//! Offline fixture ingest: loads AX captures from JSON files and pushes them through the
//! same `record` -> `summarize` -> `index_pending` path the live capture loop uses, so
//! cleaning, dedup, chunking and indexing are the real code. Never starts the AX helper.

use super::*;

#[derive(Debug, Clone, Deserialize)]
pub struct Fixture {
    pub app_id: String,
    pub title: String,
    pub url: Option<String>,
    pub source_type: Option<String>,
    pub observed_ms: i64,
    /// Later sightings of the identical page (the capture loop sees an open page again and again).
    /// Each is ingested as a repeat observation of the same snapshot.
    #[serde(default)]
    pub also_observed_ms: Vec<i64>,
    #[serde(default)]
    pub focus_role: Option<String>,
    #[serde(default)]
    pub focus_name: Option<String>,
    #[serde(default)]
    pub limitations: Option<Vec<String>>,
    #[serde(default)]
    pub provenance: String,
    #[serde(default)]
    #[allow(dead_code)]
    pub notes: String,
    pub roots: Vec<AxNode>,
}

pub struct Loaded {
    /// Stable fixture id: the file stem.
    pub id: String,
    pub fixture: Fixture,
}

#[derive(Clone, Debug, Serialize)]
pub struct Ingested {
    /// True for fixtures from `--extra-corpus` (their `body` is dropped to keep memory flat).
    pub extra: bool,
    pub fixture: String,
    pub snapshot_id: i64,
    pub is_new: bool,
    pub quality: String,
    pub searchable: bool,
    pub body: String,
}

/// Reads `*.json` fixtures (files starting with `_` are ignored) ordered by
/// (observed_ms, id) so ingest order, and therefore snapshot ids, are deterministic. A fixture
/// with `also_observed_ms` yields one entry per sighting, all under the same id.
pub fn load_corpus(dir: &Path) -> Result<Vec<Loaded>> {
    let mut loaded = Vec::new();
    for entry in fs::read_dir(dir).with_context(|| format!("cannot read corpus {}", dir.display()))? {
        let path = entry?.path();
        let Some(stem) = path.file_stem().and_then(|s| s.to_str()) else { continue };
        if path.extension().and_then(|e| e.to_str()) != Some("json") || stem.starts_with('_') {
            continue;
        }
        let text = fs::read_to_string(&path)?;
        let fixture: Fixture = serde_json::from_str(&text)
            .with_context(|| format!("invalid fixture {}", path.display()))?;
        for later in fixture.also_observed_ms.clone() {
            let mut repeat = fixture.clone();
            repeat.observed_ms = later;
            repeat.also_observed_ms.clear();
            loaded.push(Loaded { id: stem.to_owned(), fixture: repeat });
        }
        loaded.push(Loaded { id: stem.to_owned(), fixture });
    }
    loaded.sort_by(|a, b| (a.fixture.observed_ms, &a.id).cmp(&(b.fixture.observed_ms, &b.id)));
    Ok(loaded)
}

/// Refuses to run against the default state directory: fixtures are throwaway data.
pub fn require_isolated_state() -> Result<PathBuf> {
    let dir = env::var_os("CORTEX_STATE_DIR")
        .context("set CORTEX_STATE_DIR to a temporary directory; fixtures never use the default state directory")?;
    Ok(PathBuf::from(dir))
}

pub fn ingest(
    runtime: &mut Runtime,
    state: &Path,
    corpus: &[Loaded],
    chunking: &cleaner::ChunkCfg,
) -> Result<Vec<Ingested>> {
    let mut out = Vec::with_capacity(corpus.len());
    for loaded in corpus {
        out.push(ingest_one(runtime, state, loaded, chunking, false)?);
    }
    Ok(out)
}

fn ingest_one(runtime: &mut Runtime, state: &Path, loaded: &Loaded, chunking: &cleaner::ChunkCfg, extra: bool) -> Result<Ingested> {
    let f = &loaded.fixture;
    let window = AxWindow {
        app_id: f.app_id.clone(),
        window_session_id: format!("fixture:{}", loaded.id),
        title: f.title.clone(),
        observed_ms: f.observed_ms,
        focus_role: f.focus_role.clone(),
        focus_name: f.focus_name.clone(),
        roots: f.roots.iter().map(|n| AxNode {
            role: n.role.clone(),
            name: n.name.clone(),
            value: n.value.clone(),
            extra: n.extra.clone(),
        }).collect(),
    };
    let (id, is_new, source) = record_with_target(
        &mut runtime.db,
        &window,
        f.url.clone(),
        f.source_type.clone(),
        f.limitations.clone(),
        chunking,
    )?;
    if is_new && source.cleaner_quality != "navigation_only" {
        summarize(state, id)?;
    } else {
        runtime.refresh_seen(id, &source)?;
    }
    while runtime.index_pending()? > 0 {}
    Ok(Ingested {
        extra,
        fixture: loaded.id.clone(),
        snapshot_id: id,
        is_new,
        quality: source.cleaner_quality.clone(),
        searchable: !source.body.is_empty(),
        body: if extra { String::new() } else { source.body },
    })
}

/// One sighting of a fixture file that is read only when its turn to be ingested comes
/// (`--extra-corpus` can hold tens of thousands of trees, too many to keep in memory).
pub struct Lazy {
    pub id: String,
    pub path: PathBuf,
    pub observed_ms: i64,
}

#[derive(Deserialize)]
struct Head {
    observed_ms: i64,
    #[serde(default)]
    also_observed_ms: Vec<i64>,
}

/// Lists `*.json` fixtures (files starting with `_` ignored) as sightings ordered by
/// (observed_ms, id), reading only the timestamps.
pub fn list_lazy(dir: &Path) -> Result<Vec<Lazy>> {
    let mut out = Vec::new();
    for entry in fs::read_dir(dir).with_context(|| format!("cannot read extra corpus {}", dir.display()))? {
        let path = entry?.path();
        let Some(stem) = path.file_stem().and_then(|s| s.to_str()) else { continue };
        if path.extension().and_then(|e| e.to_str()) != Some("json") || stem.starts_with('_') {
            continue;
        }
        let head: Head = serde_json::from_reader(std::io::BufReader::new(fs::File::open(&path)?))
            .with_context(|| format!("invalid fixture {}", path.display()))?;
        for t in head.also_observed_ms.iter().copied().chain([head.observed_ms]) {
            out.push(Lazy { id: stem.to_owned(), path: path.clone(), observed_ms: t });
        }
    }
    out.sort_by(|a, b| (a.observed_ms, &a.id).cmp(&(b.observed_ms, &b.id)));
    Ok(out)
}

fn load_lazy(l: &Lazy) -> Result<Loaded> {
    let mut fixture: Fixture = serde_json::from_reader(std::io::BufReader::new(fs::File::open(&l.path)?))
        .with_context(|| format!("invalid fixture {}", l.path.display()))?;
    fixture.observed_ms = l.observed_ms;
    fixture.also_observed_ms.clear();
    Ok(Loaded { id: l.id.clone(), fixture })
}

/// Ingests `base` and `extra` merged by (observed_ms, id). Reports `(ingested count, elapsed ms)`
/// into `curve` about 20 times so ingest-time growth can be plotted.
pub fn ingest_merged(
    runtime: &mut Runtime,
    state: &Path,
    base: &[Loaded],
    extra: &[Lazy],
    chunking: &cleaner::ChunkCfg,
    curve: &mut Vec<(usize, f64)>,
) -> Result<Vec<Ingested>> {
    let started = std::time::Instant::now();
    let total = base.len() + extra.len();
    let step = (total / 20).max(1);
    let mut out = Vec::with_capacity(total);
    let (mut b, mut e) = (0, 0);
    while b < base.len() || e < extra.len() {
        let take_base = match (base.get(b), extra.get(e)) {
            (Some(x), Some(y)) => (x.fixture.observed_ms, &x.id) <= (y.observed_ms, &y.id),
            (Some(_), None) => true,
            _ => false,
        };
        if take_base {
            out.push(ingest_one(runtime, state, &base[b], chunking, false)?);
            b += 1;
        } else {
            let loaded = load_lazy(&extra[e])?;
            out.push(ingest_one(runtime, state, &loaded, chunking, true)?);
            e += 1;
        }
        if out.len() % step == 0 || out.len() == total {
            let ms = started.elapsed().as_secs_f64() * 1000.0;
            curve.push((out.len(), ms));
            if total >= 1000 {
                eprintln!("  ingested {}/{} in {:.1} s", out.len(), total, ms / 1000.0);
            }
        }
    }
    Ok(out)
}

/// `cortex ingest-fixtures --corpus DIR`: fills `$CORTEX_STATE_DIR` and exits.
pub fn run_cli(args: &[String]) -> Result<()> {
    let mut corpus = PathBuf::from("evals/corpus");
    let mut dump: Option<PathBuf> = None;
    let mut iter = args.iter();
    while let Some(arg) = iter.next() {
        match arg.as_str() {
            "--corpus" => corpus = PathBuf::from(iter.next().context("--corpus needs a path")?),
            // Additive: write each fixture's cleaned body (<id>.txt) and `_index.json` (quality,
            // bytes, chunk count, snapshot id) so gold questions can be authored against what the
            // current cleaner produces.
            "--dump-bodies" => dump = Some(PathBuf::from(iter.next().context("--dump-bodies needs a path")?)),
            other => bail!("unknown ingest-fixtures option {other}"),
        }
    }
    let state = require_isolated_state()?;
    fs::create_dir_all(&state)?;
    fs::set_permissions(&state, fs::Permissions::from_mode(0o700))?;
    let fixtures = load_corpus(&corpus)?;
    let mut runtime = open_runtime(&state, false)?;
    let ingested = ingest(&mut runtime, &state, &fixtures, &cleaner::DEFAULT_CFG)?;
    for item in &ingested {
        println!("{} -> #{} ({}, {} bytes{})", item.fixture, item.snapshot_id, item.quality,
            item.body.len(), if item.is_new { "" } else { ", duplicate" });
    }
    if let Some(dir) = dump {
        fs::create_dir_all(&dir)?;
        let mut index = serde_json::Map::new();
        for item in &ingested {
            if index.contains_key(&item.fixture) {
                continue;
            }
            fs::write(dir.join(format!("{}.txt", item.fixture)), &item.body)?;
            let chunks: i64 = runtime.db.query_row("SELECT COUNT(*) FROM chunks WHERE snapshot_id=?1", [item.snapshot_id], |r| r.get(0))?;
            index.insert(item.fixture.clone(), json!({"snapshot_id": item.snapshot_id, "quality": item.quality,
                "searchable": item.searchable, "body_bytes": item.body.len(), "body_chars": item.body.chars().count(), "chunks": chunks}));
        }
        fs::write(dir.join("_index.json"), serde_json::to_string_pretty(&Value::Object(index))?)?;
    }
    Ok(())
}
