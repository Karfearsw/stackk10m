-- M26 (audit round 2, 2026-09-15): notification dedup key so the existing
-- onConflictDoNothing + partial unique index on event_key can actually fire.
-- Column is nullable so rows created without an event key are unaffected.
ALTER TABLE user_notifications ADD COLUMN IF NOT EXISTS event_key VARCHAR(200);

CREATE UNIQUE INDEX IF NOT EXISTS idx_user_notifications_event_key
  ON user_notifications(event_key)
  WHERE event_key IS NOT NULL;
