DROP INDEX IF EXISTS playground_property_sessions_address_key_uq;

CREATE UNIQUE INDEX IF NOT EXISTS playground_property_sessions_user_address_key_uq
ON playground_property_sessions (created_by, address_key);

CREATE INDEX IF NOT EXISTS playground_property_sessions_user_recent_idx
ON playground_property_sessions (created_by, last_opened_at DESC);

