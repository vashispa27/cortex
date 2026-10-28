//! Windows UI Automation feasibility boundary. The native probe must be built and
//! run on Windows; this crate never starts background capture on its own.

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum ProbeStatus { NotRun, UnsupportedPlatform }

pub fn probe_status() -> ProbeStatus {
    #[cfg(target_os = "windows")]
    { ProbeStatus::NotRun }
    #[cfg(not(target_os = "windows"))]
    { ProbeStatus::UnsupportedPlatform }
}

pub const NATIVE_PROBE: &str = "cl /EHsc crates\\platform-win\\native\\UIAProbe.cpp /link ole32.lib uiautomationcore.lib";

