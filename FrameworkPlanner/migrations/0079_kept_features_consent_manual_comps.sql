-- 0079: kept-features finish (campaigns consent + manual comps)
-- NOTE: numbered 0079 to avoid colliding with FreeBuff PR #25 (0075-0078).

-- Campaigns: positive opt-in consent on leads. The scheduler requires
-- sms_consent/email_consent = true before any campaign send, and hard-suppresses
-- do_not_call / do_not_text / do_not_email. NULL (existing rows) = not opted in.
ALTER TABLE leads ADD COLUMN IF NOT EXISTS sms_consent boolean;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS email_consent boolean;

-- Comps: documented manual-entry flow. Manual comps are real user-entered data
-- (address + price + source required at the API layer); they are flagged
-- is_manual so the internal pull never fabricates them and the UI can badge them.
ALTER TABLE comp_snapshot_rows ADD COLUMN IF NOT EXISTS is_manual boolean NOT NULL DEFAULT false;
ALTER TABLE comp_snapshot_rows ADD COLUMN IF NOT EXISTS manual_address varchar(255);
ALTER TABLE comp_snapshot_rows ADD COLUMN IF NOT EXISTS manual_city varchar(100);
ALTER TABLE comp_snapshot_rows ADD COLUMN IF NOT EXISTS manual_state varchar(2);
ALTER TABLE comp_snapshot_rows ADD COLUMN IF NOT EXISTS manual_zip varchar(10);
ALTER TABLE comp_snapshot_rows ADD COLUMN IF NOT EXISTS manual_sqft integer;
ALTER TABLE comp_snapshot_rows ADD COLUMN IF NOT EXISTS manual_beds integer;
ALTER TABLE comp_snapshot_rows ADD COLUMN IF NOT EXISTS manual_baths numeric;
ALTER TABLE comp_snapshot_rows ADD COLUMN IF NOT EXISTS manual_source varchar(120);
ALTER TABLE comp_snapshot_rows ADD COLUMN IF NOT EXISTS manual_notes text;
ALTER TABLE comp_snapshot_rows ALTER COLUMN comp_property_id DROP NOT NULL;
