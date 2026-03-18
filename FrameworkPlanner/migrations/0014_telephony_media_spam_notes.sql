CREATE TABLE IF NOT EXISTS call_media (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL,
  call_log_id INTEGER,
  kind VARCHAR(20) NOT NULL,
  e164 VARCHAR(20),
  storage_key TEXT,
  provider_url TEXT,
  provider_sid VARCHAR(64),
  mime_type VARCHAR(100),
  duration_seconds INTEGER,
  transcript TEXT,
  is_read BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS call_media_user_created_idx ON call_media (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS call_media_call_log_idx ON call_media (call_log_id);

CREATE TABLE IF NOT EXISTS number_reputation (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL,
  e164 VARCHAR(20) NOT NULL,
  label VARCHAR(20) NOT NULL,
  reason TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS number_reputation_user_e164_uidx ON number_reputation (user_id, e164);

CREATE TABLE IF NOT EXISTS call_notes (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL,
  call_log_id INTEGER NOT NULL,
  disposition VARCHAR(50),
  notes TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS call_notes_call_log_idx ON call_notes (call_log_id);

