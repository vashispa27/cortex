#![cfg(target_os = "macos")]
mod cleaner;

use anyhow::{anyhow, bail, Context, Result};
use chrono::{DateTime, Local, TimeZone, Utc};
use model2vec_rs::model::StaticModel;
use qdrant_edge::bm25_embed::{EdgeBm25, EdgeBm25Config};
use qdrant_edge::*;
use regex::Regex;
use reqwest::blocking::Client;
use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use std::{
    env, fs,
    io::{Read, Write},
    os::unix::{
        fs::PermissionsExt,
        net::{UnixListener, UnixStream},
    },
    path::{Path, PathBuf},
    process::{Command, Stdio},
    sync::mpsc,
    thread,
    time::{Duration, SystemTime, UNIX_EPOCH},
};

const MODEL_ID: &str = "minishlab/potion-base-32M";
const MODEL_REVISION: &str = "1e5a03f8eeb2c98b928fbbd846f22f816360919f";
const MODEL_VERSION: &str = "minishlab/potion-base-32M@1e5a03f8eeb2c98b928fbbd846f22f816360919f:model2vec-rs-0.3.0:default-512";
const MODEL_SHA256: &str = "99f6c33204c9231a7391871b7a3c91409b532c8f587a9ea44fc282303d8dec28";
const HELPER: &[u8] = include_bytes!(concat!(env!("OUT_DIR"), "/open-memory-ax-helper"));

#[derive(Debug, Deserialize)]
struct AxReply {
    status: Option<String>,
    reason: Option<String>,
    permission: Option<String>,
    window: Option<AxWindow>,
    url: Option<String>,
    source_type: Option<String>,
    limitations: Option<Vec<String>>,
}
#[derive(Debug, Deserialize)]
struct AxWindow {
    app_id: String,
    window_session_id: String,
    title: String,
    observed_ms: i64,
    focus_role: Option<String>,
    focus_name: Option<String>,
    roots: Vec<AxNode>,
}
#[derive(Debug, Deserialize, Serialize)]
struct AxNode {
    role: String,
    name: Option<String>,
    value: Option<String>,
    #[serde(flatten)]
    extra: serde_json::Map<String, Value>,
}
#[derive(Debug, Clone, Serialize)]
struct Source {
    id: i64,
    app_id: String,
    title: String,
    url: Option<String>,
    domain: Option<String>,
    source_type: String,
    body: String,
    first_seen_ms: i64,
    last_seen_ms: i64,
    sightings: i64,
    limitations: String,
    cleaner_quality: String,
    hit_text: Option<String>,
    score: f32,
}

struct Runtime {
    db: Connection,
    shard: EdgeShard,
    model: StaticModel,
    bm25: EdgeBm25,
}

fn main() -> Result<()> {
    unsafe {
        libc_umask(0o077);
    }
    let args: Vec<String> = env::args().skip(1).collect();
    let state = state_dir()?;
    fs::create_dir_all(&state)?;
    fs::set_permissions(&state, fs::Permissions::from_mode(0o700))?;
    match args.as_slice() {
        [command, flags @ ..] if command == "capture" => {
            if flags
                .iter()
                .any(|f| f != "--print" && f != "--rebuild-index" && f != "--clean-dry-run" && f != "--apply-cleaning")
            {
                usage();
                bail!("unknown capture option");
            }
            if flags.contains(&"--clean-dry-run".to_string()) {
                return reprocess(&state, false);
            }
            if flags.contains(&"--apply-cleaning".to_string()) {
                return reprocess(&state, true);
            }
            capture(
                &state,
                flags.contains(&"--print".to_string()),
                flags.contains(&"--rebuild-index".to_string()),
            )
        }
        [command, question] if command == "ask" && !question.trim().is_empty() => {
            ask(&state, question)
        }
        _ => {
            usage();
            bail!("expected capture or ask \"question\"")
        }
    }
}

extern "C" {
    fn umask(mask: u32) -> u32;
}
unsafe fn libc_umask(mask: u32) {
    umask(mask);
}
fn usage() {
    eprintln!("Usage: open-memory capture [--print] [--rebuild-index]\n       open-memory capture --clean-dry-run\n       open-memory capture --apply-cleaning\n       open-memory ask \"natural-language question\"");
}
fn state_dir() -> Result<PathBuf> {
    if let Some(path) = env::var_os("OPEN_MEMORY_STATE_DIR") {
        return Ok(PathBuf::from(path));
    }
    Ok(
        PathBuf::from(env::var_os("HOME").context("HOME unavailable")?)
            .join("Library/Application Support/Open Memory/local-memory"),
    )
}
fn now_ms() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as i64
}
fn digest(value: &str) -> String {
    hex::encode(Sha256::digest(value.as_bytes()))
}
fn content_fingerprint(app: &str, url: Option<&str>, title: &str, body: &str) -> String {
    digest(&format!("{app}\0{}\0{}\0{body}", url.unwrap_or(""), if body.is_empty() { title } else { "" }))
}
fn evidence_key(app: &str, domain: Option<&str>, _source_type: &str, body: &str) -> String {
    digest(&format!("{app}\0{}\0{}", domain.unwrap_or(""), body.to_lowercase()))
}
fn time_string(ms: i64) -> String {
    DateTime::<Utc>::from_timestamp_millis(ms)
        .map(|t| {
            t.with_timezone(&Local)
                .format("%Y-%m-%d %H:%M:%S %Z")
                .to_string()
        })
        .unwrap_or_else(|| ms.to_string())
}

fn open_db(state: &Path) -> Result<Connection> {
    let db = Connection::open(state.join("memory.sqlite3"))?;
    db.busy_timeout(Duration::from_secs(5))?;
    db.execute_batch(include_str!("schema.sql"))?;
    let columns = {
        let mut statement = db.prepare("PRAGMA table_info(snapshots)")?;
        let found = statement
            .query_map([], |row| row.get::<_, String>(1))?
            .collect::<rusqlite::Result<Vec<_>>>()?;
        found
    };
    for (column, definition) in [
        ("ax_nodes_json", "TEXT NOT NULL DEFAULT '[]'"),
        ("cleaner_version", "INTEGER NOT NULL DEFAULT 0"),
        ("cleaner_quality", "TEXT NOT NULL DEFAULT 'unprocessed'"),
        ("cleaner_coverage", "REAL NOT NULL DEFAULT 0"),
        ("cleaning_trace_json", "TEXT NOT NULL DEFAULT '[]'"),
        ("searchable", "INTEGER NOT NULL DEFAULT 1"),
    ] {
        if !columns.iter().any(|existing| existing == column) {
            db.execute(&format!("ALTER TABLE snapshots ADD COLUMN {column} {definition}"), [])?;
        }
    }
    Ok(db)
}

fn install_helper(state: &Path) -> Result<PathBuf> {
    let path = state.join("open-memory-ax-helper");
    if fs::read(&path).ok().as_deref() != Some(HELPER) {
        let tmp = state.join("open-memory-ax-helper.tmp");
        fs::write(&tmp, HELPER)?;
        fs::set_permissions(&tmp, fs::Permissions::from_mode(0o700))?;
        fs::rename(tmp, &path)?;
    }
    Ok(path)
}

fn run_helper(path: &Path, mode: &str) -> Result<AxReply> {
    let output = Command::new(path).arg(mode).stdin(Stdio::null()).output()?;
    if !output.status.success() || output.stdout.len() > 512 * 1024 {
        bail!("Accessibility helper failed");
    }
    serde_json::from_slice(&output.stdout).context("invalid Accessibility response")
}

fn download_model(state: &Path) -> Result<PathBuf> {
    let dir = state.join("models").join(MODEL_REVISION);
    fs::create_dir_all(&dir)?;
    let client = Client::builder()
        .timeout(Duration::from_secs(300))
        .build()?;
    for file in ["config.json", "tokenizer.json", "model.safetensors"] {
        let path = dir.join(file);
        if path.is_file() && (file != "model.safetensors" || file_hash(&path)? == MODEL_SHA256) {
            continue;
        }
        eprintln!("Downloading pinned local embedding model: {file}");
        let url = format!("https://huggingface.co/{MODEL_ID}/resolve/{MODEL_REVISION}/{file}");
        let mut response = client.get(url).send()?.error_for_status()?;
        let tmp = dir.join(format!("{file}.part"));
        let mut out = fs::File::create(&tmp)?;
        std::io::copy(&mut response, &mut out)?;
        out.sync_all()?;
        if file == "model.safetensors" && file_hash(&tmp)? != MODEL_SHA256 {
            bail!("model checksum mismatch");
        }
        fs::rename(tmp, path)?;
    }
    Ok(dir)
}
fn file_hash(path: &Path) -> Result<String> {
    let mut file = fs::File::open(path)?;
    let mut hash = Sha256::new();
    let mut buffer = [0_u8; 64 * 1024];
    loop {
        let count = file.read(&mut buffer)?;
        if count == 0 {
            break;
        }
        hash.update(&buffer[..count]);
    }
    Ok(hex::encode(hash.finalize()))
}

fn open_runtime(state: &Path, rebuild: bool) -> Result<Runtime> {
    let db = open_db(state)?;
    let stale: i64 = db.query_row("SELECT COUNT(*) FROM snapshots WHERE cleaner_version<?1", [cleaner::VERSION], |r| r.get(0))?;
    if stale > 0 {
        bail!("{stale} captures still use the old text format; run `open-memory capture --clean-dry-run` then `open-memory capture --apply-cleaning`");
    }
    let old: Option<String> = db
        .query_row("SELECT value FROM index_meta WHERE key='model'", [], |r| {
            r.get(0)
        })
        .optional()?;
    if old.as_deref().is_some_and(|v| v != MODEL_VERSION) && !rebuild {
        bail!("embedding model changed; run `open-memory capture --rebuild-index` to reindex originals in SQLite");
    }
    let shard_dir = state.join("qdrant-edge");
    if rebuild || (old.is_none() && shard_dir.join("edge_config.json").exists()) {
        if shard_dir.exists() {
            fs::remove_dir_all(&shard_dir)?;
        }
        db.execute("UPDATE snapshots SET indexed=0,embedding_model=NULL", [])?;
        db.execute("UPDATE chunks SET indexed=0", [])?;
        db.execute("UPDATE derived SET indexed=0", [])?;
    } else if !shard_dir.join("edge_config.json").exists() {
        // SQLite is authoritative if the disposable vector directory vanished.
        db.execute("UPDATE snapshots SET indexed=0,embedding_model=NULL", [])?;
        db.execute("UPDATE chunks SET indexed=0", [])?;
        db.execute("UPDATE derived SET indexed=0", [])?;
    }
    let model_dir = download_model(state)?;
    let model = StaticModel::from_pretrained(
        model_dir.to_str().context("model path is not UTF-8")?,
        None,
        None,
        None,
    )?;
    if model.encode(&["dimension check".to_owned()])[0].len() != 512 {
        bail!("pinned model dimension is not 512");
    }
    let bm25 = EdgeBm25::new(EdgeBm25Config {
        language: Some("english".into()),
        ..Default::default()
    })?;
    let config = EdgeConfigBuilder::new()
        .on_disk_payload(true)
        .vector(
            "dense",
            EdgeVectorParamsBuilder::new(512, Distance::Cosine).build(),
        )
        .sparse_vector(
            "bm25",
            EdgeSparseVectorParamsBuilder::new()
                .modifier(Modifier::Idf)
                .build(),
        )
        .build();
    let shard = if shard_dir.join("edge_config.json").exists() {
        EdgeShard::load(&shard_dir, Some(config))?
    } else {
        fs::create_dir_all(&shard_dir)?;
        EdgeShard::new(&shard_dir, config)?
    };
    db.execute("INSERT INTO index_meta(key,value) VALUES('model',?1) ON CONFLICT(key) DO UPDATE SET value=excluded.value", [MODEL_VERSION])?;
    let mut runtime = Runtime {
        db,
        shard,
        model,
        bm25,
    };
    runtime.index_pending()?;
    Ok(runtime)
}

impl Runtime {
    fn vector(&self, text: &str) -> Result<Vec<f32>> {
        let result = self.model.encode(&[text.to_owned()]);
        let vector = result
            .into_iter()
            .next()
            .context("embedding returned no vector")?;
        if vector.len() != 512 {
            bail!("embedding dimension mismatch");
        }
        Ok(vector)
    }
    fn upsert_point(&self, id: u64, body: &str, payload: Value) -> Result<()> {
        let dense = self.vector(body)?;
        let sparse = self.bm25.embed_document(body);
        let point: PointStructPersisted = PointStruct::new(
            id,
            Vectors::new_named([
                ("dense", VectorInternal::from(dense)),
                ("bm25", VectorInternal::from(sparse)),
            ]),
            payload,
        )
        .into();
        self.shard.update(UpdateOperation::PointOperation(
            PointOperations::UpsertPoints(PointInsertOperations::PointsList(vec![point])),
        ))?;
        Ok(())
    }
    fn index_pending(&mut self) -> Result<usize> {
        let chunks = {
            let mut stmt = self.db.prepare("SELECT c.id,c.snapshot_id,s.app_id,s.title,s.url,s.domain,s.source_type,c.body,c.start_byte,c.end_byte,s.first_seen_ms,s.last_seen_ms FROM chunks c JOIN snapshots s ON s.id=c.snapshot_id WHERE c.indexed=0 AND s.searchable=1 ORDER BY c.id LIMIT 100")?;
            let rows = stmt.query_map([], |r| {
                Ok((
                    r.get::<_, i64>(0)?,
                    r.get::<_, i64>(1)?,
                    r.get::<_, String>(2)?,
                    r.get::<_, String>(3)?,
                    r.get::<_, Option<String>>(4)?,
                    r.get::<_, Option<String>>(5)?,
                    r.get::<_, String>(6)?,
                    r.get::<_, String>(7)?,
                    r.get::<_, i64>(8)?,
                    r.get::<_, i64>(9)?,
                    r.get::<_, i64>(10)?,
                    r.get::<_, i64>(11)?,
                ))
            })?;
            rows.collect::<rusqlite::Result<Vec<_>>>()?
        };
        let derived = {
            let mut stmt = self.db.prepare(
                "SELECT id,kind,body FROM derived WHERE indexed=0 ORDER BY id LIMIT 100",
            )?;
            let rows = stmt.query_map([], |r| {
                Ok((
                    r.get::<_, i64>(0)?,
                    r.get::<_, String>(1)?,
                    r.get::<_, String>(2)?,
                ))
            })?;
            rows.collect::<rusqlite::Result<Vec<_>>>()?
        };
        for (chunk_id, snapshot_id, app, _title, url, domain, source_type, body, start, end, first, last) in &chunks {
            self.upsert_point((1_u64 << 61) + *chunk_id as u64, body, json!({"snapshot_id":snapshot_id,"chunk_id":chunk_id,"start_byte":start,"end_byte":end,"point_type":"chunk","app":app,"domain":domain,"url":url,"capture_time":first,"last_seen":last,"source_type":source_type,"model":MODEL_VERSION}))?;
        }
        for (id, kind, body) in &derived {
            self.upsert_point(
                (1_u64 << 62) + *id as u64,
                body,
                json!({"derived_id":id,"point_type":"derived","kind":kind,"model":MODEL_VERSION}),
            )?;
        }
        let added = chunks.len() + derived.len();
        if added > 0 {
            self.shard.flush()?;
            let tx = self.db.transaction()?;
            for (id, snapshot_id, _, _, _, _, _, _, _, _, _, _) in chunks {
                tx.execute("UPDATE chunks SET indexed=1 WHERE id=?1", [id])?;
                tx.execute("UPDATE snapshots SET indexed=1,embedding_model=?2 WHERE id=?1", params![snapshot_id, MODEL_VERSION])?;
            }
            for (id, _, body) in derived {
                tx.execute(
                    "UPDATE derived SET indexed=1 WHERE id=?1 AND body=?2",
                    params![id, body],
                )?;
            }
            tx.commit()?;
        }
        Ok(added)
    }
}

fn capture(state: &Path, print: bool, rebuild: bool) -> Result<()> {
    let helper = install_helper(state)?;
    let socket = state.join("capture.sock");
    if UnixStream::connect(&socket).is_ok() {
        bail!("capture is already running");
    }
    if socket.exists() {
        fs::remove_file(&socket)?;
    }
    let listener = UnixListener::bind(&socket)?;
    fs::set_permissions(&socket, fs::Permissions::from_mode(0o600))?;
    listener.set_nonblocking(true)?;
    println!("Capture starting. State: {}", state.display());
    let permission = run_helper(&helper, "--permission")?;
    if permission.permission.as_deref() != Some("granted") {
        let _ = run_helper(&helper, "--request-permission");
        println!("Grant Accessibility to {} in System Settings → Privacy & Security → Accessibility, then leave this command running.", helper.display());
    }
    let mut runtime: Option<Runtime> = None;
    let (tx, rx) = mpsc::channel::<i64>();
    let state_for_worker = state.to_path_buf();
    thread::spawn(move || {
        while let Ok(id) = rx.recv() {
            if let Err(error) = summarize(&state_for_worker, id) {
                eprintln!("summary skipped for #{id}: {error:#}");
            }
        }
    });
    let mut last_status = String::new();
    loop {
        if run_helper(&helper, "--permission")?.permission.as_deref() != Some("granted") {
            if last_status != "accessibility_not_granted" {
                println!("Skipped: accessibility_not_granted");
                last_status = "accessibility_not_granted".into();
            }
        } else {
            if runtime.is_none() {
                runtime = Some(open_runtime(state, rebuild)?);
                println!("Model2Vec and Qdrant Edge ready ({MODEL_VERSION}).");
            }
            let rt = runtime.as_mut().unwrap();
            let reply = run_helper(&helper, "--read-frontmost")?;
            if reply.status.as_deref() == Some("ok") {
                if let Some(window) = reply.window {
                    let (id, is_new, source) = record(
                        &mut rt.db,
                        &window,
                        reply.url,
                        reply.source_type,
                        reply.limitations,
                    )?;
                    if is_new && source.cleaner_quality != "navigation_only" {
                        tx.send(id)?;
                    } else {
                        let chunk_ids = {
                            let mut stmt = rt.db.prepare("SELECT id FROM chunks WHERE snapshot_id=?1")?;
                            let found = stmt.query_map([id], |r| r.get::<_, i64>(0))?.collect::<rusqlite::Result<Vec<_>>>()?;
                            found
                        };
                        if !chunk_ids.is_empty() {
                            let payload: Payload = serde_json::from_value(
                                json!({"last_seen":source.last_seen_ms,"source_type":source.source_type}),
                            )?;
                            rt.shard.update(UpdateOperation::PayloadOperation(
                                PayloadOps::SetPayload(SetPayloadOp {
                                    payload,
                                    points: Some(chunk_ids.into_iter().map(|chunk_id| PointId::NumId((1_u64 << 61) + chunk_id as u64)).collect()),
                                    filter: None,
                                    key: None,
                                }),
                            ))?;
                        }
                    }
                    let indexed = rt.index_pending()?;
                    let status = if source.cleaner_quality == "navigation_only" { "navigation_only" } else if is_new { "new" } else { "seen" };
                    println!(
                        "{status} #{id} {} | {} | {} | indexed {indexed}",
                        source.app_id,
                        source.title,
                        time_string(source.last_seen_ms)
                    );
                    if !source.limitations.is_empty() && source.limitations != "[]" {
                        println!("  Partial: {}", source.limitations);
                    }
                    if print {
                        println!(
                            "  URL: {}\n  Source type: {}\n  Quality: {}\n  Focus: {} / {}\n  Text:\n{}",
                            source.url.as_deref().unwrap_or("(unavailable)"),
                            source.source_type,
                            source.cleaner_quality,
                            window.focus_role.as_deref().unwrap_or(""),
                            window.focus_name.as_deref().unwrap_or(""),
                            source.body
                        );
                    }
                    last_status.clear();
                }
            } else {
                let status = reply
                    .reason
                    .unwrap_or_else(|| "unknown_capture_failure".into());
                if status != last_status {
                    println!("Skipped: {status}");
                    last_status = status;
                }
            }
        }
        for stream in listener.incoming() {
            match stream {
                Ok(mut stream) => {
                    stream.set_read_timeout(Some(Duration::from_secs(20)))?;
                    stream.set_write_timeout(Some(Duration::from_secs(20)))?;
                    let mut question = String::new();
                    stream.read_to_string(&mut question)?;
                    let answer = match runtime.as_mut() {
                        Some(rt) => answer(rt, question.trim()),
                        None => Err(anyhow!("capture is waiting for Accessibility permission")),
                    };
                    let response = match answer {
                        Ok(value) => json!({"ok":true,"text":value}),
                        Err(error) => json!({"ok":false,"text":format!("{error:#}")}),
                    };
                    stream.write_all(response.to_string().as_bytes())?;
                }
                Err(error) if error.kind() == std::io::ErrorKind::WouldBlock => break,
                Err(error) => eprintln!("query socket error: {error}"),
            }
        }
        thread::sleep(Duration::from_secs(3));
    }
}

fn record(
    db: &mut Connection,
    window: &AxWindow,
    url: Option<String>,
    source_type: Option<String>,
    limitations: Option<Vec<String>>,
) -> Result<(i64, bool, Source)> {
    let cleaned = cleaner::clean(&window.roots, &window.app_id, url.as_deref(), &window.title);
    let body = &cleaned.body;
    let domain = url
        .as_deref()
        .and_then(|u| url::Url::parse(u).ok())
        .and_then(|u| u.host_str().map(str::to_owned));
    let source_type = source_type.unwrap_or_else(|| "app".into());
    let fingerprint = content_fingerprint(&window.app_id, url.as_deref(), &window.title, body);
    let evidence_fingerprint = evidence_key(&window.app_id, domain.as_deref(), &source_type, &body);
    let limitations = serde_json::to_string(&limitations.unwrap_or_default())?;
    let ax_nodes_json = serde_json::to_string(&window.roots)?;
    let cleaning_trace_json = serde_json::to_string(&cleaned.decisions)?;
    let existing: Option<i64> = db
        .query_row(
            "SELECT id FROM snapshots WHERE fingerprint=?1",
            [&fingerprint],
            |r| r.get(0),
        )
        .optional()?;
    let transaction = db.transaction()?;
    transaction.execute("INSERT INTO snapshots(fingerprint,evidence_fingerprint,app_id,title,url,domain,source_type,body,first_seen_ms,last_seen_ms,focus_role,focus_name,limitations,ax_nodes_json,cleaner_version,cleaner_quality,cleaner_coverage,cleaning_trace_json,searchable) VALUES(?1,?2,?3,?4,?5,?6,?7,?8,?9,?9,?10,?11,?12,?13,?14,?15,?16,?17,?18) ON CONFLICT(fingerprint) DO UPDATE SET last_seen_ms=excluded.last_seen_ms,duration_ms=MAX(0,excluded.last_seen_ms-snapshots.first_seen_ms),sightings=snapshots.sightings+1,limitations=excluded.limitations,source_type=excluded.source_type",
        params![fingerprint,evidence_fingerprint,window.app_id,window.title,url,domain,source_type,body,window.observed_ms,window.focus_role,window.focus_name,limitations,ax_nodes_json,cleaner::VERSION,cleaned.quality,cleaned.coverage,cleaning_trace_json,i64::from(!body.is_empty())])?;
    let id: i64 = transaction.query_row(
        "SELECT id FROM snapshots WHERE fingerprint=?1",
        [&fingerprint],
        |r| r.get(0),
    )?;
    transaction.execute("INSERT OR IGNORE INTO raw_versions(snapshot_id,ax_hash,ax_nodes_json,observed_ms) VALUES(?1,?2,?3,?4)",params![id,digest(&ax_nodes_json),ax_nodes_json,window.observed_ms])?;
    if existing.is_none() {
        for (start, end, text) in cleaner::chunks(body) {
            transaction.execute("INSERT INTO chunks(snapshot_id,start_byte,end_byte,body) VALUES(?1,?2,?3,?4)", params![id,start as i64,end as i64,text])?;
        }
    }
    transaction.execute("INSERT INTO observations(snapshot_id,observed_ms,window_session_id,focus_role,focus_name,limitations) VALUES(?1,?2,?3,?4,?5,?6)",params![id,window.observed_ms,window.window_session_id,window.focus_role,window.focus_name,limitations])?;
    transaction.commit()?;
    let source = load_source(db, id, 0.0)?.context("recorded source missing")?;
    Ok((id, existing.is_none(), source))
}

fn load_source(db: &Connection, id: i64, score: f32) -> Result<Option<Source>> {
    db.query_row("SELECT id,app_id,title,url,domain,source_type,body,first_seen_ms,last_seen_ms,sightings,limitations,cleaner_quality FROM snapshots WHERE id=?1",[id],|r| {
        Ok(Source { id:r.get(0)?,app_id:r.get(1)?,title:r.get(2)?,url:r.get(3)?,domain:r.get(4)?,source_type:r.get(5)?,body:r.get(6)?,first_seen_ms:r.get(7)?,last_seen_ms:r.get(8)?,sightings:r.get(9)?,limitations:r.get(10)?,cleaner_quality:r.get(11)?,hit_text:None,score })
    }).optional().map_err(Into::into)
}

fn reprocess(state: &Path, apply: bool) -> Result<()> {
    if UnixStream::connect(state.join("capture.sock")).is_ok() {
        bail!("stop the capture process before reprocessing stored snapshots");
    }
    let mut db = open_db(state)?;
    let records = {
        let mut stmt = db.prepare("SELECT id,app_id,title,url,domain,source_type,body,ax_nodes_json FROM snapshots ORDER BY id")?;
        let found = stmt.query_map([], |r| Ok((r.get::<_,i64>(0)?,r.get::<_,String>(1)?,r.get::<_,String>(2)?,r.get::<_,Option<String>>(3)?,r.get::<_,Option<String>>(4)?,r.get::<_,String>(5)?,r.get::<_,String>(6)?,r.get::<_,String>(7)?)))?
            .collect::<rusqlite::Result<Vec<_>>>()?;
        found
    };
    let mut prepared = Vec::new();
    let mut unavailable = 0_usize;
    let mut navigation_only = 0_usize;
    let mut reason_counts = std::collections::BTreeMap::<&'static str, usize>::new();
    for (id, app, title, url, domain, source_type, old_body, json_nodes) in records {
        let nodes: Vec<AxNode> = serde_json::from_str(&json_nodes).with_context(|| format!("invalid AX JSON for snapshot #{id}"))?;
        if nodes.is_empty() {
            unavailable += 1;
            prepared.push((id, app, title, url, domain, source_type, old_body, json_nodes, None));
            continue;
        }
        let cleaned = cleaner::clean(&nodes, &app, url.as_deref(), &title);
        if cleaned.body.is_empty() { navigation_only += 1; }
        for decision in &cleaned.decisions {
            if decision.class == "drop" { *reason_counts.entry(decision.reason).or_default() += 1; }
        }
        if !apply && (url.as_deref().is_some_and(|u| u.contains("chatgpt.com")) || prepared.len() < 2 || [3,12,15,45].contains(&id)) {
            println!("\nSnapshot #{id} [{}] {}", cleaned.quality, title);
            println!("Before: {}", old_body.chars().take(600).collect::<String>().replace('\n', " | "));
            println!("After:  {}", cleaned.body.chars().take(900).collect::<String>().replace('\n', " | "));
            if url.as_deref().is_some_and(|u| u.contains("chatgpt.com")) {
                let tail = cleaned.body.chars().rev().take(900).collect::<String>().chars().rev().collect::<String>();
                println!("After tail: {}", tail.replace('\n', " | "));
            }
            let removed = cleaned.decisions.iter().filter(|d| d.class == "drop").take(12).map(|d| format!("{}:{}",d.node,d.reason)).collect::<Vec<_>>();
            println!("Removed nodes: {}", removed.join(", "));
        }
        prepared.push((id, app, title, url, domain, source_type, old_body, json_nodes, Some(cleaned)));
    }
    println!("Cleaning preview: {} snapshots; {navigation_only} navigation-only; {unavailable} without AX nodes (original retained).", prepared.len());
    println!("Removed-node reasons: {reason_counts:?}");
    if !apply {
        println!("No snapshot text or Qdrant index changed. Run `open-memory capture --apply-cleaning` to apply.");
        return Ok(());
    }

    // The backup includes the current WAL contents and is intentionally outside
    // the live database name. Reprocessing can then be retried without losing AX JSON.
    let backup = state.join(format!("memory.pre-clean-v{}.sqlite3", cleaner::VERSION));
    if !backup.exists() {
        db.execute("VACUUM INTO ?1", [backup.to_string_lossy().as_ref()])?;
    }
    let tx = db.transaction()?;
    tx.execute("DELETE FROM derived", [])?;
    tx.execute("DELETE FROM chunks", [])?;
    for (id, _, _, _, _, _, _, json_nodes, _) in &prepared {
        if json_nodes != "[]" {
            let first_seen: i64 = tx.query_row("SELECT first_seen_ms FROM snapshots WHERE id=?1",[id],|r|r.get(0))?;
            tx.execute("INSERT OR IGNORE INTO raw_versions(snapshot_id,ax_hash,ax_nodes_json,observed_ms) VALUES(?1,?2,?3,?4)",params![id,digest(json_nodes),json_nodes,first_seen])?;
        }
        tx.execute("UPDATE snapshots SET fingerprint=?2 WHERE id=?1", params![id,format!("reclean-pending-{id}")])?;
    }
    let mut merged = 0_usize;
    for (id, app, title, url, domain, source_type, _old_body, _json_nodes, cleaned) in prepared {
        let Some(cleaned) = cleaned else {
            tx.execute("UPDATE snapshots SET cleaner_version=?2,cleaner_quality='content_unavailable',cleaner_coverage=0,searchable=0,indexed=0,embedding_model=NULL WHERE id=?1",params![id,cleaner::VERSION])?;
            continue;
        };
        let fingerprint = content_fingerprint(&app, url.as_deref(), &title, &cleaned.body);
        let evidence = evidence_key(&app, domain.as_deref(), &source_type, &cleaned.body);
        let existing: Option<i64> = tx.query_row("SELECT id FROM snapshots WHERE fingerprint=?1", [&fingerprint], |r| r.get(0)).optional()?;
        if let Some(winner) = existing {
            tx.execute("UPDATE observations SET snapshot_id=?1 WHERE snapshot_id=?2", params![winner,id])?;
            tx.execute("INSERT OR IGNORE INTO raw_versions(snapshot_id,ax_hash,ax_nodes_json,observed_ms) SELECT ?1,ax_hash,ax_nodes_json,observed_ms FROM raw_versions WHERE snapshot_id=?2",params![winner,id])?;
            tx.execute("UPDATE snapshots SET first_seen_ms=MIN(first_seen_ms,(SELECT first_seen_ms FROM snapshots WHERE id=?2)),last_seen_ms=MAX(last_seen_ms,(SELECT last_seen_ms FROM snapshots WHERE id=?2)),sightings=sightings+(SELECT sightings FROM snapshots WHERE id=?2) WHERE id=?1",params![winner,id])?;
            tx.execute("DELETE FROM snapshots WHERE id=?1",[id])?;
            merged += 1;
            continue;
        }
        let trace = serde_json::to_string(&cleaned.decisions)?;
        tx.execute("UPDATE snapshots SET fingerprint=?2,evidence_fingerprint=?3,body=?4,cleaner_version=?5,cleaner_quality=?6,cleaner_coverage=?7,cleaning_trace_json=?8,searchable=?9,indexed=0,embedding_model=NULL WHERE id=?1",
            params![id,fingerprint,evidence,cleaned.body,cleaner::VERSION,cleaned.quality,cleaned.coverage,trace,i64::from(!cleaned.body.is_empty())])?;
        for (start, end, text) in cleaner::chunks(&cleaned.body) {
            tx.execute("INSERT INTO chunks(snapshot_id,start_byte,end_byte,body) VALUES(?1,?2,?3,?4)",params![id,start as i64,end as i64,text])?;
        }
    }
    tx.commit()?;
    let ids = {
        let mut stmt = db.prepare("SELECT id FROM snapshots WHERE searchable=1 ORDER BY id")?;
        let found = stmt.query_map([], |r| r.get::<_,i64>(0))?.collect::<rusqlite::Result<Vec<_>>>()?;
        found
    };
    drop(db);
    for id in &ids { summarize(state,*id)?; }
    let mut runtime = open_runtime(state, true)?;
    let mut indexed = 0_usize;
    loop {
        let count = runtime.index_pending()?;
        indexed += count;
        if count == 0 { break; }
    }
    println!("Applied cleaner v{}; merged {merged} duplicate snapshots; rebuilt Qdrant ({indexed} additional points). Backup: {}",cleaner::VERSION,backup.display());
    Ok(())
}

fn summarize(state: &Path, snapshot_id: i64) -> Result<()> {
    let db = open_db(state)?;
    let source = load_source(&db, snapshot_id, 0.0)?.context("snapshot missing")?;
    let timestamp = DateTime::<Utc>::from_timestamp_millis(source.first_seen_ms)
        .context("invalid capture time")?;
    let topic = source.title.trim();
    if !topic.is_empty() {
        let body = format!("Topic: {topic}. Exact source snapshot #{snapshot_id}.");
        put_derived(
            &db,
            "topic",
            &format!("{}:{topic}", source.app_id),
            &body,
            &[snapshot_id],
        )?;
    }
    let entity_re = Regex::new(r"\b[A-Z][a-z]{2,}(?:\s+[A-Z][a-z]{2,})?\b")?;
    for name in entity_re
        .find_iter(&source.body)
        .map(|m| m.as_str())
        .filter(|n| {
            ![
                "Static", "Text", "Button", "Heading", "Group", "Window", "Search",
            ]
            .contains(n)
        })
        .take(12)
    {
        let body = format!("Entity label {name} appears in source snapshot #{snapshot_id}. This is a mention, not a verified identity.");
        put_derived(&db, "entity", name, &body, &[snapshot_id])?;
    }
    for (kind, key) in [
        ("hour", timestamp.format("%Y-%m-%dT%H").to_string()),
        ("day", timestamp.format("%Y-%m-%d").to_string()),
    ] {
        let start = if kind == "hour" {
            timestamp.timestamp_millis() / 3_600_000 * 3_600_000
        } else {
            timestamp.timestamp_millis() / 86_400_000 * 86_400_000
        };
        let end = start
            + if kind == "hour" {
                3_600_000
            } else {
                86_400_000
            };
        let records = {
            let mut stmt = db.prepare("SELECT id,title,body FROM snapshots WHERE first_seen_ms>=?1 AND first_seen_ms<?2 ORDER BY first_seen_ms LIMIT 50")?;
            let rows = stmt.query_map(params![start, end], |r| {
                Ok((
                    r.get::<_, i64>(0)?,
                    r.get::<_, String>(1)?,
                    r.get::<_, String>(2)?,
                ))
            })?;
            rows.collect::<rusqlite::Result<Vec<_>>>()?
        };
        let mut ids = Vec::new();
        let mut lines = Vec::new();
        for (id, title, body) in records {
            ids.push(id);
            let excerpt = body
                .lines()
                .filter(|line| !line.trim().is_empty())
                .take(2)
                .collect::<Vec<_>>()
                .join("; ");
            lines.push(format!("#{id} {title}: {excerpt}"));
        }
        let summary = format!(
            "{} UTC {}. Extractive evidence: {}",
            kind,
            key,
            lines.join(" | ")
        );
        put_derived(&db, kind, &key, &summary, &ids)?;
    }
    Ok(())
}

fn put_derived(
    db: &Connection,
    kind: &str,
    key: &str,
    body: &str,
    source_ids: &[i64],
) -> Result<()> {
    db.execute("INSERT INTO derived(kind,logical_key,body,created_ms) VALUES(?1,?2,?3,?4) ON CONFLICT(kind,logical_key) DO UPDATE SET body=excluded.body,indexed=0,created_ms=excluded.created_ms",params![kind,key,body,now_ms()])?;
    let id: i64 = db.query_row(
        "SELECT id FROM derived WHERE kind=?1 AND logical_key=?2",
        params![kind, key],
        |r| r.get(0),
    )?;
    for source_id in source_ids {
        db.execute(
            "INSERT OR IGNORE INTO derived_sources(derived_id,snapshot_id) VALUES(?1,?2)",
            params![id, source_id],
        )?;
    }
    Ok(())
}

fn ask(state: &Path, question: &str) -> Result<()> {
    let socket = state.join("capture.sock");
    if let Ok(mut stream) = UnixStream::connect(&socket) {
        stream.set_read_timeout(Some(Duration::from_secs(30)))?;
        stream.write_all(question.as_bytes())?;
        stream.shutdown(std::net::Shutdown::Write)?;
        let mut response = String::new();
        stream.read_to_string(&mut response)?;
        let parsed: Value = serde_json::from_str(&response)?;
        if parsed["ok"] == true {
            println!("{}", parsed["text"].as_str().unwrap_or(""));
            return Ok(());
        }
        bail!("{}", parsed["text"].as_str().unwrap_or("query failed"));
    }
    let mut runtime = open_runtime(state, false)?;
    println!("{}", answer(&mut runtime, question)?);
    Ok(())
}

fn query_filter(db: &Connection, question: &str) -> Result<Option<Filter>> {
    let q = question.to_lowercase();
    let mut must = Vec::<Value>::new();
    let known_apps = [
        ("chrome", "com.google.Chrome"),
        ("safari", "com.apple.Safari"),
        ("firefox", "org.mozilla.firefox"),
        ("slack", "com.tinyspeck.slackmacgap"),
        ("terminal", "com.apple.Terminal"),
        ("notes", "com.apple.Notes"),
        ("messages", "com.apple.iChat"),
        ("edge", "com.microsoft.edgemac"),
    ];
    let words: std::collections::HashSet<_> = q.split(|c: char| !c.is_alphanumeric()).collect();
    for (label, id) in known_apps {
        if words.contains(label) {
            must.push(json!({"key":"app","match":{"value":id}}));
            break;
        }
    }
    if words.contains("private") || words.contains("incognito") {
        must.push(json!({"key":"source_type","match":{"value":"browser_private"}}));
    }
    let domains = Regex::new(r"(?i)\b(?:[a-z0-9-]+\.)+[a-z]{2,}\b")?;
    if let Some(domain) = domains.find(question) {
        let value = domain.as_str().to_lowercase();
        let exists: bool = db.query_row(
            "SELECT EXISTS(SELECT 1 FROM snapshots WHERE domain=?1)",
            [&value],
            |r| r.get(0),
        )?;
        if exists {
            must.push(json!({"key":"domain","match":{"value":value}}));
        }
    }
    if let Some((start, end)) = time_bounds(question)? {
        must.push(json!({"key":"capture_time","range":{"lt":end}}));
        must.push(json!({"key":"last_seen","range":{"gte":start}}));
    }
    if must.is_empty() {
        Ok(None)
    } else {
        Ok(Some(serde_json::from_value(json!({"must":must}))?))
    }
}

fn time_bounds(question: &str) -> Result<Option<(i64, i64)>> {
    let q = question.to_lowercase();
    let date_re = Regex::new(r"\b\d{4}-\d{2}-\d{2}\b")?;
    let date = if q.contains("yesterday") {
        Some(
            Local::now()
                .date_naive()
                .pred_opt()
                .context("invalid yesterday")?,
        )
    } else if q.contains("today") {
        Some(Local::now().date_naive())
    } else {
        date_re
            .find(question)
            .and_then(|m| chrono::NaiveDate::parse_from_str(m.as_str(), "%Y-%m-%d").ok())
    };
    if let Some(date) = date {
        let start = Local
            .from_local_datetime(&date.and_hms_opt(0, 0, 0).context("invalid date")?)
            .earliest()
            .context("invalid local date")?
            .timestamp_millis();
        let end = Local
            .from_local_datetime(
                &date
                    .succ_opt()
                    .context("invalid next day")?
                    .and_hms_opt(0, 0, 0)
                    .context("invalid next day")?,
            )
            .earliest()
            .context("invalid next day")?
            .timestamp_millis();
        Ok(Some((start, end)))
    } else {
        Ok(None)
    }
}

fn answer(runtime: &mut Runtime, question: &str) -> Result<String> {
    if question.len() > 2_000 {
        bail!("question is too long");
    }
    if question.to_lowercase().contains("that conversation") {
        let previous: Option<String> = runtime
            .db
            .query_row(
                "SELECT value FROM index_meta WHERE key='last_answer_snapshot'",
                [],
                |r| r.get(0),
            )
            .optional()?;
        if let Some(id) = previous.and_then(|s| s.parse::<i64>().ok()) {
            if let Some(source) = load_source(&runtime.db, id, 0.0)? {
                return Ok(format!("Most recent conversation evidence: [{}] {} — {}\nObserved: {}\nSource: {}\nThe source URL identifies where the captured conversation appeared; it does not establish where participants were physically located.",
                    source.id,source.app_id,source.title,time_string(source.first_seen_ms),source.url.as_deref().unwrap_or("No URL exposed by Accessibility")));
            }
        }
        return Ok("No earlier conversation evidence is available in this state directory. Ask about the conversation first.".into());
    }
    runtime.index_pending()?;
    let filter = query_filter(&runtime.db, question)?;
    let time = time_bounds(question)?;
    let dense = runtime.vector(question)?;
    let sparse = runtime.bm25.embed_query(question);
    let mut builder = QueryRequestBuilder::new(40)
        .add_prefetch(
            PrefetchBuilder::new(80)
                .query(ScoringQuery::Vector(QueryEnum::Nearest(NamedQuery {
                    query: VectorInternal::from(dense),
                    using: Some("dense".into()),
                })))
                .build(),
        )
        .add_prefetch(
            PrefetchBuilder::new(80)
                .query(ScoringQuery::Vector(QueryEnum::Nearest(NamedQuery {
                    query: VectorInternal::from(sparse),
                    using: Some("bm25".into()),
                })))
                .build(),
        )
        .query(ScoringQuery::Fusion(Fusion::Rrf {
            k: 60,
            weights: None,
        }))
        .with_payload(WithPayloadInterface::Bool(true));
    if let Some(filter) = filter {
        builder = builder.filter(filter);
    }
    let points = runtime.shard.query(builder.build())?;
    let mut by_evidence = std::collections::HashMap::<String, Source>::new();
    for point in points {
        let PointId::NumId(point_id) = point.id else {
            continue;
        };
        let hits: Vec<(i64,Option<String>)> = if point_id >= (1_u64 << 62) {
            let derived_id = (point_id - (1_u64 << 62)) as i64;
            let mut stmt = runtime
                .db
                .prepare("SELECT snapshot_id FROM derived_sources WHERE derived_id=?1 LIMIT 8")?;
            let found = stmt
                .query_map([derived_id], |r| r.get::<_, i64>(0))?
                .collect::<rusqlite::Result<Vec<_>>>()?;
            found.into_iter().map(|id| (id,None)).collect()
        } else if point_id >= (1_u64 << 61) {
            let chunk_id = (point_id - (1_u64 << 61)) as i64;
            runtime.db.query_row("SELECT snapshot_id,body FROM chunks WHERE id=?1", [chunk_id], |r| Ok((r.get::<_, i64>(0)?,Some(r.get::<_,String>(1)?)))).optional()?.into_iter().collect()
        } else {
            vec![(point_id as i64,None)]
        };
        for (id,hit_text) in hits {
            if let Some((start, end)) = time {
                let observed: bool = runtime.db.query_row("SELECT EXISTS(SELECT 1 FROM observations WHERE snapshot_id=?1 AND observed_ms>=?2 AND observed_ms<?3)",params![id,start,end],|r|r.get(0))?;
                if !observed {
                    continue;
                }
            }
            if let Some(mut source) = load_source(&runtime.db, id, point.score)? {
                source.hit_text = hit_text;
                let evidence = evidence_key(
                    &source.app_id,
                    source.domain.as_deref(),
                    &source.source_type,
                    &source.body,
                );
                match by_evidence.entry(evidence) {
                    std::collections::hash_map::Entry::Vacant(entry) => {
                        entry.insert(source);
                    }
                    std::collections::hash_map::Entry::Occupied(mut entry) => {
                        if source.score > entry.get().score || (source.score == entry.get().score && source.last_seen_ms > entry.get().last_seen_ms) {
                            let mut newer = source;
                            newer.score = newer.score.max(entry.get().score);
                            entry.insert(newer);
                        }
                    }
                }
            }
        }
    }
    let mut sources: Vec<Source> = by_evidence.into_values().collect();
    if sources.is_empty() {
        return Ok("No matching captured evidence yet. Capture may be incomplete if the app did not expose text through Accessibility.".into());
    }
    let terms = content_terms(question);
    sources.sort_by(|a, b| {
        let relevance = |source: &Source| {
            let body = source.body.to_lowercase();
            let matches: usize = terms
                .iter()
                .map(|term| body.matches(term).count().min(5))
                .sum();
            source.score + (matches as f32) / (body.len().max(100) as f32).sqrt()
        };
        relevance(b)
            .total_cmp(&relevance(a))
            .then_with(|| b.last_seen_ms.cmp(&a.last_seen_ms))
    });
    sources.truncate(8);
    runtime.db.execute("INSERT INTO index_meta(key,value) VALUES('last_answer_snapshot',?1) ON CONFLICT(key) DO UPDATE SET value=excluded.value",[sources[0].id.to_string()])?;
    let mut output = String::new();
    if env::var("OPEN_MEMORY_LLM_URL").is_ok() {
        match llm_answer(question, &sources) {
            Ok(response) => {
                output.push_str(&response);
                output.push_str("\n\n");
            }
            Err(error) => {
                output.push_str(&format!(
                    "LLM unavailable ({error:#}); showing ranked evidence.\n\n"
                ));
            }
        }
    } else {
        output.push_str("Ranked evidence (no LLM configured):\n\n");
    }
    for (rank, source) in sources.iter().enumerate() {
        let snippet = snippet(&source.body, question);
        output.push_str(&format!("{}. [{}] {} — {}\n   Observed: {} (last seen {}; {} sightings)\n   Source: {}\n   {}\n",
            rank+1,source.id,source.app_id,source.title,time_string(source.first_seen_ms),time_string(source.last_seen_ms),source.sightings,
            source.url.as_deref().unwrap_or("No URL exposed by Accessibility"),snippet));
        if source.limitations != "[]" {
            output.push_str(&format!("   Capture limitations: {}\n", source.limitations));
        }
    }
    output.push_str("Displayed message times, if present, are in the captured text; observed times above are capture times.");
    Ok(output)
}

fn snippet(body: &str, question: &str) -> String {
    let terms = content_terms(question);
    let lines: Vec<&str> = body.lines().collect();
    let lower_question = question.to_lowercase();
    let speaker = if lower_question.contains("did i ask") {
        Some("me".to_owned())
    } else {
        Regex::new(r"(?i)\bdid\s+([A-Z][a-z]+)\s+say\b")
            .ok()
            .and_then(|re| re.captures(question).map(|c| c[1].to_lowercase()))
    };
    if let Some(speaker) = speaker {
        if let Some(start) = lines.iter().position(|line| {
            line.eq_ignore_ascii_case(&speaker)
                || line.eq_ignore_ascii_case(&format!("{speaker} said:"))
        }) {
            let end = ((start + 1)..lines.len())
                .find(|&i| lines[i].ends_with(" said:"))
                .unwrap_or(lines.len());
            let block = &lines[start..end.min(start + 8)];
            let relevant = block
                .iter()
                .take_while(|line| {
                    !line.is_empty()
                })
                .copied()
                .collect::<Vec<_>>();
            if relevant
                .iter()
                .any(|line| terms.iter().any(|term| line.to_lowercase().contains(term)))
            {
                return relevant.join(" | ");
            }
        }
    }
    let best = lines
        .iter()
        .enumerate()
        .max_by_key(|(_, line)| {
            let lower = line.to_lowercase();
            let matches = terms
                .iter()
                .filter(|term| lower.contains(term.as_str()))
                .count();
            matches * 10 + usize::from(matches > 0 && line.len() > 45)
        })
        .map(|(index, _)| index)
        .unwrap_or(0);
    let start = best.saturating_sub(2);
    lines
        .iter()
        .skip(start)
        .take(5)
        .map(|line| line.chars().take(250).collect::<String>())
        .collect::<Vec<_>>()
        .join(" | ")
}

fn content_terms(question: &str) -> Vec<String> {
    let stop = [
        "what", "which", "when", "where", "about", "said", "did", "does", "have", "with", "from",
        "that", "this", "there", "were", "would", "could", "should", "tell", "asked", "asking",
    ];
    question
        .split(|c: char| !c.is_alphanumeric())
        .filter(|s| s.len() > 3 && !stop.contains(&s.to_lowercase().as_str()))
        .map(str::to_lowercase)
        .collect()
}

fn redact_cloud(text: &str) -> Result<String> {
    let mut value = text.to_owned();
    for (pattern, replacement) in [
        (r"(?i)\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b", "[EMAIL]"),
        (r"\b(?:\+?\d[\d ()-]{8,}\d)\b", "[PHONE]"),
        (
            r"(?i)\b(?:sk-|ghp_|github_pat_|xox[baprs]-|AKIA)[A-Za-z0-9_\-]{12,}\b",
            "[SECRET]",
        ),
        (
            r"(?i)(?:api[_ -]?key|access[_ -]?token|password|secret)\s*[:=]\s*\S+",
            "[SECRET]",
        ),
        (r"https?://[^\s?#]+(?:\?[^\s#]+)?", "[URL]"),
    ] {
        value = Regex::new(pattern)?
            .replace_all(&value, replacement)
            .into_owned();
    }
    // Redact likely person names while preserving the same placeholder in the
    // question and evidence. This is deliberately conservative for cloud mode.
    value = Regex::new(r"\b[A-Z][a-z]{2,}(?:\s+[A-Z][a-z]{2,})?\b")?
        .replace_all(&value, "[PERSON_OR_TITLE]")
        .into_owned();
    Ok(value)
}

fn llm_answer(question: &str, sources: &[Source]) -> Result<String> {
    let endpoint = env::var("OPEN_MEMORY_LLM_URL")?;
    let parsed = url::Url::parse(&endpoint)?;
    if parsed.scheme() != "https"
        && !(parsed.scheme() == "http"
            && matches!(parsed.host_str(), Some("localhost" | "127.0.0.1")))
    {
        bail!("LLM endpoint must be HTTPS or local HTTP");
    }
    let model = env::var("OPEN_MEMORY_LLM_MODEL").context("OPEN_MEMORY_LLM_MODEL is required")?;
    let key = env::var("OPEN_MEMORY_LLM_API_KEY").ok();
    let context = sources
        .iter()
        .take(6)
        .map(|s| {
            format!(
                "Source #{} app={} observed={} title={} URL={}\nRelevant excerpt: {}\nRetrieved chunk: {}",
                s.id,
                s.app_id,
                time_string(s.first_seen_ms),
                s.title,
                s.url.as_deref().unwrap_or(""),
                snippet(&s.body, question),
                s.hit_text.as_deref().unwrap_or(&s.body).chars().take(2_500).collect::<String>()
            )
        })
        .collect::<Vec<_>>()
        .join("\n\n");
    let redacted = redact_cloud(&format!("Question: {question}\n\nEvidence:\n{context}"))?;
    let client = Client::builder().timeout(Duration::from_secs(40)).build()?;
    let mut request = client.post(endpoint).json(&json!({"model":model,"messages":[
        {"role":"system","content":"Answer only from the supplied evidence. Cite snapshot IDs in square brackets. Distinguish observation time from any message time displayed in text. If evidence is insufficient, say so."},
        {"role":"user","content":redacted}
    ]}));
    if let Some(key) = key {
        request = request.bearer_auth(key);
    }
    let response: Value = request.send()?.error_for_status()?.json()?;
    Ok(response["choices"][0]["message"]["content"]
        .as_str()
        .context("LLM response lacked content")?
        .to_owned())
}
