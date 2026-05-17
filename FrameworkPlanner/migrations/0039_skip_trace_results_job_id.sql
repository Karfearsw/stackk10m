ALTER TABLE skip_trace_results ADD COLUMN IF NOT EXISTS job_id INTEGER;

CREATE INDEX IF NOT EXISTS idx_skip_trace_results_job_id ON skip_trace_results (job_id, requested_at DESC);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'skip_trace_results_job_fk'
      AND conrelid = 'skip_trace_results'::regclass
  ) THEN
    EXECUTE 'ALTER TABLE skip_trace_results ADD CONSTRAINT skip_trace_results_job_fk FOREIGN KEY (job_id) REFERENCES skip_trace_jobs(id) ON DELETE SET NULL';
  END IF;
END
$$;
