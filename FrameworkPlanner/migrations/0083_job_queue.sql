-- 0083: Background job and queue system (Ticket 09 — P1 engine).
--
-- Durable PostgreSQL-backed job queue for scheduled/long-running work
-- (follow-ups, sequences, imports, enrichment, delivery/webhook/document events).
-- Supports job types, priorities, scheduled runs, and idempotency keys.
-- Additive and idempotent.

CREATE TABLE IF NOT EXISTS job_queue (
  id SERIAL PRIMARY KEY,
  type VARCHAR(100) NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  status VARCHAR(30) NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued', 'active', 'succeeded', 'failed', 'cancelled', 'dead_lettered')),
  priority INTEGER NOT NULL DEFAULT 0,
  scheduled_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  attempts INTEGER NOT NULL DEFAULT 0,
  max_attempts INTEGER NOT NULL DEFAULT 5,
  idempotency_key VARCHAR(255) UNIQUE,
  locked_by VARCHAR(100),
  locked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_job_queue_status_scheduled
  ON job_queue (status, scheduled_at);
CREATE INDEX IF NOT EXISTS idx_job_queue_type
  ON job_queue (type);
CREATE INDEX IF NOT EXISTS idx_job_queue_priority
  ON job_queue (priority DESC, scheduled_at ASC);

CREATE TABLE IF NOT EXISTS job_runs (
  id SERIAL PRIMARY KEY,
  job_id INTEGER NOT NULL REFERENCES job_queue(id) ON DELETE CASCADE,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ,
  status VARCHAR(30) NOT NULL DEFAULT 'running'
    CHECK (status IN ('running', 'succeeded', 'failed', 'timed_out')),
  error TEXT,
  output JSONB
);

CREATE INDEX IF NOT EXISTS idx_job_runs_job_id
  ON job_runs (job_id);
CREATE INDEX IF NOT EXISTS idx_job_runs_started_at
  ON job_runs (started_at DESC);

CREATE TABLE IF NOT EXISTS dead_letter_queue (
  id SERIAL PRIMARY KEY,
  job_id INTEGER NOT NULL REFERENCES job_queue(id) ON DELETE SET NULL,
  failed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  error TEXT,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  job_type VARCHAR(100),
  attempts INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_dead_letter_queue_failed_at
  ON dead_letter_queue (failed_at DESC);
