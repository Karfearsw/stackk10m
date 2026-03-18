CREATE TABLE IF NOT EXISTS sync_idempotency (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL,
  idempotency_key VARCHAR(120) NOT NULL,
  response_json TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE (user_id, idempotency_key)
);

CREATE INDEX IF NOT EXISTS idx_sync_idempotency_user ON sync_idempotency (user_id, created_at DESC);

