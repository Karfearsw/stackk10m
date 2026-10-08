-- 0092: Email provisioning cross-system dedup.
--
-- Tracks WHERE a business email was provisioned so the CRM and the
-- onboarding site never create duplicate @oceanluxe.org mailboxes for the
-- same person.
--
-- Additive and idempotent. The email_address UNIQUE constraint from 0091
-- is the hard dedup guard at the database level; this migration adds the
-- source tracking column used by the application-level checks.

-- Source of the provisioning request.
ALTER TABLE provisioned_emails
  ADD COLUMN IF NOT EXISTS source varchar(50) NOT NULL DEFAULT 'crm_signup';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'provisioned_emails_source_check'
  ) THEN
    ALTER TABLE provisioned_emails
      ADD CONSTRAINT provisioned_emails_source_check
      CHECK (source IN ('crm_signup', 'onboarding_site', 'manual'));
  END IF;
END $$;

-- Confirm the address-level uniqueness guard from 0091 (no-op if present).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'provisioned_emails_email_address_key'
  ) THEN
    ALTER TABLE provisioned_emails ADD CONSTRAINT provisioned_emails_email_address_key UNIQUE (email_address);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS provisioned_emails_source_idx ON provisioned_emails (source);
