CREATE TABLE IF NOT EXISTS skip_trace_job_events (
  id SERIAL PRIMARY KEY,
  job_id INTEGER NOT NULL,
  status VARCHAR(20) NOT NULL,
  message TEXT,
  metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  CONSTRAINT skip_trace_job_events_job_fk FOREIGN KEY (job_id) REFERENCES skip_trace_jobs(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_skip_trace_job_events_job_created ON skip_trace_job_events (job_id, created_at ASC);
