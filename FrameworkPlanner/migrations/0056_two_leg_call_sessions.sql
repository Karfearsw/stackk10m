-- 0056: Two-legged click-to-dial call sessions + AI screening/handoff.
--       Each telephone party is a separate Telnyx provider leg; the CRM
--       session tracks both legs and drives transitions only from signed
--       Telnyx webhook events.

CREATE TABLE IF NOT EXISTS crm_call_sessions (
  id serial PRIMARY KEY,
  lead_id integer,
  contact_id integer,
  campaign_id integer,
  initiating_user_id integer,
  assigned_agent_user_id integer,
  mode varchar(24) NOT NULL,
  status varchar(32) NOT NULL DEFAULT 'queued',
  agent_phone_e164 varchar(20),
  lead_phone_e164 varchar(20),
  agent_leg_call_control_id varchar(255),
  lead_leg_call_control_id varchar(255),
  ai_leg_call_control_id varchar(255),
  bridge_request_id varchar(128),
  provider_connection_id varchar(100),
  provider_name varchar(20) NOT NULL DEFAULT 'telnyx',
  started_at timestamptz,
  agent_answered_at timestamptz,
  lead_answered_at timestamptz,
  bridged_at timestamptz,
  ended_at timestamptz,
  duration_seconds integer,
  final_disposition varchar(50),
  provider_hangup_cause varchar(100),
  ai_summary text,
  ai_qualification_score integer,
  ai_confidence numeric,
  idempotency_key varchar(128),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_crm_call_sessions_lead ON crm_call_sessions (lead_id, created_at);
CREATE INDEX IF NOT EXISTS idx_crm_call_sessions_status ON crm_call_sessions (status, created_at);
CREATE INDEX IF NOT EXISTS idx_crm_call_sessions_idem ON crm_call_sessions (idempotency_key);
CREATE INDEX IF NOT EXISTS idx_crm_call_sessions_agent_leg ON crm_call_sessions (agent_leg_call_control_id);
CREATE INDEX IF NOT EXISTS idx_crm_call_sessions_lead_leg ON crm_call_sessions (lead_leg_call_control_id);

CREATE TABLE IF NOT EXISTS crm_call_session_events (
  id serial PRIMARY KEY,
  session_id integer NOT NULL,
  event_type varchar(64) NOT NULL,
  from_status varchar(32),
  to_status varchar(32),
  metadata text,
  provider_event_id varchar(128),
  actor_user_id integer,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_crm_call_session_events_session ON crm_call_session_events (session_id, id);

CREATE TABLE IF NOT EXISTS crm_agent_phone_settings (
  id serial PRIMARY KEY,
  user_id integer NOT NULL UNIQUE,
  phone_e164 varchar(20) NOT NULL,
  default_call_mode varchar(24) NOT NULL DEFAULT 'human_first',
  verified boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS crm_call_dispositions (
  id serial PRIMARY KEY,
  session_id integer NOT NULL UNIQUE,
  disposition varchar(50) NOT NULL,
  confidence varchar(20),
  source varchar(20) NOT NULL DEFAULT 'agent',
  note text,
  review_task_id integer,
  actor_user_id integer,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS crm_ai_call_qualifications (
  id serial PRIMARY KEY,
  session_id integer NOT NULL,
  intent varchar(100),
  location text,
  property_type varchar(100),
  budget varchar(100),
  timeline varchar(100),
  financing_status varchar(100),
  motivation varchar(100),
  preferred_contact varchar(50),
  request_human boolean NOT NULL DEFAULT false,
  do_not_call boolean NOT NULL DEFAULT false,
  confidence numeric,
  raw text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_crm_ai_call_qualifications_session ON crm_ai_call_qualifications (session_id);
