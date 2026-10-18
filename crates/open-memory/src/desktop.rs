//! Rewind's desktop adapter. Owns the same Runtime and canonical archive as the
//! CLI; IPC adapts UI requests, not retrieval or cleaning algorithms.
use super::*;

const MAX_REQUEST: u64 = 65_537;

#[derive(Clone, Serialize, Deserialize)]
struct Settings {
    version: u64,
    capture_enabled: bool,
    capture_paused: bool,
    mcp_enabled: bool,
    excluded_apps: Vec<String>,
    excluded_domains: Vec<String>,
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
        }
    }
}
fn write_settings(root: &Path, settings: &Settings) -> Result<()> {
    let tmp = root.join("rewind-capture.json.tmp");
    fs::write(&tmp, serde_json::to_vec(settings)?)?;
    fs::set_permissions(&tmp, fs::Permissions::from_mode(0o600))?;
    fs::rename(tmp, root.join("rewind-capture.json"))?;
    Ok(())
}
fn load_settings(root: &Path) -> Result<Settings> {
    let path = root.join("rewind-capture.json");
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
    let bundle = root.join("Rewind Capture.app");
    let path = bundle.join("Contents/MacOS/Rewind Capture");
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
    let temp = root.join("Rewind Capture.tmp.app");
    if temp.exists() {
        fs::remove_dir_all(&temp)?;
    }
    fs::create_dir_all(temp.join("Contents/MacOS"))?;
    fs::create_dir_all(temp.join("Contents/Resources"))?;
    let executable = temp.join("Contents/MacOS/Rewind Capture");
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
<key>CFBundleIdentifier</key><string>app.rewind.capture</string>
<key>CFBundleName</key><string>Rewind Capture</string>
<key>CFBundleDisplayName</key><string>Rewind Capture</string>
<key>CFBundleExecutable</key><string>Rewind Capture</string>
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
        bail!("Could not sign the Rewind Capture helper");
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
        "app.open-memory.desktop" | "app.rewind.desktop" | "app.rewind.capture"
    )
}
extern "C" {
    fn responsibility_spawnattrs_setdisclaim(
        attr: *mut libc::posix_spawnattr_t,
        disclaim: libc::c_int,
    ) -> libc::c_int;
}

/// Run the capture helper as its own "responsible process". A child of the
/// Rewind app is otherwise judged by macOS under Rewind's identity, which an
/// ad-hoc-signed development build changes on every rebuild, so an Accessibility
/// grant to "Rewind Capture" would never apply. Disclaiming makes the helper's
/// stable bundle identity the one that is checked and prompted for.
fn run_helper(path: &Path, mode: &str) -> Result<AxReply> {
    use std::ffi::CString;
    use std::os::fd::FromRawFd;
    use std::os::unix::ffi::OsStrExt;
    unsafe {
        let mut fds = [0 as libc::c_int; 2];
        if libc::pipe(fds.as_mut_ptr()) != 0 {
            bail!("Accessibility helper failed");
        }
        libc::fcntl(fds[0], libc::F_SETFD, libc::FD_CLOEXEC);
        libc::fcntl(fds[1], libc::F_SETFD, libc::FD_CLOEXEC);
        let mut actions: libc::posix_spawn_file_actions_t = std::mem::zeroed();
        let mut attr: libc::posix_spawnattr_t = std::mem::zeroed();
        libc::posix_spawn_file_actions_init(&mut actions);
        libc::posix_spawnattr_init(&mut attr);
        let null = CString::new("/dev/null")?;
        libc::posix_spawn_file_actions_addopen(&mut actions, 0, null.as_ptr(), libc::O_RDONLY, 0);
        libc::posix_spawn_file_actions_addopen(&mut actions, 2, null.as_ptr(), libc::O_WRONLY, 0);
        libc::posix_spawn_file_actions_adddup2(&mut actions, fds[1], 1);
        responsibility_spawnattrs_setdisclaim(&mut attr, 1);
        let program = CString::new(path.as_os_str().as_bytes())?;
        let mode = CString::new(mode)?;
        let argv = [program.as_ptr(), mode.as_ptr(), std::ptr::null()];
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
        if spawned != 0 {
            bail!("Accessibility helper could not start");
        }
        let (tx, rx) = std::sync::mpsc::channel();
        thread::spawn(move || {
            let mut bytes = Vec::new();
            let _ = (&mut reader).take(512 * 1024 + 1).read_to_end(&mut bytes);
            let _ = tx.send(bytes);
        });
        let bytes = rx.recv_timeout(Duration::from_secs(15));
        if bytes.is_err() {
            libc::kill(pid, libc::SIGKILL);
        }
        let mut status = 0;
        libc::waitpid(pid, &mut status, 0);
        let bytes = bytes.map_err(|_| anyhow!("Accessibility helper timed out"))?;
        if !libc::WIFEXITED(status) || libc::WEXITSTATUS(status) != 0 || bytes.len() > 512 * 1024 {
            bail!("Accessibility helper failed");
        }
        serde_json::from_slice(&bytes).context("invalid Accessibility response")
    }
}
fn permission(helper: &Path) -> String {
    run_helper(helper, "--permission")
        .ok()
        .and_then(|r| r.permission)
        .unwrap_or_else(|| "not_granted".into())
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
    root: &Path,
    settings: &mut Settings,
    helper: &Path,
    request: &Value,
) -> Result<Value> {
    let method = request["method"].as_str().context("method missing")?;
    let path = request["path"].as_str().context("path missing")?;
    let body = &request["body"];
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
                json!({"capture_enabled":settings.capture_enabled && access=="granted","capture_paused":settings.capture_paused,"permission_state":access,"snapshot_count":count,"indexed_chunks":indexed,"memory_epoch":epoch,"retrieval_engine":"qdrant_edge_hybrid","embedding_model":MODEL_VERSION,"version":"0.1.0","ready":true}),
            )
        }
        ("GET", "/v1/settings") => Ok(serde_json::to_value(&*settings)?),
        ("PATCH", "/v1/settings") => {
            if body["expected_version"].as_u64() != Some(settings.version) {
                bail!("Settings changed; refresh and try again");
            }
            let mut next = settings.clone();
            for (key, target) in [
                ("capture_enabled", &mut next.capture_enabled),
                ("capture_paused", &mut next.capture_paused),
            ] {
                if let Some(value) = body.get(key) {
                    *target = value.as_bool().context("invalid capture setting")?;
                }
            }
            if body["mcp_enabled"] == true {
                bail!("MCP access is not available through the Rewind adapter");
            }
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
            *settings = next;
            Ok(serde_json::to_value(&*settings)?)
        }
        ("POST", "/v1/capture/request-permission") => {
            Ok(json!({"permission_state":run_helper(helper,"--request-permission")?.permission}))
        }
        ("POST", "/v1/memory/search" | "/v1/memory/retrieve") => {
            let question = body["query"]
                .as_str()
                .filter(|q| !q.trim().is_empty() && q.len() <= 4096)
                .context("Invalid search question")?;
            let mut params = Params::default();
            params.final_k = body["limit"]
                .as_u64()
                .unwrap_or(answer_pipeline::SOURCE_LIMIT as u64)
                .clamp(1, 50) as usize;
            let result = retrieve(rt, question, &params)?;
            let prepared =
                answer_pipeline::prepare(question, &result.hits, params.chunks_per_result)?;
            let results: Vec<_> = result
                .hits
                .iter()
                .map(|h| hit_json(h, question, params.chunks_per_result))
                .collect();
            Ok(
                json!({"results":results,"sources":prepared.sources,"abstained":result.abstained,"coverage":{"state":"partial"},"next_cursor":null,"retrieval":{"engine":"qdrant_edge_hybrid","dense":true,"bm25":true,"fusion":"rrf","candidates":result.ranked.len(),"collapsed":result.collapsed,"embedding_model":MODEL_VERSION}}),
            )
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
        _ => bail!("Route is not available in Rewind"),
    }
}

pub fn serve(state: &Path) -> Result<()> {
    let root = env::var_os("REWIND_SETTINGS_DIR")
        .map(PathBuf::from)
        .unwrap_or_else(|| state.parent().unwrap_or(state).to_path_buf());
    fs::create_dir_all(&root)?;
    if env::var("OPEN_MEMORY_EXIT_ON_STDIN_EOF").as_deref() == Ok("1") {
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
            "Open Memory already owns this archive; stop its capture process before opening Rewind"
        );
    }
    if socket.exists() {
        fs::remove_file(&socket)?;
    }
    let listener = UnixListener::bind(&socket)?;
    fs::set_permissions(&socket, fs::Permissions::from_mode(0o600))?;
    listener.set_nonblocking(true)?;
    let mut settings = load_settings(&root)?;
    let helper = install_capture_bundle(&root)?;
    let mut db = open_db(state)?;
    let count = import_legacy(&root, &mut db)?;
    eprintln!("Imported {count} legacy desktop captures into the shared Open Memory archive");
    drop(db);
    let mut runtime = open_runtime(state, false)?;
    while runtime.index_pending()? > 0 {}
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
                        json!({"ok":false,"error":"Rewind request was not received; try again","text":"Rewind request was not received; try again"})
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
                        &root,
                        &mut settings,
                        &helper,
                        &request.unwrap(),
                    )
                } else {
                    answer(&mut runtime, text.trim()).map(|v| json!({"text":v}))
                };
                let rebuild = result
                    .as_ref()
                    .is_ok_and(|v| v["rebuild_empty_index"] == true);
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
            Err(e) => eprintln!("Rewind IPC error: {e}"),
        }
        if last_capture.elapsed() >= Duration::from_secs(3) {
            last_capture = std::time::Instant::now();
            let _ = blocked.refresh();
            if settings.capture_enabled
                && !settings.capture_paused
                && permission(&helper) == "granted"
            {
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
            if let Err(e) = runtime.index_pending() {
                eprintln!("Indexing failed: {e:#}");
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
    fn temp_root() -> PathBuf {
        let root = env::temp_dir().join(format!(
            "rewind-import-test-{}-{}",
            std::process::id(),
            now_ms()
        ));
        fs::create_dir_all(&root).unwrap();
        root
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
            fs::metadata(root.join("rewind-capture.json"))
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
