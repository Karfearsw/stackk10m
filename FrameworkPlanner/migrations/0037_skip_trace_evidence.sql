CREATE TABLE IF NOT EXISTS skip_trace_evidence (
  id SERIAL PRIMARY KEY,
  job_id INTEGER NOT NULL,
  entity_type VARCHAR(20) NOT NULL,
  entity_id INTEGER NOT NULL,
  source_type VARCHAR(50) NOT NULL,
  source_url TEXT,
  collected_at TIMESTAMP NOT NULL DEFAULT NOW(),
  extracted_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  confidence_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  notes TEXT,
  screenshot_ref TEXT,
  CONSTRAINT skip_trace_evidence_job_fk FOREIGN KEY (job_id) REFERENCES skip_trace_jobs(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_skip_trace_evidence_job_collected ON skip_trace_evidence (job_id, collected_at DESC);
CREATE INDEX IF NOT EXISTS idx_skip_trace_evidence_entity ON skip_trace_evidence (entity_type, entity_id, collected_at DESC);
