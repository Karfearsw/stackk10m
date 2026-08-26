-- 0053: Dialer hardening — exact call_control_id lookup, webhook event dedupe,
--       AI assistant transcript/qualification storage on call logs.

ALTER TABLE call_logs ADD COLUMN IF NOT EXISTS call_control_id varchar(255);

ALTER TABLE call_logs ADD COLUMN IF NOT EXISTS ai_assistant_id varchar(100);

ALTER TABLE call_logs ADD COLUMN IF NOT EXISTS transcript text;

ALTER TABLE call_logs ADD COLUMN IF NOT EXISTS ai_qualified boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_call_logs_call_control_id ON call_logs (call_control_id);

-- Backfill call_control_id from existing metadata JSON (best-effort).
-- Forward writes set the column directly; malformed legacy JSON is skipped.
DO $$
BEGIN
  UPDATE call_logs
  SET call_control_id = (metadata::jsonb->>'callControlId')
  WHERE call_control_id IS NULL
    AND metadata IS NOT NULL
    AND metadata LIKE '{%'
    AND metadata::jsonb ? 'callControlId';
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;

-- Webhook event dedupe table: one row per Telnyx event id so terminal
-- transitions and AI transcript updates are applied exactly once.
CREATE TABLE IF NOT EXISTS processed_webhook_events (
  event_id text PRIMARY KEY,
  event_type varchar(100) NOT NULL,
  processed_at timestamptz NOT NULL DEFAULT now()
);
