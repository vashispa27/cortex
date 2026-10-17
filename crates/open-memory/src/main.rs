#![cfg(target_os = "macos")]
mod abstain;
mod appscope;
mod blocklist;
mod cleaner;
mod dedup;
mod eval;
mod fixtures;
mod prefix;
mod rawtrees;
mod timewin;
mod versions;

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
#[derive(Debug, Clone, Deserialize, Serialize)]
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
    /// Context prepended to chunk text before embedding; part of the index version.
    prefix: prefix::Prefix,
}

fn main() -> Result<()> {
    unsafe {
        libc_umask(0o077);
    }
    let args: Vec<String> = env::args().skip(1).collect();
    // Offline commands never touch the default state directory.
    match args.first().map(String::as_str) {
        Some("eval") => return eval::run(&args[1..]),
        Some("ingest-fixtures") => return fixtures::run_cli(&args[1..]),
        _ => {}
    }
    let state = state_dir()?;
    fs::create_dir_all(&state)?;
    fs::set_permissions(&state, fs::Permissions::from_mode(0o700))?;
    match args.as_slice() {
        [command, rest @ ..] if command == "blocklist" => blocklist::run_cli(&state, rest),
        [command, rest @ ..] if command == "raw-trees" => rawtrees::run_cli(&state, rest),
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
    eprintln!("Usage: open-memory capture [--print] [--rebuild-index]\n       open-memory capture --clean-dry-run\n       open-memory capture --apply-cleaning\n       open-memory blocklist [purge [--yes]|list|check <app id>|add <app id> [label]|remove <app id>|enable <app id>|disable <app id>|reset]\n       open-memory ask \"natural-language question\"\n       OPEN_MEMORY_STATE_DIR=<tmp> open-memory ingest-fixtures --corpus evals/corpus\n       open-memory eval --corpus evals/corpus --gold evals/gold/gold.jsonl --out evals/reports/<name>.json");
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
    // Chunk-level sharing (dedup.rs): `dup_of` points at the chunk whose vector point serves this one.
    let chunk_columns = {
        let mut statement = db.prepare("PRAGMA table_info(chunks)")?;
        let found = statement
            .query_map([], |row| row.get::<_, String>(1))?
            .collect::<rusqlite::Result<Vec<_>>>()?;
        found
    };
    for (column, definition) in [("dup_of", "INTEGER"), ("text_hash", "TEXT")] {
        if !chunk_columns.iter().any(|existing| existing == column) {
            db.execute(&format!("ALTER TABLE chunks ADD COLUMN {column} {definition}"), [])?;
        }
    }
    db.execute_batch("CREATE INDEX IF NOT EXISTS chunks_text_hash ON chunks(text_hash); CREATE INDEX IF NOT EXISTS chunks_dup_of ON chunks(dup_of);")?;
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
    // Offline evals point at an already-downloaded copy of the pinned model so a
    // throwaway state directory does not re-download it. The checksum is still enforced.
    if let Some(dir) = env::var_os("OPEN_MEMORY_MODEL_DIR") {
        let dir = PathBuf::from(dir);
        for file in ["config.json", "tokenizer.json", "model.safetensors"] {
            if !dir.join(file).is_file() {
                bail!("OPEN_MEMORY_MODEL_DIR is missing {file}");
            }
        }
        if file_hash(&dir.join("model.safetensors"))? != MODEL_SHA256 {
            bail!("OPEN_MEMORY_MODEL_DIR model checksum mismatch");
        }
        return Ok(dir);
    }
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

/// Snapshots cleaned by an older cleaner that can still be re-cleaned. Snapshots whose raw tree was deleted
/// (rawtrees.rs) keep their body and stay searchable; they are not stale.
fn stale_count(db: &Connection) -> Result<i64> {
    Ok(db.query_row("SELECT COUNT(*) FROM snapshots WHERE cleaner_version<?1 AND ax_nodes_json!='[]'", [cleaner::VERSION], |r| r.get(0))?)
}

fn open_runtime(state: &Path, rebuild: bool) -> Result<Runtime> {
    open_runtime_with(state, rebuild, None, prefix::Prefix::DEFAULT)
}

/// `model` lets offline evals reuse one loaded embedding model across state directories.
fn open_runtime_with(state: &Path, rebuild: bool, model: Option<StaticModel>, prefix_mode: prefix::Prefix) -> Result<Runtime> {
    let db = open_db(state)?;
    let stale = stale_count(&db)?;
    if stale > 0 {
        bail!("{stale} captures still use the old text format; run `open-memory capture --clean-dry-run` then `open-memory capture --apply-cleaning`");
    }
    let old: Option<String> = db
        .query_row("SELECT value FROM index_meta WHERE key='model'", [], |r| {
            r.get(0)
        })
        .optional()?;
    if old.as_deref().is_some_and(|v| v != prefix::index_version(prefix_mode)) && !rebuild {
        bail!("embedding model or chunk context format changed; run `open-memory capture --rebuild-index` to reindex originals in SQLite");
    }
    let shard_dir = state.join("qdrant-edge");
    if rebuild || (old.is_none() && shard_dir.join("edge_config.json").exists()) {
        if shard_dir.exists() {
            fs::remove_dir_all(&shard_dir)?;
        }
        db.execute("UPDATE snapshots SET indexed=0,embedding_model=NULL", [])?;
        db.execute("UPDATE chunks SET indexed=0,dup_of=NULL,text_hash=NULL", [])?;
        db.execute("UPDATE derived SET indexed=0", [])?;
    } else if !shard_dir.join("edge_config.json").exists() {
        // SQLite is authoritative if the disposable vector directory vanished.
        db.execute("UPDATE snapshots SET indexed=0,embedding_model=NULL", [])?;
        db.execute("UPDATE chunks SET indexed=0,dup_of=NULL,text_hash=NULL", [])?;
        db.execute("UPDATE derived SET indexed=0", [])?;
    }
    let model = match model {
        Some(model) => model,
        None => {
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
            model
        }
    };
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
    db.execute("INSERT INTO index_meta(key,value) VALUES('model',?1) ON CONFLICT(key) DO UPDATE SET value=excluded.value", [prefix::index_version(prefix_mode)])?;
    let mut runtime = Runtime {
        db,
        shard,
        model,
        bm25,
        prefix: prefix_mode,
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
    /// A re-sighting of a known snapshot only advances the `last_seen` payload of the chunk points that
    /// serve it (its own, or the ones its shared chunks point at).
    fn refresh_seen(&self, id: i64, source: &Source) -> Result<()> {
        let canonicals = {
            let mut stmt = self.db.prepare("SELECT DISTINCT COALESCE(dup_of,id) FROM chunks WHERE snapshot_id=?1")?;
            let found = stmt.query_map([id], |r| r.get::<_, i64>(0))?.collect::<rusqlite::Result<Vec<_>>>()?;
            found
        };
        // Points are grouped by the value to set: a point shared with other snapshots keeps the latest
        // sighting among all of them.
        let mut by_last: std::collections::BTreeMap<i64, Vec<PointId>> = std::collections::BTreeMap::new();
        for canonical in canonicals {
            let last: i64 = if dedup::enabled() { dedup::sharing(&self.db, canonical)?.1.max(source.last_seen_ms) } else { source.last_seen_ms };
            by_last.entry(last).or_default().push(PointId::NumId((1_u64 << 61) + canonical as u64));
        }
        for (last, points) in by_last {
            let payload: Payload = serde_json::from_value(json!({"last_seen":last,"source_type":source.source_type}))?;
            self.shard.update(UpdateOperation::PayloadOperation(PayloadOps::SetPayload(SetPayloadOp {
                payload,
                points: Some(points),
                filter: None,
                key: None,
            })))?;
        }
        Ok(())
    }
    fn index_pending(&mut self) -> Result<usize> {
        let chunks = {
            let mut stmt = self.db.prepare("SELECT c.id,c.snapshot_id,s.app_id,s.title,s.url,s.domain,s.source_type,c.body,c.start_byte,c.end_byte,s.first_seen_ms,s.last_seen_ms,s.body FROM chunks c JOIN snapshots s ON s.id=c.snapshot_id WHERE c.indexed=0 AND s.searchable=1 ORDER BY c.id LIMIT 100")?;
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
                    r.get::<_, String>(12)?,
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
        let version = prefix::index_version(self.prefix);
        // Chunks whose text is already indexed (same app and domain, same embedded context) get no point of
        // their own; they point at the one that exists. The context prefix puts the capture date in the
        // embedded text, so that mode never shares.
        let share = dedup::chunk_sharing_enabled() && self.prefix != prefix::Prefix::Context;
        let mut batch: std::collections::HashMap<String, i64> = std::collections::HashMap::new();
        let mut keys: Vec<(i64, String)> = Vec::new();
        let mut shared: Vec<(i64, i64, String)> = Vec::new();
        for (chunk_id, snapshot_id, app, title, url, domain, source_type, body, start, end, first, last, snapshot_body) in &chunks {
            let key = dedup::chunk_key(self.prefix, app, domain.as_deref(), title, body);
            if share {
                let canonical = match batch.get(&key) {
                    Some(c) => Some(*c),
                    None => self.db.query_row("SELECT id FROM chunks WHERE text_hash=?1 AND indexed=1 AND dup_of IS NULL LIMIT 1", [&key], |r| r.get::<_, i64>(0)).optional()?,
                };
                if let Some(canonical) = canonical {
                    shared.push((*chunk_id, canonical, key));
                    continue;
                }
                batch.insert(key.clone(), *chunk_id);
            }
            keys.push((*chunk_id, key));
            let text = prefix::embed_text(self.prefix, &prefix::ChunkContext { title, app_id: app, domain: domain.as_deref(), first_seen_ms: *first, snapshot_body, start_byte: *start as usize }, body);
            self.upsert_point((1_u64 << 61) + *chunk_id as u64, &text, json!({"snapshot_id":snapshot_id,"snapshot_ids":[snapshot_id],"chunk_id":chunk_id,"start_byte":start,"end_byte":end,"point_type":"chunk","app":app,"domain":domain,"url":url,"capture_time":first,"last_seen":last,"source_type":source_type,"model":version}))?;
        }
        // A shared point must be findable through every snapshot that shares it, and its time window must
        // cover all of them (the exact per-snapshot observation check runs after the query).
        let sharers: std::collections::HashMap<i64, (i64, i64, i64)> = chunks.iter().map(|c| (c.0, (c.1, c.10, c.11))).collect();
        let mut canonicals: std::collections::BTreeMap<i64, (i64, i64, std::collections::BTreeSet<i64>)> = std::collections::BTreeMap::new();
        for (chunk_id, canonical, _) in &shared {
            let entry = match canonicals.entry(*canonical) {
                std::collections::btree_map::Entry::Occupied(e) => e.into_mut(),
                std::collections::btree_map::Entry::Vacant(e) => {
                    let (first, last, ids) = dedup::sharing(&self.db, *canonical)?;
                    e.insert((first, last, ids.into_iter().collect()))
                }
            };
            let (snapshot_id, first, last) = sharers[chunk_id];
            entry.0 = entry.0.min(first);
            entry.1 = entry.1.max(last);
            entry.2.insert(snapshot_id);
        }
        for (canonical, (first, last, ids)) in &canonicals {
            let payload: Payload = serde_json::from_value(json!({"capture_time":first,"last_seen":last,"snapshot_ids":ids.iter().collect::<Vec<_>>()}))?;
            self.shard.update(UpdateOperation::PayloadOperation(PayloadOps::SetPayload(SetPayloadOp {
                payload,
                points: Some(vec![PointId::NumId((1_u64 << 61) + *canonical as u64)]),
                filter: None,
                key: None,
            })))?;
        }
        for (id, kind, body) in &derived {
            self.upsert_point(
                (1_u64 << 62) + *id as u64,
                body,
                json!({"derived_id":id,"point_type":"derived","kind":kind,"model":version}),
            )?;
        }
        let added = chunks.len() + derived.len();
        if added > 0 {
            self.shard.flush()?;
            let tx = self.db.transaction()?;
            for (id, key) in &keys {
                tx.execute("UPDATE chunks SET indexed=1,text_hash=?2 WHERE id=?1", params![id, key])?;
            }
            for (id, canonical, key) in &shared {
                tx.execute("UPDATE chunks SET indexed=1,dup_of=?2,text_hash=?3 WHERE id=?1", params![id, canonical, key])?;
            }
            for (_, snapshot_id, _, _, _, _, _, _, _, _, _, _, _) in &chunks {
                tx.execute("UPDATE snapshots SET indexed=1,embedding_model=?2 WHERE id=?1", params![snapshot_id, version])?;
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
    let mut last_purge: Option<std::time::Instant> = None;
    let mut blocked_apps = blocklist::Watcher::new(state)?;
    println!("Not saving windows of {} blocked app entries (open-memory blocklist list).", blocked_apps.list.apps.iter().filter(|e| e.enabled).count());
    loop {
        match blocked_apps.refresh() {
            Ok(true) => println!("Blocklist reloaded: {} enabled entries.", blocked_apps.list.apps.iter().filter(|e| e.enabled).count()),
            Ok(false) => {}
            Err(error) => eprintln!("blocklist not reloaded, keeping the previous one: {error:#}"),
        }
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
            // Raw Accessibility trees older than the retention window are deleted at start and then daily.
            if last_purge.map_or(true, |t| t.elapsed() >= Duration::from_secs(24 * 3600)) {
                let startup = last_purge.is_none();
                last_purge = Some(std::time::Instant::now());
                match rawtrees::purge_expired(&mut rt.db, now_ms()) {
                    Ok(report) if report.snapshots > 0 => println!("Deleted {} raw trees ({:.1} MB) of snapshots not seen for {} days; bodies and search are unchanged.", report.snapshots, report.bytes as f64 / 1e6, rawtrees::retention_days().unwrap_or(0)),
                    Ok(_) => {}
                    Err(error) => eprintln!("raw tree cleanup skipped: {error:#}"),
                }
                if startup {
                    match rawtrees::reclaim(&rt.db, 64_000_000) {
                        Ok(true) => println!("Database file compacted."),
                        Ok(false) => {}
                        Err(error) => eprintln!("database compaction skipped: {error:#}"),
                    }
                }
            }
            let reply = run_helper(&helper, "--read-frontmost")?;
            if reply.status.as_deref() == Some("ok") {
                if let Some(window) = reply.window.filter(|w| {
                    if let Some(entry) = blocked_apps.list.matching(&w.app_id) {
                        let status = format!("blocked_app {} ({})", w.app_id, entry.label);
                        if status != last_status {
                            println!("Skipped: {status}");
                            last_status = status;
                        }
                        false
                    } else {
                        true
                    }
                }) {
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
                        rt.refresh_seen(id, &source)?;
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
    record_with_target(db, window, url, source_type, limitations, &cleaner::DEFAULT_CFG)
}

/// `chunking` lets offline evals sweep chunk size and overlap; live capture uses the default.
fn record_with_target(
    db: &mut Connection,
    window: &AxWindow,
    url: Option<String>,
    source_type: Option<String>,
    limitations: Option<Vec<String>>,
    chunking: &cleaner::ChunkCfg,
) -> Result<(i64, bool, Source)> {
    let dedup = dedup::enabled();
    let tree_key = dedup::tree_key(window, url.as_deref());
    let source_type = source_type.unwrap_or_else(|| "app".into());
    let limitations = serde_json::to_string(&limitations.unwrap_or_default())?;
    // Same Accessibility text as an earlier capture of this page: nothing to clean, store or embed.
    if dedup {
        if let Some(id) = dedup::snapshot_for_tree(db, &tree_key)? {
            let source = dedup::touch(db, id, window, &source_type, &limitations, &tree_key)?;
            return Ok((id, false, source));
        }
    }
    let cleaned = cleaner::clean(&window.roots, &window.app_id, url.as_deref(), &window.title);
    let body = &cleaned.body;
    let domain = url
        .as_deref()
        .and_then(|u| url::Url::parse(u).ok())
        .and_then(|u| u.host_str().map(str::to_owned));
    let fingerprint = content_fingerprint(&window.app_id, url.as_deref(), &window.title, body);
    let evidence_fingerprint = evidence_key(&window.app_id, domain.as_deref(), &source_type, &body);
    let ax_nodes_json = serde_json::to_string(&window.roots)?;
    let cleaning_trace_json = serde_json::to_string(&cleaned.decisions)?;
    let existing: Option<i64> = db
        .query_row(
            "SELECT id FROM snapshots WHERE fingerprint=?1",
            [&fingerprint],
            |r| r.get(0),
        )
        .optional()?;
    // A near-identical copy of the page's latest snapshot (same numbers, names and negations) is one more
    // sighting of it, not a new snapshot.
    if dedup::near_dup_enabled() && existing.is_none() {
        if let Some(id) = dedup::find_near_duplicate(db, window, url.as_deref(), body)? {
            let source = dedup::touch(db, id, window, &source_type, &limitations, &tree_key)?;
            return Ok((id, false, source));
        }
    }
    let transaction = db.transaction()?;
    transaction.execute("INSERT INTO snapshots(fingerprint,evidence_fingerprint,app_id,title,url,domain,source_type,body,first_seen_ms,last_seen_ms,focus_role,focus_name,limitations,ax_nodes_json,cleaner_version,cleaner_quality,cleaner_coverage,cleaning_trace_json,searchable) VALUES(?1,?2,?3,?4,?5,?6,?7,?8,?9,?9,?10,?11,?12,?13,?14,?15,?16,?17,?18) ON CONFLICT(fingerprint) DO UPDATE SET last_seen_ms=excluded.last_seen_ms,duration_ms=MAX(0,excluded.last_seen_ms-snapshots.first_seen_ms),sightings=snapshots.sightings+1,limitations=excluded.limitations,source_type=excluded.source_type",
        params![fingerprint,evidence_fingerprint,window.app_id,window.title,url,domain,source_type,body,window.observed_ms,window.focus_role,window.focus_name,limitations,ax_nodes_json,cleaner::VERSION,cleaned.quality,cleaned.coverage,cleaning_trace_json,i64::from(!body.is_empty())])?;
    let id: i64 = transaction.query_row(
        "SELECT id FROM snapshots WHERE fingerprint=?1",
        [&fingerprint],
        |r| r.get(0),
    )?;
    transaction.execute("INSERT OR IGNORE INTO raw_versions(snapshot_id,ax_hash,ax_nodes_json,observed_ms) VALUES(?1,?2,?3,?4)",params![id,digest(&ax_nodes_json),ax_nodes_json,window.observed_ms])?;
    transaction.execute("INSERT OR IGNORE INTO tree_keys(tree_key,snapshot_id) VALUES(?1,?2)", params![tree_key,id])?;
    if existing.is_none() {
        for (start, end, text) in cleaner::chunks_cfg(body, chunking) {
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
    let mut kept_without_tree = std::collections::HashSet::<i64>::new();
    let mut navigation_only = 0_usize;
    let mut reason_counts = std::collections::BTreeMap::<&'static str, usize>::new();
    for (id, app, title, url, domain, source_type, old_body, json_nodes) in records {
        let nodes: Vec<AxNode> = serde_json::from_str(&json_nodes).with_context(|| format!("invalid AX JSON for snapshot #{id}"))?;
        if nodes.is_empty() {
            if !old_body.is_empty() {
                // The raw tree was deleted (rawtrees.rs): keep the body, chunks and searchability as they are.
                kept_without_tree.insert(id);
            } else {
                unavailable += 1;
            }
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
    println!("Cleaning preview: {} snapshots; {navigation_only} navigation-only; {unavailable} without AX nodes (original retained); {} with a deleted raw tree (kept as they are).", prepared.len(), kept_without_tree.len());
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
    tx.execute("DELETE FROM chunks WHERE snapshot_id IN (SELECT id FROM snapshots WHERE ax_nodes_json!='[]')", [])?;
    for (id, _, _, _, _, _, _, json_nodes, _) in &prepared {
        if kept_without_tree.contains(id) {
            continue;
        }
        if json_nodes != "[]" {
            let first_seen: i64 = tx.query_row("SELECT first_seen_ms FROM snapshots WHERE id=?1",[id],|r|r.get(0))?;
            tx.execute("INSERT OR IGNORE INTO raw_versions(snapshot_id,ax_hash,ax_nodes_json,observed_ms) VALUES(?1,?2,?3,?4)",params![id,digest(json_nodes),json_nodes,first_seen])?;
        }
        tx.execute("UPDATE snapshots SET fingerprint=?2 WHERE id=?1", params![id,format!("reclean-pending-{id}")])?;
    }
    let mut merged = 0_usize;
    for (id, app, title, url, domain, source_type, _old_body, _json_nodes, cleaned) in prepared {
        let Some(cleaned) = cleaned else {
            if kept_without_tree.contains(&id) {
                continue;
            }
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

/// Capitalised words that are never entities: AX role words, calendar names, question words,
/// pronouns and the verbs and openers that begin sentences in chats and articles.
const NOT_ENTITY: &[&str] = &[
    "static", "text", "button", "heading", "group", "window", "search",
    "january", "february", "march", "april", "june", "july", "august", "september", "october", "november", "december",
    "monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday", "today", "yesterday", "tomorrow",
    "what", "when", "where", "which", "while", "who", "whom", "whose", "why", "how", "the", "this", "that", "these", "those",
    "there", "they", "them", "their", "then", "than", "here", "you", "your", "yours", "our", "its", "his", "her", "she", "him",
    "and", "but", "for", "with", "from", "into", "about", "also", "just", "only", "will", "would", "can", "could", "should",
    "may", "might", "must", "has", "have", "had", "was", "were", "are", "not", "yes", "okay", "thanks", "please", "sorry",
    "add", "check", "choose", "cut", "keep", "give", "given", "help", "hire", "let", "make", "mix", "mixing", "plan", "pull",
    "pulling", "run", "running", "same", "saved", "ship", "sort", "stake", "start", "take", "tell", "update", "use", "water",
    "works", "write", "last", "most", "land", "hours", "each", "some", "any", "all", "one", "two", "new", "old", "next",
];

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
    // A label is one or two capitalised words on one line; calendar names, question words, pronouns,
    // common imperatives and AX role words are not entities.
    let entity_re = Regex::new(r"\b[A-Z][a-z]{2,}(?:[ ]+[A-Z][a-z]{2,})?\b")?;
    for name in entity_re
        .find_iter(&source.body)
        .map(|m| m.as_str())
        .filter(|n| n.split(' ').filter(|w| !w.is_empty()).all(|w| !NOT_ENTITY.contains(&w.to_lowercase().as_str())))
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

/// The `must` clauses derived from the question's app words, privacy words, domain and date.
fn filter_clauses(db: &Connection, question: &str, now_ms: Option<i64>, apps: AppFilter) -> Result<Vec<Value>> {
    let q = question.to_lowercase();
    let mut must = Vec::<Value>::new();
    let words: std::collections::HashSet<_> = q.split(|c: char| !c.is_alphanumeric()).collect();
    match apps {
        AppFilter::Legacy => {
            // Original rule: any bare app word is a hard filter.
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
            for (label, id) in known_apps {
                if words.contains(label) {
                    must.push(json!({"key":"app","match":{"value":id}}));
                    break;
                }
            }
        }
        AppFilter::Phrase => {
            if let Some(ids) = appscope::app_scope(question) {
                must.push(if ids.len() == 1 {
                    json!({"key":"app","match":{"value":ids[0]}})
                } else {
                    json!({"key":"app","match":{"any":ids}})
                });
            }
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
    if let Some((start, end)) = time_bounds(question, now_ms)? {
        must.push(json!({"key":"capture_time","range":{"lt":end}}));
        must.push(json!({"key":"last_seen","range":{"gte":start}}));
    }
    Ok(must)
}

/// `now_ms` injects the clock; `None` uses the real clock. Phrases are defined in `timewin`.
fn time_bounds(question: &str, now_ms: Option<i64>) -> Result<Option<(i64, i64)>> {
    let today = match now_ms {
        Some(ms) => DateTime::<Utc>::from_timestamp_millis(ms)
            .context("invalid injected clock")?
            .with_timezone(&Local)
            .date_naive(),
        None => Local::now().date_naive(),
    };
    let Some((start, end)) = timewin::bounds(question, today) else {
        return Ok(None);
    };
    // A local time that does not exist (a DST gap) or cannot be resolved yields no filter.
    let ms = |t: chrono::NaiveDateTime| Local.from_local_datetime(&t).earliest().map(|t| t.timestamp_millis());
    Ok(ms(start).zip(ms(end)))
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
enum Mode {
    Hybrid,
    DenseOnly,
    Bm25Only,
}

/// How an app mention in the question becomes an `app` filter.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
enum AppFilter {
    /// Any bare app word ("edge case", "terminal velocity") was a hard filter. Kept for comparison.
    Legacy,
    /// Only a scoping phrase ("in Slack", "from my Notes app") filters; see `appscope`.
    Phrase,
}

/// What to do when an app-scoped search finds nothing useful.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
enum AppFallback {
    Off,
    /// Retry without the app filter when the filtered search returns nothing.
    Empty,
    /// Also retry when the filtered top score is below `app_fallback_ratio` of the unfiltered top score.
    Weak,
}

/// Retrieval knobs. `Params::default()` is exactly what `ask` has always done.
#[derive(Clone, Debug, Serialize)]
struct Params {
    /// Per-retriever candidate depth (dense and BM25 prefetch).
    prefetch: usize,
    /// Fused candidates returned by Qdrant before collapsing.
    fused_limit: usize,
    rrf_k: usize,
    /// Results kept after collapsing and re-ranking.
    final_k: usize,
    /// Regex-derived app/domain/private/date filters (and the observation-time check).
    use_filters: bool,
    /// Keyword-count bonus added to the fused score before the final sort.
    use_rerank_bonus: bool,
    /// Whether derived (topic/entity/hour/day) points may be retrieved.
    include_derived: bool,
    mode: Mode,
    /// Injected clock for "today"/"yesterday"; `None` is the real clock.
    now_ms: Option<i64>,
    app_filter: AppFilter,
    app_fallback: AppFallback,
    app_fallback_ratio: f64,
    /// Chunks of one snapshot shown and sent as evidence for its result. 1 reproduces the
    /// original single-chunk behaviour (including the whole-body snippet).
    chunks_per_result: usize,
    /// Say "no matching evidence" instead of listing weak results; see `abstain`.
    abstain_score: f64,
    abstain_support: f64,
    abstain_dense: f64,
    abstain_chunk: f64,
    abstain_unseen: f64,
    abstain_unseen_sim: f64,
    abstain_ident: f64,
    /// With a date window in the question, results that share too few of its terms are not an answer.
    abstain_time_support: f64,
    /// With a date window, restrict chunk points to snapshots actually observed in it inside Qdrant,
    /// instead of dropping them after the top-`fused_limit` cut.
    obs_prefilter: bool,
    /// Word-set overlap above which two results with the same numbers, names and negations are one.
    dedup_jaccard: f64,
    /// Order versions of one page by what the question asks for (newest by default).
    version_order: bool,
    /// Largest normalised score gap between versions for which they are reordered.
    version_margin: f64,
}

impl Default for Params {
    fn default() -> Self {
        Params {
            prefetch: 80,
            fused_limit: 40,
            rrf_k: 60,
            final_k: 8,
            use_filters: true,
            use_rerank_bonus: true,
            include_derived: true,
            mode: Mode::Hybrid,
            now_ms: None,
            app_filter: AppFilter::Phrase,
            app_fallback: AppFallback::Empty,
            app_fallback_ratio: 0.75,
            chunks_per_result: 3,
            abstain_score: 0.0,
            abstain_support: 0.0,
            abstain_dense: 0.0,
            abstain_chunk: 0.0,
            // Chosen on the dev split (evals/reports/fixes/03-abstention-dev-curve.md).
            abstain_unseen: 0.33,
            abstain_unseen_sim: 0.23,
            abstain_ident: 1.0,
            // Re-selected on dev after Fix 6 gave more questions a window: dev dated absents sit at support 0.0,
            // the lowest dev dated answerable at 0.25, so 'none of the question's terms appear' (< 0.1).
            abstain_time_support: 0.1,
            obs_prefilter: true,
            // dedup_jaccard changed nothing on dev or test (no mergeable pair exists in the corpus); 0.9 merges
            // only near-identical results. version_margin: dev cannot tell 0.05..1.0 apart; 0.3 is the safe tie.
            dedup_jaccard: 0.9,
            version_order: true,
            version_margin: 0.3,
        }
    }
}

/// One point from the Qdrant result, in fused rank order, before collapsing.
#[derive(Clone, Debug, Serialize)]
struct RankedPoint {
    rank: usize,
    /// "chunk", "derived", or "snapshot" (legacy snapshot-level point).
    kind: &'static str,
    chunk_id: Option<i64>,
    derived_id: Option<i64>,
    derived_kind: Option<String>,
    /// Chunks map to one snapshot; derived points to the snapshots they summarise.
    snapshot_ids: Vec<i64>,
    score: f32,
    text: String,
    /// False when the observation-time check removed every snapshot behind this point.
    passed_time_check: bool,
}

/// A retrieved chunk of a result's snapshot.
#[derive(Clone, Debug, Serialize)]
struct EvidenceChunk {
    chunk_id: i64,
    text: String,
    score: f32,
}

struct Hit {
    source: Source,
    best_chunk_id: Option<i64>,
    /// Up to `chunks_per_result` retrieved chunks, best first when selected, shown in document order.
    chunks: Vec<EvidenceChunk>,
    /// Other snapshots of the same page that were collapsed into or ordered around this result.
    versions: Vec<i64>,
}

struct Retrieval {
    /// Normalised best score and lexical support of the best results (see `abstain`).
    score_norm: f64,
    support: f64,
    dense_sim: f64,
    chunk_sim: f64,
    chunk_support: f64,
    unseen: f64,
    ident: f64,
    /// The abstention rule says the results are too weak to present as an answer.
    abstained: bool,
    /// True when an app-scoped search was abandoned and the unfiltered results are returned.
    app_fallback: bool,
    /// Filter clauses `query_filter` produced (empty when none or filters are off).
    filter: Vec<Value>,
    time: Option<(i64, i64)>,
    ranked: Vec<RankedPoint>,
    /// Distinct evidence bodies before the final truncate.
    collapsed: usize,
    /// Snapshot hits removed by the post-cut observation-time check.
    observation_dropped: usize,
    /// Final ordered results (at most `final_k`).
    hits: Vec<Hit>,
}

fn retrieve(runtime: &mut Runtime, question: &str, params: &Params) -> Result<Retrieval> {
    let mut r = retrieve_scoped(runtime, question, params)?;
    r.support = abstain::support(&r.hits, question);
    r.dense_sim = abstain::dense_sim(runtime, &r.hits, question)?;
    r.chunk_sim = abstain::chunk_sim(runtime, &r.ranked, question)?;
    r.chunk_support = abstain::chunk_support(&r.ranked, question);
    r.unseen = abstain::unseen_fraction(&runtime.db, question)?;
    r.ident = abstain::identifier_support(&r.hits, question);
    r.score_norm = abstain::score_norm(r.hits.first().map_or(0.0, |h| h.source.score as f64), params);
    r.abstained = abstain::decide(&r, params);
    Ok(r)
}

fn retrieve_scoped(runtime: &mut Runtime, question: &str, params: &Params) -> Result<Retrieval> {
    let first = retrieve_with(runtime, question, params, false)?;
    let scoped = first.filter.iter().any(|c| c["key"] == "app");
    if !scoped || params.app_fallback == AppFallback::Off {
        return Ok(first);
    }
    let abandon = first.hits.is_empty() || params.app_fallback == AppFallback::Weak && {
        let open = retrieve_with(runtime, question, params, true)?;
        let top = |r: &Retrieval| r.ranked.first().map_or(0.0, |p| p.score as f64);
        if top(&first) < params.app_fallback_ratio * top(&open) {
            let mut open = open;
            open.app_fallback = true;
            return Ok(open);
        }
        false
    };
    if abandon {
        let mut open = retrieve_with(runtime, question, params, true)?;
        open.app_fallback = true;
        return Ok(open);
    }
    Ok(first)
}

/// One search; `drop_app` removes the app clause (the fallback path).
fn retrieve_with(runtime: &mut Runtime, question: &str, params: &Params, drop_app: bool) -> Result<Retrieval> {
    runtime.index_pending()?;
    let mut clauses = if params.use_filters {
        let mut c = filter_clauses(&runtime.db, question, params.now_ms, params.app_filter)?;
        if drop_app {
            c.retain(|clause| clause["key"] != "app");
        }
        c
    } else {
        Vec::new()
    };
    let time = if params.use_filters { time_bounds(question, params.now_ms)? } else { None };
    let reported_clauses = clauses.clone();
    if !params.include_derived {
        clauses.push(json!({"key":"point_type","match":{"value":"chunk"}}));
    }
    if let (Some((start, end)), true) = (time, params.obs_prefilter) {
        // Exact: chunk points of snapshots never observed in the window cannot take a slot in the
        // fused list. Derived points have no snapshot_id; they are checked after the query.
        let ids: Vec<i64> = {
            let mut stmt = runtime.db.prepare("SELECT DISTINCT snapshot_id FROM observations WHERE observed_ms>=?1 AND observed_ms<?2")?;
            let found = stmt.query_map(params![start, end], |r| r.get::<_, i64>(0))?.collect::<rusqlite::Result<Vec<_>>>()?;
            found
        };
        let ids = if ids.is_empty() { vec![-1] } else { ids };
        clauses.push(json!({"should":[
            {"key":"snapshot_id","match":{"any":ids.clone()}},
            {"key":"snapshot_ids","match":{"any":ids}},
            {"key":"point_type","match":{"value":"derived"}}
        ]}));
    }
    let filter: Option<Filter> = if clauses.is_empty() {
        None
    } else {
        Some(serde_json::from_value(json!({"must":clauses}))?)
    };
    let mut builder = QueryRequestBuilder::new(params.fused_limit);
    if params.mode != Mode::Bm25Only {
        let dense = runtime.vector(question)?;
        builder = builder.add_prefetch(
            PrefetchBuilder::new(params.prefetch)
                .query(ScoringQuery::Vector(QueryEnum::Nearest(NamedQuery {
                    query: VectorInternal::from(dense),
                    using: Some("dense".into()),
                })))
                .build(),
        );
    }
    if params.mode != Mode::DenseOnly {
        let sparse = runtime.bm25.embed_query(question);
        builder = builder.add_prefetch(
            PrefetchBuilder::new(params.prefetch)
                .query(ScoringQuery::Vector(QueryEnum::Nearest(NamedQuery {
                    query: VectorInternal::from(sparse),
                    using: Some("bm25".into()),
                })))
                .build(),
        );
    }
    let mut builder = builder
        .query(ScoringQuery::Fusion(Fusion::Rrf {
            k: params.rrf_k,
            weights: None,
        }))
        .with_payload(WithPayloadInterface::Bool(true));
    if let Some(filter) = filter {
        builder = builder.filter(filter);
    }
    let mut points = runtime.shard.query(builder.build())?;
    // Qdrant Edge returns exactly tied RRF scores in arbitrary order; break ties by point id so
    // results (and evals) are reproducible. Scores are already descending, so only ties move.
    points.sort_by(|a, b| {
        b.score.total_cmp(&a.score).then_with(|| match (&a.id, &b.id) {
            (PointId::NumId(x), PointId::NumId(y)) => x.cmp(y),
            _ => std::cmp::Ordering::Equal,
        })
    });
    // Insertion-ordered so equal scores resolve by Qdrant rank, not by hash order.
    let mut index_by_evidence = std::collections::HashMap::<String, usize>::new();
    let mut collapsed: Vec<(Source, Option<i64>, Vec<EvidenceChunk>)> = Vec::new();
    let mut ranked = Vec::with_capacity(points.len());
    let mut observation_dropped = 0_usize;
    for (rank, point) in points.into_iter().enumerate() {
        let PointId::NumId(point_id) = point.id else {
            continue;
        };
        let mut derived_id = None;
        let mut derived_kind = None;
        let mut chunk_id = None;
        let mut point_text = String::new();
        let hits: Vec<(i64, Option<String>, Option<i64>)> = if point_id >= (1_u64 << 62) {
            let id = (point_id - (1_u64 << 62)) as i64;
            derived_id = Some(id);
            let mut stmt = runtime
                .db
                .prepare("SELECT snapshot_id FROM derived_sources WHERE derived_id=?1 LIMIT 8")?;
            let found = stmt
                .query_map([id], |r| r.get::<_, i64>(0))?
                .collect::<rusqlite::Result<Vec<_>>>()?;
            if let Some((kind, body)) = runtime
                .db
                .query_row("SELECT kind,body FROM derived WHERE id=?1", [id], |r| {
                    Ok((r.get::<_, String>(0)?, r.get::<_, String>(1)?))
                })
                .optional()?
            {
                derived_kind = Some(kind);
                point_text = body;
            }
            found.into_iter().map(|id| (id, None, None)).collect()
        } else if point_id >= (1_u64 << 61) {
            let id = (point_id - (1_u64 << 61)) as i64;
            chunk_id = Some(id);
            // The point's own chunk first, then the chunks that share it (dedup.rs): same text, other snapshots.
            let rows: Vec<(i64, String, i64)> = {
                let mut stmt = runtime.db.prepare("SELECT snapshot_id,body,id FROM chunks WHERE id=?1 UNION ALL SELECT snapshot_id,body,id FROM chunks WHERE dup_of=?1")?;
                let found = stmt.query_map([id], |r| Ok((r.get::<_, i64>(0)?, r.get::<_, String>(1)?, r.get::<_, i64>(2)?)))?.collect::<rusqlite::Result<Vec<_>>>()?;
                found
            };
            if let Some(first) = rows.first() {
                point_text = first.1.clone();
            }
            rows.into_iter().map(|(snapshot_id, body, chunk)| (snapshot_id, Some(body), Some(chunk))).collect()
        } else {
            vec![(point_id as i64, None, None)]
        };
        let snapshot_ids: Vec<i64> = hits.iter().map(|(id, _, _)| *id).collect();
        let mut passed_any = false;
        for (id, hit_text, hit_chunk) in hits {
            if let Some((start, end)) = time {
                let observed: bool = runtime.db.query_row("SELECT EXISTS(SELECT 1 FROM observations WHERE snapshot_id=?1 AND observed_ms>=?2 AND observed_ms<?3)",params![id,start,end],|r|r.get(0))?;
                if !observed {
                    observation_dropped += 1;
                    continue;
                }
            }
            passed_any = true;
            if let Some(mut source) = load_source(&runtime.db, id, point.score)? {
                source.hit_text = hit_text;
                let evidence = evidence_key(
                    &source.app_id,
                    source.domain.as_deref(),
                    &source.source_type,
                    &source.body,
                );
                let evidence_chunk = hit_chunk.zip(source.hit_text.clone()).map(|(chunk_id, text)| EvidenceChunk { chunk_id, text, score: point.score });
                match index_by_evidence.entry(evidence) {
                    std::collections::hash_map::Entry::Vacant(entry) => {
                        entry.insert(collapsed.len());
                        collapsed.push((source, hit_chunk, evidence_chunk.into_iter().collect()));
                    }
                    std::collections::hash_map::Entry::Occupied(entry) => {
                        let existing = &mut collapsed[*entry.get()];
                        if let Some(chunk) = evidence_chunk {
                            if !existing.2.iter().any(|c| c.chunk_id == chunk.chunk_id || c.text == chunk.text) {
                                existing.2.push(chunk);
                            }
                        }
                        if source.score > existing.0.score || (source.score == existing.0.score && source.last_seen_ms > existing.0.last_seen_ms) {
                            let mut newer = source;
                            newer.score = newer.score.max(existing.0.score);
                            existing.0 = newer;
                            existing.1 = hit_chunk;
                        }
                    }
                }
            }
        }
        ranked.push(RankedPoint {
            rank: rank + 1,
            kind: if derived_id.is_some() { "derived" } else if chunk_id.is_some() { "chunk" } else { "snapshot" },
            chunk_id,
            derived_id,
            derived_kind,
            snapshot_ids,
            score: point.score,
            text: point_text,
            passed_time_check: passed_any,
        });
    }
    let collapsed_count = collapsed.len();
    let mut keyed: Vec<(f32, (Source, Option<i64>, Vec<EvidenceChunk>, Vec<i64>))> = if params.use_rerank_bonus {
        let terms = content_terms(question);
        collapsed
            .into_iter()
            .map(|entry| {
                let body = entry.0.body.to_lowercase();
                let matches: usize = terms
                    .iter()
                    .map(|term| body.matches(term).count().min(5))
                    .sum();
                (entry.0.score + (matches as f32) / (body.len().max(100) as f32).sqrt(), (entry.0, entry.1, entry.2, Vec::new()))
            })
            .collect()
    } else {
        collapsed.into_iter().map(|entry| (entry.0.score, (entry.0, entry.1, entry.2, Vec::new()))).collect()
    };
    keyed.sort_by(|a, b| {
        b.0.total_cmp(&a.0)
            .then_with(|| b.1 .0.last_seen_ms.cmp(&a.1 .0.last_seen_ms))
    });
    let mut keyed = versions::apply(keyed, question, params);
    keyed.truncate(params.final_k);
    Ok(Retrieval {
        score_norm: 0.0,
        support: 0.0,
        dense_sim: 0.0,
        chunk_sim: 0.0,
        chunk_support: 0.0,
        unseen: 0.0,
        ident: 1.0,
        abstained: false,
        app_fallback: false,
        filter: reported_clauses,
        time,
        ranked,
        collapsed: collapsed_count,
        observation_dropped,
        hits: keyed
            .into_iter()
            .map(|(_, (source, best_chunk_id, mut chunks, versions))| {
                // The best chunk always stays; the rest are the highest-scoring others. Shown in
                // document order so adjacent chunks read as the page does.
                chunks.sort_by(|a, b| {
                    (Some(b.chunk_id) == best_chunk_id).cmp(&(Some(a.chunk_id) == best_chunk_id))
                        .then_with(|| b.score.total_cmp(&a.score))
                });
                chunks.truncate(params.chunks_per_result.max(1));
                chunks.sort_by_key(|c| c.chunk_id);
                Hit { source, best_chunk_id, chunks, versions }
            })
            .collect(),
    })
}

/// What a result tells the reader: a snippet taken from the retrieved chunks when there is more
/// than one allowed, falling back to the whole page when the chunks hold none of the query terms.
fn evidence_snippet(hit: &Hit, question: &str, chunks_per_result: usize) -> String {
    if chunks_per_result > 1 && !hit.chunks.is_empty() {
        let scope = hit.chunks.iter().map(|c| c.text.as_str()).collect::<Vec<_>>().join("\n");
        let lower = scope.to_lowercase();
        if content_terms(question).iter().any(|t| lower.contains(t.as_str())) {
            return snippet(&scope, question);
        }
    }
    snippet(&hit.source.body, question)
}

/// Total characters of retrieved-chunk evidence sent to the LLM per source.
const EVIDENCE_CHAR_CAP: usize = 2_500;

/// The retrieved chunks of one result as one block (the first 2,500 characters of the page when a
/// derived point, not a chunk, matched).
fn evidence_text(hit: &Hit) -> String {
    if hit.chunks.is_empty() {
        return hit.source.body.chars().take(EVIDENCE_CHAR_CAP).collect();
    }
    hit.chunks.iter().map(|c| c.text.as_str()).collect::<Vec<_>>().join("\n…\n").chars().take(EVIDENCE_CHAR_CAP).collect()
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
    let params = Params::default();
    let retrieval = retrieve(runtime, question, &params)?;
    if retrieval.abstained && !retrieval.hits.is_empty() {
        let weak = retrieval.hits.iter().take(3).map(|h| format!("[{}] {}", h.source.id, h.source.title)).collect::<Vec<_>>().join("; ");
        return Ok(format!("No matching captured evidence for this question.\nClosest captured pages (weak matches, probably not what you asked): {weak}"));
    }
    let hits: Vec<Hit> = retrieval.hits;
    let sources: Vec<&Source> = hits.iter().map(|hit| &hit.source).collect();
    if sources.is_empty() {
        return Ok("No matching captured evidence yet. Capture may be incomplete if the app did not expose text through Accessibility.".into());
    }
    runtime.db.execute("INSERT INTO index_meta(key,value) VALUES('last_answer_snapshot',?1) ON CONFLICT(key) DO UPDATE SET value=excluded.value",[sources[0].id.to_string()])?;
    let mut output = String::new();
    if env::var("OPEN_MEMORY_LLM_URL").is_ok() {
        match llm_answer(question, &hits, params.chunks_per_result) {
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
    for (rank, hit) in hits.iter().enumerate() {
        let source = &hit.source;
        let snippet = evidence_snippet(hit, question, params.chunks_per_result);
        output.push_str(&format!("{}. [{}] {} — {}\n   Observed: {} (last seen {}; {} sightings)\n   Source: {}\n   {}\n",
            rank+1,source.id,source.app_id,source.title,time_string(source.first_seen_ms),time_string(source.last_seen_ms),source.sightings,
            source.url.as_deref().unwrap_or("No URL exposed by Accessibility"),snippet));
        // Retrieved chunks the snippet does not already show.
        let shown = norm_space(&snippet);
        for chunk in hit.chunks.iter().filter(|c| hit.chunks.len() > 1 && !shown.contains(&norm_space(&c.text.lines().next().unwrap_or("")))).take(2) {
            output.push_str(&format!("   Also retrieved: {}\n", chunk.text.split_whitespace().collect::<Vec<_>>().join(" ").chars().take(200).collect::<String>()));
        }
        if !hit.versions.is_empty() {
            output.push_str(&format!("   Other captured versions of this page: {}\n", hit.versions.iter().map(|id| format!("[{id}]")).collect::<Vec<_>>().join(" ")));
        }
        if source.limitations != "[]" {
            output.push_str(&format!("   Capture limitations: {}\n", source.limitations));
        }
    }
    output.push_str("Displayed message times, if present, are in the captured text; observed times above are capture times.");
    Ok(output)
}

fn norm_space(s: &str) -> String {
    s.split_whitespace().collect::<Vec<_>>().join(" ")
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

fn llm_answer(question: &str, hits: &[Hit], chunks_per_result: usize) -> Result<String> {
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
    let context = hits
        .iter()
        .take(6)
        .map(|h| {
            let s = &h.source;
            format!(
                "Source #{} app={} observed={} title={} URL={}\nRelevant excerpt: {}\nRetrieved chunks: {}",
                s.id,
                s.app_id,
                time_string(s.first_seen_ms),
                s.title,
                s.url.as_deref().unwrap_or(""),
                evidence_snippet(h, question, chunks_per_result),
                evidence_text(h)
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

#[cfg(test)]
mod tests {
    use super::*;

    fn db() -> Connection {
        let db = Connection::open_in_memory().unwrap();
        db.execute_batch(include_str!("schema.sql")).unwrap();
        db
    }

    fn app_filter(question: &str) -> Option<String> {
        filter_clauses(&db(), question, None, AppFilter::Phrase)
            .unwrap()
            .iter()
            .find(|c| c["key"] == "app")
            .map(|c| c["match"]["value"].as_str().unwrap().to_owned())
    }

    fn at(day: u32, hour: u32) -> i64 {
        Utc.with_ymd_and_hms(2026, 10, day, hour, 0, 0).unwrap().timestamp_millis()
    }

    #[test]
    fn app_words_become_app_filters() {
        assert_eq!(app_filter("In Slack, when is the standup?").as_deref(), Some("com.tinyspeck.slackmacgap"));
        assert_eq!(app_filter("what did I read in Safari").as_deref(), Some("com.apple.Safari"));
        assert_eq!(app_filter("what time is the standup"), None);
    }

    #[test]
    fn private_domain_and_date_clauses() {
        let db = db();
        db.execute("INSERT INTO snapshots(fingerprint,evidence_fingerprint,app_id,title,domain,source_type,body,first_seen_ms,last_seen_ms,limitations) VALUES('a','a','x','t','known.example.org','browser','b',1,1,'[]')", []).unwrap();
        let keys = |q: &str| -> Vec<String> {
            filter_clauses(&db, q, Some(at(17, 12)), AppFilter::Phrase).unwrap().iter().map(|c| c["key"].as_str().unwrap().to_owned()).collect()
        };
        assert_eq!(keys("what is on known.example.org"), vec!["domain"]);
        assert!(keys("what is on unknown.example.org").is_empty(), "unknown domains add no filter");
        assert_eq!(keys("my private browsing"), vec!["source_type"]);
        assert_eq!(keys("what did I read yesterday"), vec!["capture_time", "last_seen"]);
    }

    #[test]
    fn time_bounds_use_the_injected_clock_and_local_days() {
        env::set_var("TZ", "UTC");
        let now = at(17, 12);
        assert_eq!(time_bounds("what did I do today", Some(now)).unwrap(), Some((at(17, 0), at(18, 0))));
        assert_eq!(time_bounds("what did I do yesterday", Some(now)).unwrap(), Some((at(16, 0), at(17, 0))));
        assert_eq!(time_bounds("notes from 2026-10-14", Some(now)).unwrap(), Some((at(14, 0), at(15, 0))));
        assert_eq!(time_bounds("no date here", Some(now)).unwrap(), None);
        assert_eq!(time_bounds("what did I read last week", Some(now)).unwrap(), Some((at(5, 0), at(12, 0))));
        assert_eq!(time_bounds("this morning", Some(now)).unwrap(), Some((at(17, 0), at(17, 12))));
    }

    /// Daylight saving needs another timezone than the one this process already resolved (chrono
    /// caches it), so the check runs in a child process of this test binary with TZ set.
    #[test]
    fn local_days_are_25_and_23_hours_on_dst_change_days() {
        if env::var("OM_DST_CHILD").is_ok() {
            let hour = 3_600_000;
            let fall_back = Utc.with_ymd_and_hms(2026, 11, 2, 17, 0, 0).unwrap().timestamp_millis();
            let (s, e) = time_bounds("yesterday", Some(fall_back)).unwrap().unwrap();
            assert_eq!(e - s, 25 * hour, "2026-11-01 has 25 hours in New York");
            assert_eq!(s, Utc.with_ymd_and_hms(2026, 11, 1, 4, 0, 0).unwrap().timestamp_millis(), "midnight EDT");
            let spring = Utc.with_ymd_and_hms(2026, 3, 9, 16, 0, 0).unwrap().timestamp_millis();
            let (s, e) = time_bounds("yesterday", Some(spring)).unwrap().unwrap();
            assert_eq!(e - s, 23 * hour, "2026-03-08 has 23 hours in New York");
            let (s, e) = time_bounds("last week", Some(fall_back)).unwrap().unwrap();
            assert_eq!(e - s, 7 * 24 * hour + hour, "the week 2026-10-26..11-02 contains the 25-hour Sunday");
            let (s, e) = time_bounds("this week", Some(fall_back)).unwrap().unwrap();
            assert_eq!(e - s, 24 * hour, "this week so far is Monday 2026-11-02 alone");
            return;
        }
        let exe = env::current_exe().unwrap();
        let out = Command::new(exe)
            .args(["--exact", "tests::local_days_are_25_and_23_hours_on_dst_change_days", "--nocapture"])
            .env("OM_DST_CHILD", "1")
            .env("TZ", "America/New_York")
            .output()
            .unwrap();
        assert!(out.status.success(), "{}{}", String::from_utf8_lossy(&out.stdout), String::from_utf8_lossy(&out.stderr));
    }

    fn hit_with(body: &str, chunks: &[&str]) -> Hit {
        let source = Source {
            id: 1, app_id: "app".into(), title: "t".into(), url: None, domain: None, source_type: "app".into(),
            body: body.into(), first_seen_ms: 0, last_seen_ms: 0, sightings: 1, limitations: "[]".into(),
            cleaner_quality: "main_content".into(), hit_text: chunks.first().map(|c| c.to_string()), score: 0.0,
        };
        Hit {
            source,
            best_chunk_id: Some(1),
            chunks: chunks.iter().enumerate().map(|(i, c)| EvidenceChunk { chunk_id: i as i64 + 1, text: (*c).into(), score: 0.0 }).collect(),
            versions: vec![],
        }
    }

    #[test]
    fn snippet_comes_from_retrieved_chunks_first() {
        let body = "Daily macros plan\nProtein 137 g | Fat 35 g | Carbs 185 g\nmacros overview line\nmacros appendix";
        let hit = hit_with(body, &["Protein 137 g | Fat 35 g | Carbs 185 g"]);
        // The question word "macros" matches other lines of the page, but not the retrieved chunk.
        assert_eq!(evidence_snippet(&hit, "what were my macros yesterday", 3), snippet(body, "what were my macros yesterday"),
            "no query term in the chunk: whole-page snippet");
        let hit = hit_with("macros intro\nmacros appendix\nProtein 137 g | Fat 35 g", &["The macros table: Protein 137 g | Fat 35 g"]);
        assert!(evidence_snippet(&hit, "my macros table", 3).contains("Protein 137 g"));
        // chunks_per_result = 1 keeps the original whole-page snippet.
        assert!(evidence_snippet(&hit, "my macros table", 1).contains("macros intro"));
        assert!(evidence_text(&hit).contains("Protein 137 g"));
    }

    #[test]
    fn evidence_text_is_capped_and_falls_back_to_the_page() {
        let long = "x ".repeat(3_000);
        let hit = hit_with("body text", &[long.as_str()]);
        assert_eq!(evidence_text(&hit).chars().count(), EVIDENCE_CHAR_CAP);
        let none = hit_with("page body", &[]);
        assert_eq!(evidence_text(&none), "page body");
    }

    #[test]
    fn entity_labels_skip_calendar_words_question_words_and_line_breaks() {
        let re = Regex::new(r"\b[A-Z][a-z]{2,}(?:[ ]+[A-Z][a-z]{2,})?\b").unwrap();
        let found: Vec<&str> = re
            .find_iter("Please add Priya Raman to Home\nExplore on Monday. What about Harbor Print in October?")
            .map(|m| m.as_str())
            .filter(|n| n.split(' ').all(|w| !NOT_ENTITY.contains(&w.to_lowercase().as_str())))
            .collect();
        assert_eq!(found, vec!["Priya Raman", "Home", "Explore", "Harbor Print"], "a name never spans a line break");
    }

    #[test]
    fn legacy_mode_keeps_the_bare_word_rule() {
        let legacy = filter_clauses(&db(), "what is an edge case in this test plan", None, AppFilter::Legacy).unwrap();
        assert_eq!(legacy[0]["match"]["value"], "com.microsoft.edgemac");
        let phrase = filter_clauses(&db(), "what is an edge case in this test plan", None, AppFilter::Phrase).unwrap();
        assert!(phrase.is_empty());
    }

    #[test]
    fn retrieval_defaults_match_the_original_constants() {
        let p = Params::default();
        assert_eq!((p.prefetch, p.fused_limit, p.rrf_k, p.final_k), (80, 40, 60, 8));
        assert!(p.use_filters && p.use_rerank_bonus && p.include_derived);
        assert_eq!(p.mode, Mode::Hybrid);
        assert_eq!(p.now_ms, None);
    }

    // ---- Known weaknesses. These fail today; remove `ignore` when the weakness is fixed.

    #[test]
    fn edge_case_is_not_an_app_filter() {
        assert_eq!(app_filter("what is an edge case in this test plan"), None);
    }

    #[test]
    fn ordinary_words_are_not_app_filters() {
        assert_eq!(app_filter("what is the terminal velocity of a skydiver"), None);
        assert_eq!(app_filter("what did I write in my notes about hiring"), None);
        assert_eq!(app_filter("what did the messages from the landlord say"), None);
    }

    #[test]
    fn last_week_is_a_time_filter() {
        assert!(time_bounds("what did I read last week", Some(at(17, 12))).unwrap().is_some());
    }
}
