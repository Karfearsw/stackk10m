ALTER TABLE leads ADD COLUMN IF NOT EXISTS do_not_call boolean NOT NULL DEFAULT false;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS do_not_text boolean NOT NULL DEFAULT false;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS next_follow_up_at timestamp;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS tags text[];

ALTER TABLE IF EXISTS call_logs ADD COLUMN IF NOT EXISTS lead_id integer;
ALTER TABLE IF EXISTS call_logs ADD COLUMN IF NOT EXISTS disposition varchar(50);
ALTER TABLE IF EXISTS call_logs ADD COLUMN IF NOT EXISTS note text;

DO $$
BEGIN
  IF to_regclass('public.call_logs') IS NOT NULL THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_call_logs_lead_started_at ON call_logs (lead_id, started_at DESC)';
  END IF;
END
$$;
CREATE INDEX IF NOT EXISTS idx_leads_next_follow_up_at ON leads (next_follow_up_at);
CREATE INDEX IF NOT EXISTS idx_leads_do_not_call ON leads (do_not_call);
