//! Installs the embedded, dependency-free JS bridge into private app storage.
use serde_json::{json, Value};
use std::{fs, path::Path, process::Command};

#[cfg(target_os = "macos")]
const BRIDGE: &[u8] = include_bytes!(concat!(env!("OUT_DIR"), "/cortex-mcp.mjs"));

#[cfg(target_os = "macos")]
pub fn connection_info(root: &Path) -> Result<Value, String> {
    use std::os::unix::fs::PermissionsExt;
    let dir = root.join("mcp");
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    fs::set_permissions(&dir, fs::Permissions::from_mode(0o700)).map_err(|e| e.to_string())?;
    let path = dir.join("cortex-mcp.mjs");
    if fs::read(&path).ok().as_deref() != Some(BRIDGE) {
        let nonce = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap_or_default().as_nanos();
        let temp = dir.join(format!("cortex-mcp-{}-{nonce}.tmp",std::process::id()));
        fs::write(&temp, BRIDGE).map_err(|e| e.to_string())?;
        fs::set_permissions(&temp, fs::Permissions::from_mode(0o600)).map_err(|e| e.to_string())?;
        fs::rename(temp, &path).map_err(|e| e.to_string())?;
    }
    fs::set_permissions(&path, fs::Permissions::from_mode(0o600)).map_err(|e| e.to_string())?;
    let mut selected = "node".to_owned();
    let mut version = None;
    for candidate in ["node", "/opt/homebrew/bin/node", "/usr/local/bin/node"] {
        if let Ok(output) = Command::new(candidate).arg("--version").output() {
            let value = String::from_utf8_lossy(&output.stdout).trim().to_owned();
            let major = value.trim_start_matches('v').split('.').next().and_then(|s| s.parse::<u32>().ok());
            if output.status.success() && major.is_some_and(|v| v >= 20) {
                selected = Command::new(candidate).args(["-p", "process.execPath"]).output().ok()
                    .filter(|o|o.status.success()).map(|o|String::from_utf8_lossy(&o.stdout).trim().to_owned())
                    .filter(|s|Path::new(s).is_absolute()).unwrap_or_else(||candidate.to_owned());
                version = Some(value); break;
            }
        }
    }
    Ok(json!({"command":selected,"args":[path],"env":{"CORTEX_STATE_DIR":root},"node_available":version.is_some(),"node_version":version}))
}

#[cfg(not(target_os = "macos"))]
pub fn connection_info(_root: &Path) -> Result<Value, String> { Err("The bundled MCP bridge is available in the macOS app".into()) }

#[cfg(all(test, target_os = "macos"))]
mod tests {
    use super::*;
    #[test]
    fn embedded_bridge_installs_with_private_permissions() {
        use std::os::unix::fs::PermissionsExt;
        let dir=std::env::temp_dir().join(format!("cortex-mcp-install-{}",std::process::id()));
        fs::create_dir_all(&dir).unwrap();
        let info=connection_info(&dir).unwrap();
        let path=std::path::PathBuf::from(info["args"][0].as_str().unwrap());
        assert_eq!(fs::read(&path).unwrap(),BRIDGE);
        assert_eq!(fs::metadata(&path).unwrap().permissions().mode() & 0o777,0o600);
        assert_eq!(connection_info(&dir).unwrap()["args"],info["args"]);
        fs::remove_dir_all(dir).unwrap();
    }
}
