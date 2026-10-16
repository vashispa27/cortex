PRAGMA foreign_keys=ON;
PRAGMA journal_mode=WAL;
PRAGMA secure_delete=ON;
CREATE TABLE IF NOT EXISTS snapshots (
 id INTEGER PRIMARY KEY,
 fingerprint TEXT NOT NULL UNIQUE,
 evidence_fingerprint TEXT NOT NULL,
 app_id TEXT NOT NULL,
 title TEXT NOT NULL,
 url TEXT,
 domain TEXT,
 source_type TEXT NOT NULL,
 body TEXT NOT NULL,
 first_seen_ms INTEGER NOT NULL,
 last_seen_ms INTEGER NOT NULL,
 duration_ms INTEGER NOT NULL DEFAULT 0,
 sightings INTEGER NOT NULL DEFAULT 1,
 focus_role TEXT,
 focus_name TEXT,
 limitations TEXT NOT NULL,
 ax_nodes_json TEXT NOT NULL DEFAULT '[]',
 cleaner_version INTEGER NOT NULL DEFAULT 0,
 cleaner_quality TEXT NOT NULL DEFAULT 'unprocessed',
 cleaner_coverage REAL NOT NULL DEFAULT 0,
 cleaning_trace_json TEXT NOT NULL DEFAULT '[]',
 searchable INTEGER NOT NULL DEFAULT 1,
 embedding_model TEXT,
 indexed INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS snapshots_evidence ON snapshots(evidence_fingerprint);
CREATE INDEX IF NOT EXISTS snapshots_time ON snapshots(first_seen_ms,last_seen_ms);
CREATE TABLE IF NOT EXISTS observations (
 id INTEGER PRIMARY KEY,
 snapshot_id INTEGER NOT NULL REFERENCES snapshots(id) ON DELETE CASCADE,
 observed_ms INTEGER NOT NULL,
 window_session_id TEXT NOT NULL,
 focus_role TEXT,
 focus_name TEXT,
 limitations TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS observations_snapshot ON observations(snapshot_id,observed_ms);
CREATE TABLE IF NOT EXISTS raw_versions (
 id INTEGER PRIMARY KEY,
 snapshot_id INTEGER NOT NULL REFERENCES snapshots(id) ON DELETE CASCADE,
 ax_hash TEXT NOT NULL,
 ax_nodes_json TEXT NOT NULL,
 observed_ms INTEGER NOT NULL,
 UNIQUE(snapshot_id,ax_hash)
);
CREATE INDEX IF NOT EXISTS raw_versions_snapshot ON raw_versions(snapshot_id);
CREATE TABLE IF NOT EXISTS chunks (
 id INTEGER PRIMARY KEY,
 snapshot_id INTEGER NOT NULL REFERENCES snapshots(id) ON DELETE CASCADE,
 start_byte INTEGER NOT NULL,
 end_byte INTEGER NOT NULL,
 body TEXT NOT NULL,
 indexed INTEGER NOT NULL DEFAULT 0,
 UNIQUE(snapshot_id,start_byte,end_byte)
);
CREATE INDEX IF NOT EXISTS chunks_snapshot ON chunks(snapshot_id,start_byte);
CREATE TABLE IF NOT EXISTS derived (
 id INTEGER PRIMARY KEY,
 kind TEXT NOT NULL,
 logical_key TEXT NOT NULL,
 body TEXT NOT NULL,
 created_ms INTEGER NOT NULL,
 indexed INTEGER NOT NULL DEFAULT 0,
 UNIQUE(kind,logical_key)
);
CREATE TABLE IF NOT EXISTS derived_sources (
 derived_id INTEGER NOT NULL REFERENCES derived(id) ON DELETE CASCADE,
 snapshot_id INTEGER NOT NULL REFERENCES snapshots(id) ON DELETE CASCADE,
 PRIMARY KEY(derived_id,snapshot_id)
);
CREATE TABLE IF NOT EXISTS index_meta (key TEXT PRIMARY KEY,value TEXT NOT NULL);
