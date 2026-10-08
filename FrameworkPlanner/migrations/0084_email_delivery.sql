-- 0084: Business email delivery (Ticket 10).
--
-- Adds the tables backing CRM email sending, delivery tracking, and
-- global suppression:
--   email_identities   — per-user sending identities (from-addresses) with
--                        SPF/DKIM/DMARC verification state.
--   email_suppressions — global suppression list (hard bounces, complaints,
--                        opt-outs). Sends to these addresses are blocked.
--   email_events       — delivery event log (delivered/bounced/complained/
--                        rejected/replied/opened/clicked), linked to leads.
--   email_outbox       — idempotent send queue; one row per logical send,
--                        keyed by idempotency_key so retries never double-send.
-- Additive and idempotent.

CREATE TABLE IF NOT EXISTS email_identities (
  id integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  user_id integer NOT NULL,
  email varchar(320) NOT NULL,
  name varchar(255),
  is_default boolean NOT NULL DEFAULT false,
  spf_pass boolean,
  dkim_pass boolean,
  dmarc_status varchar(32),
  verified_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, email)
);
CREATE INDEX IF NOT EXISTS idx_email_identities_user ON email_identities (user_id);

CREATE TABLE IF NOT EXISTS email_suppressions (
  id integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  email varchar(320) NOT NULL UNIQUE,
  reason varchar(32) NOT NULL CHECK (reason IN ('bounce', 'complaint', 'optout')),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_email_suppressions_email ON email_suppressions (lower(email));

CREATE TABLE IF NOT EXISTS email_events (
  id integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  message_id varchar(255),
  lead_id integer,
  to_email varchar(320) NOT NULL,
  event_type varchar(32) NOT NULL CHECK (event_type IN ('sent', 'delivered', 'bounced', 'complained', 'rejected', 'replied', 'opened', 'clicked')),
  occurred_at timestamptz NOT NULL DEFAULT now(),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb
);
CREATE INDEX IF NOT EXISTS idx_email_events_lead ON email_events (lead_id);
CREATE INDEX IF NOT EXISTS idx_email_events_message ON email_events (message_id);
CREATE INDEX IF NOT EXISTS idx_email_events_to ON email_events (lower(to_email));

CREATE TABLE IF NOT EXISTS email_outbox (
  id integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  to_email varchar(320) NOT NULL,
  subject varchar(500) NOT NULL,
  body_html text,
  body_text text,
  lead_id integer,
  user_id integer,
  status varchar(32) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'failed', 'suppressed')),
  idempotency_key varchar(128) NOT NULL UNIQUE,
  provider varchar(32),
  provider_message_id varchar(255),
  error text,
  sent_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_email_outbox_lead ON email_outbox (lead_id);
CREATE INDEX IF NOT EXISTS idx_email_outbox_status ON email_outbox (status);
