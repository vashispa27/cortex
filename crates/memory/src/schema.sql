PRAGMA foreign_keys = ON;
PRAGMA journal_mode = WAL;
PRAGMA secure_delete = ON;

CREATE TABLE IF NOT EXISTS schema_migrations (
  version INTEGER PRIMARY KEY,
  applied_ms INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS meta (
  key TEXT PRIMARY KEY,
  value INTEGER NOT NULL
);
INSERT OR IGNORE INTO meta(key,value) VALUES ('memory_epoch',0);
INSERT OR IGNORE INTO meta(key,value) VALUES ('settings_version',0);
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value_json TEXT NOT NULL,
  source TEXT NOT NULL,
  version INTEGER NOT NULL,
  changed_ms INTEGER NOT NULL
);
INSERT OR IGNORE INTO settings(key,value_json,source,version,changed_ms) VALUES
  ('mcp_enabled','false','default',0,0),
  ('capture_paused','false','default',0,0),
  ('capture_enabled','false','default',0,0),
  ('excluded_apps','[]','default',0,0),
  ('excluded_domains','[]','default',0,0);

CREATE TABLE IF NOT EXISTS snapshots (
  id INTEGER PRIMARY KEY,
  app_id TEXT NOT NULL,
  window_session_id TEXT NOT NULL,
  title TEXT NOT NULL DEFAULT '',
  url TEXT,
  body TEXT NOT NULL,
  content_hash TEXT NOT NULL,
  first_seen_ms INTEGER NOT NULL,
  last_seen_ms INTEGER NOT NULL,
  focused_role TEXT,
  focused_name TEXT,
  focused_path TEXT,
  extraction_quality TEXT NOT NULL,
  truncated INTEGER NOT NULL DEFAULT 0 CHECK(truncated IN (0,1)),
  redaction_version INTEGER NOT NULL,
  CHECK(last_seen_ms >= first_seen_ms),
  UNIQUE(app_id,window_session_id,content_hash)
);
CREATE INDEX IF NOT EXISTS snapshots_time ON snapshots(last_seen_ms DESC);
CREATE INDEX IF NOT EXISTS snapshots_app_time ON snapshots(app_id,last_seen_ms DESC);

CREATE TABLE IF NOT EXISTS observations (
  id INTEGER PRIMARY KEY,
  snapshot_id INTEGER NOT NULL REFERENCES snapshots(id) ON DELETE CASCADE,
  observed_ms INTEGER NOT NULL,
  timezone TEXT NOT NULL,
  focus_fingerprint TEXT,
  source_event TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS observations_time ON observations(observed_ms);
CREATE INDEX IF NOT EXISTS observations_snapshot ON observations(snapshot_id,observed_ms);

CREATE TABLE IF NOT EXISTS activity_segments (
  id INTEGER PRIMARY KEY,
  app_id TEXT NOT NULL,
  window_session_id TEXT NOT NULL,
  started_ms INTEGER NOT NULL,
  ended_ms INTEGER NOT NULL,
  active_ms INTEGER NOT NULL,
  project_id TEXT,
  assignment_source TEXT,
  confidence REAL,
  CHECK(ended_ms >= started_ms),
  CHECK(active_ms >= 0 AND active_ms <= ended_ms-started_ms)
);
CREATE INDEX IF NOT EXISTS activity_time ON activity_segments(started_ms,ended_ms);

CREATE VIRTUAL TABLE IF NOT EXISTS snapshots_fts USING fts5(
  title,body,content='snapshots',content_rowid='id',tokenize='unicode61'
);
CREATE TRIGGER IF NOT EXISTS snapshots_ai AFTER INSERT ON snapshots BEGIN
  INSERT INTO snapshots_fts(rowid,title,body) VALUES(new.id,new.title,new.body);
END;
CREATE TRIGGER IF NOT EXISTS snapshots_ad AFTER DELETE ON snapshots BEGIN
  INSERT INTO snapshots_fts(snapshots_fts,rowid,title,body) VALUES('delete',old.id,old.title,old.body);
END;
CREATE TRIGGER IF NOT EXISTS snapshots_au AFTER UPDATE OF title,body ON snapshots BEGIN
  INSERT INTO snapshots_fts(snapshots_fts,rowid,title,body) VALUES('delete',old.id,old.title,old.body);
  INSERT INTO snapshots_fts(rowid,title,body) VALUES(new.id,new.title,new.body);
END;

CREATE TABLE IF NOT EXISTS derived_items (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL,
  logical_key TEXT NOT NULL,
  revision INTEGER NOT NULL,
  body_json TEXT NOT NULL,
  created_ms INTEGER NOT NULL,
  source_watermark_ms INTEGER NOT NULL,
  prompt_version TEXT,
  model_version TEXT,
  status TEXT NOT NULL CHECK(status IN ('valid','stale','rebuilding')),
  UNIQUE(kind,logical_key,revision)
);
CREATE TABLE IF NOT EXISTS derived_sources (
  derived_id TEXT NOT NULL REFERENCES derived_items(id) ON DELETE CASCADE,
  snapshot_id INTEGER NOT NULL REFERENCES snapshots(id) ON DELETE CASCADE,
  PRIMARY KEY(derived_id,snapshot_id)
);
CREATE TABLE IF NOT EXISTS derived_dependencies (
  parent_id TEXT NOT NULL REFERENCES derived_items(id) ON DELETE CASCADE,
  child_id TEXT NOT NULL REFERENCES derived_items(id) ON DELETE CASCADE,
  PRIMARY KEY(parent_id,child_id),
  CHECK(parent_id <> child_id)
);
CREATE TABLE IF NOT EXISTS jobs (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL,
  dedup_key TEXT NOT NULL UNIQUE,
  payload_json TEXT NOT NULL,
  state TEXT NOT NULL,
  run_after_ms INTEGER NOT NULL,
  attempt INTEGER NOT NULL DEFAULT 0,
  lease_until_ms INTEGER,
  memory_epoch INTEGER NOT NULL,
  last_error_code TEXT
);
CREATE INDEX IF NOT EXISTS jobs_due ON jobs(state,run_after_ms);

CREATE TABLE IF NOT EXISTS exclusions (
  id INTEGER PRIMARY KEY,
  matcher_kind TEXT NOT NULL,
  matcher TEXT NOT NULL,
  origin TEXT NOT NULL,
  enabled INTEGER NOT NULL CHECK(enabled IN (0,1)),
  UNIQUE(matcher_kind,matcher,origin)
);
CREATE TABLE IF NOT EXISTS privacy_events (
  id INTEGER PRIMARY KEY,
  operation TEXT NOT NULL,
  category TEXT NOT NULL,
  occurred_ms INTEGER NOT NULL,
  count INTEGER NOT NULL
);
