-- 0072: Dial hardening for two-leg call sessions.
--       provider_call_session_id = Telnyx call_session_id of the first dialed
--       leg; required as link_to when using the bridge_on_answer dial param
--       (Telnyx auto-bridges the answered second leg, eliminating the
--       webhook round-trip dead air). provider_last_event_at tracks the last
--       webhook-driven transition so a watchdog sweep can reclaim sessions
--       whose events were lost.

ALTER TABLE crm_call_sessions ADD COLUMN IF NOT EXISTS provider_call_session_id varchar(64);
ALTER TABLE crm_call_sessions ADD COLUMN IF NOT EXISTS provider_last_event_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_crm_call_sessions_last_event ON crm_call_sessions (status, provider_last_event_at);

-- Rollback:
-- DROP INDEX IF EXISTS idx_crm_call_sessions_last_event;
-- ALTER TABLE crm_call_sessions DROP COLUMN IF EXISTS provider_last_event_at;
-- ALTER TABLE crm_call_sessions DROP COLUMN IF EXISTS provider_call_session_id;
