CREATE TABLE browser_jobs (
    task_id UUID PRIMARY KEY REFERENCES tasks(id) ON DELETE CASCADE,
    share_id TEXT NOT NULL,
    tab_id BIGINT NOT NULL,
    browser_instance TEXT NOT NULL DEFAULT '',
    site TEXT NOT NULL,
    active BOOLEAN NOT NULL DEFAULT TRUE
);
CREATE UNIQUE INDEX browser_one_job_per_share ON browser_jobs(share_id) WHERE active;
CREATE UNIQUE INDEX browser_one_job_per_tab ON browser_jobs(tab_id,browser_instance) WHERE active;
CREATE TABLE browser_grants (
    id UUID PRIMARY KEY,
    task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    interaction_id TEXT NOT NULL UNIQUE REFERENCES interactions(id),
    consumed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- Review state is separate from the metadata-only operational/action log.
CREATE TABLE browser_review_values (
    task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    action_key TEXT NOT NULL,
    label TEXT NOT NULL,
    value TEXT NOT NULL,
    operation TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY(task_id,action_key)
);
CREATE TABLE browser_review_proposals (
    id UUID PRIMARY KEY,
    task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    action_key TEXT NOT NULL,
    proposal JSONB NOT NULL,
    UNIQUE(task_id,action_key)
);
