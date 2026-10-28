use axum::{extract::{DefaultBodyLimit,Query,State}, http::{HeaderMap,StatusCode}, response::{IntoResponse,Response}, routing::{get,post}, Json,Router};
use cortex_contracts::{ApiError,Envelope,ErrorBody,ErrorCode,SearchRequest,SnapshotsRequest,Status,API_VERSION};
use cortex_memory::{MemoryError,MemoryStore,SettingsPatch};
use rand::RngCore;
use serde::Deserialize;
use serde_json::{json,Value};
use std::{env,fs,io,path::{Path,PathBuf},sync::{atomic::{AtomicU64,Ordering},Arc},time::{SystemTime,UNIX_EPOCH}};
use subtle::ConstantTimeEq;

#[cfg(target_os="macos")]
mod mac_capture;

static REQUEST_COUNTER: AtomicU64 = AtomicU64::new(1);

#[derive(Clone)]
struct AppState {
    store: Arc<MemoryStore>,
    workspace: Arc<cortex_memory::workspace::WorkspaceStore>,
    token: Arc<String>,
    port: u16,
    #[cfg(target_os="macos")]
    capture_helper: PathBuf,
}

#[derive(Deserialize)]
struct RecentQuery { since_ms: Option<i64>, limit: Option<usize> }
#[derive(Deserialize)]
struct LimitQuery { limit: Option<usize> }
#[derive(Deserialize)]
struct ChronicleQuery { level: String, period: String, timezone: Option<String> }
#[derive(Deserialize)]
struct TimeQuery { from_ms: i64, to_ms: i64, group_by: Option<String> }

#[derive(Deserialize)]
struct DeleteRequest { scope: String, ids: Option<Vec<i64>>, confirmation: String }

#[tokio::main]
async fn main() -> Result<(),Box<dyn std::error::Error>> {
    #[cfg(target_os="macos")]
    unsafe { libc::umask(0o077); }
    let state_dir = state_dir()?;
    fs::create_dir_all(&state_dir)?;
    restrict_directory(&state_dir)?;
    #[cfg(target_os="macos")]
    let _instance_lock = lock_instance(&state_dir.join("daemon.lock"))?;
    let store = Arc::new(MemoryStore::open(&state_dir.join("memory.sqlite3"))?);
    // Older builds captured Cortex's own window while it was frontmost. Those
    // rows are UI chrome, not memory, so remove them without touching user data.
    #[cfg(target_os = "macos")]
    for app_id in ["app.cortex.desktop"] {
        if let Ok(count) = store.purge_app_snapshots(app_id, now_ms()) {
            if count > 0 { eprintln!("Removed {count} Cortex UI captures from local memory."); }
        }
    }
    if env::args().any(|arg| arg == "--seed-synthetic") {
        seed_synthetic(&store)?;
        println!("Inserted synthetic fixture into {}",state_dir.display());
        return Ok(());
    }
    #[cfg(target_os="macos")]
    if env::var("CORTEX_EXIT_ON_STDIN_EOF").as_deref() == Ok("1") {
        std::thread::spawn(|| {
            use std::io::Read;
            let mut input = io::stdin();
            let mut byte = [0u8;1];
            loop { match input.read(&mut byte) { Ok(0) | Err(_) => std::process::exit(0), Ok(_) => {} } }
        });
    }
    let token = Arc::new(load_or_create_token(&state_dir.join("daemon.token"))?);
    #[cfg(target_os="macos")]
    let capture_helper = mac_capture::install_helper(&state_dir)?;
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await?;
    let port = listener.local_addr()?.port();
    write_private(&state_dir.join("daemon.port"),port.to_string().as_bytes())?;
    let workspace = Arc::new(cortex_memory::workspace::WorkspaceStore::open(&state_dir.join("workspace.sqlite3"))?);
    cortex_memory::schedule_runtime::start(&state_dir)?;
    let state = AppState { store, workspace, token, port, #[cfg(target_os="macos")] capture_helper };
    #[cfg(target_os="macos")]
    tokio::spawn(mac_capture::capture_loop(state.capture_helper.clone(),state.store.clone()));
    let app = Router::new()
        .route("/v1/health",get(health))
        .route("/v1/status",get(status))
        .route("/v1/settings",get(get_settings).patch(update_settings))
        .route("/v1/capture/request-permission",post(request_capture_permission))
        .route("/v1/memory/search",post(search))
        .route("/v1/memory/snapshots",post(snapshots))
        .route("/v1/memory/recent",get(recent))
        .route("/v1/memory/working",get(working_memory))
        .route("/v1/memory/chronicles",get(chronicle))
        .route("/v1/time/report",get(time_report))
        .route("/v1/privacy/delete",post(delete_memory))
        .route("/v1/workspace/:operation",post(workspace_request))
        .route("/v1/schedules/:operation",post(schedule_request))
        .layer(DefaultBodyLimit::max(64*1024))
        .with_state(state);
    eprintln!("cortex daemon listening on 127.0.0.1:{port}");
    axum::serve(listener,app).await?;
    Ok(())
}

fn state_dir() -> io::Result<PathBuf> {
    if let Some(path) = env::var_os("CORTEX_STATE_DIR") { return Ok(PathBuf::from(path)); }
    #[cfg(target_os="macos")]
    {
        let home = env::var_os("HOME").ok_or_else(|| io::Error::new(io::ErrorKind::NotFound,"HOME unavailable"))?;
        let current = PathBuf::from(&home).join("Library/Application Support/Cortex");
        let legacy = PathBuf::from(&home).join("Library/Application Support/Open Memory");
        if !current.exists() && legacy.exists() { let _ = fs::rename(&legacy, &current); }
        let renamed = PathBuf::from(&home).join("Library/Application Support/Rewind");
        if !current.exists() && renamed.exists() { let _ = fs::rename(&renamed, &current); }
        return Ok(current);
    }
    #[cfg(target_os="windows")]
    {
        let base = env::var_os("LOCALAPPDATA").ok_or_else(|| io::Error::new(io::ErrorKind::NotFound,"LOCALAPPDATA unavailable"))?;
        return Ok(PathBuf::from(base).join("Cortex"));
    }
    #[cfg(not(any(target_os="macos",target_os="windows")))]
    {
        if let Some(path) = env::var_os("XDG_STATE_HOME") { return Ok(PathBuf::from(path).join("cortex")); }
        let home = env::var_os("HOME").ok_or_else(|| io::Error::new(io::ErrorKind::NotFound,"HOME unavailable"))?;
        Ok(PathBuf::from(home).join(".local/state/cortex"))
    }
}

fn load_or_create_token(path: &Path) -> io::Result<String> {
    if path.exists() {
        restrict_file(path)?;
        let value = fs::read_to_string(path)?;
        let value = value.trim();
        if value.len() == 64 && value.bytes().all(|b| b.is_ascii_hexdigit()) { return Ok(value.to_owned()); }
        return Err(io::Error::new(io::ErrorKind::InvalidData,"token file is invalid"));
    }
    let mut bytes = [0u8;32];
    rand::rngs::OsRng.fill_bytes(&mut bytes);
    let token = hex::encode(bytes);
    write_private(path,token.as_bytes())?;
    Ok(token)
}

fn write_private(path: &Path, data: &[u8]) -> io::Result<()> {
    use std::io::Write;
    let temp = path.with_extension("tmp");
    let mut options = fs::OpenOptions::new();
    options.write(true).create(true).truncate(true);
    #[cfg(unix)] { use std::os::unix::fs::OpenOptionsExt; options.mode(0o600); }
    let mut file = options.open(&temp)?;
    file.write_all(data)?;
    file.sync_all()?;
    fs::rename(&temp,path)?;
    restrict_file(path)
}

#[cfg(target_os="macos")]
fn lock_instance(path: &Path) -> io::Result<fs::File> {
    use std::os::unix::{fs::OpenOptionsExt, io::AsRawFd};
    let file = fs::OpenOptions::new().read(true).write(true).create(true).mode(0o600).open(path)?;
    restrict_file(path)?;
    if unsafe { libc::flock(file.as_raw_fd(),libc::LOCK_EX | libc::LOCK_NB) } != 0 {
        return Err(io::Error::new(io::ErrorKind::AlreadyExists,"local daemon is already running"));
    }
    Ok(file)
}

#[cfg(unix)]
fn restrict_file(path: &Path) -> io::Result<()> {
    use std::os::unix::fs::PermissionsExt;
    fs::set_permissions(path,fs::Permissions::from_mode(0o600))
}
#[cfg(not(unix))]
fn restrict_file(_path: &Path) -> io::Result<()> { Ok(()) }

#[cfg(unix)]
fn restrict_directory(path: &Path) -> io::Result<()> {
    use std::os::unix::fs::PermissionsExt;
    fs::set_permissions(path,fs::Permissions::from_mode(0o700))
}
#[cfg(not(unix))]
fn restrict_directory(_path: &Path) -> io::Result<()> { Ok(()) }

fn now_ms() -> i64 {
    SystemTime::now().duration_since(UNIX_EPOCH).unwrap_or_default().as_millis() as i64
}

fn request_id() -> String { format!("req_{}",REQUEST_COUNTER.fetch_add(1,Ordering::Relaxed)) }

fn error(status: StatusCode, code: ErrorCode, message: &str, recovery: &str, retryable: bool) -> Response {
    (status,Json(ApiError { request_id: request_id(), error: ErrorBody { code, message: message.into(), retryable, recovery_action: recovery.into() } })).into_response()
}

fn authorize(headers: &HeaderMap, state: &AppState, memory: bool) -> Result<(),Response> {
    let expected_host = format!("127.0.0.1:{}",state.port);
    let host = headers.get("host").and_then(|x| x.to_str().ok()).unwrap_or("");
    if host != expected_host && host != format!("localhost:{}",state.port) {
        return Err(error(StatusCode::FORBIDDEN,ErrorCode::InvalidRequest,"Invalid Host header.","Use the local daemon endpoint.",false));
    }
    if headers.contains_key("origin") {
        return Err(error(StatusCode::FORBIDDEN,ErrorCode::InvalidRequest,"Browser-origin requests are unavailable.","Use the desktop client.",false));
    }
    let supplied = headers.get("authorization").and_then(|x| x.to_str().ok()).and_then(|x| x.strip_prefix("Bearer ")).unwrap_or("");
    if supplied.as_bytes().ct_eq(state.token.as_bytes()).unwrap_u8() != 1 {
        return Err(error(StatusCode::UNAUTHORIZED,ErrorCode::AuthExpired,"Local authentication failed.","Reconnect to the local daemon.",false));
    }
    if memory && headers.get("x-memory-client").and_then(|x| x.to_str().ok()) == Some("mcp") {
        match state.store.settings() {
            Ok(settings) if settings.mcp_enabled => {},
            Ok(_) => return Err(error(StatusCode::FORBIDDEN,ErrorCode::PermissionRequired,"Connected AI app access is disabled.","Enable Connected AI Apps in settings.",false)),
            Err(_) => return Err(error(StatusCode::INTERNAL_SERVER_ERROR,ErrorCode::Internal,"Settings unavailable.","Restart the daemon.",true)),
        }
    }
    Ok(())
}

fn store_error(err: MemoryError) -> Response {
    match err {
        MemoryError::InvalidRequest(message) => error(StatusCode::BAD_REQUEST,ErrorCode::InvalidRequest,message,"Correct the request and retry.",false),
        _ => error(StatusCode::INTERNAL_SERVER_ERROR,ErrorCode::Internal,"Local memory operation failed.","Check diagnostics and retry.",true),
    }
}

async fn health() -> Json<Value> { Json(json!({"service":"cortex-daemon","api_version":API_VERSION})) }

async fn schedule_request(State(state): State<AppState>, headers: HeaderMap, axum::extract::Path(operation): axum::extract::Path<String>, Json(body): Json<Value>) -> Response {
    if let Err(err) = authorize(&headers,&state,true) { return err; }
    if operation == "wake" {
        if headers.get("X-Memory-Client").and_then(|v|v.to_str().ok()) == Some("mcp") {
            return error(StatusCode::FORBIDDEN,ErrorCode::InvalidRequest,"Wake events are desktop-only","Use the native activity source.",false);
        }
        // The daemon shares the same store; activity claims run through the shared runner.
        let root = match state_dir() { Ok(root) => root, Err(_) => return store_error(MemoryError::InvalidRequest("state directory unavailable")) };
        return match cortex_memory::schedule_runtime::wake(&root) { Ok(()) => Json(Envelope { request_id:request_id(),data:json!({"accepted":true}) }).into_response(), Err(e) => store_error(e) };
    }
    match state.workspace.schedule_request(&operation,&body,now_ms()) {
        Ok(data) => Json(Envelope { request_id: request_id(), data }).into_response(),
        Err(e) => store_error(e),
    }
}

async fn workspace_request(State(state): State<AppState>, headers: HeaderMap, axum::extract::Path(operation): axum::extract::Path<String>, Json(body): Json<Value>) -> Response {
    if let Err(err) = authorize(&headers,&state,true) { return err; }
    match state.workspace.request(&operation,&body,now_ms()) {
        Ok(data) => Json(Envelope { request_id: request_id(), data }).into_response(),
        Err(e) => store_error(e),
    }
}

async fn status(State(state): State<AppState>, headers: HeaderMap) -> Response {
    if let Err(err) = authorize(&headers,&state,false) { return err; }
    let settings = match state.store.settings() { Ok(x) => x, Err(e) => return store_error(e) };
    let epoch = match state.store.memory_epoch() { Ok(x) => x, Err(e) => return store_error(e) };
    let count = match state.store.snapshot_count() { Ok(x) => x, Err(e) => return store_error(e) };
    #[cfg(target_os="macos")]
    let permission_state = mac_capture::permission(&state.capture_helper).await;
    #[cfg(not(target_os="macos"))]
    let permission_state = "unsupported";
    Json(Envelope { request_id: request_id(), data: Status { capture_enabled: settings.capture_enabled && permission_state == "granted", capture_paused: settings.capture_paused, permission_state: permission_state.into(), memory_epoch: epoch, snapshot_count: count } }).into_response()
}

async fn get_settings(State(state): State<AppState>, headers: HeaderMap) -> Response {
    if let Err(err) = authorize(&headers,&state,false) { return err; }
    match state.store.settings() { Ok(data) => Json(Envelope { request_id: request_id(), data }).into_response(), Err(e) => store_error(e) }
}

async fn update_settings(State(state): State<AppState>, headers: HeaderMap, Json(patch): Json<SettingsPatch>) -> Response {
    if let Err(err) = authorize(&headers,&state,false) { return err; }
    if patch.capture_enabled == Some(true) {
        #[cfg(target_os="macos")]
        if mac_capture::permission(&state.capture_helper).await != "granted" {
            return error(StatusCode::FORBIDDEN,ErrorCode::PermissionRequired,"macOS Accessibility permission is required.","Grant access to the current Cortex app, then try again.",false);
        }
        #[cfg(not(target_os="macos"))]
        return error(StatusCode::BAD_REQUEST,ErrorCode::InvalidRequest,"Capture is only available on macOS in this build.","Use the macOS app.",false);
    }
    match state.store.update_settings(patch,now_ms()) { Ok(data) => Json(Envelope { request_id: request_id(), data }).into_response(), Err(e) => store_error(e) }
}

async fn request_capture_permission(State(state): State<AppState>, headers: HeaderMap) -> Response {
    if let Err(err) = authorize(&headers,&state,false) { return err; }
    #[cfg(target_os="macos")]
    {
        let permission_state = match mac_capture::run_helper(&state.capture_helper,"--request-permission").await {
            Ok(reply) if reply.permission.as_deref() == Some("granted") => "granted",
            Ok(_) => "not_granted",
            Err(_) => return error(StatusCode::INTERNAL_SERVER_ERROR,ErrorCode::Internal,"Could not request Accessibility permission.","Open macOS System Settings → Privacy & Security → Accessibility.",false),
        };
        return Json(Envelope { request_id: request_id(), data: json!({"permission_state":permission_state}) }).into_response();
    }
    #[cfg(not(target_os="macos"))]
    { error(StatusCode::BAD_REQUEST,ErrorCode::InvalidRequest,"Capture is only available on macOS in this build.","Use the macOS app.",false) }
}

async fn search(State(state): State<AppState>, headers: HeaderMap, Json(request): Json<SearchRequest>) -> Response {
    if let Err(err) = authorize(&headers,&state,true) { return err; }
    match state.store.search(&request) { Ok(data) => Json(Envelope { request_id: request_id(), data }).into_response(), Err(e) => store_error(e) }
}

async fn snapshots(State(state): State<AppState>, headers: HeaderMap, Json(request): Json<SnapshotsRequest>) -> Response {
    if let Err(err) = authorize(&headers,&state,true) { return err; }
    match state.store.snapshots(&request.ids) { Ok(data) => Json(Envelope { request_id: request_id(), data }).into_response(), Err(e) => store_error(e) }
}

async fn recent(State(state): State<AppState>, headers: HeaderMap, Query(query): Query<RecentQuery>) -> Response {
    if let Err(err) = authorize(&headers,&state,true) { return err; }
    match state.store.recent(query.since_ms,query.limit) { Ok(data) => Json(Envelope { request_id: request_id(), data }).into_response(), Err(e) => store_error(e) }
}

async fn working_memory(State(state): State<AppState>, headers: HeaderMap, Query(query): Query<LimitQuery>) -> Response {
    if let Err(err) = authorize(&headers,&state,true) { return err; }
    match state.store.working_memory(query.limit) { Ok(data) => Json(Envelope { request_id: request_id(), data }).into_response(), Err(e) => store_error(e) }
}

async fn chronicle(State(state): State<AppState>, headers: HeaderMap, Query(query): Query<ChronicleQuery>) -> Response {
    if let Err(err) = authorize(&headers,&state,true) { return err; }
    if query.level != "day" { return error(StatusCode::BAD_REQUEST,ErrorCode::InvalidRequest,"Only day chronicles are available in this preview.","Use level=day.",false); }
    let timezone = query.timezone.as_deref().unwrap_or("UTC");
    match state.store.day_chronicle(&query.period,timezone) { Ok(data) => Json(Envelope { request_id: request_id(), data }).into_response(), Err(e) => store_error(e) }
}

async fn time_report(State(state): State<AppState>, headers: HeaderMap, Query(query): Query<TimeQuery>) -> Response {
    if let Err(err) = authorize(&headers,&state,true) { return err; }
    if query.group_by.as_deref().unwrap_or("app") != "app" { return error(StatusCode::BAD_REQUEST,ErrorCode::InvalidRequest,"Only app grouping is available in this preview.","Use group_by=app.",false); }
    match state.store.time_report(query.from_ms,query.to_ms) {
        Ok(rows) => Json(Envelope { request_id: request_id(), data: json!({"from_ms":query.from_ms,"to_ms":query.to_ms,"group_by":"app","basis":"tracked_foreground_activity","groups":rows.into_iter().map(|(app_id,active_ms)| json!({"app_id":app_id,"active_ms":active_ms})).collect::<Vec<_>>()}) }).into_response(),
        Err(e) => store_error(e),
    }
}

async fn delete_memory(State(state): State<AppState>, headers: HeaderMap, Json(request): Json<DeleteRequest>) -> Response {
    if let Err(err) = authorize(&headers,&state,false) { return err; }
    let result = match request.scope.as_str() {
        "all" if request.confirmation == "DELETE ALL LOCAL MEMORY" => state.store.delete_all(now_ms()).map(|n| n as usize),
        "snapshots" if request.confirmation == "DELETE SELECTED LOCAL MEMORY" => {
            match request.ids.as_ref() {
                Some(ids) if !ids.is_empty() => state.store.delete_snapshots(ids,now_ms()),
                _ => return error(StatusCode::BAD_REQUEST,ErrorCode::InvalidRequest,"Snapshot IDs are required.","Select snapshots to delete.",false),
            }
        }
        _ => return error(StatusCode::BAD_REQUEST,ErrorCode::InvalidRequest,"Deletion confirmation did not match scope.","Review the deletion choice and confirm again.",false),
    };
    match result {
        Ok(deleted) => match state.store.memory_epoch() {
            Ok(epoch) => Json(Envelope { request_id: request_id(), data: json!({"scope":request.scope,"deleted_snapshots":deleted,"memory_epoch":epoch,"capture_paused":true}) }).into_response(),
            Err(e) => store_error(e),
        },
        Err(e) => store_error(e),
    }
}

fn seed_synthetic(store: &MemoryStore) -> Result<(),Box<dyn std::error::Error>> {
    use cortex_capture::{BrowserContext,CapturePolicy,RawNode,RawWindow,SessionState};
    let example = RawWindow { app_id: "example.mail".into(), window_session_id: "synthetic-window".into(), title: "Launch review".into(), browser: BrowserContext::NotBrowser, session: SessionState::Active, observed_ms: now_ms(), timezone: "UTC".into(), source_event: "synthetic_fixture".into(), focus_role: Some("text_field".into()), focus_name: None, focus_path: None, roots: vec![RawNode { role: "text".into(), name: None, value: Some("Synthetic example: launch review moved to Thursday. This is test data, not user activity.".into()), visible: true, protected: false, excluded: false, children: vec![] }] };
    let sanitized = CapturePolicy { consent: true, ..Default::default() }.sanitize(&example)
        .map_err(|reason| io::Error::new(io::ErrorKind::Other,format!("synthetic fixture skipped: {reason:?}")))?;
    store.ingest(&sanitized)?;
    Ok(())
}
