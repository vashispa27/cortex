//! Storage for structure-aware chunking (see segment.rs): items, the snapshots they were seen in, and the
//! chunks cut from new items.
//!
//! An item seen before is not stored, chunked or embedded again; only a sighting is added. A chunk belongs
//! to the snapshot that first held its items (`chunks.snapshot_id`), and `chunk_snapshots` resolves it to
//! every snapshot that held all of them, which is what retrieval, citations and the evals speak.

use super::*;
use segment::{Item, Segmentation};

#[derive(Debug, Default, PartialEq, Eq)]
pub struct Ingested {
    pub items: usize,
    pub new_items: usize,
    pub chunks: usize,
}

pub struct ChunkMeta {
    pub header: String,
    pub kind: Option<String>,
    pub author: Option<String>,
    pub time: Option<String>,
    pub container: Option<String>,
}

/// Records the sighting of every item of `seg` in `snapshot_id` and stores the new ones with their chunks.
pub fn ingest(db: &Connection, snapshot_id: i64, observed_ms: i64, app: &str, seg: &Segmentation) -> Result<Ingested> {
    let mut report = Ingested { items: seg.items.len(), ..Ingested::default() };
    let mut fresh: Vec<(usize, i64)> = Vec::new();
    for (n, item) in seg.items.iter().enumerate() {
        let key = segment::identity(app, seg.site, item);
        let known: Option<i64> = db.query_row("SELECT id FROM items WHERE item_key=?1", [&key], |r| r.get(0)).optional()?;
        if let Some(id) = known {
            let added = db.execute("INSERT OR IGNORE INTO item_sightings(item_id,snapshot_id) VALUES(?1,?2)", params![id, snapshot_id])?;
            if added > 0 {
                db.execute("UPDATE items SET last_seen_ms=MAX(last_seen_ms,?2),sightings=sightings+1 WHERE id=?1", params![id, observed_ms])?;
                // The vector point of its chunks must now cover this snapshot too.
                db.execute("UPDATE chunks SET payload_dirty=1 WHERE id IN (SELECT chunk_id FROM chunk_items WHERE item_id=?1)", [id])?;
            }
            continue;
        }
        db.execute(
            "INSERT INTO items(item_key,site,kind,container,author,handle,displayed_time,body,first_seen_ms,last_seen_ms) VALUES(?1,?2,?3,?4,?5,?6,?7,?8,?9,?9)",
            params![key, seg.site.name(), item.kind.name(), item.container, item.author, item.handle, item.time, item.text(), observed_ms],
        )?;
        let id = db.last_insert_rowid();
        db.execute("INSERT INTO item_sightings(item_id,snapshot_id) VALUES(?1,?2)", params![id, snapshot_id])?;
        fresh.push((n, id));
    }
    report.new_items = fresh.len();
    let refs: Vec<&Item> = fresh.iter().map(|(n, _)| &seg.items[*n]).collect();
    let base: i64 = db.query_row("SELECT COUNT(*) FROM chunks WHERE snapshot_id=?1", [snapshot_id], |r| r.get(0))?;
    for (k, planned) in segment::plan(seg.site, &refs, cleaner::CHUNK_TARGET_BYTES).iter().enumerate() {
        let ordinal = base + k as i64;
        db.execute(
            "INSERT INTO chunks(snapshot_id,start_byte,end_byte,body,kind,author,displayed_time,container,header) VALUES(?1,?2,?3,?4,?5,?6,?7,?8,?9)",
            params![snapshot_id, ordinal, ordinal + 1, planned.body, planned.kind.name(), planned.author, planned.time, planned.container, planned.header],
        )?;
        let chunk_id = db.last_insert_rowid();
        for (order, &index) in planned.items.iter().enumerate() {
            db.execute("INSERT OR IGNORE INTO chunk_items(chunk_id,item_id,ord) VALUES(?1,?2,?3)", params![chunk_id, fresh[index].1, order as i64])?;
        }
        report.chunks += 1;
    }
    Ok(report)
}

pub fn chunk_meta(db: &Connection, chunk_id: i64) -> Result<Option<ChunkMeta>> {
    Ok(db
        .query_row("SELECT header,kind,author,displayed_time,container FROM chunks WHERE id=?1 AND header IS NOT NULL", [chunk_id], |r| {
            Ok(ChunkMeta { header: r.get(0)?, kind: r.get(1)?, author: r.get(2)?, time: r.get(3)?, container: r.get(4)? })
        })
        .optional()?)
}

/// Snapshots that held every item of the chunk, most recently seen first. Falls back to the snapshot that
/// created the chunk.
pub fn chunk_snapshots(db: &Connection, chunk_id: i64) -> Result<Vec<i64>> {
    let mut stmt = db.prepare(
        "SELECT s.id FROM item_sightings x JOIN snapshots s ON s.id=x.snapshot_id \
         WHERE x.item_id IN (SELECT item_id FROM chunk_items WHERE chunk_id=?1) \
         GROUP BY s.id HAVING COUNT(DISTINCT x.item_id)=(SELECT COUNT(*) FROM chunk_items WHERE chunk_id=?1) \
         ORDER BY s.last_seen_ms DESC, s.id DESC",
    )?;
    let ids = stmt.query_map([chunk_id], |r| r.get::<_, i64>(0))?.collect::<rusqlite::Result<Vec<_>>>()?;
    if !ids.is_empty() {
        return Ok(ids);
    }
    Ok(db.query_row("SELECT snapshot_id FROM chunks WHERE id=?1", [chunk_id], |r| r.get::<_, i64>(0)).optional()?.into_iter().collect())
}

/// What the chunk's vector point carries so filters find it: every snapshot that held any of its items and
/// the span of their observations. Wider than `chunk_snapshots`; retrieval narrows it afterwards.
pub fn payload_snapshots(db: &Connection, chunk_id: i64) -> Result<(i64, i64, Vec<i64>)> {
    let mut stmt = db.prepare(
        "SELECT DISTINCT s.id,s.first_seen_ms,s.last_seen_ms FROM item_sightings x JOIN snapshots s ON s.id=x.snapshot_id \
         WHERE x.item_id IN (SELECT item_id FROM chunk_items WHERE chunk_id=?1)",
    )?;
    let rows = stmt
        .query_map([chunk_id], |r| Ok((r.get::<_, i64>(0)?, r.get::<_, i64>(1)?, r.get::<_, i64>(2)?)))?
        .collect::<rusqlite::Result<Vec<_>>>()?;
    let first = rows.iter().map(|r| r.1).min().unwrap_or(0);
    let last = rows.iter().map(|r| r.2).max().unwrap_or(0);
    let mut ids: Vec<i64> = rows.iter().map(|r| r.0).collect();
    ids.sort_unstable();
    Ok((first, last, ids))
}

pub fn has_items(db: &Connection) -> Result<bool> {
    Ok(db.query_row("SELECT EXISTS(SELECT 1 FROM items)", [], |r| r.get(0))?)
}

/// `cortex segment-archive <dir>`: re-ingests the stored raw trees of a marked copy of the eval archive
/// through the item path, in observation order, and rebuilds its index. Snapshot ids and observations are
/// kept, so the gold set (which names snapshots) applies unchanged. The source archive is never touched:
/// `evals/tools/prepare_segment_archive.py` makes the copy and the marker.
pub fn rebuild_archive(args: &[String]) -> Result<()> {
    let [dir] = args else { bail!("usage: cortex segment-archive <marked copy of the eval archive>") };
    let state = PathBuf::from(dir).canonicalize()?;
    if state.to_string_lossy().contains("local-memory") {
        bail!("refusing to touch local-memory");
    }
    if !state.join(".cortex-segments-copy").is_file() {
        bail!("{} is not a marked segments copy (run evals/tools/prepare_segment_archive.py)", state.display());
    }
    segment::activate();
    let mut db = open_db(&state)?;
    let snapshots = {
        let mut stmt = db.prepare("SELECT id,url,body FROM snapshots ORDER BY id")?;
        let found = stmt
            .query_map([], |r| Ok((r.get::<_, i64>(0)?, r.get::<_, Option<String>>(1)?, r.get::<_, String>(2)?)))?
            .collect::<rusqlite::Result<Vec<_>>>()?;
        found
    };
    // Every stored raw tree, oldest observation first; a snapshot without versions uses its own tree.
    let mut trees = {
        let mut stmt = db.prepare("SELECT snapshot_id,observed_ms,ax_nodes_json FROM raw_versions UNION ALL SELECT s.id,s.first_seen_ms,s.ax_nodes_json FROM snapshots s WHERE s.id NOT IN (SELECT snapshot_id FROM raw_versions) AND s.ax_nodes_json!='[]'")?;
        let found = stmt
            .query_map([], |r| Ok((r.get::<_, i64>(0)?, r.get::<_, i64>(1)?, r.get::<_, String>(2)?)))?
            .collect::<rusqlite::Result<Vec<_>>>()?;
        found
    };
    trees.sort_by_key(|(id, observed, _)| (*observed, *id));
    let before: (i64, i64) = db.query_row("SELECT COUNT(*),COALESCE(SUM(dup_of IS NULL),0) FROM chunks", [], |r| Ok((r.get(0)?, r.get(1)?)))?;
    let derived: i64 = db.query_row("SELECT COUNT(*) FROM derived", [], |r| r.get(0))?;
    let tx = db.transaction()?;
    tx.execute_batch("DELETE FROM chunk_items; DELETE FROM item_sightings; DELETE FROM items; DELETE FROM chunks; UPDATE snapshots SET indexed=0,embedding_model=NULL; UPDATE derived SET indexed=0;")?;
    let mut segmented = std::collections::HashSet::<i64>::new();
    let (mut total_items, mut new_items, mut item_chunks) = (0_usize, 0_usize, 0_usize);
    let url_of: std::collections::HashMap<i64, Option<String>> = snapshots.iter().map(|(id, url, _)| (*id, url.clone())).collect();
    let app_of = |id: i64| -> rusqlite::Result<String> { tx.query_row("SELECT app_id FROM snapshots WHERE id=?1", [id], |r| r.get(0)) };
    for (id, observed, json) in &trees {
        let nodes: Vec<AxNode> = serde_json::from_str(json).with_context(|| format!("invalid AX JSON for snapshot #{id}"))?;
        if let Some(seg) = segment::segment(&nodes, url_of[id].as_deref()) {
            let report = ingest(&tx, *id, *observed, &app_of(*id)?, &seg)?;
            total_items += report.items;
            new_items += report.new_items;
            item_chunks += report.chunks;
            segmented.insert(*id);
        }
    }
    let mut page_chunks = 0_usize;
    for (id, _, body) in &snapshots {
        if segmented.contains(id) || body.is_empty() {
            continue;
        }
        for (start, end, text) in cleaner::chunks_cfg(body, &cleaner::DEFAULT_CFG) {
            tx.execute("INSERT INTO chunks(snapshot_id,start_byte,end_byte,body) VALUES(?1,?2,?3,?4)", params![id, start as i64, end as i64, text])?;
            page_chunks += 1;
        }
    }
    tx.commit()?;
    drop(db);
    let mut runtime = open_runtime_with(&state, true, None, prefix::Prefix::DEFAULT)?;
    while runtime.index_pending()? > 0 {}
    let db = &runtime.db;
    let count = |sql: &str| -> Result<i64> { Ok(db.query_row(sql, [], |r| r.get(0))?) };
    let report = json!({
        "snapshots": snapshots.len(),
        "snapshots_segmented": segmented.len(),
        "snapshots_page_chunked": snapshots.len() - segmented.len(),
        "raw_trees": trees.len(),
        "items_seen": total_items,
        "items_stored": new_items,
        "distinct_items": count("SELECT COUNT(*) FROM items")?,
        "sightings": count("SELECT COUNT(*) FROM item_sightings")?,
        "chunks_before": before.0,
        "chunks_after": count("SELECT COUNT(*) FROM chunks")?,
        "item_chunks": item_chunks,
        "page_chunks": page_chunks,
        "points_before": before.1 + derived,
        "points_after": count("SELECT COUNT(*) FROM chunks WHERE dup_of IS NULL")? + count("SELECT COUNT(*) FROM derived")?,
        "index_version": prefix::index_version(runtime.prefix),
    });
    println!("{}", serde_json::to_string_pretty(&report)?);
    Ok(())
}

/// `cortex segment-report <archive> [--items]`: what the segmenter makes of every LinkedIn and X snapshot of
/// an archive, as Markdown on stdout. Opens the database read-only. `--items` also prints every item, which
/// contains real text: keep the output under evals/private.
pub fn report(args: &[String]) -> Result<()> {
    let dir = args.iter().find(|a| !a.starts_with("--")).context("usage: cortex segment-report <archive> [--items]")?;
    let show_items = args.iter().any(|a| a == "--items");
    let dir = PathBuf::from(dir).canonicalize()?;
    if dir.to_string_lossy().contains("local-memory") {
        bail!("refusing to read local-memory");
    }
    let db = Connection::open_with_flags(dir.join("memory.sqlite3"), rusqlite::OpenFlags::SQLITE_OPEN_READ_ONLY)?;
    let rows = {
        let mut stmt = db.prepare("SELECT id,url,title,ax_nodes_json FROM snapshots ORDER BY id")?;
        let found = stmt
            .query_map([], |r| Ok((r.get::<_, i64>(0)?, r.get::<_, Option<String>>(1)?, r.get::<_, String>(2)?, r.get::<_, String>(3)?)))?
            .collect::<rusqlite::Result<Vec<_>>>()?;
        found
    };
    let kinds = [segment::Kind::Message, segment::Kind::Preview, segment::Kind::Post, segment::Kind::Profile, segment::Kind::Other];
    let mut out = String::new();
    out.push_str("| snapshot | page | nodes | message | preview | post | profile | other | noise % | other % | unclaimed % | result |\n|---|---|---|---|---|---|---|---|---|---|---|---|\n");
    let mut total: std::collections::BTreeMap<&'static str, usize> = std::collections::BTreeMap::new();
    let (mut supported, mut fell_back) = (0, 0);
    let mut details = String::new();
    for (id, url, _title, json) in rows {
        let Some((site, path)) = segment::site_of(url.as_deref()) else { continue };
        let nodes: Vec<AxNode> = serde_json::from_str(&json)?;
        supported += 1;
        let page = format!("{}{}", site.name(), path.chars().take(24).collect::<String>());
        match segment::segment(&nodes, url.as_deref()) {
            None => {
                fell_back += 1;
                out.push_str(&format!("| {id} | {page} | {} | | | | | | | | | fallback to page chunks |\n", nodes.len()));
            }
            Some(seg) => {
                let count = |k: segment::Kind| seg.items.iter().filter(|i| i.kind == k).count();
                let sum: usize = seg.stats.chars.values().sum::<usize>().max(1);
                let share = |k: &str| 100.0 * seg.stats.chars.get(k).copied().unwrap_or(0) as f64 / sum as f64;
                for (k, v) in &seg.stats.chars {
                    *total.entry(k).or_default() += v;
                }
                out.push_str(&format!(
                    "| {id} | {page} | {} | {} | {} | {} | {} | {} | {:.0} | {:.0} | {:.0} | items |\n",
                    nodes.len(), count(kinds[0]), count(kinds[1]), count(kinds[2]), count(kinds[3]), count(kinds[4]), share("noise"), share("other"), share("unclaimed")
                ));
                if show_items {
                    details.push_str(&format!("\n### snapshot {id} ({page})\n"));
                    details.push_str(&format!("- unclaimed text: {}\n", seg.stats.unclaimed.join(" | ")));
                    for item in &seg.items {
                        details.push_str(&format!(
                            "- **{}** {} {} {} [{}] {}\n",
                            item.kind.name(),
                            item.author.as_deref().unwrap_or("-"),
                            item.handle.as_deref().unwrap_or(""),
                            item.time.as_deref().unwrap_or("-"),
                            item.container,
                            item.text().replace('\n', " / ").chars().take(160).collect::<String>()
                        ));
                    }
                }
            }
        }
    }
    let sum: usize = total.values().sum::<usize>().max(1);
    out.push_str(&format!("\nSupported pages: {supported}; fell back to page chunks: {fell_back}.\n\nShare of text characters over the pages that segmented:\n\n"));
    for (k, v) in &total {
        out.push_str(&format!("- {k}: {:.1}% ({v} chars)\n", 100.0 * *v as f64 / sum as f64));
    }
    print!("{out}{details}");
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use segment::tests::{feed_post, linkedin_thread};

    const THREAD: &str = "https://www.linkedin.com/messaging/thread/2-abc/";

    fn db() -> Connection {
        let dir = std::env::temp_dir().join(format!("om-items-test-{}-{:?}", std::process::id(), std::thread::current().id()));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        open_db(&dir).unwrap()
    }

    fn window(roots: Vec<AxNode>, observed_ms: i64) -> AxWindow {
        AxWindow { app_id: "com.google.Chrome".into(), window_session_id: "w".into(), title: "Messaging | LinkedIn".into(), observed_ms, focus_role: None, focus_name: None, roots }
    }

    fn count(db: &Connection, sql: &str) -> i64 {
        db.query_row(sql, [], |r| r.get(0)).unwrap()
    }

    fn record(db: &mut Connection, roots: Vec<AxNode>, url: &str, at: i64) -> (i64, bool) {
        let (id, new, _) = record_with_target(db, &window(roots, at), Some(url.into()), None, None, &cleaner::DEFAULT_CFG).unwrap();
        (id, new)
    }

    const M1: (&str, &str, &[&str]) = ("Pat Quill", "10:08 PM", &["Hey, saw your profile"]);
    const M2: (&str, &str, &[&str]) = ("Sam Test", "10:12 PM", &["Sure, tomorrow at 1pm"]);
    const M3: (&str, &str, &[&str]) = ("Pat Quill", "10:14 PM", &["Great, call me on 98765 43210"]);
    const M4: (&str, &str, &[&str]) = ("Sam Test", "10:15 PM", &["Will do"]);

    #[test]
    fn a_thread_scrolled_by_one_message_stores_only_the_new_message() {
        segment::force(true);
        let mut db = db();
        let (first, _) = record(&mut db, linkedin_thread(&[], &[M1, M2, M3]), THREAD, 1_000);
        assert_eq!(count(&db, "SELECT COUNT(*) FROM items"), 6, "2 previews, the card, 3 messages");
        assert_eq!(count(&db, "SELECT COUNT(*) FROM chunks"), 3, "previews, card, one group of messages");
        let (second, new) = record(&mut db, linkedin_thread(&[], &[M2, M3, M4]), THREAD, 2_000);
        assert!(new && second != first, "the visible text differs, so the snapshot is new");
        assert_eq!(count(&db, "SELECT COUNT(*) FROM items"), 7, "only the new message is added");
        assert_eq!(count(&db, "SELECT COUNT(*) FROM chunks"), 4);
        assert_eq!(count(&db, "SELECT COUNT(*) FROM item_sightings"), 6 + 6);
        let header: String = db.query_row("SELECT header FROM chunks WHERE kind='message' ORDER BY id DESC LIMIT 1", [], |r| r.get(0)).unwrap();
        assert_eq!(header, "LinkedIn chat with Pat Quill · Sam Test, FRIDAY 10:15 PM");
        // The group of the first capture was seen whole only there; the list of previews was seen in both.
        let first_group: i64 = db.query_row("SELECT id FROM chunks WHERE kind='message' ORDER BY id LIMIT 1", [], |r| r.get(0)).unwrap();
        assert_eq!(chunk_snapshots(&db, first_group).unwrap(), vec![first]);
        let previews: i64 = db.query_row("SELECT id FROM chunks WHERE kind='preview'", [], |r| r.get(0)).unwrap();
        assert_eq!(chunk_snapshots(&db, previews).unwrap(), vec![second, first], "most recent first");
        // Its vector point has to cover the new snapshot; the next indexing pass does that.
        assert_eq!(count(&db, "SELECT payload_dirty FROM chunks WHERE kind='preview'"), 1);
        let (seen_first, seen_last, ids) = payload_snapshots(&db, previews).unwrap();
        assert_eq!((seen_first, seen_last, ids), (1_000, 2_000, vec![first, second]));
        segment::force(false);
    }

    #[test]
    fn an_unchanged_chat_with_a_changed_list_adds_no_message_items() {
        segment::force(true);
        let mut db = db();
        record(&mut db, linkedin_thread(&[], &[M1, M2]), THREAD, 1_000);
        let messages_before = count(&db, "SELECT COUNT(*) FROM items WHERE kind='message'");
        record(&mut db, linkedin_thread(&[("Lee Ng", "9:01 AM", "Lee: lunch?")], &[M1, M2]), THREAD, 2_000);
        assert_eq!(count(&db, "SELECT COUNT(*) FROM items WHERE kind='message'"), messages_before);
        assert_eq!(count(&db, "SELECT COUNT(*) FROM items WHERE kind='preview'"), 3, "only the new preview row is added");
        segment::force(false);
    }

    #[test]
    fn a_feed_scrolled_by_two_posts_adds_exactly_the_new_posts() {
        segment::force(true);
        let mut db = db();
        let posts = |range: std::ops::Range<usize>| -> Vec<AxNode> {
            range.flat_map(|i| feed_post(i, &format!("Author {i}"), "Headline", "1h", &[&format!("Post number {i} has something to say.")], false)).collect()
        };
        record(&mut db, posts(1..4), "https://www.linkedin.com/feed/", 1_000);
        assert_eq!(count(&db, "SELECT COUNT(*) FROM items WHERE kind='post'"), 3);
        record(&mut db, posts(3..6), "https://www.linkedin.com/feed/", 2_000);
        assert_eq!(count(&db, "SELECT COUNT(*) FROM items WHERE kind='post'"), 5);
        assert_eq!(count(&db, "SELECT COUNT(*) FROM chunks WHERE kind='post'"), 5, "a post is one chunk");
        let shared: i64 = db.query_row("SELECT id FROM chunks WHERE body LIKE '%number 3%'", [], |r| r.get(0)).unwrap();
        assert_eq!(chunk_snapshots(&db, shared).unwrap().len(), 2, "the post both captures showed resolves to both snapshots");
        segment::force(false);
    }

    #[test]
    fn unsupported_pages_and_the_flag_off_keep_todays_chunks() {
        let page = vec![segment::tests::n("AXStaticText", "A long enough sentence about nothing in particular, so the cleaner keeps it.", &[("AXWebArea", "Docs")])];
        let expected = cleaner::chunks(&cleaner::clean(&page, "com.google.Chrome", Some("https://example.test/a"), "Docs").body);
        for forced in [true, false] {
            segment::force(forced);
            let mut db = db();
            let (id, _) = record(&mut db, page.clone(), "https://example.test/a", 1_000);
            let stored: Vec<(i64, i64, String)> = {
                let mut stmt = db.prepare("SELECT start_byte,end_byte,body FROM chunks WHERE snapshot_id=?1 ORDER BY id").unwrap();
                let rows = stmt.query_map([id], |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?))).unwrap().collect::<rusqlite::Result<Vec<_>>>().unwrap();
                rows
            };
            let want: Vec<(i64, i64, String)> = expected.iter().map(|(a, b, t)| (*a as i64, *b as i64, t.clone())).collect();
            assert_eq!(stored, want);
            assert_eq!(count(&db, "SELECT COUNT(*) FROM items"), 0);
        }
        // A supported site with the flag off is still page chunked, byte for byte.
        segment::force(false);
        let mut db = db();
        let roots = linkedin_thread(&[], &[M1, M2]);
        let body = cleaner::clean(&roots, "com.google.Chrome", Some(THREAD), "Messaging | LinkedIn").body;
        let (id, _) = record(&mut db, roots, THREAD, 1_000);
        let stored: Vec<String> = {
            let mut stmt = db.prepare("SELECT body FROM chunks WHERE snapshot_id=?1 ORDER BY id").unwrap();
            let rows = stmt.query_map([id], |r| r.get(0)).unwrap().collect::<rusqlite::Result<Vec<String>>>().unwrap();
            rows
        };
        assert_eq!(stored, cleaner::chunks(&body).into_iter().map(|c| c.2).collect::<Vec<_>>());
        assert_eq!(count(&db, "SELECT COUNT(*) FROM items"), 0);
        assert_eq!(count(&db, "SELECT COUNT(*) FROM chunks WHERE header IS NOT NULL"), 0);
    }

    #[test]
    fn item_chunks_use_a_different_index_version() {
        let base = prefix::index_version(prefix::Prefix::None);
        segment::force(true);
        let with = prefix::index_version(prefix::Prefix::None);
        segment::force(false);
        assert_ne!(base, with);
        assert_eq!(with, format!("{base}:segments-v1"));
    }
}
