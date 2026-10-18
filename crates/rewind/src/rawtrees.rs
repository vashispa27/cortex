//! Retention of raw Accessibility trees.
//!
//! A tree is only needed to re-clean a snapshot after the cleaner improves (`capture --apply-cleaning`).
//! Search runs on the cleaned body, chunks and vectors. Trees are by far the largest data in the database
//! (about 94% of it) and hold everything that was on screen, including what the cleaner discards, so they are
//! deleted once a snapshot has not been seen for `RETENTION_DAYS` (default 7). The snapshot, its body, chunks
//! and vectors stay and stay searchable; it just cannot be re-cleaned any more.
//!
//! `REWIND_RAW_TREE_DAYS=<n>` changes the window, `REWIND_RAW_TREE_DAYS=forever` keeps trees (development builds that
//! export captures for evals).

use super::*;

pub const DEFAULT_DAYS: i64 = 7;
const DAY_MS: i64 = 86_400_000;

/// `None` means keep trees forever.
pub fn retention_days() -> Option<i64> {
    match env::var("REWIND_RAW_TREE_DAYS") {
        Ok(v) if v.eq_ignore_ascii_case("forever") || v.eq_ignore_ascii_case("off") => None,
        Ok(v) => v.parse::<i64>().ok().filter(|d| *d >= 0).or(Some(DEFAULT_DAYS)),
        Err(_) => Some(DEFAULT_DAYS),
    }
}

#[derive(Debug, Default, PartialEq, Eq)]
pub struct Report {
    pub snapshots: usize,
    pub raw_versions: usize,
    pub bytes: i64,
}

/// What would be (or, with `apply`, is) deleted: trees of snapshots last seen before `cutoff_ms`.
pub fn purge(db: &mut Connection, cutoff_ms: i64, apply: bool) -> Result<Report> {
    let snapshots: i64 = db.query_row("SELECT COUNT(*) FROM snapshots WHERE last_seen_ms<?1 AND ax_nodes_json!='[]'", [cutoff_ms], |r| r.get(0))?;
    let versions: i64 = db.query_row("SELECT COUNT(*) FROM raw_versions WHERE snapshot_id IN (SELECT id FROM snapshots WHERE last_seen_ms<?1)", [cutoff_ms], |r| r.get(0))?;
    let bytes: i64 = db.query_row(
        "SELECT COALESCE((SELECT SUM(length(CAST(ax_nodes_json AS BLOB))) FROM snapshots WHERE last_seen_ms<?1 AND ax_nodes_json!='[]'),0) + COALESCE((SELECT SUM(length(CAST(ax_nodes_json AS BLOB))) FROM raw_versions WHERE snapshot_id IN (SELECT id FROM snapshots WHERE last_seen_ms<?1)),0)",
        [cutoff_ms],
        |r| r.get(0),
    )?;
    if apply {
        let tx = db.transaction()?;
        tx.execute("UPDATE snapshots SET ax_nodes_json='[]' WHERE last_seen_ms<?1 AND ax_nodes_json!='[]'", [cutoff_ms])?;
        tx.execute("DELETE FROM raw_versions WHERE snapshot_id IN (SELECT id FROM snapshots WHERE last_seen_ms<?1)", [cutoff_ms])?;
        tx.commit()?;
    }
    Ok(Report { snapshots: snapshots as usize, raw_versions: versions as usize, bytes })
}

/// Applies the configured retention as of `now_ms`. Does nothing when trees are kept forever.
pub fn purge_expired(db: &mut Connection, now_ms: i64) -> Result<Report> {
    match retention_days() {
        Some(days) => purge(db, now_ms - days * DAY_MS, true),
        None => Ok(Report::default()),
    }
}

/// Gives deleted pages back to the file system. SQLite does not shrink the file by itself.
/// Only worth doing when at least `min_free_bytes` of the file is free pages.
pub fn reclaim(db: &Connection, min_free_bytes: i64) -> Result<bool> {
    let free: i64 = db.query_row("SELECT freelist_count*page_size FROM pragma_freelist_count, pragma_page_size", [], |r| r.get(0))?;
    if free < min_free_bytes {
        return Ok(false);
    }
    db.execute_batch("PRAGMA wal_checkpoint(TRUNCATE); VACUUM; PRAGMA wal_checkpoint(TRUNCATE);")?;
    Ok(true)
}

pub fn run_cli(state: &Path, args: &[String]) -> Result<()> {
    let mut days = retention_days().unwrap_or(DEFAULT_DAYS);
    let mut apply = false;
    let mut iter = args.iter();
    while let Some(a) = iter.next() {
        match a.as_str() {
            "--yes" => apply = true,
            "--days" => days = iter.next().and_then(|v| v.parse().ok()).context("--days needs a number")?,
            other => bail!("unknown option {other}; usage: rewind raw-trees [--days N] [--yes]"),
        }
    }
    if UnixStream::connect(state.join("capture.sock")).is_ok() {
        bail!("stop the capture process first");
    }
    let mut db = open_db(state)?;
    let report = purge(&mut db, now_ms() - days * DAY_MS, apply)?;
    println!(
        "{} {} raw trees ({} older snapshot versions, {:.1} MB) of snapshots not seen for {days} days. Bodies, chunks and vectors are kept.",
        if apply { "Deleted" } else { "Would delete" },
        report.snapshots,
        report.raw_versions,
        report.bytes as f64 / 1e6
    );
    if apply {
        let shrunk = reclaim(&db, 0)?;
        println!("{}", if shrunk { "Database file compacted." } else { "Nothing to compact." });
    } else {
        println!("Dry run. Add --yes to delete.");
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn db() -> Connection {
        let dir = std::env::temp_dir().join(format!("om-rawtrees-test-{}-{:?}", std::process::id(), std::thread::current().id()));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        open_db(&dir).unwrap()
    }

    fn window(text: &str, at: i64) -> AxWindow {
        let mut extra = serde_json::Map::new();
        extra.insert("ancestor_path".into(), json!([{"role": "AXWebArea", "name": "page"}]));
        AxWindow {
            app_id: "com.example".into(),
            window_session_id: "w".into(),
            title: "Page".into(),
            observed_ms: at,
            focus_role: None,
            focus_name: None,
            roots: vec![AxNode { role: "AXStaticText".into(), name: None, value: Some(text.into()), extra }],
        }
    }

    #[test]
    fn purge_removes_old_trees_but_keeps_body_chunks_and_search() {
        let mut db = db();
        let old = record_with_target(&mut db, &window("An old page with enough words to be kept as a body", 1_000), Some("https://x.test/old".into()), None, None, &cleaner::DEFAULT_CFG).unwrap().0;
        let recent = record_with_target(&mut db, &window("A recent page with other words that stays complete", 9_000_000), Some("https://x.test/new".into()), None, None, &cleaner::DEFAULT_CFG).unwrap().0;
        let dry = purge(&mut db, 5_000_000, false).unwrap();
        assert_eq!((dry.snapshots, dry.raw_versions), (1, 1));
        let tree = |db: &Connection, id: i64| -> String { db.query_row("SELECT ax_nodes_json FROM snapshots WHERE id=?1", [id], |r| r.get(0)).unwrap() };
        assert_ne!(tree(&db, old), "[]", "a dry run deletes nothing");
        let done = purge(&mut db, 5_000_000, true).unwrap();
        assert_eq!(done, dry);
        assert_eq!(tree(&db, old), "[]");
        assert_ne!(tree(&db, recent), "[]", "recently seen snapshots keep their tree");
        let (body, searchable): (String, i64) = db.query_row("SELECT body,searchable FROM snapshots WHERE id=?1", [old], |r| Ok((r.get(0)?, r.get(1)?))).unwrap();
        assert!(body.contains("old page") && searchable == 1);
        let chunks: i64 = db.query_row("SELECT COUNT(*) FROM chunks WHERE snapshot_id=?1", [old], |r| r.get(0)).unwrap();
        assert!(chunks > 0);
        let versions: i64 = db.query_row("SELECT COUNT(*) FROM raw_versions WHERE snapshot_id=?1", [old], |r| r.get(0)).unwrap();
        assert_eq!(versions, 0);
        assert_eq!(stale_count(&db).unwrap(), 0, "a purged snapshot on an older cleaner is legacy, not stale");
    }

    #[test]
    fn stale_counts_only_snapshots_that_can_be_re_cleaned() {
        let mut db = db();
        let id = record_with_target(&mut db, &window("A page whose body came from an older cleaner version", 1_000), Some("https://x.test/a".into()), None, None, &cleaner::DEFAULT_CFG).unwrap().0;
        db.execute("UPDATE snapshots SET cleaner_version=cleaner_version-1 WHERE id=?1", [id]).unwrap();
        assert_eq!(stale_count(&db).unwrap(), 1);
        purge(&mut db, i64::MAX, true).unwrap();
        assert_eq!(stale_count(&db).unwrap(), 0);
    }

    #[test]
    fn retention_defaults_to_seven_days() {
        assert_eq!(DEFAULT_DAYS, 7);
    }
}
