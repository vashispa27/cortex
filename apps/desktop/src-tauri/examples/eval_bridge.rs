//! Headless bridge for answer evaluations: the desktop shell's commands over stdin/stdout, no window.
//!
//! One JSON object per line in: {"id":1,"cmd":"openrouter_chat","args":{...}}
//! One JSON object per line out: {"id":1,"ok":true,"data":...} or {"id":1,"ok":false,"error":"..."}
//!
//! Requests are handled one at a time. The harness sets `REWIND_STATE_DIR` to a throwaway folder
//! that holds the engine socket (`local-memory/capture.sock`) and, optionally, a linked
//! `openrouter.key`; it never points at the real Rewind folder. Run with
//! `cargo run --release --example eval_bridge` from `apps/desktop/src-tauri`.
use std::io::{BufRead, Write};

fn main() {
    let stdin = std::io::stdin();
    let mut stdout = std::io::stdout().lock();
    for line in stdin.lock().lines() {
        let Ok(line) = line else { break };
        if line.trim().is_empty() {
            continue;
        }
        let reply = match serde_json::from_str::<serde_json::Value>(&line) {
            Ok(request) => {
                let id = request["id"].clone();
                let cmd = request["cmd"].as_str().unwrap_or("").to_owned();
                let args = request["args"].clone();
                match tauri::async_runtime::block_on(rewind_lib::headless_invoke(&cmd, args)) {
                    Ok(data) => serde_json::json!({"id": id, "ok": true, "data": data}),
                    Err(error) => serde_json::json!({"id": id, "ok": false, "error": error}),
                }
            }
            Err(error) => serde_json::json!({"id": null, "ok": false, "error": format!("invalid request: {error}")}),
        };
        if writeln!(stdout, "{reply}").and_then(|_| stdout.flush()).is_err() {
            break;
        }
    }
}
