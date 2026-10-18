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
        for path in ["crates/rewind/src", "crates/rewind/build.rs", "crates/rewind/Cargo.toml", "crates/platform-mac/native/Capture.swift"] {
            println!("cargo:rerun-if-changed={}",root.join(path).display());
        }
        let mut command = Command::new("cargo");
        command.arg("build").arg("--locked")
            .arg("--manifest-path").arg(root.join("Cargo.toml"))
            .arg("-p").arg("rewind")
            .arg("--target-dir").arg(&target_dir);
        let cross = env::var("HOST").unwrap() != target;
        if cross { command.arg("--target").arg(&target); }
        if profile == "release" { command.arg("--release"); }
        let result = command.status().expect("cargo is required to bundle the macOS daemon");
        assert!(result.success(), "macOS daemon build failed");
        let artifacts = if cross { target_dir.join(&target) } else { target_dir.clone() };
        fs::copy(artifacts.join(&profile).join("rewind"),out.join("rewind-daemon"))
            .expect("could not embed macOS daemon");
    }
    tauri_build::build()
}
