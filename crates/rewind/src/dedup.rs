//! Ingest-time deduplication, so a page that is captured again and again is stored, cleaned and
//! embedded once.
//!
//! Layers, cheapest first (each is skipped when `REWIND_NO_INGEST_DEDUP` is set, which the evals
//! use to measure the effect):
//!
//! 1. exact: `snapshots.fingerprint`, a SHA-256 of app, URL and cleaned body (unchanged, in `record`).
//! 2. same tree: `tree_key`, a SHA-256 of app, URL, title and the text-bearing parts of the Accessibility
//!    tree (role, name, value, ancestor path; not bounds or visibility). The same key yields the same body,
//!    so the cleaner is not run again and nothing new is stored.
//! 3. near-identical page: the new cleaned body is compared with the last few snapshots of the same
//!    app, URL and title seen in the last six hours. If word overlap is at least 0.9 *and* the numbers,
//!    capitalised words and negations are identical (`versions::mergeable`, the rule that keeps changed
//!    amounts, dates and decisions apart), the capture counts as another sighting of that snapshot.
//! 4. same chunk text (off by default, see `chunk_sharing_enabled`): when a chunk's text (same app and domain, same embedded context) is already in
//!    the index, no second vector point is written. The new chunk row points at the existing one
//!    (`chunks.dup_of`) and the point's payload covers every snapshot that shares it (`snapshot_ids`,
//!    earliest `capture_time`, latest `last_seen`); retrieval expands a hit back to all of them.

use super::*;
use std::sync::OnceLock;

/// Word overlap at or above which two captures of one page may be the same snapshot.
pub const NEAR_DUP_JACCARD: f64 = 0.9;
/// How far back (from the new capture) a candidate snapshot may have been last seen.
pub const NEAR_DUP_WINDOW_MS: i64 = 6 * 3600 * 1000;
/// Latest snapshots of the same page that are compared.
const NEAR_DUP_CANDIDATES: i64 = 3;

pub fn enabled() -> bool {
    static ON: OnceLock<bool> = OnceLock::new();
    *ON.get_or_init(|| env::var_os("REWIND_NO_INGEST_DEDUP").is_none())
}

/// Layer 3 (near-identical page merge). `REWIND_NO_NEAR_DUP_MERGE` switches only this layer off.
pub fn near_dup_enabled() -> bool {
    static ON: OnceLock<bool> = OnceLock::new();
    *ON.get_or_init(|| enabled() && env::var_os("REWIND_NO_NEAR_DUP_MERGE").is_none())
}

/// Layer 4 (shared chunk points) is implemented but OFF by default: on the real corpus it cut vector points by
/// 37% but cost 4 of 99 answerable questions at hit@8 and made queries about 2.5x slower (see
/// evals/reports/real/dedup.md). Set `REWIND_CHUNK_SHARING=1` to turn it on.
pub fn chunk_sharing_enabled() -> bool {
    static ON: OnceLock<bool> = OnceLock::new();
    *ON.get_or_init(|| enabled() && env::var_os("REWIND_CHUNK_SHARING").is_some())
}

/// Identity of what the cleaner sees: everything it reads (`role`, `name`, `value`, ancestor roles and
/// names) plus app, URL and title, and nothing it ignores (bounds, visibility, protected flags).
pub fn tree_key(window: &AxWindow, url: Option<&str>) -> String {
    let mut h = Sha256::new();
    for part in [window.app_id.as_str(), url.unwrap_or(""), window.title.as_str()] {
        h.update(part.as_bytes());
        h.update([0]);
    }
    for node in &window.roots {
        h.update(node.role.as_bytes());
        h.update([1]);
        h.update(node.name.as_deref().unwrap_or("").as_bytes());
        h.update([1]);
        h.update(node.value.as_deref().unwrap_or("").as_bytes());
        h.update([1]);
        if let Some(path) = node.extra.get("ancestor_path").and_then(|v| v.as_array()) {
            for a in path {
                h.update(a.get("role").and_then(|v| v.as_str()).unwrap_or("").as_bytes());
                h.update([2]);
                h.update(a.get("name").and_then(|v| v.as_str()).unwrap_or("").as_bytes());
                h.update([2]);
            }
        }
        h.update([3]);
    }
    hex::encode(h.finalize())
}

pub fn snapshot_for_tree(db: &Connection, key: &str) -> Result<Option<i64>> {
    Ok(db.query_row("SELECT snapshot_id FROM tree_keys WHERE tree_key=?1", [key], |r| r.get(0)).optional()?)
}

/// The latest snapshot of the same page that the new body is a near-identical copy of, if any.
pub fn find_near_duplicate(db: &Connection, window: &AxWindow, url: Option<&str>, body: &str) -> Result<Option<i64>> {
    if body.is_empty() {
        return Ok(None);
    }
    let mut stmt = db.prepare(
        "SELECT id,body FROM snapshots WHERE app_id=?1 AND title=?2 AND url IS ?3 AND searchable=1 AND last_seen_ms>=?4 ORDER BY last_seen_ms DESC LIMIT ?5",
    )?;
    let rows = stmt
        .query_map(params![window.app_id, window.title, url, window.observed_ms - NEAR_DUP_WINDOW_MS, NEAR_DUP_CANDIDATES], |r| {
            Ok((r.get::<_, i64>(0)?, r.get::<_, String>(1)?))
        })?
        .collect::<rusqlite::Result<Vec<_>>>()?;
    Ok(rows.into_iter().find(|(_, old)| versions::mergeable(old, body, NEAR_DUP_JACCARD)).map(|(id, _)| id))
}

/// Another sighting of snapshot `id`: no new row, no new text, no new vectors.
pub fn touch(db: &mut Connection, id: i64, window: &AxWindow, source_type: &str, limitations: &str, tree_key: &str) -> Result<Source> {
    let tx = db.transaction()?;
    tx.execute(
        "UPDATE snapshots SET last_seen_ms=MAX(last_seen_ms,?2),duration_ms=MAX(0,MAX(last_seen_ms,?2)-first_seen_ms),sightings=sightings+1,limitations=?3,source_type=?4 WHERE id=?1",
        params![id, window.observed_ms, limitations, source_type],
    )?;
    tx.execute("INSERT OR IGNORE INTO tree_keys(tree_key,snapshot_id) VALUES(?1,?2)", params![tree_key, id])?;
    tx.execute(
        "INSERT INTO observations(snapshot_id,observed_ms,window_session_id,focus_role,focus_name,limitations) VALUES(?1,?2,?3,?4,?5,?6)",
        params![id, window.observed_ms, window.window_session_id, window.focus_role, window.focus_name, limitations],
    )?;
    tx.commit()?;
    load_source(db, id, 0.0)?.context("touched snapshot missing")
}

/// Key under which two chunks share one vector point: same app and domain, same text up to case and
/// whitespace, and, when the embedded text carries the page title, the same title.
pub fn chunk_key(prefix_mode: prefix::Prefix, app: &str, domain: Option<&str>, title: &str, body: &str) -> String {
    let norm = body.to_lowercase().split_whitespace().collect::<Vec<_>>().join(" ");
    let title = if prefix_mode == prefix::Prefix::None { "" } else { title };
    digest(&format!("{app}\0{}\0{title}\0{norm}", domain.unwrap_or("")))
}

/// Every snapshot that shares the point of chunk `canonical`, with the earliest first sighting and the
/// latest last sighting among them. Includes the canonical chunk's own snapshot.
pub fn sharing(db: &Connection, canonical: i64) -> Result<(i64, i64, Vec<i64>)> {
    let mut stmt = db.prepare(
        "SELECT s.id,s.first_seen_ms,s.last_seen_ms FROM chunks ch JOIN snapshots s ON s.id=ch.snapshot_id WHERE ch.id=?1 OR ch.dup_of=?1",
    )?;
    let rows = stmt
        .query_map([canonical], |r| Ok((r.get::<_, i64>(0)?, r.get::<_, i64>(1)?, r.get::<_, i64>(2)?)))?
        .collect::<rusqlite::Result<Vec<_>>>()?;
    let first = rows.iter().map(|r| r.1).min().unwrap_or(0);
    let last = rows.iter().map(|r| r.2).max().unwrap_or(0);
    let mut ids: Vec<i64> = rows.iter().map(|r| r.0).collect();
    ids.sort_unstable();
    ids.dedup();
    Ok((first, last, ids))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn node(role: &str, value: &str, bounds_x: i64) -> AxNode {
        let mut extra = serde_json::Map::new();
        extra.insert("bounds".into(), json!({"x": bounds_x}));
        extra.insert("visible".into(), json!(bounds_x % 2 == 0));
        extra.insert("ancestor_path".into(), json!([{"role": "AXWebArea", "name": "page"}]));
        AxNode { role: role.into(), name: None, value: Some(value.into()), extra }
    }

    fn window(roots: Vec<AxNode>) -> AxWindow {
        AxWindow {
            app_id: "com.example".into(),
            window_session_id: "w".into(),
            title: "Page".into(),
            observed_ms: 1,
            focus_role: None,
            focus_name: None,
            roots,
        }
    }

    #[test]
    fn tree_key_ignores_bounds_and_visibility_but_not_text_or_page() {
        let a = tree_key(&window(vec![node("AXStaticText", "hello world", 1)]), Some("https://x.test/a"));
        let b = tree_key(&window(vec![node("AXStaticText", "hello world", 400)]), Some("https://x.test/a"));
        assert_eq!(a, b, "scrolling changes bounds only");
        assert_ne!(a, tree_key(&window(vec![node("AXStaticText", "hello world!", 1)]), Some("https://x.test/a")));
        assert_ne!(a, tree_key(&window(vec![node("AXStaticText", "hello world", 1)]), Some("https://x.test/b")));
    }

    #[test]
    fn chunk_key_ignores_case_and_whitespace_but_not_app_or_domain() {
        let k = |app: &str, dom: Option<&str>, body: &str| chunk_key(prefix::Prefix::None, app, dom, "t", body);
        assert_eq!(k("a", Some("d"), "Total:  42 EUR"), k("a", Some("d"), "total: 42\neur"));
        assert_ne!(k("a", Some("d"), "total 42"), k("a", Some("d"), "total 43"));
        assert_ne!(k("a", Some("d"), "x"), k("b", Some("d"), "x"));
        assert_ne!(k("a", Some("d"), "x"), k("a", Some("e"), "x"));
    }

    fn db() -> Connection {
        let dir = std::env::temp_dir().join(format!("om-dedup-test-{}-{:?}", std::process::id(), std::thread::current().id()));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        open_db(&dir).unwrap()
    }

    #[test]
    fn near_identical_recapture_is_one_snapshot_but_changed_amount_is_not() {
        let mut db = db();
        // A changed amount is never merged, however similar the rest.
        let long = "Invoice payment reminder from the billing team about the open balance on your account, please review it and pay by the date shown below to avoid any late fee or service interruption";
        let mut a = window(vec![node("AXStaticText", &format!("{long} 100"), 1)]);
        a.observed_ms = 10_000;
        let mut b = window(vec![node("AXStaticText", &format!("{long} 200"), 1)]);
        b.observed_ms = 20_000;
        let (ia, _, _) = record_with_target(&mut db, &a, Some("https://x.test/inv".into()), None, None, &cleaner::DEFAULT_CFG).unwrap();
        let (ib, newb, _) = record_with_target(&mut db, &b, Some("https://x.test/inv".into()), None, None, &cleaner::DEFAULT_CFG).unwrap();
        assert_ne!(ia, ib, "100 vs 200 must stay two snapshots");
        assert!(newb);
        // The same text with only an uncapitalised word added merges into the earlier snapshot.
        let mut c = window(vec![node("AXStaticText", &format!("{long} 100 ok"), 1)]);
        c.observed_ms = 30_000;
        let (ic, newc, _) = record_with_target(&mut db, &c, Some("https://x.test/inv".into()), None, None, &cleaner::DEFAULT_CFG).unwrap();
        assert!(!newc, "near-identical recapture must not be a new snapshot");
        assert_eq!(ic, ia, "it joins the latest matching snapshot of the page");
    }

    #[test]
    fn same_tree_again_skips_cleaning_and_stores_nothing_new() {
        let mut db = db();
        let mut w = window(vec![node("AXStaticText", "A page with some words in it that is long enough to keep", 1)]);
        w.observed_ms = 5_000;
        let (id, new, _) = record_with_target(&mut db, &w, Some("https://x.test/p".into()), None, None, &cleaner::DEFAULT_CFG).unwrap();
        assert!(new);
        let mut again = window(vec![node("AXStaticText", "A page with some words in it that is long enough to keep", 900)]);
        again.observed_ms = 9_000;
        let (id2, new2, source) = record_with_target(&mut db, &again, Some("https://x.test/p".into()), None, None, &cleaner::DEFAULT_CFG).unwrap();
        assert_eq!((id2, new2), (id, false));
        assert_eq!(source.sightings, 2);
        assert_eq!(source.last_seen_ms, 9_000);
        let versions: i64 = db.query_row("SELECT COUNT(*) FROM raw_versions", [], |r| r.get(0)).unwrap();
        assert_eq!(versions, 1, "an unchanged tree stores no second raw version");
        let observations: i64 = db.query_row("SELECT COUNT(*) FROM observations", [], |r| r.get(0)).unwrap();
        assert_eq!(observations, 2);
    }
}
