-- 0091: Business email auto-provisioning + onboarding checklist.
--
-- When a new agent is approved (career site or CRM signup), the CRM can
-- automatically create their @oceanluxe.org business email through IONOS,
-- set up forwarding, and link it to their CRM account. The onboarding
-- checklist gates live-lead access until every item is complete.
--
-- Additive and idempotent. IONOS credentials live in env vars only
-- (IONOS_API_KEY, IONOS_API_SECRET, IONOS_CONTRACT_ID) — never in this table.

-- Provisioned business email records.
CREATE TABLE IF NOT EXISTS provisioned_emails (
  id integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  user_id integer NOT NULL UNIQUE,              -- users.id
  email_address varchar(255) NOT NULL UNIQUE,  -- firstname.lastname@oceanluxe.org
  ionos_mailbox_id varchar(255),               -- IONOS mailbox identifier (if API provisioned)
  forwarding_to varchar(255),                  -- personal email for forwarding (e.g. Gmail)
  status varchar(30) NOT NULL DEFAULT 'pending', -- pending | active | failed
  error text,                                  -- last provisioning error, if any
  created_at timestamptz NOT NULL DEFAULT now(),
  provisioned_at timestamptz,
  CONSTRAINT provisioned_emails_status_check CHECK (status IN ('pending', 'active', 'failed'))
);

CREATE INDEX IF NOT EXISTS provisioned_emails_user_idx ON provisioned_emails (user_id);
CREATE INDEX IF NOT EXISTS provisioned_emails_status_idx ON provisioned_emails (status);

-- Onboarding checklist per user. Live-lead access is granted only when
-- every item is true.
CREATE TABLE IF NOT EXISTS onboarding_checklist (
  id integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  user_id integer NOT NULL UNIQUE,              -- users.id
  offer_letter_signed boolean NOT NULL DEFAULT FALSE,
  ica_signed boolean NOT NULL DEFAULT FALSE,
  w9_submitted boolean NOT NULL DEFAULT FALSE,
  id_verified boolean NOT NULL DEFAULT FALSE,
  payout_setup boolean NOT NULL DEFAULT FALSE,
  training_completed boolean NOT NULL DEFAULT FALSE,
  email_provisioned boolean NOT NULL DEFAULT FALSE,
  live_lead_access_granted boolean NOT NULL DEFAULT FALSE,
  live_lead_access_granted_at timestamptz,
  live_lead_access_granted_by integer,         -- users.id of the manager who granted
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS onboarding_checklist_user_idx ON onboarding_checklist (user_id);
