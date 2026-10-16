use std::{env, path::PathBuf, process::Command};

fn main() {
    println!("cargo:rerun-if-changed=../platform-mac/native/Capture.swift");
    if env::var("CARGO_CFG_TARGET_OS").as_deref() != Ok("macos") {
        return;
    }
    let source = PathBuf::from(env::var("CARGO_MANIFEST_DIR").unwrap())
        .join("../platform-mac/native/Capture.swift");
    let output = PathBuf::from(env::var("OUT_DIR").unwrap()).join("open-memory-ax-helper");
    let status = Command::new("swiftc")
        .arg("-O")
        .arg("-framework")
        .arg("AppKit")
        .arg("-framework")
        .arg("ApplicationServices")
        .arg(&source)
        .arg("-o")
        .arg(&output)
        .status()
        .expect("swiftc required");
    assert!(status.success(), "Accessibility helper failed to compile");
}
