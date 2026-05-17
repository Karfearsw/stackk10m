CREATE TABLE IF NOT EXISTS skip_trace_jobs (
  id SERIAL PRIMARY KEY,
  entity_type VARCHAR(20) NOT NULL,
  entity_id INTEGER NOT NULL,
  requested_by_user_id INTEGER,
  mode VARCHAR(20) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'queued',
  provider_name VARCHAR(100),
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  started_at TIMESTAMP,
  completed_at TIMESTAMP,
  error_message TEXT,
  idempotency_key VARCHAR(400)
);

CREATE INDEX IF NOT EXISTS idx_skip_trace_jobs_entity ON skip_trace_jobs (entity_type, entity_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_skip_trace_jobs_status ON skip_trace_jobs (status, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS ux_skip_trace_jobs_idempotency_key ON skip_trace_jobs (idempotency_key);
