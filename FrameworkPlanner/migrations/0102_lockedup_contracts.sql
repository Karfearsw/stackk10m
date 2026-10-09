-- 0102_lockedup_contracts.sql
-- Locked-Up workspace (Phase 15) + contract display / e-sign workspace (Phase 16).
-- All statements are idempotent (IF NOT EXISTS / guarded).
-- Does NOT touch existing e-sign audit tables beyond guards: contract_events is
-- covered by 0081_esign_selfbuilt.sql; the contract_signers guard below is a
-- no-op on live databases (they were created via drizzle push) and only helps
-- fresh databases.

-- ============ contracts: locked-up gate fields ============
ALTER TABLE contracts
  ADD COLUMN IF NOT EXISTS effective_date date,
  ADD COLUMN IF NOT EXISTS expiration_date date,
  ADD COLUMN IF NOT EXISTS closing_date date,
  ADD COLUMN IF NOT EXISTS emd_amount numeric(12,2),
  ADD COLUMN IF NOT EXISTS emd_status varchar(50) NOT NULL DEFAULT 'not_received',
  ADD COLUMN IF NOT EXISTS title_company varchar(255),
  ADD COLUMN IF NOT EXISTS funding_status varchar(50) NOT NULL DEFAULT 'not_started',
  ADD COLUMN IF NOT EXISTS locked_up_at timestamptz,
  ADD COLUMN IF NOT EXISTS locked_up_by integer,
  ADD COLUMN IF NOT EXISTS superseded_by_contract_id integer;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'idx_contracts_effective_date') THEN
    CREATE INDEX idx_contracts_effective_date ON contracts (effective_date);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'idx_contracts_closing_date') THEN
    CREATE INDEX idx_contracts_closing_date ON contracts (closing_date);
  END IF;
END $$;

-- ============ contract_signers: fresh-database guard (no-op where live) ============
CREATE TABLE IF NOT EXISTS contract_signers (
  id integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  contract_id integer NOT NULL,
  envelope_id integer,
  token_nonce varchar(128),
  token_used_at timestamptz,
  signature_image_base64 text,
  signature_svg text,
  consent_at timestamptz,
  consent_text text,
  decline_reason text,
  reminded_at timestamptz,
  contact_id integer,
  name varchar(255) NOT NULL,
  email varchar(255),
  phone varchar(50),
  role varchar(50) DEFAULT 'signer',
  signing_order integer DEFAULT 0,
  status varchar(50) NOT NULL DEFAULT 'sent',
  token_hash varchar(128),
  expires_at timestamptz,
  sent_at timestamptz,
  viewed_at timestamptz,
  signed_at timestamptz,
  declined_at timestamptz,
  reminder_count integer DEFAULT 0,
  last_reminder_at timestamptz,
  signature_metadata_json text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- ============ locked_up_deals: the Locked-Up pipeline (Phase 15) ============
-- A deal enters this table ONLY through the locked-up gate (server-side check:
-- fully executed agreement, all signers done, effective/expiration/closing
-- dates set, earnest-money info present). Never from likes/saves/matches.
CREATE TABLE IF NOT EXISTS locked_up_deals (
  id integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  property_id integer NOT NULL UNIQUE REFERENCES properties(id) ON DELETE CASCADE,
  contract_id integer REFERENCES contracts(id) ON DELETE SET NULL,
  -- Workflow columns: awaiting_deposit | due_diligence | title | funding |
  -- ready_to_close | closed | at_risk
  stage varchar(50) NOT NULL DEFAULT 'awaiting_deposit',
  -- JSON array of assigned team member names, e.g. '["Vladimir","Shamilca"]'
  assigned_team text NOT NULL DEFAULT '[]',
  next_action text,
  next_action_due date,
  risk_notes text,
  locked_at timestamptz DEFAULT now(),
  unlocked_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'idx_locked_up_deals_stage') THEN
    CREATE INDEX idx_locked_up_deals_stage ON locked_up_deals (stage);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'idx_locked_up_deals_contract') THEN
    CREATE INDEX idx_locked_up_deals_contract ON locked_up_deals (contract_id);
  END IF;
END $$;

-- ============ deal_conditions: open conditions per locked-up deal ============
CREATE TABLE IF NOT EXISTS deal_conditions (
  id integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  locked_up_deal_id integer NOT NULL REFERENCES locked_up_deals(id) ON DELETE CASCADE,
  title varchar(255) NOT NULL,
  -- open | met | waived
  status varchar(20) NOT NULL DEFAULT 'open',
  due_date date,
  notes text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'idx_deal_conditions_deal') THEN
    CREATE INDEX idx_deal_conditions_deal ON deal_conditions (locked_up_deal_id);
  END IF;
END $$;

-- ============ contract_reminders: scheduled reminders (Phase 16) ============
-- Records ONLY. No email/SMS is sent by creating a row; a separate scheduler
-- (not built here) would act on rows with status = 'scheduled'.
CREATE TABLE IF NOT EXISTS contract_reminders (
  id integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  contract_id integer NOT NULL REFERENCES contracts(id) ON DELETE CASCADE,
  envelope_id integer REFERENCES contract_envelopes(id) ON DELETE CASCADE,
  signer_id integer REFERENCES contract_signers(id) ON DELETE SET NULL,
  remind_at timestamptz NOT NULL,
  -- email | sms | in_app
  channel varchar(20) NOT NULL DEFAULT 'email',
  recipient varchar(255) NOT NULL,
  note text,
  -- scheduled | sent | cancelled
  status varchar(20) NOT NULL DEFAULT 'scheduled',
  created_by integer,
  created_at timestamptz DEFAULT now()
);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'idx_contract_reminders_contract') THEN
    CREATE INDEX idx_contract_reminders_contract ON contract_reminders (contract_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'idx_contract_reminders_due') THEN
    CREATE INDEX idx_contract_reminders_due ON contract_reminders (remind_at, status);
  END IF;
END $$;
