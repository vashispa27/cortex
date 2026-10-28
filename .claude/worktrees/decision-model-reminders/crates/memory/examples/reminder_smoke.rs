//! Manual smoke test: fires two real desktop notifications from a throwaway store.
//!
//! `cargo run -p cortex-memory --example reminder_smoke`
//!
//! Creates, in a temp directory (never the real workspace), a one-time reminder due in about a minute and an
//! interval reminder (every 15 minutes, grid aligned so its next slot is about 90 seconds away), starts the
//! same runtime loop the engine runs, waits for both to be delivered through the OS notification service, and
//! prints their run history. Needs notification permission for the terminal or the app running it.
use chrono::{Duration, Utc};
use cortex_memory::{schedule_runtime, workspace::WorkspaceStore};
use serde_json::json;
use std::time::{Duration as Wait, Instant};

fn local(at: chrono::DateTime<Utc>) -> String {
    at.format("%Y-%m-%dT%H:%M").to_string()
}

fn main() {
    let dir = tempfile::tempdir().expect("temp dir");
    let store = WorkspaceStore::open(&dir.path().join("workspace.sqlite3")).expect("open store");
    let now = Utc::now();
    let ms = now.timestamp_millis();
    // Whole minutes: schedules have minute precision, and the due time must be in the future.
    let once_at = local(now + Duration::seconds(75));
    let slot = local(now + Duration::seconds(105));
    let anchor = local(now + Duration::seconds(105) - Duration::minutes(15));
    let make = |id: &str, title: &str, timing: serde_json::Value| {
        let created = store
            .schedule_request("create", &json!({"id": id, "schedule": {"title": title, "timezone": "UTC", "timing": timing, "action": {"type": "reminder", "message": format!("{title} (smoke test)")}}}), ms)
            .expect("create schedule");
        println!("{title}: next due {} UTC ({})", created["next_due_local"], created["next_due_ms"]);
    };
    make("smoke-once", "Cortex smoke: one-time", json!({"type": "once", "local_at": once_at}));
    make("smoke-interval", "Cortex smoke: every 15 minutes", json!({"type": "interval", "every_minutes": 15, "start_local": anchor}));
    println!("expecting the interval slot at {slot} UTC; waiting for notifications…");
    schedule_runtime::start(dir.path()).expect("start runtime");
    let started = Instant::now();
    loop {
        let history = store.schedule_request("history", &json!({}), Utc::now().timestamp_millis()).expect("history");
        let items = history["items"].as_array().cloned().unwrap_or_default();
        if items.len() >= 2 && items.iter().all(|r| r["delivery_status"] != "pending" && r["delivery_status"] != "attempted") {
            for run in &items {
                println!("run {}: status={} delivery={} error={}", run["schedule"]["title"], run["status"], run["delivery_status"], run["error"]);
            }
            return;
        }
        if started.elapsed() > Wait::from_secs(200) {
            eprintln!("timed out; history: {history}");
            std::process::exit(1);
        }
        std::thread::sleep(Wait::from_secs(3));
    }
}
