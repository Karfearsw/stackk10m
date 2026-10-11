-- 0108: Skip-trace completion — spend ledger, alerts, runtime settings.
-- Applied automatically on Vercel via AUTO_APPLY_MIGRATIONS.

-- Paid-lookup spend ledger: every paid result's costCents is recorded here.
CREATE TABLE IF NOT EXISTS skip_trace_spend_ledger (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  job_id INTEGER NULL,
  provider VARCHAR(100) NOT NULL,
  cost_cents INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_skip_trace_spend_ledger_created
  ON skip_trace_spend_ledger (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_skip_trace_spend_ledger_job
  ON skip_trace_spend_ledger (job_id);

-- Persistent admin alerts (e.g. insufficient_credits 402s).
CREATE TABLE IF NOT EXISTS skip_trace_alerts (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  type VARCHAR(100) NOT NULL,
  message TEXT NOT NULL,
  metadata_json JSONB NULL,
  resolved_at TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_skip_trace_alerts_unresolved
  ON skip_trace_alerts (created_at DESC)
  WHERE resolved_at IS NULL;

-- Manager-editable runtime settings (override env defaults).
CREATE TABLE IF NOT EXISTS skip_trace_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL DEFAULT '',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
