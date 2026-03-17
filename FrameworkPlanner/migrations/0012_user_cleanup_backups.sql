CREATE TABLE IF NOT EXISTS user_cleanup_backups (
  id INTEGER PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  run_id TEXT NOT NULL,
  deleted_user_id INTEGER NOT NULL,
  deleted_user_email TEXT NOT NULL,
  snapshot JSONB NOT NULL,
  metadata JSONB,
  created_at TIMESTAMP DEFAULT NOW(),
  expires_at TIMESTAMP NOT NULL DEFAULT (NOW() + INTERVAL '24 hours'),
  restored_at TIMESTAMP
);

CREATE INDEX IF NOT EXISTS user_cleanup_backups_run_id_idx ON user_cleanup_backups(run_id);
CREATE INDEX IF NOT EXISTS user_cleanup_backups_expires_at_idx ON user_cleanup_backups(expires_at);
CREATE INDEX IF NOT EXISTS user_cleanup_backups_deleted_user_id_idx ON user_cleanup_backups(deleted_user_id);
