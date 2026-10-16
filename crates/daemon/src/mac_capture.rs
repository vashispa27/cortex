use goldfish_capture::{CapturePolicy, RawWindow};
use goldfish_memory::MemoryStore;
use serde::Deserialize;
use std::{fs, io::{self, Write}, os::unix::fs::{MetadataExt, OpenOptionsExt, PermissionsExt}, path::{Path, PathBuf}, process::Stdio, sync::Arc, time::Duration};
use tokio::{process::Command, time::{interval, timeout, MissedTickBehavior}};

const HELPER: &[u8] = include_bytes!(concat!(env!("OUT_DIR"), "/open-memory-ax-helper"));
const MAX_HELPER_OUTPUT: usize = 512 * 1024;

#[derive(Deserialize)]
pub struct HelperReply {
    pub status: Option<String>,
    pub permission: Option<String>,
    pub window: Option<RawWindow>,
    pub idle_ms: Option<i64>,
}

pub fn install_helper(state_dir: &Path) -> io::Result<PathBuf> {
    let path = state_dir.join("open-memory-ax-helper");
    if let Ok(meta) = fs::symlink_metadata(&path) {
        if meta.is_file() && meta.uid() == unsafe { libc::geteuid() }
            && meta.mode() & 0o077 == 0 && fs::read(&path).map(|bytes| bytes == HELPER).unwrap_or(false) {
            return Ok(path);
        }
    }
    let temp = state_dir.join("open-memory-ax-helper.tmp");
    if temp.exists() { fs::remove_file(&temp)?; }
    let mut file = fs::OpenOptions::new().write(true).create_new(true).mode(0o700).open(&temp)?;
    file.write_all(HELPER)?;
    file.sync_all()?;
    fs::set_permissions(&temp, fs::Permissions::from_mode(0o700))?;
    fs::rename(&temp, &path)?;
    Ok(path)
}

pub async fn run_helper(path: &Path, mode: &str) -> io::Result<HelperReply> {
    run_helper_with_args(path,mode,&[]).await
}

async fn run_helper_with_args(path: &Path, mode: &str, extra_args: &[String]) -> io::Result<HelperReply> {
    let output = timeout(Duration::from_millis(1_500), Command::new(path)
        .arg(mode).args(extra_args).stdin(Stdio::null()).stderr(Stdio::null()).kill_on_drop(true).output())
        .await.map_err(|_| io::Error::new(io::ErrorKind::TimedOut,"Accessibility provider timed out"))??;
    if !output.status.success() || output.stdout.len() > MAX_HELPER_OUTPUT {
        return Err(io::Error::new(io::ErrorKind::InvalidData,"Accessibility provider failed"));
    }
    serde_json::from_slice(&output.stdout)
        .map_err(|_| io::Error::new(io::ErrorKind::InvalidData,"Accessibility provider returned invalid data"))
}

pub async fn permission(path: &Path) -> &'static str {
    match run_helper(path,"--permission").await {
        Ok(reply) if reply.permission.as_deref() == Some("granted") => "granted",
        _ => "not_granted",
    }
}

pub async fn capture_loop(path: PathBuf, store: Arc<MemoryStore>) {
    let mut ticker = interval(Duration::from_secs(3));
    ticker.set_missed_tick_behavior(MissedTickBehavior::Skip);
    let mut previous: Option<(String,String,i64)> = None;
    loop {
        ticker.tick().await;
        let Ok(settings) = store.settings() else { previous = None; continue; };
        if !settings.capture_enabled || settings.capture_paused || permission(&path).await != "granted" {
            previous = None;
            continue;
        }
        let Ok(epoch) = store.memory_epoch() else { previous = None; continue; };
        let mut excluded_args: Vec<String> = vec!["--skip-browsers".into()];
        excluded_args.extend(settings.excluded_apps.iter().map(|app| format!("--exclude-app={app}")));
        let Ok(reply) = run_helper_with_args(&path,"--read-frontmost",&excluded_args).await else { previous = None; continue; };
        if reply.status.as_deref() != Some("ok") { previous = None; continue; }
        let Some(window) = reply.window else { previous = None; continue; };
        // An opt-out, exclusion change, pause, or deletion while AX was reading
        // invalidates the observation before anything is stored.
        let Ok(current) = store.settings() else { previous = None; continue; };
        if current.version != settings.version || !current.capture_enabled || current.capture_paused {
            previous = None;
            continue;
        }
        let policy = CapturePolicy {
            consent: current.capture_enabled,
            paused: current.capture_paused,
            excluded_apps: current.excluded_apps,
            excluded_domains: current.excluded_domains,
            excluded_window_terms: Vec::new(),
        };
        let Ok(snapshot) = policy.sanitize(&window) else { previous = None; continue; };
        if snapshot.body.trim().is_empty() { previous = None; continue; }
        if store.ingest_live(&snapshot,epoch,current.version).is_err() { previous = None; continue; }

        if let Some((app,window_id,last_ms)) = &previous {
            let elapsed = snapshot.observed_ms.saturating_sub(*last_ms);
            if *app == snapshot.app_id && *window_id == snapshot.window_session_id
                && (1..=10_000).contains(&elapsed) && reply.idle_ms.is_some_and(|idle| (0..60_000).contains(&idle)) {
                let _ = store.insert_activity_segment_live(&snapshot.app_id,&snapshot.window_session_id,*last_ms,snapshot.observed_ms,elapsed,epoch,current.version);
            }
        }
        previous = Some((snapshot.app_id,snapshot.window_session_id,snapshot.observed_ms));
    }
}
