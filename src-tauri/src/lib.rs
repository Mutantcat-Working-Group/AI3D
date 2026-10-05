mod watchdog;

use std::{
    fs,
    io::{Read, Write},
    net::{SocketAddr, TcpStream},
    path::PathBuf,
    process::{Child, Command, Stdio},
    sync::{
        atomic::{AtomicBool, Ordering},
        Mutex,
    },
    time::{Duration, Instant, SystemTime},
};

use tauri::{Manager, RunEvent};
use watchdog::{
    health_ok, health_request, slept_through, start_backoff, url_port, HealthTracker,
    PROBE_CONNECT_TIMEOUT, PROBE_INTERVAL, PROBE_READ_TIMEOUT, READY_POLL, READY_TIMEOUT,
};

/// Everything the supervisor needs to bring the service back and to point the
/// window at it again. The child lives behind the mutex so the exit handler and
/// the supervisor never kill the same process twice.
struct Backend {
    child: Mutex<Option<Child>>,
    port: Mutex<Option<u16>>,
    /// Set once by the exit handler. Without it the supervisor would see the
    /// service it just killed, call it a crash, and start a replacement while
    /// the app is on its way out.
    stopping: AtomicBool,
    package: PathBuf,
    ready_file: PathBuf,
}

#[cfg(windows)]
fn win32_path(path: PathBuf) -> PathBuf {
    let text = path.to_string_lossy();
    let Some(rest) = text.strip_prefix(r"\\?\") else {
        return path;
    };
    if let Some(unc) = rest.strip_prefix("UNC\\") {
        PathBuf::from(format!(r"\\{unc}"))
    } else {
        PathBuf::from(rest)
    }
}

#[cfg(not(windows))]
fn win32_path(path: PathBuf) -> PathBuf {
    path
}

fn package_root(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    #[cfg(debug_assertions)]
    {
        let _ = app;
        if let Ok(explicit) = std::env::var("AI3D_DESKTOP_PACKAGE") {
            return Ok(win32_path(PathBuf::from(explicit)));
        }
        return Ok(win32_path(
            PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../tmp/desktop-package"),
        ));
    }

    #[cfg(not(debug_assertions))]
    {
        let resource_dir = app
            .path()
            .resource_dir()
            .map_err(|error| error.to_string())?;
        // The bundle keeps resources that live outside the source tree under
        // resource_dir/_up_ with their config-relative path preserved.
        Ok(win32_path(
            resource_dir
                .join("_up_")
                .join("tmp")
                .join("desktop-package"),
        ))
    }
}

fn data_dir(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|error| error.to_string())?;
    fs::create_dir_all(&dir).map_err(|error| error.to_string())?;
    Ok(dir)
}

/// One line in the desktop log. The supervisor is the thing that acts while
/// nobody is watching, so what it decided has to be readable afterwards.
fn log_line(app: &tauri::AppHandle, message: &str) {
    let Ok(dir) = data_dir(app) else {
        return;
    };
    if let Ok(mut log) = fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(dir.join("desktop-app.log"))
    {
        let _ = writeln!(log, "{message}");
    }
}

fn spawn_backend(
    app: &tauri::AppHandle,
    package: &PathBuf,
    ready_file: &PathBuf,
) -> Result<Child, String> {
    let data_dir = data_dir(app)?;

    log_line(
        app,
        &format!(
            "spawn backend package={} entry={}",
            package.display(),
            package.join("runtime").join("server.mjs").display()
        ),
    );

    let backend_log = fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(data_dir.join("desktop-backend.log"))
        .map_err(|error| format!("Could not open the desktop backend log: {error}"))?;
    let backend_log_stderr = backend_log
        .try_clone()
        .map_err(|error| format!("Could not duplicate the desktop backend log: {error}"))?;

    let server_entry = package.join("runtime").join("server.mjs");
    if !server_entry.is_file() {
        return Err(format!(
            "The desktop server bundle is missing {}; run `npm run desktop:build` first.",
            server_entry.display()
        ));
    }

    let node = std::env::var("AI3D_NODE").unwrap_or_else(|_| "node".to_string());
    let _ = fs::remove_file(ready_file);

    let child = Command::new(&node)
        .arg(&server_entry)
        .current_dir(package)
        .env("REVIEW_WORKSPACE", &data_dir)
        .env("REVIEW_DATA_DIR", &data_dir)
        .env("REVIEW_DIST_DIR", package.join("web"))
        .env("REVIEW_READY_FILE", ready_file)
        .env("PORT", "0")
        .stdin(Stdio::null())
        .stdout(Stdio::from(backend_log))
        .stderr(Stdio::from(backend_log_stderr))
        .spawn()
        .map_err(|error| {
            format!(
                "Could not start the AI3D desktop service with `{}`: {error}",
                node
            )
        })?;

    Ok(child)
}

fn ready_url(ready_file: &PathBuf) -> Option<String> {
    let text = fs::read_to_string(ready_file).ok()?;
    let value: serde_json::Value = serde_json::from_str(&text).ok()?;
    value.get("url")?.as_str().map(|url| url.to_string())
}

/// Point the window at a service that is now answering. Only called once the
/// ready file exists, so the page never lands on a port that is still starting.
fn navigate(app: &tauri::AppHandle, url: &str) {
    if let Some(window) = app.get_webview_window("main") {
        if let Ok(parsed) = url.parse() {
            let _ = window.navigate(parsed);
        }
    }
}

/// Is the child process still running? A `try_wait` error is treated as gone:
/// the supervisor's job is to end up with a working service, and a process it
/// cannot even ask about is not one it can promise.
fn backend_alive(state: &Backend) -> bool {
    let Ok(mut guard) = state.child.lock() else {
        return false;
    };
    match guard.as_mut() {
        None => false,
        Some(child) => matches!(child.try_wait(), Ok(None)),
    }
}

/// Ask the service how it is over loopback. Returns false for a connection
/// that is refused, times out, or answers with anything other than its own
/// health payload.
fn probe_health(port: u16) -> bool {
    let Ok(address) = format!("127.0.0.1:{port}").parse::<SocketAddr>() else {
        return false;
    };
    let Ok(mut stream) = TcpStream::connect_timeout(&address, PROBE_CONNECT_TIMEOUT) else {
        return false;
    };
    let _ = stream.set_read_timeout(Some(PROBE_READ_TIMEOUT));
    let _ = stream.set_write_timeout(Some(PROBE_READ_TIMEOUT));
    if stream.write_all(health_request(port).as_bytes()).is_err() {
        return false;
    }
    let mut response = String::new();
    let _ = std::io::Read::by_ref(&mut stream)
        .take(64 * 1024)
        .read_to_string(&mut response);
    health_ok(&response)
}

/// Start a service and wait for it to announce itself. The child is only
/// published to the shared state once it is ready, so a failed start never
/// leaves a half-started process for the exit handler to kill.
fn start_backend(
    app: &tauri::AppHandle,
    package: &PathBuf,
    ready_file: &PathBuf,
) -> Result<String, String> {
    if shutting_down(app) {
        return Err("the app is shutting down".to_string());
    }
    let _ = fs::remove_file(ready_file);
    let mut child = spawn_backend(app, package, ready_file)?;
    let started = Instant::now();
    let url = loop {
        if let Some(url) = ready_url(ready_file) {
            break url;
        }
        match child.try_wait() {
            Ok(Some(status)) => {
                return Err(format!("the service exited during startup ({status})"))
            }
            Err(error) => return Err(format!("could not check the service process: {error}")),
            Ok(None) => {}
        }
        if started.elapsed() >= READY_TIMEOUT {
            let _ = child.kill();
            let _ = child.wait();
            return Err(format!(
                "the service did not report readiness within {}s",
                READY_TIMEOUT.as_secs()
            ));
        }
        std::thread::sleep(READY_POLL);
    };

    // The window may have been closed while this service was starting. Its
    // child would outlive the app, so it is ended here rather than published.
    if shutting_down(app) {
        let _ = child.kill();
        let _ = child.wait();
        return Err("the app is shutting down".to_string());
    }

    let port = url_port(&url);
    if let Some(state) = app.try_state::<Backend>() {
        if let Ok(mut slot) = state.port.lock() {
            *slot = port;
        }
        if let Ok(mut slot) = state.child.lock() {
            *slot = Some(child);
        }
    }
    let _ = fs::remove_file(ready_file);
    log_line(app, &format!("backend ready at {url}"));
    navigate(app, &url);
    Ok(url)
}

/// Kill whatever service is running and forget its port. Safe to call when
/// nothing is running, so the supervisor can use it to replace a dead service
/// and the exit handler can use it to end one.
fn kill_child(app: &tauri::AppHandle) {
    let Some(state) = app.try_state::<Backend>() else {
        return;
    };
    if let Ok(mut port) = state.port.lock() {
        *port = None;
    }
    let mut child = state.child.lock().ok().and_then(|mut guard| guard.take());
    if let Some(child) = child.as_mut() {
        let _ = child.kill();
        let _ = child.wait();
    }
}

/// End the service for good. The flag is what keeps the supervisor from
/// treating the shutdown it asked for as a crash worth recovering from.
fn shutdown(app: &tauri::AppHandle) {
    if let Some(state) = app.try_state::<Backend>() {
        state.stopping.store(true, Ordering::SeqCst);
    }
    kill_child(app);
}

/// Whether the app has begun to exit. Read by the supervisor at the points
/// where it is about to create something, so nothing is started for a window
/// that is already closing.
fn shutting_down(app: &tauri::AppHandle) -> bool {
    app.try_state::<Backend>()
        .map(|state| state.stopping.load(Ordering::SeqCst))
        .unwrap_or(false)
}

/// The whole lifecycle, owned by one thread so two restarts can never race.
///
/// It waits for readiness, then ticks: a live process that answers health is
/// left alone, a process that has exited is restarted immediately, and a
/// process that is alive but silent is restarted after a short run of failed
/// probes. A gap in the tick long enough to be a suspension clears the failure
/// count instead of being counted, so coming back from sleep never looks like
/// a crash.
fn supervise(app: tauri::AppHandle) {
    std::thread::spawn(move || {
        let Some(state) = app.try_state::<Backend>() else {
            return;
        };
        let package = state.package.clone();
        let ready_file = state.ready_file.clone();
        let mut tracker = HealthTracker::new();
        let mut start_failures: u32 = 0;
        let mut last_tick = SystemTime::now();
        let mut announced = false;

        loop {
            if state.stopping.load(Ordering::SeqCst) {
                return;
            }
            if !backend_alive(&state) {
                match start_backend(&app, &package, &ready_file) {
                    Ok(_) => {
                        if announced {
                            log_line(&app, "backend restarted; the window was pointed at it");
                        }
                        announced = true;
                        start_failures = 0;
                        tracker.reset();
                        last_tick = SystemTime::now();
                    }
                    Err(error) => {
                        start_failures = start_failures.saturating_add(1);
                        log_line(
                            &app,
                            &format!("backend start failed (attempt {start_failures}): {error}"),
                        );
                        std::thread::sleep(start_backoff(start_failures));
                    }
                }
                continue;
            }

            std::thread::sleep(PROBE_INTERVAL);

            // A gap this wide is the machine having slept, not the service
            // having stalled. Clearing the count is the whole point: the first
            // probe after a wake-up must not be read as a third failure.
            let now = SystemTime::now();
            let gap = now.duration_since(last_tick).unwrap_or(Duration::ZERO);
            last_tick = now;
            if slept_through(gap) {
                tracker.reset();
                continue;
            }

            if !backend_alive(&state) {
                continue;
            }
            let port = state.port.lock().ok().and_then(|port| *port);
            let healthy = port.map(probe_health).unwrap_or(false);
            if tracker.observe(healthy) {
                log_line(
                    &app,
                    "backend stopped answering health probes; restarting it",
                );
                kill_child(&app);
                tracker.reset();
            } else if tracker.failures() == 1 {
                // One miss is worth a line, not a restart: the next probe in
                // five seconds decides whether this was a stall or the start
                // of a crash.
                log_line(&app, "backend missed a health probe; watching it");
            }
        }
    });
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let app = tauri::Builder::default()
        .setup(|app| {
            let handle = app.handle().clone();
            let package = package_root(&handle)?;
            let ready_file = data_dir(&handle)?.join("desktop-ready.json");
            app.manage(Backend {
                child: Mutex::new(None),
                port: Mutex::new(None),
                stopping: AtomicBool::new(false),
                package,
                ready_file,
            });
            if app.get_webview_window("main").is_none() {
                return Err("the AI3D main window was not created".into());
            }
            // The window is pointed at the service as soon as the service
            // answers, and the supervisor keeps it that way for the life of
            // the app: a crash is restarted, and a wake-up from suspend is
            // told apart from a crash rather than acted on as one.
            supervise(handle);
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error while building the AI3D desktop app");

    app.run(|app, event| {
        if let RunEvent::Exit = event {
            shutdown(app);
        }
    });
}
