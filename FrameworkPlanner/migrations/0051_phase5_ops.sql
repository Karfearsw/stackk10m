-- 0051: Phase 5 — Operations, Settings, Communications, Security, Calendar.
-- Additive only; no existing data is touched.
-- 1) Granular notification preference categories (jsonb map, defaults all-on).
-- 2) Idempotent notifications via optional event_key + partial unique index.
-- 3) Internal team messages (never routed through Telnyx SMS).
-- 4) Calendar events for internal meetings.

ALTER TABLE notification_preferences ADD COLUMN IF NOT EXISTS categories jsonb NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE user_notifications ADD COLUMN IF NOT EXISTS event_key varchar(200);
CREATE UNIQUE INDEX IF NOT EXISTS user_notifications_event_key_idx
  ON user_notifications(user_id, event_key) WHERE event_key IS NOT NULL;

CREATE TABLE IF NOT EXISTS internal_messages (
  id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  sender_user_id integer NOT NULL,
  recipient_user_id integer NOT NULL,
  body text NOT NULL,
  related_type varchar(50),
  related_id integer,
  read_at timestamp,
  created_at timestamp NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS internal_messages_recipient_idx ON internal_messages(recipient_user_id, id DESC);
CREATE INDEX IF NOT EXISTS internal_messages_sender_idx ON internal_messages(sender_user_id, id DESC);

CREATE TABLE IF NOT EXISTS calendar_events (
  id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  title varchar(255) NOT NULL,
  description text,
  starts_at timestamp NOT NULL,
  ends_at timestamp,
  meeting_link text,
  location varchar(255),
  created_by integer NOT NULL,
  related_type varchar(50),
  related_id integer,
  invitee_user_ids integer[] NOT NULL DEFAULT '{}',
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS calendar_events_starts_idx ON calendar_events(starts_at);
