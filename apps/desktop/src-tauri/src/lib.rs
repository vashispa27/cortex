use serde_json::Value;
use std::{env, fs, path::PathBuf, time::Duration};
#[cfg(target_os = "macos")]
use std::{io::{self, Write}, os::unix::fs::{MetadataExt, OpenOptionsExt, PermissionsExt}, process::{Child, Command, Stdio}, sync::{Arc, Mutex}};

const MAX_RESPONSE_BYTES: usize = 1_048_576;

fn state_dir() -> Result<PathBuf, String> {
    if let Some(path) = env::var_os("OPEN_MEMORY_STATE_DIR").or_else(|| env::var_os("GOLDFISH_STATE_DIR")) {
        return Ok(PathBuf::from(path));
    }
    #[cfg(target_os = "macos")]
    {
        return dirs::home_dir()
            .map(|home| home.join("Library/Application Support/Open Memory"))
            .ok_or_else(|| "Cannot find user home directory".to_string());
    }
    #[cfg(target_os = "windows")]
    {
        return env::var_os("LOCALAPPDATA")
            .map(|root| PathBuf::from(root).join("OpenMemory"))
            .ok_or_else(|| "Cannot find local application data directory".to_string());
    }
    #[cfg(not(any(target_os = "macos", target_os = "windows")))]
    {
        if let Some(root) = env::var_os("XDG_STATE_HOME") {
            return Ok(PathBuf::from(root).join("open-memory"));
        }
        dirs::home_dir()
            .map(|home| home.join(".local/state/open-memory"))
            .ok_or_else(|| "Cannot find user home directory".to_string())
    }
}

fn valid_route(method: &str, path: &str) -> bool {
    match (method, path) {
        ("GET", "/v1/health" | "/v1/status" | "/v1/settings") => true,
        ("POST", "/v1/memory/search" | "/v1/memory/snapshots" | "/v1/privacy/delete" | "/v1/capture/request-permission") => true,
        ("PATCH", "/v1/settings") => true,
        ("GET", p) if p.starts_with("/v1/memory/recent?") => {
            p[18..].split('&').all(|part| {
                let mut pair = part.split('=');
                let key = pair.next().unwrap_or("");
                let value = pair.next().unwrap_or("");
                pair.next().is_none()
                    && matches!(key, "limit" | "since_ms")
                    && !value.is_empty()
                    && value.bytes().all(|byte| byte.is_ascii_digit())
            })
        }
        _ => false,
    }
}

#[tauri::command]
async fn daemon_request(method: String, path: String, body: Option<Value>) -> Result<Value, String> {
    if !valid_route(&method, &path) {
        return Err("Route is not available to the desktop shell".to_string());
    }
    if body.as_ref().is_some_and(|value| value.to_string().len() > 65_536) {
        return Err("Local service request is too large".to_string());
    }
    let state = state_dir()?;
    let port_text = fs::read_to_string(state.join("daemon.port"))
        .map_err(|_| "Local service is not running (port file missing)".to_string())?;
    let port: u16 = port_text.trim().parse()
        .map_err(|_| "Local service port is invalid".to_string())?;
    let token_path = state.join("daemon.token");
    let token_meta = fs::symlink_metadata(&token_path)
        .map_err(|_| "Local service token is missing".to_string())?;
    if !token_meta.is_file() {
        return Err("Local service token file is invalid".to_string());
    }
    #[cfg(unix)]
    {
        use std::os::unix::fs::MetadataExt;
        if token_meta.mode() & 0o077 != 0 || token_meta.uid() != unsafe { libc::geteuid() } {
            return Err("Local service token file permissions are unsafe".to_string());
        }
    }
    let token = fs::read_to_string(token_path)
        .map_err(|_| "Local service token is missing".to_string())?;
    if token.trim().len() != 64 || !token.trim().bytes().all(|byte| byte.is_ascii_hexdigit()) {
        return Err("Local service token is invalid".to_string());
    }
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(5))
        .redirect(reqwest::redirect::Policy::none())
        .build()
        .map_err(|_| "Could not prepare local connection".to_string())?;
    let url = format!("http://127.0.0.1:{port}{path}");
    let verb = match method.as_str() {
        "GET" => reqwest::Method::GET,
        "POST" => reqwest::Method::POST,
        "PATCH" => reqwest::Method::PATCH,
        _ => return Err("Unsupported method".to_string()),
    };
    let mut request = client.request(verb, url).bearer_auth(token.trim());
    if let Some(json) = body {
        request = request.json(&json);
    }
    let mut response = request.send().await
        .map_err(|_| "Could not reach the local service".to_string())?;
    if !response.status().is_success() {
        return Err(format!("Local service returned HTTP {}", response.status().as_u16()));
    }
    let mut bytes = Vec::new();
    while let Some(chunk) = response.chunk().await.map_err(|_| "Local service response failed".to_string())? {
        if bytes.len().saturating_add(chunk.len()) > MAX_RESPONSE_BYTES {
            return Err("Local service response is too large".to_string());
        }
        bytes.extend_from_slice(&chunk);
    }
    serde_json::from_slice::<Value>(&bytes)
        .map_err(|_| "Local service returned invalid JSON".to_string())
}

#[cfg(test)]
mod tests {
    use super::valid_route;

    #[test]
    fn route_allowlist_rejects_external_and_encoded_paths() {
        assert!(valid_route("GET", "/v1/memory/recent?limit=20"));
        assert!(valid_route("GET", "/v1/memory/recent?since_ms=0&limit=4"));
        assert!(!valid_route("GET", "/v1/memory/recent?limit=2&url=http://example.com"));
        assert!(!valid_route("GET", "/v1/memory/recent?limit=%2Fetc"));
        assert!(!valid_route("GET", "http://example.com"));
        assert!(!valid_route("GET", "/v1/memory/recent/../status"));
        assert!(!valid_route("POST", "/v1/status"));
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    #[cfg(target_os = "macos")]
    let daemon = Arc::new(Mutex::new(None::<Child>));
    #[cfg(target_os = "macos")]
    let daemon_on_start = daemon.clone();
    let app = tauri::Builder::default()
        .setup(move |_app| {
            #[cfg(target_os = "macos")]
            {
                let executable = install_bundled_daemon()?;
                let child = Command::new(executable)
                    .env("OPEN_MEMORY_EXIT_ON_STDIN_EOF", "1")
                    .stdin(Stdio::piped()).stdout(Stdio::null()).stderr(Stdio::null())
                    .spawn()?;
                *daemon_on_start.lock().map_err(|_| io::Error::other("daemon lock poisoned"))? = Some(child);
            }
            Ok(())
        })
        .on_window_event(|window, event| {
            if matches!(event, tauri::WindowEvent::Destroyed) {
                use tauri::Manager;
                window.app_handle().exit(0);
            }
        })
        .invoke_handler(tauri::generate_handler![daemon_request])
        .build(tauri::generate_context!())
        .expect("failed to run desktop shell");
    app.run(move |_handle, event| {
        if matches!(event, tauri::RunEvent::Exit) {
            #[cfg(target_os = "macos")]
            if let Ok(mut guard) = daemon.lock() {
                if let Some(mut child) = guard.take() {
                    if child.try_wait().ok().flatten().is_none() { let _ = child.kill(); }
                    let _ = child.wait();
                }
            }
        }
    });
}

#[cfg(target_os = "macos")]
fn install_bundled_daemon() -> io::Result<PathBuf> {
    const DAEMON: &[u8] = include_bytes!(concat!(env!("OUT_DIR"), "/open-memory-daemon"));
    let state = state_dir().map_err(io::Error::other)?;
    fs::create_dir_all(&state)?;
    fs::set_permissions(&state,fs::Permissions::from_mode(0o700))?;
    let path = state.join("open-memory-daemon");
    if let Ok(meta) = fs::symlink_metadata(&path) {
        if meta.is_file() && meta.uid() == unsafe { libc::geteuid() }
            && meta.mode() & 0o077 == 0 && fs::read(&path).map(|bytes| bytes == DAEMON).unwrap_or(false) {
            return Ok(path);
        }
    }
    let temp = state.join("open-memory-daemon.tmp");
    if temp.exists() { fs::remove_file(&temp)?; }
    let mut file = fs::OpenOptions::new().write(true).create_new(true).mode(0o700).open(&temp)?;
    file.write_all(DAEMON)?;
    file.sync_all()?;
    fs::set_permissions(&temp,fs::Permissions::from_mode(0o700))?;
    fs::rename(&temp,&path)?;
    Ok(path)
}
