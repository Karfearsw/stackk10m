CREATE TABLE IF NOT EXISTS field_media_assets (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL,
  lead_id INTEGER,
  kind VARCHAR(20) NOT NULL,
  mime_type VARCHAR(120) NOT NULL,
  content_base64 TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_field_media_assets_lead ON field_media_assets (lead_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_field_media_assets_user ON field_media_assets (user_id, created_at DESC);

