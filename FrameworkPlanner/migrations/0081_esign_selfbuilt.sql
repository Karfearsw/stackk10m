-- 0081_esign_selfbuilt.sql — Self-built e-sign module (v2) schema extensions.
-- EXTENDS the existing e-sign tables (contract_envelopes, contract_signers, contract_events);
-- does NOT duplicate them. All statements are idempotent (IF NOT EXISTS / DO blocks).
-- NOTE: hash-chain columns on contract_events are nullable for backward compatibility with
-- rows written by the legacy (v1) e-sign flow. New module (server/esign/*) always writes them.

-- ============ contract_events: SHA-256 hash-chain audit trail ============
-- contract_events is written by server code/cron but has no CREATE TABLE in the
-- migration history; guard it so fresh databases work too (no-op where live).
CREATE TABLE IF NOT EXISTS contract_events (
  id integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  contract_id integer NOT NULL,
  actor_type varchar(50) NOT NULL DEFAULT 'system',
  actor_user_id integer,
  actor_contact_id integer,
  event_type varchar(100) NOT NULL,
  payload_json text DEFAULT '{}',
  ip varchar(50),
  user_agent text,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE contract_events
  ADD COLUMN IF NOT EXISTS event_hash varchar(64),
  ADD COLUMN IF NOT EXISTS prev_hash varchar(64);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'idx_contract_events_contract_hash'
  ) THEN
    CREATE INDEX idx_contract_events_contract_hash ON contract_events (contract_id, id);
  END IF;
END $$;

-- ============ contract_envelopes: multi-signer v2 fields ============
ALTER TABLE contract_envelopes
  ADD COLUMN IF NOT EXISTS contract_id integer,
  ADD COLUMN IF NOT EXISTS signing_mode varchar(20) NOT NULL DEFAULT 'sequential',
  ADD COLUMN IF NOT EXISTS completed_at timestamptz,
  ADD COLUMN IF NOT EXISTS voided_at timestamptz,
  ADD COLUMN IF NOT EXISTS document_sha256 varchar(64),
  ADD COLUMN IF NOT EXISTS final_pdf_sha256 varchar(64),
  ADD COLUMN IF NOT EXISTS esign_version integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS notification_log text NOT NULL DEFAULT '[]';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'fk_contract_envelopes_contract_id'
  ) THEN
    ALTER TABLE contract_envelopes
      ADD CONSTRAINT fk_contract_envelopes_contract_id
      FOREIGN KEY (contract_id) REFERENCES contracts(id) ON DELETE SET NULL;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'idx_contract_envelopes_contract_id'
  ) THEN
    CREATE INDEX idx_contract_envelopes_contract_id ON contract_envelopes (contract_id);
  END IF;
END $$;

-- ============ contract_signers: envelope link + HMAC token single-use ============
ALTER TABLE contract_signers
  ADD COLUMN IF NOT EXISTS envelope_id integer,
  ADD COLUMN IF NOT EXISTS token_nonce varchar(128),
  ADD COLUMN IF NOT EXISTS token_used_at timestamptz,
  ADD COLUMN IF NOT EXISTS signature_image_base64 text,
  ADD COLUMN IF NOT EXISTS signature_svg text,
  ADD COLUMN IF NOT EXISTS consent_at timestamptz,
  ADD COLUMN IF NOT EXISTS consent_text text,
  ADD COLUMN IF NOT EXISTS decline_reason text,
  ADD COLUMN IF NOT EXISTS reminded_at timestamptz;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'fk_contract_signers_envelope_id'
  ) THEN
    ALTER TABLE contract_signers
      ADD CONSTRAINT fk_contract_signers_envelope_id
      FOREIGN KEY (envelope_id) REFERENCES contract_envelopes(id) ON DELETE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'idx_contract_signers_envelope_id'
  ) THEN
    CREATE INDEX idx_contract_signers_envelope_id ON contract_signers (envelope_id);
  END IF;
END $$;
