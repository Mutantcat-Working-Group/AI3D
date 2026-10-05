//! The shell outlives the service it starts.
//!
//! A review session is a long-lived thing: a lid closes, a laptop suspends for
//! the night, a backend dies on a malformed model. The window cannot be left
//! pointing at a port nobody answers on, so the shell has to keep answering
//! three separate questions:
//!
//!   * is the child process still alive?
//!   * does it still answer `/api/health`?
//!   * did the wall clock jump far enough that the machine slept?
//!
//! The third is the one that is easy to get wrong. Every duration here is
//! wall-clock, so a process that sat through a six-hour suspension looks, from
//! inside the loop, exactly like a process that stopped answering. Counting
//! that as a failure would restart a perfectly healthy service every time the
//! user came back to their desk. So a gap wider than a normal tick is treated
//! as sleep: the failure counter is cleared and the tick is skipped.
//!
//! Nothing here talks to tauri. The shell decides *when* to consult these
//! rules; this module decides *what* they say, which is what makes it testable
//! with a bare `rustc --test` and no windowing toolkit in sight.

use std::time::Duration;

/// How long the service is given to write its ready file before a start is
/// called a failure and retried.
pub const READY_TIMEOUT: Duration = Duration::from_secs(20);
/// How often that ready file is looked for while starting.
pub const READY_POLL: Duration = Duration::from_millis(100);
/// How often a running service is asked how it is.
pub const PROBE_INTERVAL: Duration = Duration::from_secs(5);
pub const PROBE_CONNECT_TIMEOUT: Duration = Duration::from_millis(1500);
pub const PROBE_READ_TIMEOUT: Duration = Duration::from_millis(1500);
/// Consecutive failed probes tolerated before the service is restarted. Three
/// ticks is fifteen seconds of silence, which is long enough that a request
/// backlog or a busy disk does not trigger it, and short enough that a stuck
/// service is not left stuck for a minute.
pub const FAILURES_BEFORE_RESTART: u32 = 3;
/// Restart backoff for a service that will not come up. Doubling from here is
/// capped, so a permanently broken install still retries at least twice a
/// minute instead of spinning or giving up.
pub const START_BACKOFF_MIN: Duration = Duration::from_millis(500);
pub const START_BACKOFF_MAX: Duration = Duration::from_secs(30);
/// A gap wider than this between two ticks is read as "the machine slept"
/// rather than "the service stalled". It is deliberately several times a
/// normal tick: a plain slow loop must never be mistaken for a suspension.
pub const SLEEP_GAP: Duration = Duration::from_secs(30);

/// Counts consecutive health failures, and separates the two ways a tick can
/// be uninteresting: the service is fine, or there was no tick to judge.
#[derive(Debug, Default)]
pub struct HealthTracker {
    failures: u32,
}

impl HealthTracker {
    pub fn new() -> Self {
        Self { failures: 0 }
    }

    /// Record one probe. Returns true when the service has now failed enough
    /// consecutive probes that it should be restarted. A healthy probe always
    /// clears the count, so a service that stumbles once every few minutes is
    /// never restarted by a slow accumulation.
    pub fn observe(&mut self, healthy: bool) -> bool {
        if healthy {
            self.failures = 0;
            return false;
        }
        self.failures = self.failures.saturating_add(1);
        self.failures >= FAILURES_BEFORE_RESTART
    }

    /// Forget every failure so far, without judging a tick. Used when the
    /// machine was suspended and when a fresh service has just come up.
    pub fn reset(&mut self) {
        self.failures = 0;
    }

    pub fn failures(&self) -> u32 {
        self.failures
    }
}

/// Exponential backoff for repeated failed starts, clamped so the retry never
/// slows past twice a minute. `attempts` counts failures already seen, so the
/// first retry asks for one interval and the next asks for two.
pub fn start_backoff(attempts: u32) -> Duration {
    let shift = attempts.saturating_sub(1).min(6);
    let factor = 1u64 << shift;
    let millis = (START_BACKOFF_MIN.as_millis() as u64).saturating_mul(factor);
    Duration::from_millis(millis).min(START_BACKOFF_MAX)
}

/// True when the wall clock moved further than a regular tick, which is what
/// waking from suspend looks like from inside the loop.
pub fn slept_through(gap: Duration) -> bool {
    gap > SLEEP_GAP
}

/// The loopback port the ready file advertised, for the health probe. The URL
/// is one the service printed for itself, so this reads it rather than
/// trusting anything the page sent. A URL with no port, or port zero, has no
/// probe target and yields `None` instead of a guess.
pub fn url_port(url: &str) -> Option<u16> {
    let rest = url.split_once("://").map_or(url, |(_, rest)| rest);
    let authority = rest.split(['/', '?', '#']).next()?;
    let host_port = authority
        .rsplit_once('@')
        .map_or(authority, |(_, host_port)| host_port);
    let port = if let Some(v6) = host_port.strip_prefix('[') {
        // [::1]:43173 -- the bracket closes the address, the port follows it.
        v6.split_once(']')?.1.strip_prefix(':')?
    } else {
        host_port.rsplit_once(':')?.1
    };
    port.parse::<u16>().ok().filter(|port| *port != 0)
}

/// The minimal HTTP request a probe sends. Written by hand rather than with a
/// client library: this is one request to loopback, and the desktop shell has
/// no other use for an HTTP stack.
pub fn health_request(port: u16) -> String {
    format!(
        "GET /api/health HTTP/1.1\r\n\
         Host: 127.0.0.1:{port}\r\n\
         Accept: application/json\r\n\
         Connection: close\r\n\
         User-Agent: ai3d-watchdog\r\n\r\n"
    )
}

/// Whether a probe response is this service saying it is well. The status line
/// must be 200 and the body must carry the service's own `"ok":true`. Anything
/// else is refused on purpose: a port that has been taken over by another
/// program answers with something, and a restart is the right response to a
/// stranger on our port, not to trust it.
pub fn health_ok(response: &str) -> bool {
    let status = response
        .lines()
        .next()
        .and_then(|line| line.split_whitespace().nth(1));
    let ok_status = status == Some("200");
    let ok_body = ["\"ok\":true", "\"ok\": true"]
        .iter()
        .any(|needle| response.contains(needle));
    ok_status && ok_body
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn restarts_only_after_the_tolerated_run_of_failures() {
        let mut tracker = HealthTracker::new();
        assert!(!tracker.observe(false));
        assert!(!tracker.observe(false));
        assert_eq!(tracker.failures(), 2);
        assert!(tracker.observe(false), "the third silent probe restarts");
    }

    #[test]
    fn one_healthy_probe_forgives_the_run() {
        let mut tracker = HealthTracker::new();
        tracker.observe(false);
        tracker.observe(false);
        assert!(!tracker.observe(true));
        assert_eq!(tracker.failures(), 0);
        assert!(!tracker.observe(false));
        assert!(!tracker.observe(false));
        assert!(tracker.observe(false));
    }

    #[test]
    fn reset_forgets_failures_without_probing() {
        let mut tracker = HealthTracker::new();
        tracker.observe(false);
        tracker.observe(false);
        tracker.reset();
        assert_eq!(tracker.failures(), 0);
        assert!(!tracker.observe(false));
    }

    #[test]
    fn backoff_grows_then_stops_growing() {
        assert_eq!(start_backoff(1), START_BACKOFF_MIN);
        assert_eq!(start_backoff(2), START_BACKOFF_MIN * 2);
        assert_eq!(start_backoff(3), START_BACKOFF_MIN * 4);
        assert_eq!(start_backoff(0), START_BACKOFF_MIN);
        for attempts in 1..40 {
            assert!(start_backoff(attempts) <= START_BACKOFF_MAX);
        }
        assert_eq!(start_backoff(40), START_BACKOFF_MAX);
    }

    #[test]
    fn a_normal_tick_is_not_sleep_and_a_long_gap_is() {
        assert!(!slept_through(PROBE_INTERVAL));
        assert!(!slept_through(SLEEP_GAP));
        assert!(slept_through(SLEEP_GAP + Duration::from_secs(1)));
    }

    #[test]
    fn reads_the_port_out_of_the_ready_url() {
        assert_eq!(url_port("http://127.0.0.1:43173/"), Some(43173));
        assert_eq!(url_port("http://127.0.0.1:43173"), Some(43173));
        assert_eq!(url_port("http://localhost:8080/#/x"), Some(8080));
        assert_eq!(url_port("http://[::1]:65535/"), Some(65535));
        assert_eq!(url_port("http://user:pw@127.0.0.1:41/"), Some(41));
    }

    #[test]
    fn a_url_without_a_usable_port_has_no_probe_target() {
        assert_eq!(url_port("http://127.0.0.1:0/"), None);
        assert_eq!(url_port("http://127.0.0.1/"), None);
        assert_eq!(url_port("not a url"), None);
        assert_eq!(url_port("http://127.0.0.1:70000/"), None);
    }

    #[test]
    fn accepts_the_service_saying_it_is_well() {
        let response = "HTTP/1.1 200 OK\r\nContent-Type: application/json\r\n\r\n\
                        {\"ok\":true,\"product\":\"AI3D\"}";
        assert!(health_ok(response));
        assert!(health_ok("HTTP/1.1 200 OK\r\n\r\n{\"ok\": true}"));
    }

    #[test]
    fn refuses_a_stranger_on_the_port() {
        // A 404 from something else listening, a 500, and a truncated read all
        // have to be told apart from health, or a restart would be skipped for
        // the wrong reason.
        assert!(!health_ok("HTTP/1.1 404 Not Found\r\n\r\n{\"ok\":true}"));
        assert!(!health_ok("HTTP/1.1 500 Internal Server Error\r\n\r\n{}"));
        assert!(!health_ok(""));
        assert!(!health_ok("HTTP/1.1 200 OK\r\n\r\n{\"ok\":false}"));
    }

    #[test]
    fn the_request_targets_the_health_route_on_loopback() {
        let request = health_request(43173);
        assert!(request.starts_with("GET /api/health HTTP/1.1\r\n"));
        assert!(request.contains("Host: 127.0.0.1:43173\r\n"));
        assert!(request.ends_with("\r\n\r\n"));
    }
}
