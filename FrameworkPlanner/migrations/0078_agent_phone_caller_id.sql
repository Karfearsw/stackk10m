-- 0078: Per-user dialer phone settings (Ticket 8).
--
-- Extends crm_agent_phone_settings with the outbound caller ID (the number a
-- lead sees) and a recording preference, so the dialer no longer relies solely
-- on the global TELNYX_DEFAULT_FROM_NUMBER. Additive and idempotent.

ALTER TABLE IF EXISTS crm_agent_phone_settings
  ADD COLUMN IF NOT EXISTS caller_id_e164 varchar(20);
ALTER TABLE IF EXISTS crm_agent_phone_settings
  ADD COLUMN IF NOT EXISTS recording_enabled boolean NOT NULL DEFAULT true;
