fn main() {
    #[cfg(target_os = "macos")]
    {
        use std::{env, fs, path::PathBuf, process::Command};
        let manifest_dir = PathBuf::from(env::var("CARGO_MANIFEST_DIR").unwrap());
        let root = manifest_dir.join("../../..");
        let out = PathBuf::from(env::var("OUT_DIR").unwrap());
        let target_dir = root.join("target");
        let target = env::var("TARGET").unwrap();
        let profile = env::var("PROFILE").unwrap();
        for path in ["crates/mcp/src", "crates/mcp/scripts", "crates/mcp/package.json", "crates/mcp/package-lock.json"] {
            println!("cargo:rerun-if-changed={}", root.join(path).display());
        }
        let bundled = Command::new("npm").arg("run").arg("bundle")
            .current_dir(root.join("crates/mcp")).status().expect("Node.js and npm are required to bundle the Cortex MCP bridge");
        assert!(bundled.success(), "Cortex MCP bundling failed. Run npm ci in crates/mcp first.");
        fs::copy(root.join("crates/mcp/dist/cortex-mcp.mjs"), out.join("cortex-mcp.mjs")).expect("could not embed MCP bridge");
        for path in ["crates/cortex/src", "crates/cortex/build.rs", "crates/cortex/Cargo.toml", "crates/memory/src", "crates/memory/Cargo.toml", "Cargo.lock", "crates/platform-mac/native/Capture.swift"] {
            println!("cargo:rerun-if-changed={}",root.join(path).display());
        }
        let mut command = Command::new("cargo");
        command.arg("build").arg("--locked")
            .arg("--manifest-path").arg(root.join("Cargo.toml"))
            .arg("-p").arg("cortex")
            .arg("--target-dir").arg(&target_dir);
        let cross = env::var("HOST").unwrap() != target;
        if cross { command.arg("--target").arg(&target); }
        if profile == "release" { command.arg("--release"); }
        let result = command.status().expect("cargo is required to bundle the macOS daemon");
        assert!(result.success(), "macOS daemon build failed");
        let artifacts = if cross { target_dir.join(&target) } else { target_dir.clone() };
        fs::copy(artifacts.join(&profile).join("cortex"),out.join("cortex-daemon"))
            .expect("could not embed macOS daemon");
    }
    tauri_build::build()
}
