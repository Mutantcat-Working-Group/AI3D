use std::{
    fs,
    path::PathBuf,
    process::{Child, Command, Stdio},
    sync::Mutex,
    time::{Duration, Instant},
};

use tauri::{Manager, RunEvent, WebviewWindow};

const READY_TIMEOUT: Duration = Duration::from_secs(20);

struct Backend {
    child: Mutex<Option<Child>>,
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

fn spawn_backend(app: &tauri::AppHandle, package: &PathBuf) -> Result<(Child, PathBuf), String> {
    let data_dir = app
        .path()
        .app_data_dir()
        .map_err(|error| error.to_string())?;
    fs::create_dir_all(&data_dir).map_err(|error| error.to_string())?;

    if let Ok(mut startup_log) = fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(data_dir.join("desktop-app.log"))
    {
        use std::io::Write;
        let _ = writeln!(
            startup_log,
            "spawn backend package={} entry={}",
            package.display(),
            package.join("runtime").join("server.mjs").display()
        );
    }

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
    let ready_file = data_dir.join("desktop-ready.json");
    let _ = fs::remove_file(&ready_file);

    let child = Command::new(&node)
        .arg(&server_entry)
        .current_dir(package)
        .env("REVIEW_WORKSPACE", &data_dir)
        .env("REVIEW_DATA_DIR", &data_dir)
        .env("REVIEW_DIST_DIR", package.join("web"))
        .env("REVIEW_READY_FILE", &ready_file)
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

    Ok((child, ready_file))
}

fn ready_url(ready_file: &PathBuf) -> Option<String> {
    let text = fs::read_to_string(ready_file).ok()?;
    let value: serde_json::Value = serde_json::from_str(&text).ok()?;
    value.get("url")?.as_str().map(|url| url.to_string())
}

fn navigate_when_ready(window: WebviewWindow, ready_file: PathBuf) {
    tauri::async_runtime::spawn(async move {
        let started = Instant::now();
        while started.elapsed() < READY_TIMEOUT {
            if let Some(url) = ready_url(&ready_file) {
                if let Ok(parsed) = url.parse() {
                    let _ = window.navigate(parsed);
                }
                let _ = fs::remove_file(&ready_file);
                return;
            }
            std::thread::sleep(Duration::from_millis(100));
        }
    });
}

fn stop_backend(app: &tauri::AppHandle) {
    if let Some(state) = app.try_state::<Backend>() {
        if let Some(mut child) = state.child.lock().unwrap().take() {
            let _ = child.kill();
            let _ = child.wait();
        }
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let app = tauri::Builder::default()
        .setup(|app| {
            let handle = app.handle().clone();
            let package = package_root(&handle)?;
            let (child, ready_file) = spawn_backend(&handle, &package)?;
            app.manage(Backend {
                child: Mutex::new(Some(child)),
            });
            let window = app
                .get_webview_window("main")
                .ok_or("the AI3D main window was not created")?;
            navigate_when_ready(window, ready_file);
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error while building the AI3D desktop app");

    app.run(|app, event| {
        if let RunEvent::Exit = event {
            stop_backend(app);
        }
    });
}
