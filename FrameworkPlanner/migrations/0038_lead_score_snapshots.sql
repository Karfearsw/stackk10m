CREATE TABLE IF NOT EXISTS lead_score_snapshots (
  id SERIAL PRIMARY KEY,
  entity_type VARCHAR(20) NOT NULL,
  entity_id INTEGER NOT NULL,
  job_id INTEGER,
  score_total INTEGER NOT NULL,
  confidence VARCHAR(20),
  urgency_tier VARCHAR(20),
  reason_summary TEXT,
  factors_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  CONSTRAINT lead_score_snapshots_job_fk FOREIGN KEY (job_id) REFERENCES skip_trace_jobs(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_lead_score_snapshots_entity ON lead_score_snapshots (entity_type, entity_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_lead_score_snapshots_job ON lead_score_snapshots (job_id, created_at DESC);
