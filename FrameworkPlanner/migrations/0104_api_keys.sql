-- 0104: API keys for programmatic CRM access (AI agents, integrations).
-- Allows AI agents and external systems to authenticate via API key
-- instead of session cookies. Keys are scoped and revocable.

CREATE TABLE IF NOT EXISTS api_keys (
  id integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  user_id integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name varchar(255) NOT NULL,
  key_hash varchar(255) NOT NULL UNIQUE,
  key_prefix varchar(20) NOT NULL,
  scopes text[] NOT NULL DEFAULT '{}',
  last_used_at timestamp with time zone,
  expires_at timestamp with time zone,
  revoked_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_api_keys_user ON api_keys (user_id);
CREATE INDEX IF NOT EXISTS idx_api_keys_hash ON api_keys (key_hash) WHERE revoked_at IS NULL;
