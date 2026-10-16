fn main() {
    #[cfg(target_os = "macos")]
    {
        use std::{env, fs, path::PathBuf, process::Command};
        let manifest_dir = PathBuf::from(env::var("CARGO_MANIFEST_DIR").unwrap());
        let root = manifest_dir.join("../../..");
        let out = PathBuf::from(env::var("OUT_DIR").unwrap());
        let target_dir = out.join("daemon-target");
        let target = env::var("TARGET").unwrap();
        let profile = env::var("PROFILE").unwrap();
        for path in ["crates/daemon/src", "crates/daemon/build.rs", "crates/memory/src", "crates/capture/src", "crates/platform-mac/native/Capture.swift"] {
            println!("cargo:rerun-if-changed={}",root.join(path).display());
        }
        let mut command = Command::new("cargo");
        command.arg("build").arg("--locked")
            .arg("--manifest-path").arg(root.join("Cargo.toml"))
            .arg("-p").arg("goldfish-daemon")
            .arg("--target").arg(&target)
            .arg("--target-dir").arg(&target_dir);
        if profile == "release" { command.arg("--release"); }
        let result = command.status().expect("cargo is required to bundle the macOS daemon");
        assert!(result.success(), "macOS daemon build failed");
        fs::copy(target_dir.join(target).join(&profile).join("goldfish-daemon"),out.join("open-memory-daemon"))
            .expect("could not embed macOS daemon");
    }
    tauri_build::build()
}
