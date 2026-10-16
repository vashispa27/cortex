use serde::{Deserialize, Serialize};

pub const API_VERSION: &str = "v1";

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum CoverageState {
    Complete,
    Partial,
    NoEvidence,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Coverage {
    pub state: CoverageState,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub reason: Option<String>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Envelope<T> {
    pub request_id: String,
    pub data: T,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct ApiError {
    pub request_id: String,
    pub error: ErrorBody,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct ErrorBody {
    pub code: ErrorCode,
    pub message: String,
    pub retryable: bool,
    pub recovery_action: String,
}

#[derive(Clone, Copy, Debug, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum ErrorCode {
    PermissionRequired,
    CapturePaused,
    TargetStale,
    TargetUnsupported,
    NoEvidence,
    AuthExpired,
    RateLimited,
    ModelUnavailable,
    IndexRebuilding,
    DiskFull,
    Cancelled,
    InvalidRequest,
    Internal,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct SearchRequest {
    pub query: String,
    #[serde(default)]
    pub from_ms: Option<i64>,
    #[serde(default)]
    pub to_ms: Option<i64>,
    #[serde(default)]
    pub apps: Option<Vec<String>>,
    #[serde(default)]
    pub limit: Option<usize>,
    #[serde(default)]
    pub cursor: Option<String>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct SearchResult {
    pub snapshot_id: i64,
    pub observed_ms: i64,
    pub app_id: String,
    pub title: String,
    pub excerpt: String,
    pub evidence_available: bool,
    pub truncated: bool,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct SearchResponse {
    pub results: Vec<SearchResult>,
    pub next_cursor: Option<String>,
    pub coverage: Coverage,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct SnapshotsRequest {
    pub ids: Vec<i64>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Snapshot {
    pub id: i64,
    pub app_id: String,
    pub window_session_id: String,
    pub title: String,
    pub url: Option<String>,
    pub body: String,
    pub first_seen_ms: i64,
    pub last_seen_ms: i64,
    pub extraction_quality: String,
    pub truncated: bool,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct SnapshotsResponse {
    pub snapshots: Vec<Snapshot>,
    pub coverage: Coverage,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct RecentResponse {
    pub results: Vec<SearchResult>,
    pub coverage: Coverage,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Health {
    pub service: &'static str,
    pub api_version: &'static str,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Status {
    pub capture_enabled: bool,
    pub capture_paused: bool,
    pub permission_state: String,
    pub memory_epoch: i64,
    pub snapshot_count: i64,
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
pub struct Selection {
    /// UTF-16 code-unit offsets, matching native text providers.
    pub start: usize,
    pub end: usize,
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
pub struct TargetRevision {
    pub app_id: String,
    pub process_id: u32,
    pub process_started_at_ms: i64,
    pub window_session_id: String,
    pub element_handle: String,
    pub element_fingerprint: String,
    pub field_text_hash: String,
    pub selection: Selection,
    pub selected_text_hash: String,
    pub captured_at_ms: i64,
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum EditOperation {
    RewriteSelection,
    DirectAnswer,
    InterpretInstruction,
    DraftResponse,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct EditDraft {
    pub request_id: String,
    pub target: TargetRevision,
    pub operation: EditOperation,
    pub replacement: String,
    pub memory_epoch: i64,
}
