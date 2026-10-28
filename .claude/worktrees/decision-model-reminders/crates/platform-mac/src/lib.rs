//! macOS native feasibility boundary. Accessibility capture requires explicit
//! OS permission and adapter-specific validation; no worker is started by this crate.

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum PermissionState { Granted, NotGranted, UnsupportedPlatform }

#[cfg(target_os = "macos")]
#[link(name = "ApplicationServices", kind = "framework")]
unsafe extern "C" { fn AXIsProcessTrusted() -> bool; }

pub fn accessibility_permission() -> PermissionState {
    #[cfg(target_os = "macos")]
    { if unsafe { AXIsProcessTrusted() } { PermissionState::Granted } else { PermissionState::NotGranted } }
    #[cfg(not(target_os = "macos"))]
    { PermissionState::UnsupportedPlatform }
}

pub const NATIVE_PROBE: &str = "swiftc crates/platform-mac/native/AXProbe.swift -o /tmp/cortex-independent-ax-probe && /tmp/cortex-independent-ax-probe --permission";

