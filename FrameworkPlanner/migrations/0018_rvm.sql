CREATE TABLE IF NOT EXISTS rvm_audio_assets (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL,
  name VARCHAR(120) NOT NULL,
  mime_type VARCHAR(120) NOT NULL,
  content_base64 TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS rvm_campaigns (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL,
  name VARCHAR(120) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'draft',
  send_window_start VARCHAR(5),
  send_window_end VARCHAR(5),
  daily_cap INTEGER NOT NULL DEFAULT 500,
  audio_asset_id INTEGER,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_rvm_campaigns_user ON rvm_campaigns (user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS rvm_drops (
  id SERIAL PRIMARY KEY,
  campaign_id INTEGER NOT NULL,
  lead_id INTEGER NOT NULL,
  to_number VARCHAR(32) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'queued',
  provider_id VARCHAR(120),
  requested_at TIMESTAMP NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMP,
  error TEXT
);

CREATE INDEX IF NOT EXISTS idx_rvm_drops_campaign ON rvm_drops (campaign_id, requested_at DESC);
CREATE INDEX IF NOT EXISTS idx_rvm_drops_lead ON rvm_drops (lead_id, requested_at DESC);

