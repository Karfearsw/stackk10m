-- 0074: Buyer-side calling + disposition system.
--       (1) Buyer pipeline: a dedicated buyer_status stage, single owner,
--           next-action tracking, interest level, and consent capture.
--       (2) Buyer call sessions: crm_call_sessions can reference a buyer so
--           the Telnyx two-leg dialer works for buyer outreach, with
--           provider-tagged manual sessions for external calls
--           (e.g. company Google Voice) logged via the same workflow.
--
-- All statements are idempotent so the migration can be re-run safely.

-- ── Buyer pipeline & ownership ────────────────────────────────────────────
ALTER TABLE buyers ADD COLUMN IF NOT EXISTS buyer_status varchar(32) NOT NULL DEFAULT 'new';
ALTER TABLE buyers ADD COLUMN IF NOT EXISTS owner_user_id INTEGER;
ALTER TABLE buyers ADD COLUMN IF NOT EXISTS next_action text;
ALTER TABLE buyers ADD COLUMN IF NOT EXISTS next_action_at timestamptz;
ALTER TABLE buyers ADD COLUMN IF NOT EXISTS last_call_disposition varchar(50);
ALTER TABLE buyers ADD COLUMN IF NOT EXISTS interest_level varchar(20);
ALTER TABLE buyers ADD COLUMN IF NOT EXISTS call_consent boolean;
ALTER TABLE buyers ADD COLUMN IF NOT EXISTS sms_consent boolean;
ALTER TABLE buyers ADD COLUMN IF NOT EXISTS email_consent boolean;
ALTER TABLE buyers ADD COLUMN IF NOT EXISTS consent_source varchar(120);
ALTER TABLE buyers ADD COLUMN IF NOT EXISTS consent_at timestamptz;

-- Map legacy loose statuses onto the pipeline: existing rows keep their
-- meaning instead of all collapsing into 'new'.
UPDATE buyers SET buyer_status = 'do_not_contact' WHERE do_not_call IS TRUE;
UPDATE buyers SET buyer_status = 'qualified' WHERE buyer_status = 'new' AND proof_of_funds IS TRUE;
UPDATE buyers SET buyer_status = 'contacted' WHERE buyer_status = 'new' AND last_contact_date IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_buyers_buyer_status ON buyers (buyer_status);
CREATE INDEX IF NOT EXISTS idx_buyers_owner ON buyers (owner_user_id);
CREATE INDEX IF NOT EXISTS idx_buyers_next_action ON buyers (next_action_at);

-- ── Buyer call sessions (dialed + provider-tagged manual logs) ────────────
ALTER TABLE crm_call_sessions ADD COLUMN IF NOT EXISTS buyer_id INTEGER;
ALTER TABLE crm_call_sessions ADD COLUMN IF NOT EXISTS session_source varchar(24) NOT NULL DEFAULT 'crm_dialer';
ALTER TABLE crm_call_sessions ADD COLUMN IF NOT EXISTS session_provider varchar(24);
ALTER TABLE crm_call_sessions ADD COLUMN IF NOT EXISTS occurred_at timestamptz;

-- AI screening modes dial a lead script, not a buyer — restrict buyer rows
-- to human-first two-leg sessions or manual logs.
CREATE INDEX IF NOT EXISTS idx_crm_call_sessions_buyer ON crm_call_sessions (buyer_id, created_at);

-- Two-leg mode only accepts human_first; legacy queued rows are untouched.
ALTER TABLE crm_call_sessions
  ADD CONSTRAINT chk_call_sessions_buyer_mode
  CHECK (buyer_id IS NULL OR mode = 'human_first') NOT VALID;

ALTER TABLE crm_call_sessions
  ADD CONSTRAINT chk_call_sessions_source
  CHECK (session_source IN ('crm_dialer', 'manual')) NOT VALID;

ALTER TABLE crm_call_sessions
  ADD CONSTRAINT chk_call_sessions_provider
  CHECK (session_provider IS NULL OR session_source = 'manual') NOT VALID;

ALTER TABLE crm_call_sessions
  ADD CONSTRAINT chk_call_sessions_target
  CHECK (num_nonnulls(lead_id, buyer_id, contact_id) <= 1) NOT VALID;
