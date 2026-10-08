-- 0088: Ticket 15 — Broadcast campaign build-out.
--
-- Extends the existing drip-sequence campaigns table with broadcast fields
-- and adds recipient/message tracking tables for one-shot broadcast sends.
-- All statements are additive and idempotent (IF NOT EXISTS guards).

-- ── Extend campaigns with broadcast fields ──
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS channel VARCHAR(10) NOT NULL DEFAULT 'sms';
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS scheduled_at TIMESTAMPTZ;
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS created_by INTEGER;
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS audience_filters JSONB NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS pilot_mode BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS pilot_limit INTEGER NOT NULL DEFAULT 10;

-- Normalize legacy statuses to the broadcast lifecycle vocabulary.
-- Existing values (active/draft/scheduled/paused/completed/archived/failed) are kept;
-- 'sending' and 'cancelled' are added by the application layer (varchar, no constraint).

-- ── Broadcast recipients: exact list resolved at send time ──
CREATE TABLE IF NOT EXISTS campaign_recipients (
  id SERIAL PRIMARY KEY,
  campaign_id INTEGER NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  lead_id INTEGER,
  buyer_id INTEGER,
  recipient_type VARCHAR(10) NOT NULL DEFAULT 'lead',
  phone VARCHAR(32),
  email VARCHAR(255),
  status VARCHAR(20) NOT NULL DEFAULT 'pending',
  sent_at TIMESTAMPTZ,
  error TEXT,
  cost_cents INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT chk_recipient_target CHECK (lead_id IS NOT NULL OR buyer_id IS NOT NULL),
  CONSTRAINT chk_recipient_status CHECK (status IN ('pending','sent','failed','opted_out','skipped'))
);
CREATE INDEX IF NOT EXISTS idx_campaign_recipients_campaign ON campaign_recipients (campaign_id);
CREATE INDEX IF NOT EXISTS idx_campaign_recipients_status ON campaign_recipients (campaign_id, status);

-- ── Broadcast message content (one row per campaign) ──
CREATE TABLE IF NOT EXISTS campaign_messages (
  id SERIAL PRIMARY KEY,
  campaign_id INTEGER NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  subject VARCHAR(255),
  body TEXT NOT NULL DEFAULT '',
  template_id INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (campaign_id)
);

-- ── Campaign send runs: audit trail for each broadcast execution ──
CREATE TABLE IF NOT EXISTS campaign_runs (
  id SERIAL PRIMARY KEY,
  campaign_id INTEGER NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at TIMESTAMPTZ,
  status VARCHAR(20) NOT NULL DEFAULT 'running',
  total_recipients INTEGER NOT NULL DEFAULT 0,
  sent_count INTEGER NOT NULL DEFAULT 0,
  failed_count INTEGER NOT NULL DEFAULT 0,
  skipped_count INTEGER NOT NULL DEFAULT 0,
  total_cost_cents INTEGER NOT NULL DEFAULT 0,
  started_by INTEGER,
  stop_reason TEXT,
  CONSTRAINT chk_run_status CHECK (status IN ('running','completed','paused','cancelled','failed'))
);
CREATE INDEX IF NOT EXISTS idx_campaign_runs_campaign ON campaign_runs (campaign_id);
