-- 0055: crm_sms_messages — persisted SMS rows powering the conversation/thread
--       view in the Communications Workspace. Outbound rows are written by the
--       send route; inbound rows and delivery updates by the webhook router.
--       provider_message_id dedupes Telnyx event redeliveries.

CREATE TABLE IF NOT EXISTS crm_sms_messages (
  id serial PRIMARY KEY,
  user_id integer,
  lead_id integer,
  direction varchar(10) NOT NULL DEFAULT 'outbound',
  from_number varchar(20),
  to_number varchar(20),
  body text,
  status varchar(30) NOT NULL DEFAULT 'queued',
  provider_message_id varchar(128),
  metadata text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_crm_sms_messages_provider_id ON crm_sms_messages (provider_message_id);
CREATE INDEX IF NOT EXISTS idx_crm_sms_messages_numbers ON crm_sms_messages (from_number, to_number);
CREATE INDEX IF NOT EXISTS idx_crm_sms_messages_lead ON crm_sms_messages (lead_id, created_at);
CREATE INDEX IF NOT EXISTS idx_crm_sms_messages_created ON crm_sms_messages (created_at);
