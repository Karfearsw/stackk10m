-- 0073: Call recording for two-leg call sessions.
--       record_requested        = per-call opt-in chosen by the agent when
--                                 starting the call (dialer toggle).
--       provider_recording_id   = Telnyx recording_id from record_start /
--                                 call.recording.saved; used to mint fresh
--                                 download URLs via GET /v2/recordings/{id}.
--       provider_recording_url  = last known signed recording URL (short-lived;
--                                 the proxy route re-mints via the recording API).
-- Master switch lives in app_settings key 'telnyx_call_recording_enabled'
-- (default off; consent beep plays via play_beep).

ALTER TABLE crm_call_sessions ADD COLUMN IF NOT EXISTS record_requested boolean NOT NULL DEFAULT false;
ALTER TABLE crm_call_sessions ADD COLUMN IF NOT EXISTS provider_recording_id varchar(64);
ALTER TABLE crm_call_sessions ADD COLUMN IF NOT EXISTS provider_recording_url text;

-- Rollback:
-- ALTER TABLE crm_call_sessions DROP COLUMN IF EXISTS provider_recording_url;
-- ALTER TABLE crm_call_sessions DROP COLUMN IF EXISTS provider_recording_id;
-- ALTER TABLE crm_call_sessions DROP COLUMN IF EXISTS record_requested;
