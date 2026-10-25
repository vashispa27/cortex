CREATE TABLE IF NOT EXISTS schema_migrations (
    version TEXT PRIMARY KEY,
    applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS tasks (
    id UUID PRIMARY KEY,
    thread_id TEXT NOT NULL UNIQUE,
    status TEXT NOT NULL CHECK (status IN ('queued','running','paused','waiting_input','waiting_approval','waiting_event','completed','failed','cancelled')),
    version INTEGER NOT NULL DEFAULT 1,
    input_revision INTEGER NOT NULL DEFAULT 1,
    objective TEXT NOT NULL,
    timezone TEXT NOT NULL,
    limits JSONB NOT NULL,
    progress JSONB NOT NULL DEFAULT '{}'::jsonb,
    plan JSONB,
    outcome JSONB,
    error JSONB,
    trace_ref TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    cancelled_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS task_input_versions (
    task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    revision INTEGER NOT NULL,
    payload JSONB NOT NULL,
    content_hash TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (task_id, revision)
);

CREATE TABLE IF NOT EXISTS execution_segments (
    id UUID PRIMARY KEY,
    task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    input_revision INTEGER NOT NULL,
    command JSONB NOT NULL DEFAULT '{}'::jsonb,
    state TEXT NOT NULL CHECK (state IN ('queued','leased','completed','failed','cancelled')),
    lease_token UUID,
    lease_expires_at TIMESTAMPTZ,
    container_id TEXT,
    attempt INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    started_at TIMESTAMPTZ,
    finished_at TIMESTAMPTZ,
    error JSONB
);
CREATE INDEX IF NOT EXISTS execution_segments_claim_idx ON execution_segments(state, created_at) WHERE state = 'queued';
CREATE UNIQUE INDEX IF NOT EXISTS one_active_segment_per_task ON execution_segments(task_id) WHERE state IN ('queued','leased');

CREATE TABLE IF NOT EXISTS interactions (
    id TEXT PRIMARY KEY,
    task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    input_revision INTEGER NOT NULL,
    kind TEXT NOT NULL CHECK (kind IN ('approval','clarification')),
    operation TEXT NOT NULL,
    payload JSONB NOT NULL,
    payload_hash TEXT NOT NULL,
    preview JSONB NOT NULL,
    state TEXT NOT NULL CHECK (state IN ('pending','resolved','invalidated','cancelled')),
    response JSONB,
    resolved_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS interactions_task_idx ON interactions(task_id, created_at);

CREATE TABLE IF NOT EXISTS artifacts (
    id UUID PRIMARY KEY,
    task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    input_revision INTEGER NOT NULL,
    logical_name TEXT NOT NULL,
    media_type TEXT NOT NULL,
    sha256 TEXT NOT NULL,
    byte_size INTEGER NOT NULL,
    relative_path TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(task_id, input_revision, logical_name, sha256)
);
CREATE INDEX IF NOT EXISTS artifacts_task_idx ON artifacts(task_id, created_at);

CREATE TABLE IF NOT EXISTS sources (
    id UUID PRIMARY KEY,
    task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    input_revision INTEGER NOT NULL,
    url TEXT NOT NULL,
    title TEXT,
    retrieved_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    evidence TEXT NOT NULL,
    is_synthetic BOOLEAN NOT NULL DEFAULT FALSE,
    sha256 TEXT NOT NULL,
    UNIQUE(task_id, input_revision, url, sha256)
);

CREATE TABLE IF NOT EXISTS scheduled_events (
    id UUID PRIMARY KEY,
    task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    input_revision INTEGER NOT NULL,
    event_type TEXT NOT NULL,
    wake_at TIMESTAMPTZ NOT NULL,
    payload JSONB NOT NULL,
    state TEXT NOT NULL CHECK (state IN ('pending','leased','delivered','invalidated','cancelled')),
    delivery_key TEXT NOT NULL UNIQUE,
    lease_token UUID,
    lease_expires_at TIMESTAMPTZ,
    delivered_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS scheduled_events_due_idx ON scheduled_events(state, wake_at) WHERE state = 'pending';

CREATE TABLE IF NOT EXISTS action_records (
    id UUID PRIMARY KEY,
    task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    action_key TEXT NOT NULL,
    action_type TEXT NOT NULL,
    request_hash TEXT NOT NULL,
    result JSONB,
    state TEXT NOT NULL CHECK (state IN ('started','completed','uncertain','failed')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    completed_at TIMESTAMPTZ,
    UNIQUE(task_id, action_key)
);

CREATE TABLE IF NOT EXISTS idempotency_keys (
    scope TEXT NOT NULL,
    key TEXT NOT NULL,
    request_hash TEXT NOT NULL,
    response_status INTEGER,
    response_body JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY(scope, key)
);

CREATE TABLE IF NOT EXISTS application_events (
    id BIGSERIAL PRIMARY KEY,
    task_id UUID REFERENCES tasks(id) ON DELETE CASCADE,
    event_type TEXT NOT NULL,
    payload JSONB NOT NULL DEFAULT '{}'::jsonb,
    trace_ref TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS application_events_task_idx ON application_events(task_id, id);
