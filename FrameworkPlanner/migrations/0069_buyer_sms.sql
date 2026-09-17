-- 0069: buyer SMS integration — link SMS rows to buyers + buyer DNC flags
--       crm_sms_messages.buyer_id lets outbound/inbound buyer texts live on the
--       buyer's thread; buyers.do_not_call gates outbound sends (403 DNC_BLOCKED)
--       and is flipped by inbound STOP/START keywords via the Telnyx webhook.

ALTER TABLE crm_sms_messages
  ADD COLUMN IF NOT EXISTS buyer_id integer;

CREATE INDEX IF NOT EXISTS idx_crm_sms_messages_buyer ON crm_sms_messages (buyer_id, created_at);

ALTER TABLE buyers
  ADD COLUMN IF NOT EXISTS do_not_call boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS dnc_updated_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_buyers_do_not_call ON buyers (do_not_call);

-- DNC also applies to contacts (call/SMS surfaces that reference contacts)
ALTER TABLE contacts
  ADD COLUMN IF NOT EXISTS do_not_call boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS do_not_text boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_contacts_do_not_call ON contacts (do_not_call);
