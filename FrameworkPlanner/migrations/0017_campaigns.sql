ALTER TABLE leads ADD COLUMN IF NOT EXISTS last_touch_at TIMESTAMP;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS next_touch_at TIMESTAMP;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS do_not_email BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS campaigns (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL,
  name VARCHAR(120) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'active',
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS campaign_steps (
  id SERIAL PRIMARY KEY,
  campaign_id INTEGER NOT NULL,
  step_order INTEGER NOT NULL,
  channel VARCHAR(10) NOT NULL,
  offset_days INTEGER NOT NULL DEFAULT 0,
  send_window_start VARCHAR(5),
  send_window_end VARCHAR(5),
  template_text TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_campaign_steps_campaign_order ON campaign_steps (campaign_id, step_order);

CREATE TABLE IF NOT EXISTS campaign_enrollments (
  id SERIAL PRIMARY KEY,
  campaign_id INTEGER NOT NULL,
  lead_id INTEGER NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'active',
  started_at TIMESTAMP NOT NULL DEFAULT NOW(),
  next_step_order INTEGER NOT NULL DEFAULT 0,
  next_run_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_campaign_enrollments_campaign_lead ON campaign_enrollments (campaign_id, lead_id);
CREATE INDEX IF NOT EXISTS idx_campaign_enrollments_next_run ON campaign_enrollments (next_run_at);

CREATE TABLE IF NOT EXISTS campaign_deliveries (
  id SERIAL PRIMARY KEY,
  enrollment_id INTEGER NOT NULL,
  campaign_id INTEGER NOT NULL,
  lead_id INTEGER NOT NULL,
  step_id INTEGER,
  channel VARCHAR(10) NOT NULL,
  status VARCHAR(20) NOT NULL,
  provider_id VARCHAR(120),
  error TEXT,
  sent_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_campaign_deliveries_campaign ON campaign_deliveries (campaign_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_campaign_deliveries_lead ON campaign_deliveries (lead_id, created_at DESC);
