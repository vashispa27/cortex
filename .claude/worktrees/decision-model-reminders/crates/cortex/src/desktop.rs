//! Cortex's desktop adapter. Owns the same Runtime and canonical archive as the
//! CLI; IPC adapts UI requests, not retrieval or cleaning algorithms.
use super::*;

const MAX_REQUEST: u64 = 65_537;
/// How many of the best results are widened with neighbouring chunks, and to how many chunks.
const WIDENED_TOP_HITS: usize = 3;
const WIDENED_MAX_CHUNKS: usize = 6;

#[derive(Clone, Serialize, Deserialize)]
struct Settings {
    version: u64,
    capture_enabled: bool,
    capture_paused: bool,
    mcp_enabled: bool,
    excluded_apps: Vec<String>,
    excluded_domains: Vec<String>,
    /// Routes every search to the separate eval archive and lets the notch record into it.
    #[serde(default)]
    test_mode: bool,
    /// Nothing may be sent to a cloud model, whatever else is chosen.
    #[serde(default)]
    local_only: bool,
    /// Contextual retrieval: a model writes a short context for each new chunk before it is indexed.
    #[serde(default)]
    context_enabled: bool,
    /// "local" (a server on this Mac) or "cloud" (OpenRouter), as the app resolved it for this layer.
    #[serde(default = "local_provider")]
    context_provider: String,
    #[serde(default)]
    context_cloud_model: String,
    #[serde(default)]
    context_local_model: String,
    /// Base address of the local model server, such as `http://127.0.0.1:8080/v1`.
    #[serde(default)]
    local_endpoint: String,
}
fn local_provider() -> String {
    "local".into()
}
/// Tells the context generator which model and provider Settings chose. Local-only wins over a cloud choice.
fn apply_context(settings: &Settings) -> Result<()> {
    let cloud = settings.context_provider == "cloud" && !settings.local_only;
    let model = if cloud { &settings.context_cloud_model } else { &settings.context_local_model };
    contextual::configure(settings.context_enabled, cloud, model, &settings.local_endpoint)
}
/// True when the main archive's index was built without context, so enabling context needs a re-index.
fn index_lacks_context(db: &Connection) -> bool {
    let old: Option<String> = db.query_row("SELECT value FROM index_meta WHERE key='model'", [], |r| r.get(0)).optional().ok().flatten();
    old.is_some_and(|v| v != prefix::index_version(prefix::Prefix::Contextual))
}
impl Default for Settings {
    fn default() -> Self {
        Self {
            version: 0,
            capture_enabled: false,
            capture_paused: false,
            mcp_enabled: false,
            excluded_apps: vec![],
            excluded_domains: vec![],
            test_mode: false,
            local_only: false,
            context_enabled: false,
            context_provider: local_provider(),
            context_cloud_model: String::new(),
            context_local_model: String::new(),
            local_endpoint: String::new(),
        }
    }
}
fn write_settings(root: &Path, settings: &Settings) -> Result<()> {
    let tmp = root.join("cortex-capture.json.tmp");
    fs::write(&tmp, serde_json::to_vec(settings)?)?;
    fs::set_permissions(&tmp, fs::Permissions::from_mode(0o600))?;
    fs::rename(tmp, root.join("cortex-capture.json"))?;
    Ok(())
}
fn load_settings(root: &Path) -> Result<Settings> {
    let path = root.join("cortex-capture.json");
    // Settings written before the Rewind to Cortex rename.
    let renamed = root.join("rewind-capture.json");
    if !path.exists() && renamed.exists() {
        fs::rename(&renamed, &path)?;
    }
    if path.exists() {
        return Ok(serde_json::from_slice(&fs::read(path)?)?);
    }
    let mut settings = Settings::default();
    let legacy = root.join("memory.sqlite3");
    if legacy.exists() {
        let db = Connection::open_with_flags(legacy, rusqlite::OpenFlags::SQLITE_OPEN_READ_ONLY)?;
        let mut stmt = db.prepare("SELECT key,value_json FROM settings")?;
        for row in stmt.query_map([], |r| Ok((r.get::<_, String>(0)?, r.get::<_, String>(1)?)))? {
            let (key, value) = row?;
            match key.as_str() {
                "capture_enabled" => settings.capture_enabled = serde_json::from_str(&value)?,
                "capture_paused" => settings.capture_paused = serde_json::from_str(&value)?,
                "excluded_apps" => settings.excluded_apps = serde_json::from_str(&value)?,
                "excluded_domains" => settings.excluded_domains = serde_json::from_str(&value)?,
                _ => {}
            }
        }
    }
    write_settings(root, &settings)?;
    Ok(settings)
}

/// Test mode's own archive: a separate SQLite file and Qdrant index next to (never inside) the real
/// memory, so evals only ever see what the user deliberately recorded into it. Recording is a
/// play/pause switch that is off whenever the engine starts.
struct EvalLab {
    dir: PathBuf,
    runtime: Option<Runtime>,
    capturing: bool,
}
impl EvalLab {
    fn new(root: &Path) -> Self {
        let dir = env::var_os("CORTEX_EVAL_DIR").map(PathBuf::from).unwrap_or_else(|| root.join("eval-memory"));
        Self { dir, runtime: None, capturing: false }
    }
    /// Opens the eval archive on first use. It borrows the embedding model of the real runtime, so it is
    /// not downloaded or loaded twice.
    fn runtime(&mut self, main: &Runtime) -> Result<&mut Runtime> {
        if self.runtime.is_none() {
            fs::create_dir_all(&self.dir)?;
            fs::set_permissions(&self.dir, fs::Permissions::from_mode(0o700))?;
            // The eval archive never generates context, whatever Settings chose for the real memory.
            contextual::suppress(true);
            let opened = open_runtime_with(&self.dir, false, Some(main.model.clone()), prefix::Prefix::DEFAULT);
            contextual::suppress(false);
            self.runtime = Some(opened?);
        }
        self.runtime.as_mut().context("eval archive unavailable")
    }
    /// Deletes everything recorded for evals: the database, the vector index and both logs. Only files
    /// this module creates are removed, so a mistyped `CORTEX_EVAL_DIR` cannot take anything else with it.
    fn reset(&mut self) -> Result<()> {
        self.capturing = false;
        self.runtime = None;
        for name in ["memory.sqlite3", "memory.sqlite3-wal", "memory.sqlite3-shm", CAPTURE_LOG, QUERY_LOG] {
            let path = self.dir.join(name);
            if path.is_file() {
                fs::remove_file(path)?;
            }
        }
        let index = self.dir.join("qdrant-edge");
        if index.is_dir() {
            fs::remove_dir_all(index)?;
        }
        Ok(())
    }
}
const CAPTURE_LOG: &str = "captures.jsonl";
const QUERY_LOG: &str = "queries.jsonl";

fn append_jsonl(dir: &Path, name: &str, value: &Value) -> Result<()> {
    use std::io::Write;
    use std::os::unix::fs::OpenOptionsExt;
    let mut file = fs::OpenOptions::new().create(true).append(true).mode(0o600).open(dir.join(name))?;
    writeln!(file, "{value}")?;
    Ok(())
}
/// Writes what the cleaner produced for a newly recorded page and the chunks that were cut from it:
/// exactly the text that goes on to be embedded.
fn log_eval_capture(dir: &Path, rt: &Runtime, id: i64) -> Result<()> {
    let source = load_source(&rt.db, id, 0.0)?.context("recorded source missing")?;
    let mut stmt = rt.db.prepare("SELECT body FROM chunks WHERE snapshot_id=?1 ORDER BY start_byte")?;
    let chunks = stmt.query_map([id], |r| r.get::<_, String>(0))?.collect::<rusqlite::Result<Vec<_>>>()?;
    append_jsonl(dir, CAPTURE_LOG, &json!({
        "captured_at": time_string(now_ms()), "snapshot_id": id, "app_id": source.app_id, "title": source.title,
        "url": source.url, "source_type": source.source_type, "cleaner_quality": source.cleaner_quality,
        "cleaned_body": source.body, "chunks": chunks,
    }))
}
fn log_eval_query(dir: &Path, route: &str, query: &str, hits: &[Hit], abstained: bool) -> Result<()> {
    let results: Vec<Value> = hits.iter().map(|h| json!({"snapshot_id":h.source.id,"app_id":h.source.app_id,"title":h.source.title,"url":h.source.url,"score":h.source.score})).collect();
    append_jsonl(dir, QUERY_LOG, &json!({"asked_at":time_string(now_ms()),"route":route,"query":query,"abstained":abstained,"results":results}))
}
/// Routes that read the archive: in test mode these answer from the eval archive instead.
fn reads_archive(method: &str, path: &str) -> bool {
    matches!(
        (method, path),
        ("GET", "/v1/status")
            | ("POST", "/v1/memory/search" | "/v1/memory/retrieve" | "/v1/memory/snapshots" | "/v1/assistant/prepare" | "/v1/assistant/search")
    ) || (method == "GET" && path.starts_with("/v1/memory/recent?"))
}
fn settings_json(settings: &Settings, lab: &EvalLab) -> Result<Value> {
    let mut value = serde_json::to_value(settings)?;
    value["eval_capture_active"] = json!(settings.test_mode && lab.capturing);
    value["eval_dir"] = json!(lab.dir);
    Ok(value)
}

/// Copy the former desktop's already-sanitized captures into the canonical
/// archive once. Keep the old database and IDs in a mapping; never reinterpret
/// its schema as the newer schema, or fabricate missing original AX trees.
fn import_legacy(root: &Path, db: &mut Connection) -> Result<usize> {
    db.execute_batch("CREATE TABLE IF NOT EXISTS desktop_imports (legacy_id INTEGER PRIMARY KEY, snapshot_id INTEGER NOT NULL);")?;
    let path = root.join("memory.sqlite3");
    if !path.exists() {
        return Ok(0);
    }
    let old = Connection::open_with_flags(path, rusqlite::OpenFlags::SQLITE_OPEN_READ_ONLY)?;
    let has_snapshots: bool = old.query_row(
        "SELECT EXISTS(SELECT 1 FROM sqlite_master WHERE type='table' AND name='snapshots')",
        [],
        |r| r.get(0),
    )?;
    if !has_snapshots {
        return Ok(0);
    }
    let mut stmt = old.prepare("SELECT id,app_id,title,url,body,first_seen_ms,last_seen_ms,window_session_id FROM snapshots ORDER BY id")?;
    let mut count = 0;
    for row in stmt.query_map([], |r| {
        Ok((
            r.get::<_, i64>(0)?,
            r.get::<_, String>(1)?,
            r.get::<_, String>(2)?,
            r.get::<_, Option<String>>(3)?,
            r.get::<_, String>(4)?,
            r.get::<_, i64>(5)?,
            r.get::<_, i64>(6)?,
            r.get::<_, String>(7)?,
        ))
    })? {
        let (id, app, title, url, body, first, last, window) = row?;
        if is_self(&app)
            || db.query_row(
                "SELECT EXISTS(SELECT 1 FROM desktop_imports WHERE legacy_id=?1)",
                [id],
                |r| r.get::<_, bool>(0),
            )?
        {
            continue;
        }
        let domain = url
            .as_deref()
            .and_then(|u| url::Url::parse(u).ok())
            .and_then(|u| u.host_str().map(str::to_owned));
        let fingerprint = content_fingerprint(&app, url.as_deref(), &title, &body);
        let tx = db.transaction()?;
        tx.execute("INSERT OR IGNORE INTO snapshots(fingerprint,evidence_fingerprint,app_id,title,url,domain,source_type,body,first_seen_ms,last_seen_ms,duration_ms,limitations,cleaner_version,cleaner_quality,cleaner_coverage,searchable) VALUES(?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?10-?9,'[\"legacy_sanitized_text_no_original_ax_tree\"]',?11,'legacy_sanitized',1.0,1)",params![fingerprint,evidence_key(&app,domain.as_deref(),"app",&body),app,title,url,domain,if domain.is_some(){"browser"}else{"app"},body,first,last,cleaner::VERSION])?;
        let target: i64 = tx.query_row(
            "SELECT id FROM snapshots WHERE fingerprint=?1",
            [&fingerprint],
            |r| r.get(0),
        )?;
        tx.execute("UPDATE snapshots SET first_seen_ms=MIN(first_seen_ms,?2),last_seen_ms=MAX(last_seen_ms,?3),duration_ms=MAX(last_seen_ms,?3)-MIN(first_seen_ms,?2) WHERE id=?1",params![target,first,last])?;
        let existing: i64 = tx.query_row(
            "SELECT COUNT(*) FROM chunks WHERE snapshot_id=?1",
            [target],
            |r| r.get(0),
        )?;
        if existing == 0 {
            for (start, end, text) in cleaner::chunks_cfg(&body, &cleaner::DEFAULT_CFG) {
                tx.execute("INSERT OR IGNORE INTO chunks(snapshot_id,start_byte,end_byte,body) VALUES(?1,?2,?3,?4)",params![target,start as i64,end as i64,text])?;
            }
        }
        // Preserve all observation timestamps for date-scoped retrieval.
        let mut observations = old.prepare(
            "SELECT observed_ms FROM observations WHERE snapshot_id=?1 ORDER BY observed_ms",
        )?;
        for observed in observations.query_map([id], |r| r.get::<_, i64>(0))? {
            tx.execute("INSERT INTO observations(snapshot_id,observed_ms,window_session_id,limitations) VALUES(?1,?2,?3,'[\"legacy_import\"]')",params![target,observed?,window])?;
        }
        tx.execute(
            "INSERT INTO desktop_imports(legacy_id,snapshot_id) VALUES(?1,?2)",
            params![id, target],
        )?;
        tx.commit()?;
        count += 1;
    }
    Ok(count)
}
/// macOS ties the Accessibility grant to the process that reads the tree. A
/// bare helper binary shows up under a different identity after each change and
/// the grant never sticks, so run it from a named, signed app bundle whose
/// identity stays the same until the helper itself changes.
fn install_capture_bundle(root: &Path) -> Result<PathBuf> {
    use std::io::Write;
    use std::os::unix::fs::{MetadataExt, OpenOptionsExt};
    let bundle = root.join("Cortex Capture.app");
    let path = bundle.join("Contents/MacOS/Cortex Capture");
    let source = bundle.join("Contents/Resources/helper-source");
    if let Ok(meta) = fs::symlink_metadata(&path) {
        if meta.is_file()
            && fs::metadata(root).map(|dir| dir.uid() == meta.uid()).unwrap_or(false)
            && meta.mode() & 0o077 == 0
            && fs::read(&source).map(|bytes| bytes == HELPER).unwrap_or(false)
            && bundle.join("Contents/Info.plist").is_file()
        {
            return Ok(path);
        }
    }
    let temp = root.join("Cortex Capture.tmp.app");
    if temp.exists() {
        fs::remove_dir_all(&temp)?;
    }
    fs::create_dir_all(temp.join("Contents/MacOS"))?;
    fs::create_dir_all(temp.join("Contents/Resources"))?;
    let executable = temp.join("Contents/MacOS/Cortex Capture");
    let mut file = fs::OpenOptions::new()
        .write(true)
        .create_new(true)
        .mode(0o700)
        .open(&executable)?;
    file.write_all(HELPER)?;
    file.sync_all()?;
    fs::write(temp.join("Contents/Resources/helper-source"), HELPER)?;
    fs::write(
        temp.join("Contents/Info.plist"),
        br#"<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
<key>CFBundleIdentifier</key><string>app.cortex.capture</string>
<key>CFBundleName</key><string>Cortex Capture</string>
<key>CFBundleDisplayName</key><string>Cortex Capture</string>
<key>CFBundleExecutable</key><string>Cortex Capture</string>
<key>CFBundlePackageType</key><string>APPL</string>
<key>CFBundleVersion</key><string>1</string>
<key>LSUIElement</key><true/>
</dict></plist>"#,
    )?;
    let signed = Command::new("/usr/bin/codesign")
        .args(["--force", "--sign", "-"])
        .arg(&temp)
        .output()?;
    if !signed.status.success() {
        bail!("Could not sign the Cortex Capture helper");
    }
    if bundle.exists() {
        fs::remove_dir_all(&bundle)?;
    }
    fs::rename(&temp, &bundle)?;
    Ok(path)
}
fn is_self(app: &str) -> bool {
    matches!(
        app,
        "app.cortex.desktop" | "app.cortex.capture"
    )
}
extern "C" {
    fn responsibility_spawnattrs_setdisclaim(
        attr: *mut libc::posix_spawnattr_t,
        disclaim: libc::c_int,
    ) -> libc::c_int;
}

/// Run the capture helper as its own "responsible process". A child of the
/// Cortex app is otherwise judged by macOS under Cortex's identity, which an
/// ad-hoc-signed development build changes on every rebuild, so an Accessibility
/// grant to "Cortex Capture" would never apply. Disclaiming makes the helper's
/// stable bundle identity the one that is checked and prompted for.
fn run_helper(path: &Path, mode: &str) -> Result<AxReply> {
    let bytes = run_helper_raw(path, &[mode.to_owned()], None, 15)?;
    serde_json::from_slice(&bytes).context("invalid Accessibility response")
}
/// Spawns the helper with `args`, optionally feeding `input` on stdin, and returns its stdout.
pub(crate) fn run_helper_raw(path: &Path, args: &[String], input: Option<&[u8]>, timeout_secs: u64) -> Result<Vec<u8>> {
    use std::ffi::CString;
    use std::os::fd::FromRawFd;
    use std::os::unix::ffi::OsStrExt;
    unsafe {
        let mut fds = [0 as libc::c_int; 2];
        if libc::pipe(fds.as_mut_ptr()) != 0 {
            bail!("Accessibility helper failed");
        }
        let mut stdin_fds = [-1 as libc::c_int; 2];
        if input.is_some() && libc::pipe(stdin_fds.as_mut_ptr()) != 0 {
            libc::close(fds[0]);
            libc::close(fds[1]);
            bail!("Accessibility helper failed");
        }
        for fd in [fds[0], fds[1], stdin_fds[0], stdin_fds[1]] {
            if fd >= 0 {
                libc::fcntl(fd, libc::F_SETFD, libc::FD_CLOEXEC);
            }
        }
        let mut actions: libc::posix_spawn_file_actions_t = std::mem::zeroed();
        let mut attr: libc::posix_spawnattr_t = std::mem::zeroed();
        libc::posix_spawn_file_actions_init(&mut actions);
        libc::posix_spawnattr_init(&mut attr);
        let null = CString::new("/dev/null")?;
        if input.is_some() {
            libc::posix_spawn_file_actions_adddup2(&mut actions, stdin_fds[0], 0);
        } else {
            libc::posix_spawn_file_actions_addopen(&mut actions, 0, null.as_ptr(), libc::O_RDONLY, 0);
        }
        libc::posix_spawn_file_actions_addopen(&mut actions, 2, null.as_ptr(), libc::O_WRONLY, 0);
        libc::posix_spawn_file_actions_adddup2(&mut actions, fds[1], 1);
        responsibility_spawnattrs_setdisclaim(&mut attr, 1);
        let program = CString::new(path.as_os_str().as_bytes())?;
        let mut owned: Vec<CString> = vec![program.clone()];
        for arg in args {
            owned.push(CString::new(arg.as_str())?);
        }
        let mut argv: Vec<*const libc::c_char> = owned.iter().map(|arg| arg.as_ptr()).collect();
        argv.push(std::ptr::null());
        let vars: Vec<CString> = env::vars_os()
            .filter_map(|(k, v)| {
                let mut entry = k.as_bytes().to_vec();
                entry.push(b'=');
                entry.extend_from_slice(v.as_bytes());
                CString::new(entry).ok()
            })
            .collect();
        let mut envp: Vec<*const libc::c_char> = vars.iter().map(|v| v.as_ptr()).collect();
        envp.push(std::ptr::null());
        let mut pid: libc::pid_t = 0;
        let spawned = libc::posix_spawn(
            &mut pid,
            program.as_ptr(),
            &actions,
            &attr,
            argv.as_ptr() as *const *mut libc::c_char,
            envp.as_ptr() as *const *mut libc::c_char,
        );
        libc::posix_spawn_file_actions_destroy(&mut actions);
        libc::posix_spawnattr_destroy(&mut attr);
        libc::close(fds[1]);
        let mut reader = fs::File::from_raw_fd(fds[0]);
        if input.is_some() {
            libc::close(stdin_fds[0]);
        }
        if spawned != 0 {
            if input.is_some() {
                libc::close(stdin_fds[1]);
            }
            bail!("Accessibility helper could not start");
        }
        if let Some(input) = input {
            let mut writer = fs::File::from_raw_fd(stdin_fds[1]);
            let payload = input.to_vec();
            thread::spawn(move || {
                let _ = writer.write_all(&payload);
            });
        }
        let (tx, rx) = std::sync::mpsc::channel();
        thread::spawn(move || {
            let mut bytes = Vec::new();
            let _ = (&mut reader).take(512 * 1024 + 1).read_to_end(&mut bytes);
            let _ = tx.send(bytes);
        });
        let bytes = rx.recv_timeout(Duration::from_secs(timeout_secs));
        if bytes.is_err() {
            libc::kill(pid, libc::SIGKILL);
        }
        let mut status = 0;
        libc::waitpid(pid, &mut status, 0);
        let bytes = bytes.map_err(|_| anyhow!("Accessibility helper timed out"))?;
        if !libc::WIFEXITED(status) || libc::WEXITSTATUS(status) != 0 || bytes.len() > 512 * 1024 {
            bail!("Accessibility helper failed");
        }
        Ok(bytes)
    }
}
fn permission(helper: &Path) -> String {
    run_helper(helper, "--permission")
        .ok()
        .and_then(|r| r.permission)
        .unwrap_or_else(|| "not_granted".into())
}
/// `YYYY-MM-DD` or `YYYY-MM-DDTHH:MM[:SS]` in local time, as milliseconds. A bare date means the
/// start of that day, or with `end` the start of the next, so a range of dates is inclusive.
fn parse_when(value: &str, end: bool) -> Option<i64> {
    let value = value.trim();
    let local = |t: chrono::NaiveDateTime| Local.from_local_datetime(&t).earliest().map(|t| t.timestamp_millis());
    if let Ok(date) = chrono::NaiveDate::parse_from_str(value, "%Y-%m-%d") {
        let day = if end { date.succ_opt()? } else { date };
        return local(day.and_hms_opt(0, 0, 0)?);
    }
    ["%Y-%m-%dT%H:%M:%S", "%Y-%m-%dT%H:%M"]
        .iter()
        .find_map(|f| chrono::NaiveDateTime::parse_from_str(value, f).ok())
        .and_then(local)
}
/// The best results are most likely the page the answer is on, but retrieval only returns the chunks that matched
/// the question best, and in a chat thread those are often the repeated sidebar rather than the message that holds
/// the fact. So the top results also get the chunks next to the ones that matched, up to `max_chunks`, in page order.
fn widen_top_hits(db: &Connection, hits: &mut [Hit], top: usize, max_chunks: usize) -> Result<()> {
    for hit in hits.iter_mut().take(top) {
        // Item chunks (segment.rs) are not neighbours in a page; they carry their own header.
        if hit.chunks.iter().any(|c| c.header.is_some()) {
            continue;
        }
        let mut stmt = db.prepare("SELECT id,body FROM chunks WHERE snapshot_id=?1 AND body!='' ORDER BY start_byte,id")?;
        let all = stmt
            .query_map([hit.source.id], |r| Ok((r.get::<_, i64>(0)?, r.get::<_, String>(1)?)))?
            .collect::<rusqlite::Result<Vec<_>>>()?;
        let mut keep: Vec<usize> = hit.chunks.iter().filter_map(|c| all.iter().position(|(id, _)| *id == c.chunk_id)).collect();
        if keep.is_empty() || all.len() <= keep.len() {
            continue;
        }
        // Next chunk before previous (a message usually follows its header), nearest first.
        'grow: for distance in 1..all.len() {
            for index in keep.clone() {
                for candidate in [index.checked_add(distance).filter(|i| *i < all.len()), index.checked_sub(distance)].into_iter().flatten() {
                    if keep.len() >= max_chunks {
                        break 'grow;
                    }
                    if !keep.contains(&candidate) {
                        keep.push(candidate);
                    }
                }
            }
        }
        keep.sort_unstable();
        let score = |id: i64| hit.chunks.iter().find(|c| c.chunk_id == id).map_or(0.0, |c| c.score);
        hit.chunks = keep.into_iter().map(|i| EvidenceChunk { chunk_id: all[i].0, text: all[i].1.clone(), score: score(all[i].0), header: None }).collect();
    }
    Ok(())
}
fn hit_json(hit: &Hit, question: &str, chunks: usize) -> Value {
    let s = &hit.source;
    json!({"snapshot_id":s.id,"observed_ms":s.last_seen_ms,"app_id":s.app_id,"title":s.title,"url":s.url,"excerpt":evidence_snippet(hit,question,chunks),"evidence_available":true,"truncated":false,"score":s.score})
}
fn recent(db: &Connection, limit: usize, since: i64) -> Result<Value> {
    let mut stmt = db.prepare("SELECT id FROM snapshots WHERE last_seen_ms>=?1 AND searchable=1 ORDER BY last_seen_ms DESC LIMIT ?2")?;
    let ids = stmt
        .query_map(params![since, limit as i64], |r| r.get::<_, i64>(0))?
        .collect::<rusqlite::Result<Vec<_>>>()?;
    let mut results = Vec::new();
    for id in ids {
        if let Some(s) = load_source(db, id, 0.0)? {
            results.push(json!({"snapshot_id":s.id,"observed_ms":s.last_seen_ms,"app_id":s.app_id,"title":s.title,"url":s.url,"excerpt":s.body.chars().take(360).collect::<String>(),"evidence_available":true,"truncated":false}));
        }
    }
    Ok(json!({"results":results,"coverage":{"state":"partial"},"next_cursor":null}))
}
fn route(
    rt: &mut Runtime,
    lab: &mut EvalLab,
    root: &Path,
    settings: &mut Settings,
    helper: &Path,
    request: &Value,
) -> Result<Value> {
    let method = request["method"].as_str().context("method missing")?;
    let path = request["path"].as_str().context("path missing")?;
    let body = &request["body"];
    if request["client"] == "mcp" && !settings.mcp_enabled {
        bail!("MCP_DISABLED: Enable Connected AI Apps in Cortex settings");
    }
    if request["client"] == "mcp" && !(path.starts_with("/v1/workspace/") || path.starts_with("/v1/schedules/") || path.starts_with("/v1/memory/") || path == "/v1/time/report") {
        bail!("MCP route is unavailable");
    }
    if method == "POST" && path == "/v1/schedules/wake" {
        if request["client"] == "mcp" { bail!("Wake events are desktop-only"); }
        cortex_memory::schedule_runtime::wake(root)?;
        return Ok(json!({"accepted":true}));
    }
    if method == "POST" && path.starts_with("/v1/schedules/") {
        let workspace = cortex_memory::workspace::WorkspaceStore::open(&root.join("workspace.sqlite3"))?;
        return Ok(workspace.schedule_request(&path[14..], body, now_ms())?);
    }
    if method == "POST" && path.starts_with("/v1/workspace/") {
        let workspace = cortex_memory::workspace::WorkspaceStore::open(&root.join("workspace.sqlite3"))?;
        return Ok(workspace.request(&path[14..], body, now_ms())?);
    }
    match (method, path) {
        ("POST", "/v1/eval/capture") => {
            // The play/pause switch. Only available in test mode, and only with Accessibility permission.
            if !settings.test_mode {
                bail!("Turn on test mode in Settings first");
            }
            let active = body["active"].as_bool().context("active must be true or false")?;
            if active {
                if permission(helper) != "granted" {
                    bail!("Accessibility permission is not granted to Cortex Capture");
                }
                lab.runtime(rt)?;
            }
            lab.capturing = active;
            return settings_json(settings, lab);
        }
        ("POST", "/v1/eval/reset") => {
            if body["confirmation"] != "RESET EVAL DATA" {
                bail!("Reset confirmation did not match");
            }
            lab.reset()?;
            return Ok(json!({"reset":true,"eval_dir":lab.dir}));
        }
        _ => {}
    }
    // In test mode every question is answered from the eval archive; the real memory is not read.
    let eval_dir = lab.dir.clone();
    let test_mode = settings.test_mode;
    let reads_eval = test_mode && reads_archive(method, path);
    let rt = if reads_eval { lab.runtime(rt)? } else { rt };
    match (method, path) {
        ("GET", "/v1/health") => Ok(json!({"ready":true,"retrieval_engine":"qdrant_edge_hybrid"})),
        ("GET", "/v1/status") => {
            let count: i64 = rt.db.query_row(
                "SELECT COUNT(*) FROM snapshots WHERE searchable=1",
                [],
                |r| r.get(0),
            )?;
            let indexed: i64 =
                rt.db
                    .query_row("SELECT COUNT(*) FROM chunks WHERE indexed=1", [], |r| {
                        r.get(0)
                    })?;
            let access = permission(helper);
            let epoch: i64 = rt
                .db
                .query_row(
                    "SELECT CAST(value AS INTEGER) FROM index_meta WHERE key='memory_epoch'",
                    [],
                    |r| r.get(0),
                )
                .optional()?
                .unwrap_or(0);
            Ok(
                json!({"test_mode":test_mode,"eval_dir":eval_dir,"capture_enabled":settings.capture_enabled && access=="granted","capture_paused":settings.capture_paused,"permission_state":access,"snapshot_count":count,"indexed_chunks":indexed,"memory_epoch":epoch,"retrieval_engine":"qdrant_edge_hybrid","embedding_model":MODEL_VERSION,"version":"0.1.0","ready":true}),
            )
        }
        ("GET", "/v1/settings") => settings_json(settings, lab),
        ("PATCH", "/v1/settings") => {
            if body["expected_version"].as_u64() != Some(settings.version) {
                bail!("Settings changed; refresh and try again");
            }
            let mut next = settings.clone();
            for (key, target) in [
                ("capture_enabled", &mut next.capture_enabled),
                ("capture_paused", &mut next.capture_paused),
                ("mcp_enabled", &mut next.mcp_enabled),
            ] {
                if let Some(value) = body.get(key) {
                    *target = value.as_bool().context("invalid capture setting")?;
                }
            }
            if let Some(value) = body.get("test_mode") {
                next.test_mode = value.as_bool().context("invalid test mode setting")?;
            }
            for (key, target) in [("local_only", &mut next.local_only), ("context_enabled", &mut next.context_enabled)] {
                if let Some(value) = body.get(key) {
                    *target = value.as_bool().with_context(|| format!("invalid {key} setting"))?;
                }
            }
            if let Some(value) = body.get("context_provider") {
                next.context_provider = match value.as_str() {
                    Some(p @ ("local" | "cloud")) => p.to_owned(),
                    _ => bail!("context_provider must be local or cloud"),
                };
            }
            for (key, target) in [
                ("context_cloud_model", &mut next.context_cloud_model),
                ("context_local_model", &mut next.context_local_model),
                ("local_endpoint", &mut next.local_endpoint),
            ] {
                if let Some(value) = body.get(key) {
                    let text = value.as_str().with_context(|| format!("invalid {key} setting"))?.trim();
                    if text.len() > 160 || (key.ends_with("_model") && text.chars().any(char::is_whitespace)) {
                        bail!("invalid {key} setting");
                    }
                    *target = text.to_owned();
                }
            }
            // Validate before saving: a bad model name or address must not be persisted.
            apply_context(&next)?;
            let reindex = next.context_enabled && !settings.context_enabled && index_lacks_context(&rt.db);
            for (key, target) in [
                ("excluded_apps", &mut next.excluded_apps),
                ("excluded_domains", &mut next.excluded_domains),
            ] {
                if let Some(value) = body.get(key) {
                    *target = serde_json::from_value(value.clone())?;
                    if target.len() > 200 || target.iter().any(|v| v.is_empty() || v.len() > 253) {
                        bail!("Invalid exclusion list");
                    }
                }
            }
            next.version += 1;
            write_settings(root, &next)?;
            if !next.test_mode {
                lab.capturing = false;
            }
            *settings = next;
            let mut response = settings_json(settings, lab)?;
            // Enabling context on an index built without it: the engine re-embeds from the archive (nothing is deleted).
            response["reindex"] = json!(reindex);
            Ok(response)
        }
        ("POST", "/v1/capture/request-permission") => {
            Ok(json!({"permission_state":run_helper(helper,"--request-permission")?.permission}))
        }
        ("POST", "/v1/memory/search" | "/v1/memory/retrieve" | "/v1/assistant/prepare") => {
            let assistant = path == "/v1/assistant/prepare";
            let query = body["query"]
                .as_str()
                .filter(|q| !q.trim().is_empty() && q.len() <= 4096)
                .context("Invalid search question")?;
            let mut params = Params::default();
            params.final_k = body["limit"]
                .as_u64()
                .unwrap_or(answer_pipeline::SOURCE_LIMIT as u64)
                .clamp(1, 50) as usize;
            let mut result = retrieve(rt, query, &params)?;
            if test_mode {
                let _ = log_eval_query(&eval_dir, path, query, &result.hits, result.abstained);
            }
            if assistant {
                widen_top_hits(&rt.db, &mut result.hits, WIDENED_TOP_HITS, WIDENED_MAX_CHUNKS)?;
            }
            // The assistant route shows the user's own wording to the model; retrieval ran on `query`.
            let question = body["question"]
                .as_str()
                .filter(|q| assistant && !q.trim().is_empty() && q.len() <= 4096)
                .unwrap_or(query);
            let timezone = answer_pipeline::system_timezone();
            let history = body["history"].as_array().map(Vec::as_slice).unwrap_or(&[]);
            let mut prepared = answer_pipeline::prepare(&answer_pipeline::Request {
                query,
                history: if assistant { history } else { &[] },
                timezone: &timezone,
                tools: assistant && body["tools"] == true,
                ..answer_pipeline::Request::new(question, &result.hits, params.chunks_per_result, result.abstained)
            })?;
            if assistant {
                if let Some(facts) = body["permanent_facts"].as_str() {
                    answer_pipeline::add_permanent_facts(&mut prepared, facts)?;
                }
            }
            let results: Vec<_> = result
                .hits
                .iter()
                .map(|h| hit_json(h, query, params.chunks_per_result))
                .collect();
            let mut response = json!({"results":results,"sources":prepared.sources,"abstained":result.abstained,"coverage":{"state":"partial"},"next_cursor":null,"retrieval":{"engine":"qdrant_edge_hybrid","dense":true,"bm25":true,"fusion":"rrf","candidates":result.ranked.len(),"collapsed":result.collapsed,"embedding_model":MODEL_VERSION}});
            if assistant {
                response["messages"] = json!(prepared.messages);
                response["prompt_version"] = json!(answer_pipeline::PROMPT_VERSION);
            }
            Ok(response)
        }
        ("POST", "/v1/assistant/search") => {
            // The `search_memory` tool: a second, targeted retrieval with an explicit time window and app.
            let query = body["query"]
                .as_str()
                .filter(|q| !q.trim().is_empty() && q.len() <= 1000)
                .context("search_memory needs a non-empty query")?;
            let mut params = Params::default();
            params.final_k = body["limit"].as_u64().unwrap_or(5).clamp(1, answer_pipeline::SOURCE_LIMIT as u64) as usize;
            let when = |key: &str, end: bool| -> Result<Option<i64>> {
                match body[key].as_str().filter(|v| !v.trim().is_empty()) {
                    None => Ok(None),
                    Some(v) => parse_when(v, end).map(Some).with_context(|| format!("`{key}` must be YYYY-MM-DD or YYYY-MM-DDTHH:MM local time")),
                }
            };
            params.window = match (when("from", false)?, when("to", true)?) {
                (None, None) => None,
                (from, to) => {
                    let (from, to) = (from.unwrap_or(0), to.unwrap_or(i64::MAX / 2));
                    if from >= to {
                        bail!("`from` must be before `to`");
                    }
                    Some((from, to))
                }
            };
            if let Some(app) = body["app"].as_str().filter(|a| !a.trim().is_empty()) {
                let ids = appscope::app_scope(&format!("in {}", app.trim()))
                    .context("Unknown app name for search_memory")?;
                params.app_ids = Some(ids.iter().map(|id| id.to_string()).collect());
            }
            let result = retrieve(rt, query, &params)?;
            if test_mode {
                let _ = log_eval_query(&eval_dir, path, query, &result.hits, result.abstained);
            }
            let timezone = answer_pipeline::system_timezone();
            let prepared = answer_pipeline::prepare(&answer_pipeline::Request {
                timezone: &timezone,
                ..answer_pipeline::Request::new(query, &result.hits, params.chunks_per_result, result.abstained)
            })?;
            let text = if prepared.sources.is_empty() {
                "No captured evidence matched.".to_owned()
            } else {
                let note = if result.abstained { "Retrieval was weak: these are probably unrelated.\n\n" } else { "" };
                let body = prepared.sources.iter().map(|s| format!("Source #{}\n{}", s.id, s.text)).collect::<Vec<_>>().join("\n\n");
                format!("{note}{body}")
            };
            let results: Vec<_> = result.hits.iter().map(|h| hit_json(h, query, params.chunks_per_result)).collect();
            Ok(json!({"text":text,"results":results,"abstained":result.abstained}))
        }
        ("POST", "/v1/assistant/redact") => {
            // Tool output from outside the engine is redacted the same way as evidence before it leaves the Mac.
            let text = body["text"].as_str().context("text missing")?;
            Ok(json!({"text":redact_cloud(text)?}))
        }

        ("POST", "/v1/memory/snapshots") => {
            let ids: Vec<i64> = serde_json::from_value(body["ids"].clone())?;
            if ids.len() > 25 {
                bail!("Too many snapshot IDs");
            }
            let mut snapshots = Vec::new();
            for id in ids {
                if let Some(s) = load_source(&rt.db, id, 0.0)? {
                    snapshots.push(json!({"id":s.id,"body":s.body,"url":s.url,"title":s.title,"app_id":s.app_id,"first_seen_ms":s.first_seen_ms,"last_seen_ms":s.last_seen_ms}));
                }
            }
            Ok(json!({"snapshots":snapshots}))
        }
        ("GET", path) if path.starts_with("/v1/memory/recent?") => {
            let parsed = url::Url::parse(&format!("http://localhost{path}"))?;
            let values: std::collections::HashMap<_, _> =
                parsed.query_pairs().into_owned().collect();
            recent(
                &rt.db,
                values
                    .get("limit")
                    .and_then(|v| v.parse().ok())
                    .unwrap_or(20)
                    .clamp(1, 50),
                values
                    .get("since_ms")
                    .and_then(|v| v.parse().ok())
                    .unwrap_or(0),
            )
        }
        ("POST", "/v1/privacy/delete") => {
            if settings.test_mode {
                bail!("Turn off test mode before deleting your memory; this would not touch the eval archive");
            }
            if body["scope"] != "all" || body["confirmation"] != "DELETE ALL LOCAL MEMORY" {
                bail!("Deletion confirmation did not match");
            }
            settings.capture_paused = true;
            settings.version += 1;
            write_settings(root, settings)?;
            let count: i64 = rt
                .db
                .query_row("SELECT COUNT(*) FROM snapshots", [], |r| r.get(0))?;
            let tx = rt.db.transaction()?;
            tx.execute_batch("DELETE FROM derived_sources; DELETE FROM derived; DELETE FROM tree_keys; DELETE FROM raw_versions; DELETE FROM observations; DELETE FROM chunks; DELETE FROM snapshots; DELETE FROM index_meta WHERE key='last_answer_snapshot';")?;
            // Keep import mappings as tombstones so old desktop captures stay deleted.
            tx.execute("INSERT INTO index_meta(key,value) VALUES('memory_epoch','1') ON CONFLICT(key) DO UPDATE SET value=CAST(value AS INTEGER)+1",[])?;
            tx.commit()?;
            // Delete the retired archive too: a UI privacy action must cover
            // the preserved original, not just its imported copy.
            let legacy_path = root.join("memory.sqlite3");
            if legacy_path.exists() {
                let mut legacy = Connection::open_with_flags(
                    legacy_path,
                    rusqlite::OpenFlags::SQLITE_OPEN_READ_WRITE,
                )?;
                legacy.execute_batch("PRAGMA foreign_keys=ON; PRAGMA secure_delete=ON;")?;
                let tx = legacy.transaction()?;
                for table in [
                    "derived_sources",
                    "derived_dependencies",
                    "derived_items",
                    "activity_segments",
                    "observations",
                    "snapshots",
                ] {
                    let exists: bool = tx.query_row(
                        "SELECT EXISTS(SELECT 1 FROM sqlite_master WHERE type='table' AND name=?1)",
                        [table],
                        |r| r.get(0),
                    )?;
                    if exists {
                        tx.execute(&format!("DELETE FROM {table}"), [])?;
                    }
                }
                tx.commit()?;
            }
            // Rebuild the disposable index from the now-empty archive below.
            let epoch: i64 = rt.db.query_row(
                "SELECT CAST(value AS INTEGER) FROM index_meta WHERE key='memory_epoch'",
                [],
                |r| r.get(0),
            )?;
            Ok(
                json!({"scope":"all","deleted_snapshots":count,"memory_epoch":epoch,"capture_paused":true,"rebuild_empty_index":true}),
            )
        }
        _ => bail!("Route is not available in Cortex"),
    }
}

pub fn serve(state: &Path) -> Result<()> {
    let root = env::var_os("CORTEX_SETTINGS_DIR")
        .map(PathBuf::from)
        .unwrap_or_else(|| state.parent().unwrap_or(state).to_path_buf());
    fs::create_dir_all(&root)?;
    if env::var("CORTEX_EXIT_ON_STDIN_EOF").as_deref() == Ok("1") {
        thread::spawn(|| {
            let mut byte = [0u8; 1];
            loop {
                if std::io::stdin().read(&mut byte).unwrap_or(0) == 0 {
                    std::process::exit(0);
                }
            }
        });
    }
    let socket = state.join("capture.sock");
    if UnixStream::connect(&socket).is_ok() {
        bail!(
            "Cortex already owns this archive; stop its capture process before opening Cortex"
        );
    }
    if socket.exists() {
        fs::remove_file(&socket)?;
    }
    let listener = UnixListener::bind(&socket)?;
    fs::set_permissions(&socket, fs::Permissions::from_mode(0o600))?;
    listener.set_nonblocking(true)?;
    cortex_memory::schedule_runtime::start(&root)?;
    let mut settings = load_settings(&root)?;
    let helper = install_capture_bundle(&root)?;
    let mut db = open_db(state)?;
    let count = import_legacy(&root, &mut db)?;
    eprintln!("Imported {count} legacy desktop captures into the shared Cortex archive");
    // Settings choose the context model before the index opens; turning context on for an index built without it
    // re-embeds from the archive.
    if let Err(e) = apply_context(&settings) {
        eprintln!("Context settings ignored: {e:#}");
    }
    let reindex = settings.context_enabled && index_lacks_context(&db);
    drop(db);
    let mut runtime = open_runtime(state, reindex)?;
    while runtime.index_pending()? > 0 {}
    let mut lab = EvalLab::new(&root);
    let mut blocked = blocklist::Watcher::new(state)?;
    let mut last_capture = std::time::Instant::now() - Duration::from_secs(3);
    loop {
        match listener.accept() {
            Ok((mut stream, _)) => {
                // macOS accepted sockets inherit the listener's O_NONBLOCK, which
                // makes a read that races the client's write fail with
                // WouldBlock and drop the request without any reply.
                stream.set_nonblocking(false)?;
                stream.set_read_timeout(Some(Duration::from_secs(3)))?;
                stream.set_write_timeout(Some(Duration::from_secs(10)))?;
                let mut text = String::new();
                if (&mut stream)
                    .take(MAX_REQUEST)
                    .read_to_string(&mut text)
                    .is_err()
                    || text.len() >= MAX_REQUEST as usize
                {
                    let _ = stream.write_all(
                        json!({"ok":false,"error":"Cortex request was not received; try again","text":"Cortex request was not received; try again"})
                            .to_string()
                            .as_bytes(),
                    );
                    continue;
                }
                let request = serde_json::from_str::<Value>(&text);
                let is_json = request.as_ref().is_ok_and(|r| r.get("method").is_some());
                let result = if is_json {
                    route(
                        &mut runtime,
                        &mut lab,
                        &root,
                        &mut settings,
                        &helper,
                        &request.unwrap(),
                    )
                } else {
                    let active = if settings.test_mode { lab.runtime(&runtime) } else { Ok(&mut runtime) };
                    active.and_then(|rt| answer(rt, text.trim())).map(|v| json!({"text":v}))
                };
                let rebuild = result
                    .as_ref()
                    .is_ok_and(|v| v["rebuild_empty_index"] == true || v["reindex"] == true);
                let response = match result {
                    Ok(data) if is_json => json!({"ok":true,"data":data}),
                    Ok(data) => json!({"ok":true,"text":data["text"]}),
                    Err(e) => json!({"ok":false,"error":format!("{e:#}"),"text":format!("{e:#}")}),
                };
                if rebuild {
                    drop(runtime);
                    runtime = open_runtime(state, true)?;
                }
                let _ = stream.write_all(response.to_string().as_bytes());
            }
            Err(e) if e.kind() == std::io::ErrorKind::WouldBlock => {}
            Err(e) => eprintln!("Cortex IPC error: {e}"),
        }
        if last_capture.elapsed() >= Duration::from_secs(3) {
            last_capture = std::time::Instant::now();
            let _ = blocked.refresh();
            let real_capture = settings.capture_enabled && !settings.capture_paused;
            let eval_capture = settings.test_mode && lab.capturing;
            if (real_capture || eval_capture) && permission(&helper) == "granted" {
                if real_capture {
                    match capture_one(&mut runtime, &helper, &settings, &blocked.list) {
                        Ok(Some(id)) => {
                            if let Err(e) = summarize(state, id) {
                                eprintln!("Summary failed: {e:#}");
                            }
                        }
                        Ok(None) => {}
                        Err(e) => eprintln!("Capture skipped: {e:#}"),
                    }
                }
                // The play/pause switch records into the eval archive only, whatever the real capture does.
                if eval_capture {
                    let dir = lab.dir.clone();
                    match lab.runtime(&runtime).and_then(|eval| {
                        contextual::suppress(true);
                        let captured = capture_one(eval, &helper, &settings, &blocked.list);
                        contextual::suppress(false);
                        captured.map(|id| (eval, id))
                    }) {
                        Ok((eval, Some(id))) => {
                            if let Err(e) = log_eval_capture(&dir, eval, id).and_then(|_| summarize(&dir, id)) {
                                eprintln!("Eval record failed: {e:#}");
                            }
                        }
                        Ok((_, None)) => {}
                        Err(e) => eprintln!("Eval capture skipped: {e:#}"),
                    }
                }
            }
            if let Err(e) = runtime.index_pending() {
                eprintln!("Indexing failed: {e:#}");
            }
            if let Some(eval) = lab.runtime.as_mut() {
                if let Err(e) = eval.index_pending() {
                    eprintln!("Eval indexing failed: {e:#}");
                }
            }
        }
        thread::sleep(Duration::from_millis(30));
    }
}
fn capture_one(
    rt: &mut Runtime,
    helper: &Path,
    settings: &Settings,
    blocked: &blocklist::Blocklist,
) -> Result<Option<i64>> {
    let reply = run_helper(helper, "--read-frontmost")?;
    if reply.status.as_deref() != Some("ok") {
        return Ok(None);
    }
    let Some(window) = reply.window else {
        return Ok(None);
    };
    if is_self(&window.app_id)
        || blocked.matching(&window.app_id).is_some()
        || settings
            .excluded_apps
            .iter()
            .any(|a| a.eq_ignore_ascii_case(&window.app_id))
    {
        return Ok(None);
    }
    // Preserve the desktop's public-browser-only capture choice.
    if reply.source_type.as_deref() == Some("browser_private")
        || reply.source_type.as_deref() == Some("browser") && reply.url.is_none()
    {
        return Ok(None);
    }
    let domain = reply
        .url
        .as_deref()
        .and_then(|s| url::Url::parse(s).ok())
        .and_then(|u| u.host_str().map(str::to_owned));
    if domain.is_some_and(|d| {
        settings
            .excluded_domains
            .iter()
            .any(|s| d == *s || d.ends_with(&format!(".{s}")))
    }) {
        return Ok(None);
    }
    let (id, is_new, source) = record(
        &mut rt.db,
        &window,
        reply.url,
        reply.source_type,
        reply.limitations,
    )?;
    if !is_new {
        rt.refresh_seen(id, &source)?;
    }
    Ok(is_new.then_some(id))
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::atomic::Ordering as AtomicOrdering;
    fn temp_root() -> PathBuf {
        static NEXT: std::sync::atomic::AtomicUsize = std::sync::atomic::AtomicUsize::new(0);
        let root = env::temp_dir().join(format!(
            "cortex-import-test-{}-{}-{}",
            std::process::id(),
            now_ms(),
            NEXT.fetch_add(1, AtomicOrdering::SeqCst)
        ));
        fs::create_dir_all(&root).unwrap();
        root
    }
    #[test]
    fn test_mode_reads_the_eval_archive_and_never_deletes() {
        for (method, path) in [("GET", "/v1/status"), ("POST", "/v1/memory/retrieve"), ("POST", "/v1/assistant/search"), ("GET", "/v1/memory/recent?limit=5")] {
            assert!(reads_archive(method, path), "{path}");
        }
        for (method, path) in [("GET", "/v1/settings"), ("POST", "/v1/privacy/delete"), ("POST", "/v1/eval/reset"), ("POST", "/v1/assist/prepare")] {
            assert!(!reads_archive(method, path), "{path}");
        }
        assert!(!Settings::default().test_mode);
        // Settings written before test mode existed still load.
        let old: Settings = serde_json::from_str(r#"{"version":3,"capture_enabled":true,"capture_paused":false,"mcp_enabled":false,"excluded_apps":[],"excluded_domains":[]}"#).unwrap();
        assert!(old.capture_enabled && !old.test_mode);
    }
    #[test]
    fn eval_reset_removes_only_its_own_files() {
        let root = temp_root();
        let dir = root.join("eval-memory");
        fs::create_dir_all(dir.join("qdrant-edge")).unwrap();
        for name in ["memory.sqlite3", CAPTURE_LOG, QUERY_LOG, "keep.txt"] {
            fs::write(dir.join(name), "x").unwrap();
        }
        fs::write(dir.join("qdrant-edge/edge_config.json"), "{}").unwrap();
        let mut lab = EvalLab { dir: dir.clone(), runtime: None, capturing: true };
        append_jsonl(&dir, CAPTURE_LOG, &json!({"cleaned_body":"hello"})).unwrap();
        lab.reset().unwrap();
        assert!(!lab.capturing);
        for name in ["memory.sqlite3", CAPTURE_LOG, QUERY_LOG, "qdrant-edge"] {
            assert!(!dir.join(name).exists(), "{name}");
        }
        assert!(dir.join("keep.txt").exists());
        fs::remove_dir_all(root).unwrap();
    }
    #[test]
    fn tool_dates_are_local_and_inclusive_of_the_end_day() {
        let day = |ms: i64| DateTime::<Utc>::from_timestamp_millis(ms).unwrap().with_timezone(&Local).format("%Y-%m-%d %H:%M").to_string();
        assert_eq!(day(parse_when("2026-10-17", false).unwrap()), "2026-10-17 00:00");
        assert_eq!(day(parse_when("2026-10-17", true).unwrap()), "2026-10-18 00:00");
        assert_eq!(day(parse_when("2026-10-17T09:30", true).unwrap()), "2026-10-17 09:30");
        assert_eq!(day(parse_when(" 2026-10-17T09:30:15 ", false).unwrap()), "2026-10-17 09:30");
        for bad in ["yesterday", "2026-13-01", "17/10/2026", ""] {
            assert!(parse_when(bad, false).is_none(), "{bad}");
        }
    }
    #[test]
    fn legacy_import_is_idempotent_and_preserves_observation_times_and_urls() {
        let root = temp_root();
        let legacy = Connection::open(root.join("memory.sqlite3")).unwrap();
        legacy.execute_batch("CREATE TABLE snapshots(id INTEGER PRIMARY KEY,app_id TEXT,title TEXT,url TEXT,body TEXT,first_seen_ms INTEGER,last_seen_ms INTEGER,window_session_id TEXT); CREATE TABLE observations(snapshot_id INTEGER,observed_ms INTEGER); CREATE TABLE settings(key TEXT,value_json TEXT);
        INSERT INTO snapshots VALUES(9,'test.browser','Conversation','https://example.test/chat/123','Mira postponed our appointment to Friday.',1000,4000,'test-window');
        INSERT INTO observations VALUES(9,1000),(9,4000);
        INSERT INTO settings VALUES('capture_enabled','true'),('capture_paused','true'),('excluded_domains','[\"private.example\"]');").unwrap();
        let state = root.join("local-memory");
        fs::create_dir(&state).unwrap();
        let mut db = open_db(&state).unwrap();
        assert_eq!(import_legacy(&root, &mut db).unwrap(), 1);
        assert_eq!(import_legacy(&root, &mut db).unwrap(), 0);
        let url: String = db
            .query_row("SELECT url FROM snapshots", [], |r| r.get(0))
            .unwrap();
        assert_eq!(url, "https://example.test/chat/123");
        let observations: i64 = db
            .query_row(
                "SELECT COUNT(*) FROM observations WHERE observed_ms IN(1000,4000)",
                [],
                |r| r.get(0),
            )
            .unwrap();
        assert_eq!(observations, 2);
        assert!(
            db.query_row("SELECT COUNT(*) FROM chunks", [], |r| r.get::<_, i64>(0))
                .unwrap()
                > 0
        );
        let settings = load_settings(&root).unwrap();
        assert!(settings.capture_enabled && settings.capture_paused);
        assert_eq!(settings.excluded_domains, vec!["private.example"]);
        assert_eq!(
            fs::metadata(root.join("cortex-capture.json"))
                .unwrap()
                .permissions()
                .mode()
                & 0o777,
            0o600
        );
        // The mapping acts as a tombstone after a user deletes imported data.
        db.execute_batch("DELETE FROM chunks; DELETE FROM observations; DELETE FROM snapshots;")
            .unwrap();
        assert_eq!(import_legacy(&root, &mut db).unwrap(), 0);
        drop(db);
        drop(legacy);
        fs::remove_dir_all(root).unwrap();
    }
}
