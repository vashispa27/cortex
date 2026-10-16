//! Offline retrieval evaluation: `open-memory eval --corpus DIR --gold FILE --out FILE`.
//!
//! Loads invented AX fixtures into a throwaway state directory through the real
//! record -> chunk -> embed -> index path, runs the gold questions through `retrieve`, and writes
//! a JSON report plus a short markdown summary. No LLM is called and the user's state directory
//! is never opened: the state lives under the OS temp dir and is deleted afterwards.

use super::*;
use crate::fixtures::{self, Ingested, Loaded};
use std::collections::{BTreeMap, BTreeSet, HashMap, HashSet};

/// Fixed injected clock: Saturday 2026-10-17 12:00 UTC. Fixture `observed_ms` values are set
/// relative to it so "today"/"yesterday" are deterministic.
const EVAL_NOW: (i32, u32, u32, u32) = (2026, 10, 17, 12);
const KS: [usize; 5] = [1, 5, 8, 10, 40];
const GOLD_TYPES: [&str; 13] = [
    "keyword", "paraphrase", "speaker", "time_scoped", "app_scoped", "domain_scoped",
    "multi_snapshot", "absent", "ambiguous_entity", "filter_trap", "near_duplicate_version",
    "boundary_fact", "non_english",
];
const CROWD_THRESHOLDS: [f64; 2] = [0.8, 0.5];

// ------------------------------------------------------------------------------ inputs

#[derive(Debug, Deserialize)]
struct Rel {
    fixture: String,
    answer_text: String,
}

#[derive(Debug, Deserialize)]
struct Gold {
    id: String,
    #[serde(rename = "type")]
    qtype: String,
    #[serde(default = "default_split")]
    split: String,
    query: String,
    #[serde(default)]
    relevant: Vec<Rel>,
    #[serde(default)]
    expect_abstain: bool,
    #[serde(default)]
    wrong_text: Vec<String>,
    #[serde(default)]
    #[allow(dead_code)]
    notes: String,
}

fn default_split() -> String {
    "dev".into()
}

#[derive(Debug, Default, Deserialize)]
struct Facts {
    #[serde(default)]
    facts: Vec<Fact>,
    #[serde(default)]
    noise_strings: Vec<String>,
    #[serde(default = "yes")]
    expect_searchable: bool,
    #[serde(default)]
    tags: Vec<String>,
}

fn yes() -> bool {
    true
}

#[derive(Debug, Deserialize)]
struct Fact {
    id: String,
    text: String,
}

struct Args {
    corpus: PathBuf,
    gold: PathBuf,
    facts: PathBuf,
    split: String,
    base: Vec<(String, String)>,
    sweeps: Vec<(String, Vec<String>)>,
    out: PathBuf,
    keep_state: bool,
}

fn parse_args(args: &[String]) -> Result<Args> {
    let mut corpus = PathBuf::from("evals/corpus");
    let mut gold = PathBuf::from("evals/gold/gold.jsonl");
    let mut facts = None;
    let mut split = "all".to_owned();
    let mut base = Vec::new();
    let mut sweeps = Vec::new();
    let mut out = None;
    let mut keep_state = false;
    let mut iter = args.iter();
    while let Some(arg) = iter.next() {
        let mut value = |name: &str| -> Result<String> {
            iter.next().cloned().with_context(|| format!("{name} needs a value"))
        };
        match arg.as_str() {
            "--corpus" => corpus = PathBuf::from(value("--corpus")?),
            "--gold" => gold = PathBuf::from(value("--gold")?),
            "--facts" => facts = Some(PathBuf::from(value("--facts")?)),
            "--split" => split = value("--split")?,
            "--out" => out = Some(PathBuf::from(value("--out")?)),
            "--keep-state" => keep_state = true,
            "--param" => {
                let kv = value("--param")?;
                let (k, v) = kv.split_once('=').with_context(|| format!("--param expects key=value, got {kv}"))?;
                base.push((k.to_owned(), v.to_owned()));
            }
            "--sweep" => {
                let kv = value("--sweep")?;
                let (k, v) = kv.split_once('=').with_context(|| format!("--sweep expects key=v1,v2, got {kv}"))?;
                sweeps.push((k.to_owned(), v.split(',').map(str::to_owned).collect()));
            }
            other => bail!("unknown eval option {other}"),
        }
    }
    if !["dev", "test", "all"].contains(&split.as_str()) {
        bail!("--split must be dev, test or all");
    }
    let facts = facts.unwrap_or_else(|| corpus.parent().map(|p| p.join("pages")).unwrap_or_else(|| PathBuf::from("evals/pages")));
    Ok(Args { corpus, gold, facts, split, base, sweeps, out: out.context("--out is required")?, keep_state })
}

/// One eval configuration. `chunk_target` changes ingest; everything else is query-time.
#[derive(Clone, Debug)]
struct Variant {
    name: String,
    params: Params,
    chunking: cleaner::ChunkCfg,
    prefix: prefix::Prefix,
    /// Which key/value this variant overrides relative to the base (for naming the output).
    sweep: Option<(String, String)>,
}

fn apply_param(params: &mut Params, chunking: &mut cleaner::ChunkCfg, index_prefix: &mut prefix::Prefix, key: &str, value: &str) -> Result<()> {
    let flag = |v: &str| -> Result<bool> {
        match v {
            "on" | "true" | "1" => Ok(true),
            "off" | "false" | "0" => Ok(false),
            _ => bail!("expected on/off for {key}, got {v}"),
        }
    };
    match key {
        "mode" => {
            params.mode = match value {
                "hybrid" => Mode::Hybrid,
                "dense_only" => Mode::DenseOnly,
                "bm25_only" => Mode::Bm25Only,
                _ => bail!("mode must be hybrid, dense_only or bm25_only"),
            }
        }
        "rerank_bonus" => params.use_rerank_bonus = flag(value)?,
        "filters" => params.use_filters = flag(value)?,
        "derived" => params.include_derived = flag(value)?,
        "rrf_k" => params.rrf_k = value.parse()?,
        "prefetch" => params.prefetch = value.parse()?,
        "fused_limit" => params.fused_limit = value.parse()?,
        "final_k" => params.final_k = value.parse()?,
        "chunk_target" => chunking.target = value.parse()?,
        "chunk_unit" => {
            chunking.chars = match value {
                "bytes" => false,
                "chars" => true,
                _ => bail!("chunk_unit must be bytes or chars"),
            }
        }
        "chunk_overlap" => chunking.overlap_pct = value.parse()?,
        "chunk_boundaries" => chunking.boundaries = flag(value)?,
        "prefix" => {
            *index_prefix = match value {
                "none" => prefix::Prefix::None,
                "title" => prefix::Prefix::Title,
                "context" => prefix::Prefix::Context,
                _ => bail!("prefix must be none, title or context"),
            }
        }
        "chunk_mode" => {
            if value != "legacy" {
                bail!("chunk_mode accepts only legacy (bytes, no overlap, plain cuts)");
            }
            *chunking = cleaner::LEGACY;
        }
        "app_filter" => {
            params.app_filter = match value {
                "legacy" => AppFilter::Legacy,
                "phrase" => AppFilter::Phrase,
                _ => bail!("app_filter must be legacy or phrase"),
            }
        }
        "chunks_per_result" => params.chunks_per_result = value.parse::<usize>()?.max(1),
        "abstain" => {
            if value != "off" {
                bail!("abstain accepts only off (zero every threshold); set the thresholds individually otherwise");
            }
            params.abstain_score = 0.0;
            params.abstain_support = 0.0;
            params.abstain_dense = 0.0;
            params.abstain_chunk = 0.0;
            params.abstain_unseen = 0.0;
            params.abstain_unseen_sim = 0.0;
            params.abstain_ident = 0.0;
            params.abstain_time_support = 0.0;
        }
        "abstain_score" => params.abstain_score = value.parse()?,
        "abstain_support" => params.abstain_support = value.parse()?,
        "abstain_dense" => params.abstain_dense = value.parse()?,
        "abstain_chunk" => params.abstain_chunk = value.parse()?,
        "abstain_ident" => params.abstain_ident = value.parse()?,
        "abstain_time_support" => params.abstain_time_support = value.parse()?,
        "abstain_unseen" => params.abstain_unseen = value.parse()?,
        "abstain_unseen_sim" => params.abstain_unseen_sim = value.parse()?,
        "app_fallback" => {
            params.app_fallback = match value {
                "off" => AppFallback::Off,
                "empty" => AppFallback::Empty,
                "weak" => AppFallback::Weak,
                _ => bail!("app_fallback must be off, empty or weak"),
            }
        }
        "app_fallback_ratio" => params.app_fallback_ratio = value.parse()?,
        _ => bail!("unknown --param key {key} (mode, rerank_bonus, filters, derived, rrf_k, prefetch, fused_limit, final_k, chunk_target, chunk_unit, chunk_overlap, chunk_boundaries, chunk_mode, prefix, app_filter, app_fallback, app_fallback_ratio, chunks_per_result, abstain_score, abstain_support, abstain_dense, abstain_chunk, abstain_unseen, abstain_unseen_sim, abstain_ident, abstain_time_support)"),
    }
    Ok(())
}

fn variants(args: &Args, now_ms: i64) -> Result<Vec<Variant>> {
    let mut base_params = Params { now_ms: Some(now_ms), ..Params::default() };
    let mut base_chunking = cleaner::DEFAULT_CFG;
    let mut base_prefix = prefix::Prefix::DEFAULT;
    for (k, v) in &args.base {
        apply_param(&mut base_params, &mut base_chunking, &mut base_prefix, k, v)?;
    }
    let mut out = vec![Variant { name: "base".into(), params: base_params.clone(), chunking: base_chunking, prefix: base_prefix, sweep: None }];
    for (key, values) in &args.sweeps {
        for value in values {
            let mut p = base_params.clone();
            let mut t = base_chunking;
            let mut px = base_prefix;
            apply_param(&mut p, &mut t, &mut px, key, value)?;
            out.push(Variant { name: format!("{key}={value}"), params: p, chunking: t, prefix: px, sweep: Some((key.clone(), value.clone())) });
        }
    }
    Ok(out)
}

fn variant_path(out: &Path, variant: &Variant) -> PathBuf {
    match &variant.sweep {
        None => out.to_path_buf(),
        Some((k, v)) => {
            let stem = out.file_stem().and_then(|s| s.to_str()).unwrap_or("report");
            out.with_file_name(format!("{stem}.{k}-{v}.json"))
        }
    }
}

// ----------------------------------------------------------------------------- helpers

fn norm(s: &str) -> String {
    s.to_lowercase().split_whitespace().collect::<Vec<_>>().join(" ")
}

fn round(x: f64) -> f64 {
    if x.is_finite() { (x * 10_000.0).round() / 10_000.0 } else { 0.0 }
}

fn mean(values: &[f64]) -> f64 {
    if values.is_empty() { 0.0 } else { values.iter().sum::<f64>() / values.len() as f64 }
}

fn percentile(sorted: &[f64], p: f64) -> f64 {
    if sorted.is_empty() {
        return 0.0;
    }
    let rank = ((p * sorted.len() as f64).ceil() as usize).clamp(1, sorted.len());
    sorted[rank - 1]
}

fn dist(values: &[f64]) -> Value {
    let mut v = values.to_vec();
    v.sort_by(|a, b| a.total_cmp(b));
    json!({
        "n": v.len(), "mean": round(mean(&v)), "p50": round(percentile(&v, 0.5)),
        "p95": round(percentile(&v, 0.95)), "min": round(v.first().copied().unwrap_or(0.0)),
        "max": round(v.last().copied().unwrap_or(0.0)),
    })
}

fn rate(count: usize, total: usize) -> Value {
    json!({"count": count, "of": total, "rate": round(if total == 0 { 0.0 } else { count as f64 / total as f64 })})
}

fn words(s: &str) -> HashSet<String> {
    s.to_lowercase().split(|c: char| !c.is_alphanumeric()).filter(|w| !w.is_empty()).map(str::to_owned).collect()
}

fn jaccard(a: &HashSet<String>, b: &HashSet<String>) -> f64 {
    if a.is_empty() && b.is_empty() {
        return 1.0;
    }
    let inter = a.intersection(b).count() as f64;
    inter / ((a.len() + b.len()) as f64 - inter)
}

fn truncate_chars(s: &str, n: usize) -> String {
    s.chars().take(n).collect()
}

fn dir_size(path: &Path) -> u64 {
    let mut total = 0;
    if let Ok(entries) = fs::read_dir(path) {
        for entry in entries.flatten() {
            let p = entry.path();
            match entry.metadata() {
                Ok(m) if m.is_dir() => total += dir_size(&p),
                Ok(m) => total += m.len(),
                _ => {}
            }
        }
    }
    total
}

fn git(args: &[&str]) -> Option<String> {
    let out = Command::new("git").args(args).output().ok()?;
    out.status.success().then(|| String::from_utf8_lossy(&out.stdout).trim().to_owned())
}

fn auroc(positive: &[f64], negative: &[f64]) -> Option<f64> {
    if positive.is_empty() || negative.is_empty() {
        return None;
    }
    let mut wins = 0.0;
    for p in positive {
        for n in negative {
            wins += if p > n { 1.0 } else if (p - n).abs() < 1e-12 { 0.5 } else { 0.0 };
        }
    }
    Some(wins / (positive.len() * negative.len()) as f64)
}

// -------------------------------------------------------------------------- per query

struct QueryResult {
    gold: usize,
    chunk_first: Vec<Option<usize>>,
    final_first: Vec<Option<usize>>,
    /// Final ranks before the abstention rule (what the results would have been).
    raw_final_first: Vec<Option<usize>>,
    abstained: bool,
    chunk_ndcg10: f64,
    n_final: usize,
    crowd: [(usize, usize); 2],
    derived_top10: usize,
    top10_len: usize,
    top_chunk_score: Option<f64>,
    top_final_score: Option<f64>,
    zero: bool,
    has_filter: bool,
    has_app_filter: bool,
    app_fallback: bool,
    excluded_all: bool,
    excluded_any: bool,
    obs_dropped: usize,
    wrong_before_right: Option<bool>,
    chunk_found_final_lost: bool,
    json: Value,
}

struct SnapRow {
    app_id: String,
    domain: Option<String>,
    source_type: String,
    first_seen: i64,
    last_seen: i64,
    observed: Vec<i64>,
}

fn load_snap(db: &Connection, id: i64) -> Result<SnapRow> {
    let (app_id, domain, source_type, first_seen, last_seen) = db.query_row(
        "SELECT app_id,domain,source_type,first_seen_ms,last_seen_ms FROM snapshots WHERE id=?1",
        [id],
        |r| Ok((r.get::<_, String>(0)?, r.get::<_, Option<String>>(1)?, r.get::<_, String>(2)?, r.get::<_, i64>(3)?, r.get::<_, i64>(4)?)),
    )?;
    let mut stmt = db.prepare("SELECT observed_ms FROM observations WHERE snapshot_id=?1")?;
    let observed = stmt.query_map([id], |r| r.get::<_, i64>(0))?.collect::<rusqlite::Result<Vec<_>>>()?;
    Ok(SnapRow { app_id, domain, source_type, first_seen, last_seen, observed })
}

/// Which filter keys (if any) keep this snapshot out of the Qdrant result.
fn excluded_by(clauses: &[Value], time: Option<(i64, i64)>, snap: &SnapRow) -> Vec<String> {
    let mut by = Vec::new();
    for clause in clauses {
        let key = clause["key"].as_str().unwrap_or("");
        let ok = match key {
            "app" => clause["match"]["value"].as_str() == Some(snap.app_id.as_str()),
            "domain" => clause["match"]["value"].as_str() == snap.domain.as_deref(),
            "source_type" => clause["match"]["value"].as_str() == Some(snap.source_type.as_str()),
            "capture_time" => clause["range"]["lt"].as_i64().map_or(true, |lt| snap.first_seen < lt),
            "last_seen" => clause["range"]["gte"].as_i64().map_or(true, |gte| snap.last_seen >= gte),
            _ => true,
        };
        if !ok && !by.iter().any(|k| k == key) {
            by.push(key.to_owned());
        }
    }
    if let Some((start, end)) = time {
        if !snap.observed.iter().any(|&o| o >= start && o < end) {
            by.push("observation_time".to_owned());
        }
    }
    by
}

struct EvalCtx<'a> {
    fixture_snapshots: &'a BTreeMap<String, i64>,
    snapshot_fixtures: &'a BTreeMap<i64, Vec<String>>,
}

fn evaluate_query(rt: &mut Runtime, index: usize, gold: &Gold, params: &Params, ctx: &EvalCtx) -> Result<(QueryResult, f64)> {
    let started = std::time::Instant::now();
    let retrieval = retrieve(rt, &gold.query, params)?;
    let latency_ms = started.elapsed().as_secs_f64() * 1000.0;
    let answers: Vec<String> = gold.relevant.iter().map(|r| norm(&r.answer_text)).collect();
    let wrong: Vec<String> = gold.wrong_text.iter().map(|w| norm(w)).collect();
    let first_rank = |texts: &[String], needle: &str| texts.iter().position(|t| t.contains(needle)).map(|i| i + 1);

    // Chunk level: the Qdrant list before collapsing.
    let ranked_norm: Vec<String> = retrieval.ranked.iter().map(|p| norm(&p.text)).collect();
    let chunk_first: Vec<Option<usize>> = answers.iter().map(|a| first_rank(&ranked_norm, a)).collect();
    let dcg: f64 = chunk_first.iter().flatten().filter(|&&r| r <= 10).map(|&r| 1.0 / ((r as f64) + 1.0).log2()).sum();
    let ideal: f64 = (1..=answers.len().min(10)).map(|j| 1.0 / ((j as f64) + 1.0).log2()).sum();
    let chunk_ndcg10 = if ideal > 0.0 { dcg / ideal } else { 0.0 };

    // Final level: what `ask` shows or hands to the LLM (retrieved chunk, or the first 2,500
    // characters of the body for derived hits, plus the printed snippet).
    let blobs: Vec<String> = retrieval
        .hits
        .iter()
        .map(|h| norm(&format!("{}\n{}", evidence_text(h), evidence_snippet(h, &gold.query, params.chunks_per_result))))
        .collect();
    let raw_final_first: Vec<Option<usize>> = answers.iter().map(|a| first_rank(&blobs, a)).collect();
    // An abstained query shows nothing: for final-level metrics it has no results.
    let abstained = retrieval.abstained;
    let final_first: Vec<Option<usize>> = if abstained { vec![None; answers.len()] } else { raw_final_first.clone() };
    let right_rank = final_first.iter().flatten().min().copied();
    let wrong_before_right = if wrong.is_empty() {
        None
    } else {
        let wrong_rank = wrong.iter().filter_map(|w| first_rank(&blobs, w)).min();
        Some(wrong_rank.is_some_and(|w| right_rank.map_or(true, |r| w < r)))
    };

    // Near-duplicate crowding of the final slots, by word-set overlap of the displayed bodies.
    let shown: &[Hit] = if abstained { &[] } else { &retrieval.hits };
    let sets: Vec<HashSet<String>> = shown.iter().map(|h| words(&h.source.body)).collect();
    let mut crowd = [(0_usize, shown.len()); 2];
    for (t, threshold) in CROWD_THRESHOLDS.iter().enumerate() {
        for j in 1..sets.len() {
            if (0..j).any(|i| jaccard(&sets[i], &sets[j]) >= *threshold) {
                crowd[t].0 += 1;
            }
        }
    }

    let top10 = &retrieval.ranked[..retrieval.ranked.len().min(10)];
    let derived_top10 = top10.iter().filter(|p| p.kind == "derived").count();

    // Filter diagnostics against the snapshots the question is about.
    let mut excluded_all = false;
    let mut excluded_any = false;
    let mut exclusion_keys: Vec<String> = Vec::new();
    if !gold.relevant.is_empty() {
        let mut flags = Vec::new();
        for rel in &gold.relevant {
            if let Some(&sid) = ctx.fixture_snapshots.get(&rel.fixture) {
                let snap = load_snap(&rt.db, sid)?;
                let by = excluded_by(&retrieval.filter, retrieval.time, &snap);
                flags.push(!by.is_empty());
                for k in by {
                    if !exclusion_keys.contains(&k) {
                        exclusion_keys.push(k);
                    }
                }
            }
        }
        excluded_all = !flags.is_empty() && flags.iter().all(|&f| f);
        excluded_any = flags.iter().any(|&f| f);
    }
    let has_app_filter = retrieval.filter.iter().any(|c| c["key"] == "app");
    let app_fallback = retrieval.app_fallback;
    let top_chunk_score = retrieval.ranked.first().map(|p| p.score as f64);
    let top_final_score = retrieval.hits.first().map(|h| h.source.score as f64);
    let chunk_best = chunk_first.iter().flatten().min().copied();
    let chunk_found_final_lost = !gold.expect_abstain && chunk_best.is_some() && right_rank.is_none();

    let fixtures_of = |sid: i64| ctx.snapshot_fixtures.get(&sid).cloned().unwrap_or_default();
    let top5: Vec<Value> = retrieval
        .ranked
        .iter()
        .take(5)
        .enumerate()
        .map(|(i, p)| {
            json!({
                "rank": p.rank, "kind": p.kind, "derived_kind": p.derived_kind, "chunk_id": p.chunk_id,
                "snapshot_ids": p.snapshot_ids, "fixtures": p.snapshot_ids.iter().flat_map(|s| fixtures_of(*s)).collect::<Vec<_>>(),
                "score": round(p.score as f64 * 1000.0) / 1000.0 * 1.0, "passed_time_check": p.passed_time_check,
                "hit": answers.iter().any(|a| ranked_norm[i].contains(a)), "text": truncate_chars(&p.text, 200),
            })
        })
        .collect();
    let final_view: Vec<Value> = retrieval
        .hits
        .iter()
        .enumerate()
        .map(|(i, h)| {
            json!({
                "rank": i + 1, "snapshot_id": h.source.id, "fixtures": fixtures_of(h.source.id),
                "best_chunk_id": h.best_chunk_id, "score": round(h.source.score as f64 * 1000.0) / 1000.0,
                "hit": answers.iter().any(|a| blobs[i].contains(a)),
            })
        })
        .collect();
    let json = json!({
        "id": gold.id, "type": gold.qtype, "split": gold.split, "query": gold.query,
        "expect_abstain": gold.expect_abstain,
        "filter": if retrieval.filter.is_empty() { Value::Null } else { Value::Array(retrieval.filter.clone()) },
        "time_bounds": retrieval.time.map(|(s, e)| json!([s, e])),
        "filter_excluded_all_relevant": excluded_all, "filter_excluded_any_relevant": excluded_any,
        "excluded_by": exclusion_keys, "observation_dropped": retrieval.observation_dropped,
        "zero_results": retrieval.hits.is_empty(), "app_filter_fallback": app_fallback,
        "abstained": abstained, "support": round(retrieval.support), "dense_sim": round(retrieval.dense_sim), "chunk_sim": round(retrieval.chunk_sim), "chunk_support": round(retrieval.chunk_support), "unseen": round(retrieval.unseen), "has_time_window": retrieval.time.is_some(), "ident": round(retrieval.ident), "score_norm": round(retrieval.score_norm),
        "would_have_hit": raw_final_first.iter().any(|f| f.is_some()),
        "n_ranked": retrieval.ranked.len(), "n_collapsed": retrieval.collapsed, "n_final": shown.len(),
        "chunk_first_hit_rank": chunk_first, "final_first_hit_rank": final_first,
        "chunk_found_final_lost": chunk_found_final_lost,
        "wrong_before_right": wrong_before_right,
        "top_score_chunk": top_chunk_score.map(|s| round(s * 1e6) / 1e6 * 1.0),
        "top_score_final": top_final_score.map(|s| round(s * 1e6) / 1e6 * 1.0),
        "derived_in_top10": derived_top10,
        "near_duplicate_slots": {"jaccard_0.8": crowd[0].0, "jaccard_0.5": crowd[1].0, "final_slots": shown.len()},
        "top5_chunks": top5, "final": final_view,
    });
    Ok((
        QueryResult {
            gold: index, chunk_first, final_first, raw_final_first, abstained, chunk_ndcg10, n_final: shown.len(), crowd,
            derived_top10, top10_len: top10.len(), top_chunk_score, top_final_score,
            zero: retrieval.hits.is_empty(), has_filter: !retrieval.filter.is_empty(), has_app_filter, app_fallback,
            excluded_all, excluded_any, obs_dropped: retrieval.observation_dropped, wrong_before_right,
            chunk_found_final_lost, json,
        },
        latency_ms,
    ))
}

// -------------------------------------------------------------------------- aggregates

fn aggregate(results: &[&QueryResult], golds: &[Gold], final_k: usize) -> Value {
    let answerable: Vec<&&QueryResult> = results.iter().filter(|r| !golds[r.gold].expect_abstain).collect();
    let absent: Vec<&&QueryResult> = results.iter().filter(|r| golds[r.gold].expect_abstain).collect();
    let n = answerable.len();
    let any_within = |firsts: &[Option<usize>], k: usize| firsts.iter().flatten().any(|&r| r <= k);
    let recall_within = |firsts: &[Option<usize>], k: usize| -> f64 {
        if firsts.is_empty() { 0.0 } else { firsts.iter().flatten().filter(|&&r| r <= k).count() as f64 / firsts.len() as f64 }
    };
    let mrr = |firsts: &[Option<usize>]| firsts.iter().flatten().min().map_or(0.0, |&r| 1.0 / r as f64);
    let mut chunk_hit = BTreeMap::new();
    let mut chunk_recall = BTreeMap::new();
    for k in KS {
        chunk_hit.insert(format!("@{k}"), rate(answerable.iter().filter(|r| any_within(&r.chunk_first, k)).count(), n));
        chunk_recall.insert(format!("@{k}"), round(mean(&answerable.iter().map(|r| recall_within(&r.chunk_first, k)).collect::<Vec<_>>())));
    }
    let both = answerable.iter().filter(|r| r.final_first.iter().all(|f| f.is_some())).count();
    let with_results: Vec<&&QueryResult> = results.iter().filter(|r| r.n_final > 0).collect();
    let slots: usize = with_results.iter().map(|r| r.n_final).sum();
    let crowd = |t: usize| {
        let near: usize = with_results.iter().map(|r| r.crowd[t].0).sum();
        json!({
            "slots_near_duplicate": rate(near, slots),
            "queries_with_any": rate(with_results.iter().filter(|r| r.crowd[t].0 > 0).count(), with_results.len()),
            "mean_slots_per_query": round(mean(&with_results.iter().map(|r| r.crowd[t].0 as f64).collect::<Vec<_>>())),
        })
    };
    let top10_slots: usize = results.iter().map(|r| r.top10_len).sum();
    let derived_slots: usize = results.iter().map(|r| r.derived_top10).sum();
    let wrong: Vec<&&QueryResult> = answerable.iter().copied().filter(|r| r.wrong_before_right.is_some()).collect();
    let abs_scores: Vec<f64> = absent.iter().filter_map(|r| r.top_chunk_score).collect();
    let ans_scores: Vec<f64> = answerable.iter().filter_map(|r| r.top_chunk_score).collect();
    let abs_final: Vec<f64> = absent.iter().filter_map(|r| r.top_final_score).collect();
    let ans_final: Vec<f64> = answerable.iter().filter_map(|r| r.top_final_score).collect();
    json!({
        "n_queries": results.len(), "n_answerable": n, "n_absent": absent.len(),
        "chunk_level": {
            "hit": chunk_hit, "recall": chunk_recall,
            "mrr": round(mean(&answerable.iter().map(|r| mrr(&r.chunk_first)).collect::<Vec<_>>())),
            "ndcg@10": round(mean(&answerable.iter().map(|r| r.chunk_ndcg10).collect::<Vec<_>>())),
        },
        "final_level": {
            "k": final_k,
            "hit@1": rate(answerable.iter().filter(|r| any_within(&r.final_first, 1)).count(), n),
            "hit@k": rate(answerable.iter().filter(|r| any_within(&r.final_first, final_k)).count(), n),
            "all_relevant_found": rate(both, n),
            "recall@k": round(mean(&answerable.iter().map(|r| recall_within(&r.final_first, final_k)).collect::<Vec<_>>())),
            "mrr": round(mean(&answerable.iter().map(|r| mrr(&r.final_first)).collect::<Vec<_>>())),
            "chunk_hit_but_final_miss": rate(answerable.iter().filter(|r| r.chunk_found_final_lost).count(), n),
            "stale_or_wrong_text_ranked_above_answer": rate(wrong.iter().filter(|r| r.wrong_before_right == Some(true)).count(), wrong.len()),
        },
        "near_duplicate_crowding": {"jaccard_0.8": crowd(0), "jaccard_0.5": crowd(1)},
        "derived_pollution_top10": {
            "derived_slots": rate(derived_slots, top10_slots),
            "mean_per_query": round(mean(&results.iter().map(|r| if r.top10_len == 0 { 0.0 } else { r.derived_top10 as f64 / r.top10_len as f64 }).collect::<Vec<_>>())),
        },
        "filters": {
            "queries_with_filter": rate(results.iter().filter(|r| r.has_filter).count(), results.len()),
            "queries_with_app_filter": rate(results.iter().filter(|r| r.has_app_filter).count(), results.len()),
            "app_filter_abandoned_for_unfiltered": rate(results.iter().filter(|r| r.app_fallback).count(), results.len()),
            "excluded_all_relevant": rate(answerable.iter().filter(|r| r.excluded_all).count(), n),
            "excluded_some_relevant": rate(answerable.iter().filter(|r| r.excluded_any).count(), n),
            "zero_result_queries": rate(results.iter().filter(|r| r.zero).count(), results.len()),
            "observation_check_dropped_hits": results.iter().map(|r| r.obs_dropped).sum::<usize>(),
        },
        "abstention": {
            "absent_queries_returning_results": rate(absent.iter().filter(|r| r.n_final > 0).count(), absent.len()),
            "absent_queries_abstained": rate(absent.iter().filter(|r| r.n_final == 0).count(), absent.len()),
            "answerable_wrongly_abstained": rate(answerable.iter().filter(|r| r.abstained).count(), n),
            "answerable_wrongly_abstained_that_would_have_hit": rate(answerable.iter().filter(|r| r.abstained && r.raw_final_first.iter().any(|f| f.is_some())).count(), n),
            "top_chunk_score_absent": dist(&abs_scores), "top_chunk_score_answerable": dist(&ans_scores),
            "top_final_score_absent": dist(&abs_final), "top_final_score_answerable": dist(&ans_final),
            "auroc_answerable_vs_absent_chunk_score": auroc(&ans_scores, &abs_scores).map(round),
            "auroc_answerable_vs_absent_final_score": auroc(&ans_final, &abs_final).map(round),
        },
    })
}

// -------------------------------------------------------------------------- intrinsics

fn intrinsics(
    rt: &Runtime,
    corpus: &[Loaded],
    ingested: &[Ingested],
    facts: &BTreeMap<String, Facts>,
    golds: &[Gold],
) -> Result<Value> {
    let mut chunk_rows: Vec<(i64, i64, String)> = Vec::new();
    {
        let mut stmt = rt.db.prepare("SELECT c.id,c.snapshot_id,c.body FROM chunks c JOIN snapshots s ON s.id=c.snapshot_id ORDER BY c.id")?;
        let rows = stmt.query_map([], |r| Ok((r.get::<_, i64>(0)?, r.get::<_, i64>(1)?, r.get::<_, String>(2)?)))?;
        for row in rows {
            chunk_rows.push(row?);
        }
    }
    let by_snapshot: BTreeMap<i64, Vec<&String>> = chunk_rows.iter().fold(BTreeMap::new(), |mut m, (_, s, b)| {
        m.entry(*s).or_default().push(b);
        m
    });
    let tag_of = |fixture: &str| facts.get(fixture).map(|f| f.tags.clone()).unwrap_or_default();
    let snapshot_tags: BTreeMap<i64, Vec<String>> = ingested.iter().map(|i| (i.snapshot_id, tag_of(&i.fixture))).collect();
    let bytes: Vec<f64> = chunk_rows.iter().map(|(_, _, b)| b.len() as f64).collect();
    let chars: Vec<f64> = chunk_rows.iter().map(|(_, _, b)| b.chars().count() as f64).collect();
    let word_counts: Vec<f64> = chunk_rows.iter().map(|(_, _, b)| b.split_whitespace().count() as f64).collect();
    let (mut ne_chars, mut ne_bytes, mut en_chars, mut en_bytes) = (Vec::new(), Vec::new(), Vec::new(), Vec::new());
    for (_, s, b) in &chunk_rows {
        let non_english = snapshot_tags.get(s).is_some_and(|t| t.iter().any(|x| x == "non_english"));
        let (c, y) = if non_english { (&mut ne_chars, &mut ne_bytes) } else { (&mut en_chars, &mut en_bytes) };
        c.push(b.chars().count() as f64);
        y.push(b.len() as f64);
    }
    let per_snapshot: Vec<f64> = by_snapshot.values().map(|v| v.len() as f64).collect();
    // How much meaning a chunk carries on its own: chunks are embedded without title, app or
    // speaker, so tiny chunks and chunks that share no word with their page title are the ones
    // that depend on context the index never sees.
    let mut titles: HashMap<i64, HashSet<String>> = HashMap::new();
    {
        let mut stmt = rt.db.prepare("SELECT id,title FROM snapshots")?;
        for row in stmt.query_map([], |r| Ok((r.get::<_, i64>(0)?, r.get::<_, String>(1)?)))? {
            let (id, title) = row?;
            titles.insert(id, words(&title).into_iter().filter(|w| w.chars().count() > 3).collect());
        }
    }
    let without_title = chunk_rows.iter().filter(|(_, s, b)| {
        let t = &titles[s];
        !t.is_empty() && words(b).is_disjoint(t)
    }).count();
    let tiny = chunk_rows.iter().filter(|(_, _, b)| b.len() < 100).count();

    // Fact-split rate: a gold answer that no single chunk of its fixture contains whole.
    let mut seen = BTreeSet::new();
    let mut split_facts = Vec::new();
    let mut total_facts = 0_usize;
    let mut split_by_type: BTreeMap<String, (usize, usize)> = BTreeMap::new();
    for gold in golds {
        for rel in &gold.relevant {
            if !seen.insert((rel.fixture.clone(), norm(&rel.answer_text))) {
                continue;
            }
            let Some(item) = ingested.iter().find(|i| i.fixture == rel.fixture) else { continue };
            let needle = norm(&rel.answer_text);
            let whole = by_snapshot.get(&item.snapshot_id).is_some_and(|cs| cs.iter().any(|c| norm(c).contains(&needle)));
            total_facts += 1;
            let entry = split_by_type.entry(gold.qtype.clone()).or_default();
            entry.1 += 1;
            if !whole {
                entry.0 += 1;
                split_facts.push(json!({"fixture": rel.fixture, "answer_text": rel.answer_text, "query_id": gold.id}));
            }
        }
    }

    // Redundancy: identical chunk text stored for different snapshots; and inside same-URL groups.
    let mut text_snapshots: HashMap<String, BTreeSet<i64>> = HashMap::new();
    for (_, s, b) in &chunk_rows {
        text_snapshots.entry(norm(b)).or_default().insert(*s);
    }
    let redundant_chunks = chunk_rows.iter().filter(|(_, _, b)| text_snapshots[&norm(b)].len() > 1).count();
    let mut groups: BTreeMap<(String, String), Vec<(i64, String)>> = BTreeMap::new();
    for item in ingested.iter().filter(|i| i.is_new && i.searchable) {
        let loaded = corpus.iter().find(|l| l.id == item.fixture).unwrap();
        if let Some(url) = &loaded.fixture.url {
            groups.entry((loaded.fixture.app_id.clone(), url.clone())).or_default().push((item.snapshot_id, item.fixture.clone()));
        }
    }
    let mut dup_groups = Vec::new();
    for ((app, url), members) in groups.iter().filter(|(_, m)| m.len() > 1) {
        let ids: BTreeSet<i64> = members.iter().map(|(s, _)| *s).collect();
        let total: usize = ids.iter().map(|s| by_snapshot.get(s).map_or(0, Vec::len)).sum();
        let redundant: usize = ids
            .iter()
            .flat_map(|s| by_snapshot.get(s).cloned().unwrap_or_default())
            .filter(|b| text_snapshots[&norm(b)].intersection(&ids).count() > 1)
            .count();
        dup_groups.push(json!({
            "app": app, "url": url, "fixtures": members.iter().map(|(_, f)| f.clone()).collect::<Vec<_>>(),
            "chunks": total, "chunks_identical_to_a_chunk_of_another_version": redundant,
            "redundant_fraction": round(if total == 0 { 0.0 } else { redundant as f64 / total as f64 }),
        }));
    }

    // Derived points.
    let mut derived_counts: BTreeMap<String, usize> = BTreeMap::new();
    {
        let mut stmt = rt.db.prepare("SELECT kind,COUNT(*) FROM derived GROUP BY kind")?;
        for row in stmt.query_map([], |r| Ok((r.get::<_, String>(0)?, r.get::<_, i64>(1)?)))? {
            let (k, c) = row?;
            derived_counts.insert(k, c as usize);
        }
    }
    let calendar = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday", "january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];
    let mut entity_rows: Vec<(String, usize)> = Vec::new();
    {
        let mut stmt = rt.db.prepare("SELECT d.logical_key,COUNT(ds.snapshot_id) FROM derived d LEFT JOIN derived_sources ds ON ds.derived_id=d.id WHERE d.kind='entity' GROUP BY d.id ORDER BY COUNT(ds.snapshot_id) DESC, d.logical_key LIMIT 5000")?;
        for row in stmt.query_map([], |r| Ok((r.get::<_, String>(0)?, r.get::<_, i64>(1)?)))? {
            let (k, c) = row?;
            entity_rows.push((k, c as usize));
        }
    }
    let calendar_entities: Vec<&String> = entity_rows.iter().map(|(k, _)| k).filter(|k| calendar.contains(&k.split_whitespace().next().unwrap_or("").to_lowercase().as_str())).collect();

    // Cleaner intrinsics per fixture.
    let mut per_fixture = Vec::new();
    let (mut facts_total, mut facts_kept, mut noise_total, mut noise_leaked, mut fixtures_leaking) = (0, 0, 0, 0, 0);
    let mut nav_ok = Vec::new();
    for item in ingested.iter().filter(|i| i.is_new || !ingested.iter().any(|j| j.fixture == i.fixture && j.is_new)) {
        let f = facts.get(&item.fixture);
        let body = norm(&item.body);
        let (mut lost, mut leaked) = (Vec::new(), Vec::new());
        if let Some(f) = f {
            for fact in &f.facts {
                facts_total += 1;
                if body.contains(&norm(&fact.text)) { facts_kept += 1 } else { lost.push(json!({"id": fact.id, "text": fact.text})) }
            }
            let body_lines: Vec<String> = item.body.lines().map(norm).collect();
            for noise in &f.noise_strings {
                noise_total += 1;
                // A leak is a body line equal to the UI string, or (for multi-word strings) the
                // string embedded in a longer line. Substring-only matching would flag "Send"
                // inside ordinary sentences.
                let n = norm(noise);
                if body_lines.iter().any(|l| *l == n) || (n.split(' ').count() >= 3 && body.contains(&n)) {
                    noise_leaked += 1;
                    leaked.push(noise.clone());
                }
            }
            if !leaked.is_empty() {
                fixtures_leaking += 1;
            }
            if !f.expect_searchable {
                nav_ok.push(json!({"fixture": item.fixture, "quality": item.quality, "body_bytes": item.body.len(),
                    "ok": item.quality == "navigation_only" && item.body.is_empty() && !by_snapshot.contains_key(&item.snapshot_id)}));
            }
        }
        let loaded = corpus.iter().find(|l| l.id == item.fixture).unwrap();
        per_fixture.push(json!({
            "fixture": item.fixture, "provenance": loaded.fixture.provenance, "snapshot_id": item.snapshot_id,
            "quality": item.quality, "body_bytes": item.body.len(), "chunks": by_snapshot.get(&item.snapshot_id).map_or(0, Vec::len),
            "planted_facts_lost": lost, "noise_leaked": leaked,
        }));
    }
    let mut drop_reasons: BTreeMap<String, usize> = BTreeMap::new();
    {
        let mut stmt = rt.db.prepare("SELECT cleaning_trace_json FROM snapshots")?;
        for row in stmt.query_map([], |r| r.get::<_, String>(0))? {
            let trace: Vec<Value> = serde_json::from_str(&row?).unwrap_or_default();
            for d in trace {
                let key = format!("{}:{}", d["class"].as_str().unwrap_or("?"), d["reason"].as_str().unwrap_or("?"));
                *drop_reasons.entry(key).or_default() += 1;
            }
        }
    }
    Ok(json!({
        "chunking": {
            "chunk_target_bytes_note": "bytes, no overlap; chunk closes at speaker markers and when a unit would pass the target",
            "chunks": chunk_rows.len(), "snapshots_with_chunks": by_snapshot.len(),
            "chunks_per_snapshot": dist(&per_snapshot), "bytes": dist(&bytes), "chars": dist(&chars),
            "words": dist(&word_counts),
            "tokens": "not available: Model2Vec's tokenizer is not exposed by model2vec-rs; words reported instead",
            "context": {
                "chunks_sharing_no_word_with_their_page_title": rate(without_title, chunk_rows.len()),
                "chunks_under_100_bytes": rate(tiny, chunk_rows.len()),
            },
            "chars_per_chunk_non_english": dist(&ne_chars), "chars_per_chunk_english": dist(&en_chars),
            "bytes_per_chunk_non_english": dist(&ne_bytes), "bytes_per_chunk_english": dist(&en_bytes),
            "fact_split": {
                "answers_checked": total_facts, "split_across_chunks": rate(split_facts.len(), total_facts),
                "by_query_type": split_by_type.iter().map(|(k, (s, t))| (k.clone(), rate(*s, *t))).collect::<BTreeMap<_, _>>(),
                "split_answers": split_facts,
            },
            "redundancy": {
                "chunks_with_identical_text_in_another_snapshot": rate(redundant_chunks, chunk_rows.len()),
                "same_url_groups": dup_groups,
            },
        },
        "derived": {
            "points_by_kind": derived_counts,
            "entity_points": entity_rows.len(),
            "entities_that_are_calendar_words": rate(calendar_entities.len(), entity_rows.len()),
            "calendar_entity_examples": calendar_entities.iter().take(10).collect::<Vec<_>>(),
            "most_shared_entities": entity_rows.iter().take(15).map(|(k, c)| json!({"entity": k, "snapshots": c})).collect::<Vec<_>>(),
        },
        "cleaner": {
            "planted_facts_surviving_cleaning": rate(facts_kept, facts_total),
            "noise_strings_leaked_into_body": rate(noise_leaked, noise_total),
            "fixtures_with_any_noise_leak": rate(fixtures_leaking, per_fixture.len()),
            "navigation_only_fixtures": nav_ok,
            "node_decisions": drop_reasons,
            "per_fixture": per_fixture,
        },
    }))
}

/// Direct probes of the date and app-word handling that do not need the corpus.
fn probes(db: &Connection, now_ms: i64, params: &Params) -> Result<Value> {
    let mut dates = Vec::new();
    for q in ["what did I read yesterday", "what did I read today", "notes from 2026-10-14", "what did I read last week", "what did I read this morning", "two days ago", "last month", "on October 14", "last Friday"] {
        dates.push(json!({"question": q, "bounds_produced": time_bounds(q, Some(now_ms))?.is_some()}));
    }
    let mut apps = Vec::new();
    for q in ["what is an edge case in this test plan", "what is the terminal velocity of a skydiver", "what did I write in my notes about hiring", "any messages about the deposit", "the slack of the rope", "chrome plating process", "what did I read in Safari"] {
        let clauses = filter_clauses(db, q, Some(now_ms), params.app_filter)?;
        let app = clauses.iter().find(|c| c["key"] == "app").map(|c| c["match"]["value"].clone());
        apps.push(json!({"question": q, "app_filter": app}));
    }
    Ok(json!({"date_handling": dates, "app_word_filters": apps}))
}

// ------------------------------------------------------------------------------- driver

/// Where the pinned embedding model comes from when `OPEN_MEMORY_MODEL_DIR` is not set: an
/// existing Hugging Face hub cache entry for the pinned revision, else a download (checksum
/// verified) into `<repo>/target/eval-cache`, which later runs reuse. Never the user's state dir.
fn resolve_model_dir() -> Result<PathBuf> {
    if let Some(home) = env::var_os("HOME") {
        let hub = PathBuf::from(home)
            .join(".cache/huggingface/hub/models--minishlab--potion-base-32M/snapshots")
            .join(MODEL_REVISION);
        if hub.join("model.safetensors").is_file() && file_hash(&hub.join("model.safetensors"))? == MODEL_SHA256 {
            return Ok(hub);
        }
    }
    let cache = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../target/eval-cache");
    fs::create_dir_all(&cache)?;
    eprintln!("embedding model not found locally; downloading the pinned revision into {}", cache.display());
    download_model(&cache)
}

pub fn run(args: &[String]) -> Result<()> {
    let args = parse_args(args)?;
    // Day boundaries and printed times must not depend on the machine's timezone.
    env::set_var("TZ", "UTC");
    let now_ms = Utc.with_ymd_and_hms(EVAL_NOW.0, EVAL_NOW.1, EVAL_NOW.2, EVAL_NOW.3, 0, 0).single().context("clock")?.timestamp_millis();
    let corpus = fixtures::load_corpus(&args.corpus)?;
    if corpus.is_empty() {
        bail!("no fixtures in {}", args.corpus.display());
    }
    let mut golds: Vec<Gold> = Vec::new();
    for (n, line) in fs::read_to_string(&args.gold)?.lines().enumerate() {
        if line.trim().is_empty() {
            continue;
        }
        golds.push(serde_json::from_str(line).with_context(|| format!("gold line {}", n + 1))?);
    }
    let mut ids = BTreeSet::new();
    for g in &golds {
        if !ids.insert(g.id.clone()) {
            bail!("duplicate gold id {}", g.id);
        }
        if !GOLD_TYPES.contains(&g.qtype.as_str()) {
            bail!("gold {}: unknown type {}", g.id, g.qtype);
        }
        if g.expect_abstain != g.relevant.is_empty() {
            bail!("gold {}: absent questions must have no relevant answers and all others at least one", g.id);
        }
        if !["dev", "test"].contains(&g.split.as_str()) {
            bail!("gold {}: split must be dev or test", g.id);
        }
    }
    let mut facts: BTreeMap<String, Facts> = BTreeMap::new();
    for loaded in &corpus {
        let path = args.facts.join(format!("{}.facts.json", loaded.id));
        if path.is_file() {
            facts.insert(loaded.id.clone(), serde_json::from_str(&fs::read_to_string(&path)?).with_context(|| format!("invalid {}", path.display()))?);
        }
    }
    let variants = variants(&args, now_ms)?;
    let selected: Vec<usize> = golds.iter().enumerate().filter(|(_, g)| args.split == "all" || g.split == args.split).map(|(i, _)| i).collect();

    let mut model: Option<StaticModel> = None;
    let mut targets: Vec<(cleaner::ChunkCfg, prefix::Prefix)> = Vec::new();
    for v in &variants {
        if !targets.contains(&(v.chunking, v.prefix)) {
            targets.push((v.chunking, v.prefix));
        }
    }
    for (group, target) in targets.iter().enumerate() {
        let state = env::temp_dir().join(format!("open-memory-eval-{}-{}", std::process::id(), group));
        if state.exists() {
            fs::remove_dir_all(&state)?;
        }
        fs::create_dir_all(&state)?;
        fs::set_permissions(&state, fs::Permissions::from_mode(0o700))?;
        let outcome = run_group(&args, &state, target.0, target.1, model.take(), &variants, &corpus, &golds, &selected, &facts, now_ms);
        let cleanup = |state: &Path| if !args.keep_state { let _ = fs::remove_dir_all(state); } else { eprintln!("kept state dir {}", state.display()); };
        match outcome {
            Ok(m) => {
                model = Some(m);
                cleanup(&state);
            }
            Err(e) => {
                cleanup(&state);
                return Err(e);
            }
        }
    }
    Ok(())
}

#[allow(clippy::too_many_arguments)]
fn run_group(
    args: &Args,
    state: &Path,
    chunking: cleaner::ChunkCfg,
    index_prefix: prefix::Prefix,
    model: Option<StaticModel>,
    all_variants: &[Variant],
    corpus: &[Loaded],
    golds: &[Gold],
    selected: &[usize],
    facts: &BTreeMap<String, Facts>,
    now_ms: i64,
) -> Result<StaticModel> {
    if model.is_none() && env::var_os("OPEN_MEMORY_MODEL_DIR").is_none() {
        env::set_var("OPEN_MEMORY_MODEL_DIR", resolve_model_dir()?);
    }
    let mut runtime = open_runtime_with(state, false, model, index_prefix)?;
    let ingest_started = std::time::Instant::now();
    let ingested = fixtures::ingest(&mut runtime, state, corpus, &chunking)?;
    let ingest_ms = ingest_started.elapsed().as_secs_f64() * 1000.0;

    // Every gold answer must be an exact (whitespace/case-normalised) substring of its cleaned body.
    let mut problems = Vec::new();
    for g in golds {
        for rel in &g.relevant {
            match ingested.iter().find(|i| i.fixture == rel.fixture) {
                None => problems.push(format!("{}: unknown fixture {}", g.id, rel.fixture)),
                Some(i) if !norm(&i.body).contains(&norm(&rel.answer_text)) => problems.push(format!(
                    "{}: answer_text not found in cleaned body of {}: {:?}", g.id, rel.fixture, rel.answer_text)),
                _ => {}
            }
        }
    }
    if !problems.is_empty() {
        bail!("gold set does not match the cleaned corpus:\n  {}", problems.join("\n  "));
    }
    let mut fixture_snapshots: BTreeMap<String, i64> = BTreeMap::new();
    for i in &ingested {
        fixture_snapshots.entry(i.fixture.clone()).or_insert(i.snapshot_id);
    }
    let mut snapshot_fixtures: BTreeMap<i64, Vec<String>> = BTreeMap::new();
    for i in &ingested {
        let names = snapshot_fixtures.entry(i.snapshot_id).or_default();
        if !names.contains(&i.fixture) {
            names.push(i.fixture.clone());
        }
    }
    let ctx = EvalCtx { fixture_snapshots: &fixture_snapshots, snapshot_fixtures: &snapshot_fixtures };
    let static_part = intrinsics(&runtime, corpus, &ingested, facts, golds)?;
    let probe_part = probes(&runtime.db, now_ms, &all_variants[0].params)?;
    let index_bytes = dir_size(state);

    for variant in all_variants.iter().filter(|v| v.chunking == chunking && v.prefix == index_prefix) {
        let mut results = Vec::new();
        let mut latencies = Vec::new();
        for &i in selected {
            let (result, ms) = evaluate_query(&mut runtime, i, &golds[i], &variant.params, &ctx)?;
            results.push(result);
            latencies.push(ms);
        }
        let refs: Vec<&QueryResult> = results.iter().collect();
        let final_k = variant.params.final_k;
        let mut by_type = BTreeMap::new();
        for t in GOLD_TYPES {
            let group: Vec<&QueryResult> = refs.iter().copied().filter(|r| golds[r.gold].qtype == t).collect();
            if !group.is_empty() {
                by_type.insert(t.to_owned(), aggregate(&group, golds, final_k));
            }
        }
        let overall = aggregate(&refs, golds, final_k);
        let mut by_split = BTreeMap::new();
        for split in ["dev", "test"] {
            let group: Vec<&QueryResult> = refs.iter().copied().filter(|r| golds[r.gold].split == split).collect();
            if !group.is_empty() {
                by_split.insert(split.to_owned(), aggregate(&group, golds, final_k));
            }
        }
        let provenance: BTreeMap<String, usize> = corpus
            .iter()
            .map(|l| (l.id.clone(), l.fixture.provenance.clone()))
            .collect::<BTreeMap<_, _>>()
            .into_values()
            .fold(BTreeMap::new(), |mut m, p| {
                *m.entry(p).or_default() += 1;
                m
            });
        let dirty = git(&["status", "--porcelain", "--", "crates", "evals/corpus", "evals/gold", "evals/pages"]).map_or(false, |s| !s.is_empty());
        let report = json!({
            "meta": {
                "variant": variant.name,
                "git_commit": git(&["rev-parse", "HEAD"]).unwrap_or_else(|| "unknown".into()),
                "git_dirty_in_inputs": dirty,
                "model_version": prefix::index_version(index_prefix), "prefix": index_prefix, "cleaner_version": cleaner::VERSION,
                "params": variant.params, "chunking": chunking,
                "split": args.split, "timezone": "UTC", "injected_now_ms": now_ms,
                "corpus_fixtures": corpus.iter().map(|l| l.id.as_str()).collect::<BTreeSet<_>>().len(),"corpus_sightings": corpus.len(), "corpus_provenance": provenance,
                "gold_total": golds.len(), "gold_evaluated": results.len(),
                "gold_by_split": golds.iter().fold(BTreeMap::new(), |mut m: BTreeMap<String, usize>, g| { *m.entry(g.split.clone()).or_default() += 1; m }),
            },
            "overall": overall,
            "by_type": by_type,
            "by_split": by_split,
            "intrinsics": static_part,
            "probes": probe_part,
            "queries": results.iter().map(|r| r.json.clone()).collect::<Vec<_>>(),
            "timing": {
                "ingest_ms": round(ingest_ms), "query_latency_ms": dist(&latencies),
                "index_size_bytes": index_bytes,
            },
        });
        let path = variant_path(&args.out, variant);
        if let Some(parent) = path.parent() {
            fs::create_dir_all(parent)?;
        }
        fs::write(&path, serde_json::to_string_pretty(&report)? + "\n")?;
        fs::write(path.with_extension("md"), markdown(&report))?;
        eprintln!("wrote {} ({} queries, variant {})", path.display(), results.len(), variant.name);
    }
    let Runtime { model, .. } = runtime;
    Ok(model)
}

// ------------------------------------------------------------------------------ markdown

fn pct(v: &Value) -> String {
    format!("{}/{} ({:.0}%)", v["count"], v["of"], v["rate"].as_f64().unwrap_or(0.0) * 100.0)
}

fn markdown(r: &Value) -> String {
    let mut s = String::new();
    let m = &r["meta"];
    s.push_str(&format!("# Retrieval eval: {}\n\n", m["variant"].as_str().unwrap_or("")));
    s.push_str(&format!(
        "- commit `{}`{} · model `{}` · cleaner v{} · chunking `{}`\n- params: `{}`\n- corpus: {} fixtures {} · gold: {} evaluated of {} ({} split) · clock fixed at 2026-10-17T12:00Z, TZ=UTC\n\n",
        m["git_commit"].as_str().unwrap_or("").chars().take(10).collect::<String>(),
        if m["git_dirty_in_inputs"] == true { " (dirty)" } else { "" },
        m["model_version"].as_str().unwrap_or(""), m["cleaner_version"], m["chunking"],
        m["params"], m["corpus_fixtures"], m["corpus_provenance"], m["gold_evaluated"], m["gold_total"], m["split"],
    ));
    s.push_str("Counts are queries; small n means wide intervals, so differences of a few queries are within noise.\n\n");
    s.push_str("## Overall\n\n| level | metric | value |\n|---|---|---|\n");
    let o = &r["overall"];
    for k in KS {
        s.push_str(&format!("| chunk | hit@{k} | {} |\n", pct(&o["chunk_level"]["hit"][format!("@{k}")])));
    }
    s.push_str(&format!("| chunk | MRR / nDCG@10 | {} / {} |\n", o["chunk_level"]["mrr"], o["chunk_level"]["ndcg@10"]));
    s.push_str(&format!("| final | hit@1 | {} |\n| final | hit@{} | {} |\n| final | MRR | {} |\n",
        pct(&o["final_level"]["hit@1"]), o["final_level"]["k"], pct(&o["final_level"]["hit@k"]), o["final_level"]["mrr"]));
    s.push_str(&format!("| final | chunk found but lost by final stage | {} |\n", pct(&o["final_level"]["chunk_hit_but_final_miss"])));
    s.push_str(&format!("| final | stale/wrong text above the answer | {} |\n", pct(&o["final_level"]["stale_or_wrong_text_ranked_above_answer"])));
    s.push_str(&format!("| crowding | final slots near-duplicate (Jaccard ≥0.8 / ≥0.5) | {} / {} |\n",
        pct(&o["near_duplicate_crowding"]["jaccard_0.8"]["slots_near_duplicate"]), pct(&o["near_duplicate_crowding"]["jaccard_0.5"]["slots_near_duplicate"])));
    s.push_str(&format!("| derived | top-10 slots held by derived points | {} |\n", pct(&o["derived_pollution_top10"]["derived_slots"])));
    s.push_str(&format!("| filters | filter excluded every relevant snapshot | {} |\n| filters | zero-result queries | {} |\n",
        pct(&o["filters"]["excluded_all_relevant"]), pct(&o["filters"]["zero_result_queries"])));
    s.push_str(&format!("| abstention | absent queries that still returned results | {} |\n", pct(&o["abstention"]["absent_queries_returning_results"])));
    s.push_str(&format!("| abstention | AUROC answerable vs absent by top score (chunk / final) | {} / {} |\n\n",
        o["abstention"]["auroc_answerable_vs_absent_chunk_score"], o["abstention"]["auroc_answerable_vs_absent_final_score"]));
    s.push_str("## By query type\n\n| type | n | chunk hit@1 | chunk hit@8 | chunk hit@40 | chunk MRR | final hit@1 | final hit@k | final MRR | zero-result |\n|---|---|---|---|---|---|---|---|---|---|\n");
    if let Some(types) = r["by_type"].as_object() {
        for (t, v) in types {
            if v["n_answerable"] == 0 {
                s.push_str(&format!("| {t} | {} (absent) | – | – | – | – | – | – | – | returned results: {} |\n", v["n_queries"], pct(&v["abstention"]["absent_queries_returning_results"])));
            } else {
                s.push_str(&format!("| {t} | {} | {} | {} | {} | {} | {} | {} | {} | {} |\n", v["n_answerable"],
                    pct(&v["chunk_level"]["hit"]["@1"]), pct(&v["chunk_level"]["hit"]["@8"]), pct(&v["chunk_level"]["hit"]["@40"]),
                    v["chunk_level"]["mrr"], pct(&v["final_level"]["hit@1"]), pct(&v["final_level"]["hit@k"]), v["final_level"]["mrr"],
                    pct(&v["filters"]["zero_result_queries"])));
            }
        }
    }
    let c = &r["intrinsics"]["chunking"];
    s.push_str(&format!("\n## Chunking\n\n- {} chunks over {} snapshots; bytes mean {} / p50 {} / p95 {} / max {}\n- answers split across chunks: {}\n- chars per chunk, English mean {} vs non-English mean {} (bytes {} vs {})\n- chunks whose text also appears in another snapshot: {}\n",
        c["chunks"], c["snapshots_with_chunks"], c["bytes"]["mean"], c["bytes"]["p50"], c["bytes"]["p95"], c["bytes"]["max"],
        pct(&c["fact_split"]["split_across_chunks"]), c["chars_per_chunk_english"]["mean"], c["chars_per_chunk_non_english"]["mean"],
        c["bytes_per_chunk_english"]["mean"], c["bytes_per_chunk_non_english"]["mean"], pct(&c["redundancy"]["chunks_with_identical_text_in_another_snapshot"])));
    let k = &r["intrinsics"]["cleaner"];
    s.push_str(&format!("\n## Cleaner\n\n- planted facts surviving cleaning: {}\n- noise strings leaked into bodies: {} (fixtures with any leak: {})\n",
        pct(&k["planted_facts_surviving_cleaning"]), pct(&k["noise_strings_leaked_into_body"]), pct(&k["fixtures_with_any_noise_leak"])));
    s.push_str(&format!("- navigation-only fixtures: {}\n", k["navigation_only_fixtures"]));
    let t = &r["timing"];
    s.push_str(&format!("\n## Cost\n\n- ingest {} ms · query latency p50 {} ms / p95 {} ms · index on disk {} bytes\n", t["ingest_ms"], t["query_latency_ms"]["p50"], t["query_latency_ms"]["p95"], t["index_size_bytes"]));
    s
}
