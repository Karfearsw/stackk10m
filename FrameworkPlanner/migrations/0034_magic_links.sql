CREATE TABLE IF NOT EXISTS auth_magic_links (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash VARCHAR(64) NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ,
  request_ip VARCHAR(64),
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_auth_magic_links_user_id_created_at
  ON auth_magic_links(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_auth_magic_links_expires_at
  ON auth_magic_links(expires_at);

