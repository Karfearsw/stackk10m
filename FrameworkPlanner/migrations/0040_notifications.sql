CREATE TABLE IF NOT EXISTS notification_preferences (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL UNIQUE,
  email_enabled BOOLEAN DEFAULT TRUE,
  push_enabled BOOLEAN DEFAULT TRUE,
  in_app_enabled BOOLEAN DEFAULT TRUE,
  new_leads BOOLEAN DEFAULT TRUE,
  deal_updates BOOLEAN DEFAULT TRUE,
  contract_alerts BOOLEAN DEFAULT TRUE,
  weekly_summary BOOLEAN DEFAULT TRUE,
  frequency VARCHAR(50) DEFAULT 'instant',
  dnd_enabled BOOLEAN DEFAULT FALSE,
  dnd_start_time VARCHAR(10),
  dnd_end_time VARCHAR(10),
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS user_notifications (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL,
  type VARCHAR(50) DEFAULT 'system',
  title VARCHAR(255) NOT NULL,
  description TEXT,
  read BOOLEAN NOT NULL DEFAULT FALSE,
  related_id INTEGER,
  related_type VARCHAR(50),
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_user_notifications_user_created ON user_notifications (user_id, created_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS idx_user_notifications_user_read_created ON user_notifications (user_id, read, created_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS idx_user_notifications_related ON user_notifications (related_type, related_id);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'fk_notification_preferences_user'
      AND conrelid = 'notification_preferences'::regclass
  ) THEN
    EXECUTE 'ALTER TABLE notification_preferences ADD CONSTRAINT fk_notification_preferences_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'fk_user_notifications_user'
      AND conrelid = 'user_notifications'::regclass
  ) THEN
    EXECUTE 'ALTER TABLE user_notifications ADD CONSTRAINT fk_user_notifications_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE';
  END IF;
END
$$;
