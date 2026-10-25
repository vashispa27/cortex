use cortex_capture::SanitizedSnapshot;
use cortex_contracts::{Coverage, CoverageState, RecentResponse, SearchRequest, SearchResponse, SearchResult, Snapshot, SnapshotsResponse};
use chrono::{NaiveDate, TimeZone, Utc};
use chrono_tz::Tz;
use rusqlite::{params, Connection, OptionalExtension};
use std::path::Path;
use std::sync::Mutex;
use thiserror::Error;
pub mod workspace;
pub mod facts;
pub mod schedules;
pub mod schedule_runtime;

const MAX_RESULTS: usize = 50;
const MAX_SNAPSHOT_IDS: usize = 25;
const MAX_SNAPSHOT_BYTES: usize = 128 * 1024;

#[derive(Debug, Error)]
pub enum MemoryError {
    #[error("database error: {0}")]
    Database(#[from] rusqlite::Error),
    #[error("invalid request: {0}")]
    InvalidRequest(&'static str),
    #[error("database lock poisoned")]
    LockPoisoned,
    #[error("memory epoch changed")]
    StaleEpoch,
}

pub struct MemoryStore {
    connection: Mutex<Connection>,
}

#[derive(Clone, Debug, serde::Serialize, serde::Deserialize)]
pub struct LocalSettings {
    pub version: i64,
    pub mcp_enabled: bool,
    pub capture_paused: bool,
    pub capture_enabled: bool,
    pub excluded_apps: Vec<String>,
    pub excluded_domains: Vec<String>,
}

#[derive(Clone, Debug, serde::Serialize)]
pub struct ChronicleResponse {
    pub level: String,
    pub period: String,
    pub timezone: String,
    pub summary: String,
    pub entries: Vec<SearchResult>,
    pub coverage: Coverage,
}

#[derive(Clone, Debug, serde::Deserialize)]
pub struct SettingsPatch {
    pub expected_version: i64,
    pub mcp_enabled: Option<bool>,
    pub capture_paused: Option<bool>,
    pub capture_enabled: Option<bool>,
    pub excluded_apps: Option<Vec<String>>,
    pub excluded_domains: Option<Vec<String>>,
}

impl MemoryStore {
    pub fn open(path: &Path) -> Result<Self, MemoryError> {
        if let Some(parent) = path.parent() { std::fs::create_dir_all(parent).map_err(|_| MemoryError::InvalidRequest("state directory unavailable"))?; }
        let connection = Connection::open(path)?;
        Self::initialize(connection)
    }

    pub fn in_memory() -> Result<Self, MemoryError> {
        Self::initialize(Connection::open_in_memory()?)
    }

    fn initialize(connection: Connection) -> Result<Self, MemoryError> {
        connection.execute_batch(include_str!("schema.sql"))?;
        connection.busy_timeout(std::time::Duration::from_secs(2))?;
        Ok(Self { connection: Mutex::new(connection) })
    }

    fn lock(&self) -> Result<std::sync::MutexGuard<'_, Connection>, MemoryError> {
        self.connection.lock().map_err(|_| MemoryError::LockPoisoned)
    }

    pub fn ingest(&self, snapshot: &SanitizedSnapshot) -> Result<i64, MemoryError> {
        let epoch = self.memory_epoch()?;
        self.ingest_with_epoch(snapshot,epoch)
    }

    pub fn ingest_with_epoch(&self, snapshot: &SanitizedSnapshot, expected_epoch: i64) -> Result<i64, MemoryError> {
        self.ingest_with_guard(snapshot,expected_epoch,None)
    }

    pub fn ingest_live(&self, snapshot: &SanitizedSnapshot, expected_epoch: i64, expected_settings_version: i64) -> Result<i64, MemoryError> {
        self.ingest_with_guard(snapshot,expected_epoch,Some(expected_settings_version))
    }

    fn ingest_with_guard(&self, snapshot: &SanitizedSnapshot, expected_epoch: i64, expected_settings_version: Option<i64>) -> Result<i64, MemoryError> {
        let mut conn = self.lock()?;
        let tx = conn.transaction()?;
        let current_epoch: i64 = tx.query_row("SELECT value FROM meta WHERE key='memory_epoch'",[],|r| r.get(0))?;
        if current_epoch != expected_epoch { return Err(MemoryError::StaleEpoch); }
        if let Some(version) = expected_settings_version {
            let current_version: i64 = tx.query_row("SELECT value FROM meta WHERE key='settings_version'",[],|r| r.get(0))?;
            let enabled: String = tx.query_row("SELECT value_json FROM settings WHERE key='capture_enabled'",[],|r| r.get(0))?;
            let paused: String = tx.query_row("SELECT value_json FROM settings WHERE key='capture_paused'",[],|r| r.get(0))?;
            if current_version != version || enabled != "true" || paused != "false" {
                return Err(MemoryError::InvalidRequest("capture setting changed"));
            }
        }
        tx.execute(
            "INSERT INTO snapshots(app_id,window_session_id,title,url,body,content_hash,first_seen_ms,last_seen_ms,focused_role,focused_name,focused_path,extraction_quality,truncated,redaction_version) VALUES (?1,?2,?3,?4,?5,?6,?7,?7,?8,?9,?10,?11,?12,?13) ON CONFLICT(app_id,window_session_id,content_hash) DO UPDATE SET last_seen_ms=MAX(last_seen_ms,excluded.last_seen_ms)",
            params![snapshot.app_id,snapshot.window_session_id,snapshot.title,snapshot.url,snapshot.body,snapshot.content_hash,snapshot.observed_ms,snapshot.focus_role,snapshot.focus_name,snapshot.focus_path,snapshot.extraction_quality,snapshot.truncated,snapshot.redaction_version],
        )?;
        let snapshot_id: i64 = tx.query_row(
            "SELECT id FROM snapshots WHERE app_id=?1 AND window_session_id=?2 AND content_hash=?3",
            params![snapshot.app_id,snapshot.window_session_id,snapshot.content_hash], |r| r.get(0))?;
        tx.execute(
            "INSERT INTO observations(snapshot_id,observed_ms,timezone,focus_fingerprint,source_event) VALUES(?1,?2,?3,?4,?5)",
            params![snapshot_id,snapshot.observed_ms,snapshot.timezone,snapshot.focus_path,snapshot.source_event],
        )?;
        tx.commit()?;
        Ok(snapshot_id)
    }

    pub fn search(&self, request: &SearchRequest) -> Result<SearchResponse, MemoryError> {
        if request.query.len() > 512 { return Err(MemoryError::InvalidRequest("query too long")); }
        if request.from_ms.zip(request.to_ms).is_some_and(|(from,to)| from > to) { return Err(MemoryError::InvalidRequest("invalid time range")); }
        let terms = safe_fts_terms(&request.query);
        if terms.is_empty() { return Err(MemoryError::InvalidRequest("query has no searchable terms")); }
        let limit = request.limit.unwrap_or(20).clamp(1, MAX_RESULTS);
        let offset = request.cursor.as_ref().map(|s| s.parse::<usize>().map_err(|_| MemoryError::InvalidRequest("invalid cursor"))).transpose()?.unwrap_or(0);
        if offset > 10_000 { return Err(MemoryError::InvalidRequest("cursor too deep")); }
        let apps = request.apps.clone().unwrap_or_default();
        if apps.len() > 20 || apps.iter().any(|x| x.len() > 200) { return Err(MemoryError::InvalidRequest("invalid app filter")); }
        let conn = self.lock()?;
        let mut stmt = conn.prepare(
            "WITH ranked AS MATERIALIZED (SELECT s.id,(SELECT MAX(o.observed_ms) FROM observations o WHERE o.snapshot_id=s.id AND (?2 IS NULL OR o.observed_ms>=?2) AND (?3 IS NULL OR o.observed_ms<=?3)) AS observed_ms,s.app_id,s.window_session_id,s.title,substr(s.body,1,360) AS excerpt,s.truncated,s.last_seen_ms,bm25(snapshots_fts) AS score FROM snapshots_fts f JOIN snapshots s ON s.id=f.rowid WHERE snapshots_fts MATCH ?1 AND EXISTS (SELECT 1 FROM observations o WHERE o.snapshot_id=s.id AND (?2 IS NULL OR o.observed_ms>=?2) AND (?3 IS NULL OR o.observed_ms<=?3)) AND (?6='[]' OR s.app_id IN (SELECT value FROM json_each(?6)))), diversified AS (SELECT *,row_number() OVER (PARTITION BY app_id,window_session_id ORDER BY score,last_seen_ms DESC) AS source_rank FROM ranked) SELECT id,observed_ms,app_id,title,excerpt,truncated FROM diversified ORDER BY source_rank,score,last_seen_ms DESC LIMIT ?4 OFFSET ?5"
        )?;
        let apps_json = serde_json::to_string(&apps).map_err(|_| MemoryError::InvalidRequest("invalid app filter"))?;
        let rows = stmt.query_map(params![terms,request.from_ms,request.to_ms,(limit + 1) as i64,offset as i64,apps_json], |r| {
            Ok(SearchResult { snapshot_id: r.get(0)?, observed_ms: r.get(1)?, app_id: r.get(2)?, title: r.get(3)?, excerpt: r.get(4)?, evidence_available: true, truncated: r.get(5)? })
        })?;
        let mut results = Vec::new();
        for row in rows { results.push(row?); }
        let has_more = results.len() > limit;
        results.truncate(limit);
        Ok(SearchResponse { results, next_cursor: has_more.then(|| (offset + limit).to_string()), coverage: partial_coverage() })
    }

    pub fn snapshots(&self, ids: &[i64]) -> Result<SnapshotsResponse, MemoryError> {
        if ids.len() > MAX_SNAPSHOT_IDS { return Err(MemoryError::InvalidRequest("too many snapshot IDs")); }
        let conn = self.lock()?;
        let mut stmt = conn.prepare("SELECT id,app_id,window_session_id,title,url,body,first_seen_ms,last_seen_ms,extraction_quality,truncated FROM snapshots WHERE id=?1")?;
        let mut snapshots = Vec::new();
        let mut total_bytes = 0usize;
        for id in ids {
            let item: Option<Snapshot> = stmt.query_row(params![id], |r| Ok(Snapshot {
                id: r.get(0)?, app_id: r.get(1)?, window_session_id: r.get(2)?, title: r.get(3)?, url: r.get(4)?, body: r.get(5)?, first_seen_ms: r.get(6)?, last_seen_ms: r.get(7)?, extraction_quality: r.get(8)?, truncated: r.get(9)?,
            })).optional()?;
            if let Some(item) = item {
                total_bytes += item.body.len() + item.title.len();
                if total_bytes > MAX_SNAPSHOT_BYTES { break; }
                snapshots.push(item);
            }
        }
        Ok(SnapshotsResponse { snapshots, coverage: partial_coverage() })
    }

    pub fn recent(&self, since_ms: Option<i64>, limit: Option<usize>) -> Result<RecentResponse, MemoryError> {
        let conn = self.lock()?;
        let mut stmt = conn.prepare("SELECT s.id,o.observed_ms,s.app_id,s.title,substr(s.body,1,360),s.truncated FROM observations o JOIN snapshots s ON s.id=o.snapshot_id WHERE (?1 IS NULL OR o.observed_ms>=?1) ORDER BY o.observed_ms DESC,o.id DESC LIMIT ?2")?;
        let rows = stmt.query_map(params![since_ms,limit.unwrap_or(20).clamp(1,MAX_RESULTS) as i64], |r| Ok(SearchResult {
            snapshot_id: r.get(0)?, observed_ms: r.get(1)?, app_id: r.get(2)?, title: r.get(3)?, excerpt: r.get(4)?, evidence_available: true, truncated: r.get(5)?,
        }))?;
        let mut results = Vec::new();
        for row in rows { results.push(row?); }
        Ok(RecentResponse { results, coverage: partial_coverage() })
    }

    pub fn working_memory(&self, limit: Option<usize>) -> Result<RecentResponse, MemoryError> {
        let conn = self.lock()?;
        let mut stmt = conn.prepare("SELECT s.id,MAX(o.observed_ms),s.app_id,s.title,substr(s.body,1,360),s.truncated FROM observations o JOIN snapshots s ON s.id=o.snapshot_id GROUP BY s.id ORDER BY MAX(o.observed_ms) DESC,s.id DESC LIMIT ?1")?;
        let rows = stmt.query_map(params![limit.unwrap_or(20).clamp(1,MAX_RESULTS) as i64], |r| Ok(SearchResult {
            snapshot_id: r.get(0)?, observed_ms: r.get(1)?, app_id: r.get(2)?, title: r.get(3)?, excerpt: r.get(4)?, evidence_available: true, truncated: r.get(5)?,
        }))?;
        let mut results = Vec::new();
        for row in rows { results.push(row?); }
        Ok(RecentResponse { results, coverage: partial_coverage() })
    }

    pub fn day_chronicle(&self, period: &str, timezone: &str) -> Result<ChronicleResponse, MemoryError> {
        let day = NaiveDate::parse_from_str(period, "%Y-%m-%d").map_err(|_| MemoryError::InvalidRequest("period must be YYYY-MM-DD"))?;
        let tz: Tz = timezone.parse().map_err(|_| MemoryError::InvalidRequest("invalid IANA timezone"))?;
        let start = day.and_hms_opt(0,0,0).ok_or(MemoryError::InvalidRequest("invalid period"))?;
        let end = day.succ_opt().ok_or(MemoryError::InvalidRequest("period out of range"))?.and_hms_opt(0,0,0).ok_or(MemoryError::InvalidRequest("period out of range"))?;
        // On a transition at midnight, choose the first valid instant in the local day.
        let from = tz.from_local_datetime(&start).earliest().or_else(|| tz.from_local_datetime(&(start + chrono::Duration::hours(1))).earliest()).ok_or(MemoryError::InvalidRequest("local day start unavailable"))?.with_timezone(&Utc).timestamp_millis();
        let to = tz.from_local_datetime(&end).earliest().or_else(|| tz.from_local_datetime(&(end + chrono::Duration::hours(1))).earliest()).ok_or(MemoryError::InvalidRequest("local day end unavailable"))?.with_timezone(&Utc).timestamp_millis();
        let conn = self.lock()?;
        let mut stmt = conn.prepare("SELECT s.id,MAX(o.observed_ms),s.app_id,s.title,substr(s.body,1,360),s.truncated FROM observations o JOIN snapshots s ON s.id=o.snapshot_id WHERE o.observed_ms>=?1 AND o.observed_ms<?2 GROUP BY s.id ORDER BY MAX(o.observed_ms) DESC,s.id DESC LIMIT 50")?;
        let rows = stmt.query_map(params![from,to], |r| Ok(SearchResult {
            snapshot_id: r.get(0)?, observed_ms: r.get(1)?, app_id: r.get(2)?, title: r.get(3)?, excerpt: r.get(4)?, evidence_available: true, truncated: r.get(5)?,
        }))?;
        let mut entries = Vec::new();
        for row in rows { entries.push(row?); }
        let summary = if entries.is_empty() {
            "No captured foreground sources are available for this period.".to_string()
        } else {
            format!("{} distinct captured foreground sources are available for this period. Open the linked entries for exact evidence.", entries.len())
        };
        Ok(ChronicleResponse { level: "day".into(), period: period.into(), timezone: timezone.into(), summary, entries, coverage: partial_coverage() })
    }

    pub fn snapshot_count(&self) -> Result<i64, MemoryError> {
        Ok(self.lock()?.query_row("SELECT COUNT(*) FROM snapshots",[],|r| r.get(0))?)
    }

    pub fn memory_epoch(&self) -> Result<i64, MemoryError> {
        Ok(self.lock()?.query_row("SELECT value FROM meta WHERE key='memory_epoch'",[],|r| r.get(0))?)
    }

    pub fn settings(&self) -> Result<LocalSettings, MemoryError> {
        let conn = self.lock()?;
        let version: i64 = conn.query_row("SELECT value FROM meta WHERE key='settings_version'",[],|r| r.get(0))?;
        let get = |key: &str| -> Result<String,MemoryError> {
            Ok(conn.query_row("SELECT value_json FROM settings WHERE key=?1",params![key],|r| r.get(0))?)
        };
        let decode = |key| -> Result<serde_json::Value,MemoryError> {
            serde_json::from_str(&get(key)?).map_err(|_| MemoryError::InvalidRequest("stored setting is invalid"))
        };
        let boolean = |key| -> Result<bool,MemoryError> { serde_json::from_value(decode(key)?).map_err(|_| MemoryError::InvalidRequest("stored setting is invalid")) };
        let list = |key| -> Result<Vec<String>,MemoryError> { serde_json::from_value(decode(key)?).map_err(|_| MemoryError::InvalidRequest("stored setting is invalid")) };
        Ok(LocalSettings { version, mcp_enabled: boolean("mcp_enabled")?, capture_paused: boolean("capture_paused")?, capture_enabled: boolean("capture_enabled")?, excluded_apps: list("excluded_apps")?, excluded_domains: list("excluded_domains")? })
    }

    pub fn update_settings(&self, patch: SettingsPatch, changed_ms: i64) -> Result<LocalSettings,MemoryError> {
        validate_exclusions(patch.excluded_apps.as_deref(), false)?;
        validate_exclusions(patch.excluded_domains.as_deref(), true)?;
        let mut conn = self.lock()?;
        let tx = conn.transaction()?;
        let version: i64 = tx.query_row("SELECT value FROM meta WHERE key='settings_version'",[],|r| r.get(0))?;
        if version != patch.expected_version { return Err(MemoryError::InvalidRequest("settings version changed")); }
        let next = version + 1;
        for (key,value) in [("mcp_enabled",patch.mcp_enabled),("capture_paused",patch.capture_paused),("capture_enabled",patch.capture_enabled)] {
            if let Some(value) = value {
                tx.execute("UPDATE settings SET value_json=?1,source='user',version=?2,changed_ms=?3 WHERE key=?4",params![value.to_string(),next,changed_ms,key])?;
            }
        }
        for (key,value) in [("excluded_apps",patch.excluded_apps),("excluded_domains",patch.excluded_domains)] {
            if let Some(value) = value {
                let json = serde_json::to_string(&value).map_err(|_| MemoryError::InvalidRequest("invalid exclusions"))?;
                tx.execute("UPDATE settings SET value_json=?1,source='user',version=?2,changed_ms=?3 WHERE key=?4",params![json,next,changed_ms,key])?;
            }
        }
        tx.execute("UPDATE meta SET value=?1 WHERE key='settings_version'",params![next])?;
        tx.commit()?;
        drop(conn);
        self.settings()
    }

    pub fn delete_all(&self, occurred_ms: i64) -> Result<i64, MemoryError> {
        let mut conn = self.lock()?;
        let tx = conn.transaction()?;
        let count: i64 = tx.query_row("SELECT COUNT(*) FROM snapshots",[],|r| r.get(0))?;
        pause_capture_in_transaction(&tx,occurred_ms)?;
        tx.execute("UPDATE meta SET value=value+1 WHERE key='memory_epoch'",[])?;
        tx.execute("DELETE FROM jobs",[])?;
        tx.execute("DELETE FROM derived_items",[])?;
        tx.execute("DELETE FROM observations",[])?;
        tx.execute("DELETE FROM activity_segments",[])?;
        tx.execute("DELETE FROM snapshots",[])?;
        tx.execute("INSERT INTO privacy_events(operation,category,occurred_ms,count) VALUES('delete_all','snapshots',?1,?2)",params![occurred_ms,count])?;
        tx.commit()?;
        conn.execute_batch("PRAGMA wal_checkpoint(TRUNCATE)")?;
        Ok(count)
    }

    /// Removes captures made by Cortex itself. These are UI chrome, never user memory.
    /// Unlike a user-initiated delete this does not pause capture or advance the epoch.
    pub fn purge_app_snapshots(&self, app_id: &str, occurred_ms: i64) -> Result<usize, MemoryError> {
        if app_id.is_empty() { return Err(MemoryError::InvalidRequest("invalid app id")); }
        let mut conn = self.lock()?;
        let tx = conn.transaction()?;
        let count: i64 = tx.query_row("SELECT COUNT(*) FROM snapshots WHERE app_id=?1", params![app_id], |r| r.get(0))?;
        if count == 0 {
            tx.commit()?;
            return Ok(0);
        }
        tx.execute("DELETE FROM derived_items WHERE id IN (SELECT derived_id FROM derived_sources WHERE snapshot_id IN (SELECT id FROM snapshots WHERE app_id=?1))", params![app_id])?;
        tx.execute("DELETE FROM activity_segments WHERE app_id=?1", params![app_id])?;
        tx.execute("DELETE FROM snapshots WHERE app_id=?1", params![app_id])?;
        tx.execute("INSERT INTO privacy_events(operation,category,occurred_ms,count) VALUES('self_capture_cleanup','snapshots',?1,?2)", params![occurred_ms,count])?;
        tx.commit()?;
        conn.execute_batch("PRAGMA wal_checkpoint(TRUNCATE)")?;
        Ok(count as usize)
    }

    pub fn delete_snapshots(&self, ids: &[i64], occurred_ms: i64) -> Result<usize, MemoryError> {
        if ids.len() > 1000 { return Err(MemoryError::InvalidRequest("too many snapshot IDs")); }
        let mut conn = self.lock()?;
        let tx = conn.transaction()?;
        pause_capture_in_transaction(&tx,occurred_ms)?;
        tx.execute("UPDATE meta SET value=value+1 WHERE key='memory_epoch'",[])?;
        let mut deleted = 0;
        for id in ids {
            // Remove all derived text that may contain the deleted source, including
            // summaries derived from other summaries. A later rebuilder can recreate
            // output only from remaining evidence.
            tx.execute("WITH RECURSIVE affected(id) AS (SELECT derived_id FROM derived_sources WHERE snapshot_id=?1 UNION SELECT d.child_id FROM derived_dependencies d JOIN affected a ON d.parent_id=a.id) DELETE FROM derived_items WHERE id IN (SELECT id FROM affected)",params![id])?;
            deleted += tx.execute("DELETE FROM snapshots WHERE id=?1",params![id])?;
        }
        tx.execute("DELETE FROM jobs WHERE memory_epoch < (SELECT value FROM meta WHERE key='memory_epoch')",[])?;
        tx.execute("INSERT INTO privacy_events(operation,category,occurred_ms,count) VALUES('delete_selected','snapshots',?1,?2)",params![occurred_ms,deleted])?;
        tx.commit()?;
        conn.execute_batch("PRAGMA wal_checkpoint(TRUNCATE)")?;
        Ok(deleted)
    }

    pub fn insert_activity_segment(&self, app_id: &str, window_session_id: &str, started_ms: i64, ended_ms: i64, active_ms: i64) -> Result<(),MemoryError> {
        if ended_ms < started_ms || active_ms < 0 || active_ms > ended_ms-started_ms { return Err(MemoryError::InvalidRequest("invalid activity segment")); }
        let conn = self.lock()?;
        conn.execute("INSERT INTO activity_segments(app_id,window_session_id,started_ms,ended_ms,active_ms) VALUES(?1,?2,?3,?4,?5)",params![app_id,window_session_id,started_ms,ended_ms,active_ms])?;
        Ok(())
    }

    pub fn insert_activity_segment_live(&self, app_id: &str, window_session_id: &str, started_ms: i64, ended_ms: i64, active_ms: i64, expected_epoch: i64, expected_settings_version: i64) -> Result<(),MemoryError> {
        if ended_ms < started_ms || active_ms < 0 || active_ms > ended_ms-started_ms { return Err(MemoryError::InvalidRequest("invalid activity segment")); }
        let mut conn = self.lock()?;
        let tx = conn.transaction()?;
        let epoch: i64 = tx.query_row("SELECT value FROM meta WHERE key='memory_epoch'",[],|r| r.get(0))?;
        let version: i64 = tx.query_row("SELECT value FROM meta WHERE key='settings_version'",[],|r| r.get(0))?;
        let enabled: String = tx.query_row("SELECT value_json FROM settings WHERE key='capture_enabled'",[],|r| r.get(0))?;
        let paused: String = tx.query_row("SELECT value_json FROM settings WHERE key='capture_paused'",[],|r| r.get(0))?;
        if epoch != expected_epoch || version != expected_settings_version || enabled != "true" || paused != "false" {
            return Err(MemoryError::InvalidRequest("capture setting changed"));
        }
        tx.execute("INSERT INTO activity_segments(app_id,window_session_id,started_ms,ended_ms,active_ms) VALUES(?1,?2,?3,?4,?5)",params![app_id,window_session_id,started_ms,ended_ms,active_ms])?;
        tx.commit()?;
        Ok(())
    }

    pub fn time_report(&self, from_ms: i64, to_ms: i64) -> Result<Vec<(String,i64)>,MemoryError> {
        if to_ms < from_ms { return Err(MemoryError::InvalidRequest("invalid time range")); }
        let conn = self.lock()?;
        let mut stmt = conn.prepare("SELECT app_id,started_ms,ended_ms,active_ms FROM activity_segments WHERE started_ms<?2 AND ended_ms>?1")?;
        let rows = stmt.query_map(params![from_ms,to_ms],|r| Ok((r.get::<_,String>(0)?,r.get::<_,i64>(1)?,r.get::<_,i64>(2)?,r.get::<_,i64>(3)?)))?;
        let mut totals = std::collections::BTreeMap::<String,i64>::new();
        for row in rows {
            let (app,start,end,active) = row?;
            let duration = end-start;
            if duration > 0 {
                let overlap = end.min(to_ms)-start.max(from_ms);
                // Active time is distributed proportionally when a query clips an observed segment.
                *totals.entry(app).or_default() += ((active as f64)*(overlap as f64)/(duration as f64)).round() as i64;
            }
        }
        let mut items: Vec<_> = totals.into_iter().collect();
        items.sort_by(|a,b| b.1.cmp(&a.1));
        Ok(items)
    }
}

fn validate_exclusions(values: Option<&[String]>, domain: bool) -> Result<(),MemoryError> {
    if let Some(values) = values {
        if values.len() > 100 || values.iter().any(|v| {
            v.is_empty() || v.len() > 200 || !v.bytes().all(|b| {
                b.is_ascii_alphanumeric() || b == b'.' || b == b'-' || (!domain && b == b'_')
            })
        }) { return Err(MemoryError::InvalidRequest("invalid exclusions")); }
    }
    Ok(())
}

fn pause_capture_in_transaction(tx: &rusqlite::Transaction<'_>, changed_ms: i64) -> Result<(),MemoryError> {
    tx.execute("UPDATE meta SET value=value+1 WHERE key='settings_version'",[])?;
    tx.execute("UPDATE settings SET value_json='true',source='system',version=(SELECT value FROM meta WHERE key='settings_version'),changed_ms=?1 WHERE key='capture_paused'",params![changed_ms])?;
    Ok(())
}

fn partial_coverage() -> Coverage {
    Coverage { state: CoverageState::Partial, reason: Some("Only captured foreground accessibility text is searchable; gaps may exist.".into()) }
}

fn safe_fts_terms(query: &str) -> String {
    // Quoted terms are generated by us; punctuation from user input never reaches FTS syntax.
    query.split(|c: char| !(c.is_alphanumeric() || c == '_'))
        .filter(|s| !s.is_empty()).take(16)
        .map(|s| format!("\"{}\"",s.replace('"',"")))
        .collect::<Vec<_>>().join(" AND ")
}

#[cfg(test)]
mod tests {
    use super::*;
    use cortex_capture::{BrowserContext,CapturePolicy,RawNode,RawWindow,SessionState};

    fn capture(text: &str, ms: i64) -> SanitizedSnapshot {
        CapturePolicy { consent: true, ..Default::default() }.sanitize(&RawWindow {
            app_id: "example.mail".into(), window_session_id: "w1".into(), title: "Launch review".into(), browser: BrowserContext::NotBrowser, session: SessionState::Active, observed_ms: ms, timezone: "UTC".into(), source_event: "focus".into(), focus_role: None, focus_name: None, focus_path: None,
            roots: vec![RawNode { role: "text".into(), name: None, value: Some(text.into()), visible: true, protected: false, excluded: false, children: vec![] }],
        }).unwrap()
    }
    #[test]
    fn dedupe_keeps_distinct_observations_and_fts_updates_after_delete() {
        let db = MemoryStore::in_memory().unwrap();
        let id = db.ingest(&capture("Review moved to Thursday",1_000)).unwrap();
        assert_eq!(id, db.ingest(&capture("Review moved to Thursday",9_000)).unwrap());
        assert_eq!(db.snapshot_count().unwrap(),1);
        assert_eq!(db.recent(None,None).unwrap().results.len(),2);
        let q = SearchRequest { query: "Thursday".into(), from_ms: None, to_ms: None, apps: None, limit: None, cursor: None };
        assert_eq!(db.search(&q).unwrap().results[0].snapshot_id,id);
        db.delete_snapshots(&[id],10_000).unwrap();
        assert!(db.search(&q).unwrap().results.is_empty());
        assert!(db.snapshots(&[id]).unwrap().snapshots.is_empty());
    }
    #[test]
    fn search_diversifies_repeated_captures_from_one_window() {
        let db = MemoryStore::in_memory().unwrap();
        for i in 0..10 { db.ingest(&capture(&format!("Saurav discussion version {i}"), 1_000 + i)).unwrap(); }
        let mut x = capture("Saurav conversation Jul 5", 900);
        x.app_id = "com.google.Chrome".into();
        x.window_session_id = "browser-window".into();
        let x_id = db.ingest(&x).unwrap();
        let result = db.search(&SearchRequest { query: "Saurav".into(), from_ms: None, to_ms: None, apps: None, limit: Some(2), cursor: None }).unwrap();
        assert!(result.results.iter().any(|hit| hit.snapshot_id == x_id));
    }
    #[test]
    fn fts_query_is_literal_and_redacted_text_is_only_stored_form() {
        let db = MemoryStore::in_memory().unwrap();
        db.ingest(&capture("token sk-abcdefghijklmnopqrstu launch",1)).unwrap();
        assert!(db.search(&SearchRequest { query: "launch OR nope\"".into(), from_ms: None, to_ms: None, apps: None, limit: None, cursor: None }).unwrap().results.is_empty());
        let latest = db.recent(None,None).unwrap();
        assert!(!latest.results[0].excerpt.contains("abcdefghijklmnopqrstu"));
    }
    #[test]
    fn self_capture_purge_removes_only_the_cortex_ui() {
        let db = MemoryStore::in_memory().unwrap();
        let real = db.ingest(&capture("Instagram Saurabh Thakur",1_000)).unwrap();
        let mut self_capture = capture("Cortex home LOCAL PREVIEW",2_000);
        self_capture.app_id = "app.cortex.desktop".into();
        self_capture.window_session_id = "cortex-window".into();
        let self_id = db.ingest(&self_capture).unwrap();
        assert_eq!(db.snapshot_count().unwrap(),2);
        assert_eq!(db.purge_app_snapshots("app.cortex.desktop",3_000).unwrap(),1);
        assert_eq!(db.snapshots(&[self_id]).unwrap().snapshots.len(),0);
        assert_eq!(db.snapshots(&[real]).unwrap().snapshots.len(),1);
        assert_eq!(db.memory_epoch().unwrap(),0);
    }

    #[test]
    fn deletion_advances_epoch() {
        let db = MemoryStore::in_memory().unwrap();
        db.ingest(&capture("hello",1)).unwrap();
        assert_eq!(db.memory_epoch().unwrap(),0);
        assert_eq!(db.delete_all(2).unwrap(),1);
        assert_eq!(db.memory_epoch().unwrap(),1);
        assert_eq!(db.snapshot_count().unwrap(),0);
    }
    #[test]
    fn working_memory_deduplicates_observations_and_day_chronicle_respects_timezone() {
        let db = MemoryStore::in_memory().unwrap();
        let observed = Utc.with_ymd_and_hms(2026,10,16,0,30,0).single().unwrap().timestamp_millis();
        db.ingest(&capture("Launch moved to Thursday",observed)).unwrap();
        db.ingest(&capture("Launch moved to Thursday",observed+60_000)).unwrap();
        assert_eq!(db.working_memory(None).unwrap().results.len(),1);
        assert_eq!(db.day_chronicle("2026-10-16","Asia/Kolkata").unwrap().entries.len(),1);
        assert_eq!(db.day_chronicle("2026-10-16","America/Los_Angeles").unwrap().entries.len(),0);
        assert_eq!(db.day_chronicle("2026-10-15","America/Los_Angeles").unwrap().entries.len(),1);
    }
    #[test]
    fn date_filter_uses_observation_dates_not_first_last_span() {
        let db = MemoryStore::in_memory().unwrap();
        db.ingest(&capture("Monday and Friday note",1_000)).unwrap();
        db.ingest(&capture("Monday and Friday note",5_000)).unwrap();
        let query = |from_ms,to_ms| SearchRequest { query: "note".into(), from_ms: Some(from_ms), to_ms: Some(to_ms), apps: None, limit: None, cursor: None };
        assert!(db.search(&query(2_000,4_000)).unwrap().results.is_empty());
        assert_eq!(db.search(&query(5_000,5_000)).unwrap().results[0].observed_ms,5_000);
    }
    #[test]
    fn selective_delete_removes_transitively_derived_content() {
        let db = MemoryStore::in_memory().unwrap();
        let id = db.ingest(&capture("Delete me",1)).unwrap();
        {
            let conn = db.lock().unwrap();
            conn.execute("INSERT INTO derived_items(id,kind,logical_key,revision,body_json,created_ms,source_watermark_ms,status) VALUES('child','summary','a',1,'{\"secret\":\"copied\"}',1,1,'valid')",[]).unwrap();
            conn.execute("INSERT INTO derived_items(id,kind,logical_key,revision,body_json,created_ms,source_watermark_ms,status) VALUES('grandchild','summary','b',1,'{\"secret\":\"copied\"}',1,1,'valid')",[]).unwrap();
            conn.execute("INSERT INTO derived_sources(derived_id,snapshot_id) VALUES('child',?1)",params![id]).unwrap();
            conn.execute("INSERT INTO derived_dependencies(parent_id,child_id) VALUES('child','grandchild')",[]).unwrap();
        }
        db.delete_snapshots(&[id],2).unwrap();
        let conn = db.lock().unwrap();
        let count: i64 = conn.query_row("SELECT COUNT(*) FROM derived_items",[],|r| r.get(0)).unwrap();
        assert_eq!(count,0);
    }
}
