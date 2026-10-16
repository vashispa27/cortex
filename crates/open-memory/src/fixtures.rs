//! Offline fixture ingest: loads AX captures from JSON files and pushes them through the
//! same `record` -> `summarize` -> `index_pending` path the live capture loop uses, so
//! cleaning, dedup, chunking and indexing are the real code. Never starts the AX helper.

use super::*;

#[derive(Debug, Deserialize)]
pub struct Fixture {
    pub app_id: String,
    pub title: String,
    pub url: Option<String>,
    pub source_type: Option<String>,
    pub observed_ms: i64,
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
    pub fixture: String,
    pub snapshot_id: i64,
    pub is_new: bool,
    pub quality: String,
    pub searchable: bool,
    pub body: String,
}

/// Reads `*.json` fixtures (files starting with `_` are ignored) ordered by
/// (observed_ms, id) so ingest order, and therefore snapshot ids, are deterministic.
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
        loaded.push(Loaded { id: stem.to_owned(), fixture });
    }
    loaded.sort_by(|a, b| (a.fixture.observed_ms, &a.id).cmp(&(b.fixture.observed_ms, &b.id)));
    Ok(loaded)
}

/// Refuses to run against the default state directory: fixtures are throwaway data.
pub fn require_isolated_state() -> Result<PathBuf> {
    let dir = env::var_os("OPEN_MEMORY_STATE_DIR")
        .context("set OPEN_MEMORY_STATE_DIR to a temporary directory; fixtures never use the default state directory")?;
    Ok(PathBuf::from(dir))
}

pub fn ingest(
    runtime: &mut Runtime,
    state: &Path,
    corpus: &[Loaded],
    chunk_target: usize,
) -> Result<Vec<Ingested>> {
    let mut out = Vec::with_capacity(corpus.len());
    for loaded in corpus {
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
            chunk_target,
        )?;
        if is_new && source.cleaner_quality != "navigation_only" {
            summarize(state, id)?;
        } else {
            runtime.refresh_seen(id, &source)?;
        }
        while runtime.index_pending()? > 0 {}
        out.push(Ingested {
            fixture: loaded.id.clone(),
            snapshot_id: id,
            is_new,
            quality: source.cleaner_quality.clone(),
            searchable: !source.body.is_empty(),
            body: source.body,
        });
    }
    Ok(out)
}

/// `open-memory ingest-fixtures --corpus DIR`: fills `$OPEN_MEMORY_STATE_DIR` and exits.
pub fn run_cli(args: &[String]) -> Result<()> {
    let mut corpus = PathBuf::from("evals/corpus");
    let mut iter = args.iter();
    while let Some(arg) = iter.next() {
        match arg.as_str() {
            "--corpus" => corpus = PathBuf::from(iter.next().context("--corpus needs a path")?),
            other => bail!("unknown ingest-fixtures option {other}"),
        }
    }
    let state = require_isolated_state()?;
    fs::create_dir_all(&state)?;
    fs::set_permissions(&state, fs::Permissions::from_mode(0o700))?;
    let fixtures = load_corpus(&corpus)?;
    let mut runtime = open_runtime(&state, false)?;
    let ingested = ingest(&mut runtime, &state, &fixtures, cleaner::CHUNK_TARGET_BYTES)?;
    for item in &ingested {
        println!("{} -> #{} ({}, {} bytes{})", item.fixture, item.snapshot_id, item.quality,
            item.body.len(), if item.is_new { "" } else { ", duplicate" });
    }
    Ok(())
}
