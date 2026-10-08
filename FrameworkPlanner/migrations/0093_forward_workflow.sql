-- 0093: Email forward workflow (manual IONOS creation with CRM tracking).
--
-- IONOS has no email API and the account holds only forwards — no real
-- mailboxes. There is no way to programmatically create mailboxes or
-- forwards, so the CRM tracks forward requests through a manual workflow:
--
--   requested → pending_creation → active
--                                  ↘ failed
--
-- A manager generates the @oceanluxe.org address in the CRM, creates the
-- forward manually in the IONOS Control Panel (Email → new address →
-- Forward), then clicks "Mark Active" in the CRM. The onboarding
-- checklist's email_provisioned flag flips when the forward goes active.
--
-- The legacy provisioned_emails table (0091/0092) is left untouched for
-- dedup lookups — check-email consults both tables.

CREATE TABLE IF NOT EXISTS email_forwards (
  id integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  user_id integer NOT NULL UNIQUE,                -- users.id
  forward_address varchar(255) NOT NULL UNIQUE,  -- firstname.lastname@oceanluxe.org
  target_email varchar(255) NOT NULL,             -- personal email the forward targets (e.g. Gmail)
  status varchar(30) NOT NULL DEFAULT 'requested', -- requested | pending_creation | active | failed
  source varchar(30),                             -- crm_signup | onboarding_site | manual
  requested_by integer,                           -- users.id of the manager who requested (null if auto)
  created_in_ionos_by integer,                    -- users.id of the manager who created it in IONOS
  created_in_ionos_at timestamptz,
  notes text,                                     -- e.g. failure reason
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT email_forwards_status_check CHECK (status IN ('requested', 'pending_creation', 'active', 'failed')),
  CONSTRAINT email_forwards_source_check CHECK (source IS NULL OR source IN ('crm_signup', 'onboarding_site', 'manual'))
);

CREATE INDEX IF NOT EXISTS email_forwards_user_idx ON email_forwards (user_id);
CREATE INDEX IF NOT EXISTS email_forwards_status_idx ON email_forwards (status);
CREATE INDEX IF NOT EXISTS email_forwards_address_idx ON email_forwards (forward_address);
