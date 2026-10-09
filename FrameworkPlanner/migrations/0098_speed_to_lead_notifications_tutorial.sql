-- 0098_speed_to_lead_notifications_tutorial.sql
-- Speed-to-lead alerts: in-app notifications + response-time tracking.
-- First-sign-in tutorial: server-side tour completion state.

-- In-app notifications (bell icon). Separate from tasks: these are
-- push-style alerts that demand immediate attention.
CREATE TABLE IF NOT EXISTS notifications (
  id integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  user_id integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type varchar(50) NOT NULL DEFAULT 'info',
  title varchar(255) NOT NULL,
  body text,
  entity_type varchar(50),
  entity_id integer,
  is_read boolean NOT NULL DEFAULT false,
  read_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_unread ON notifications (user_id, is_read) WHERE is_read = false;

-- Speed-to-lead: when the first outreach (call/SMS) happened for a lead.
-- NULL = not yet contacted. Response time = first_outreach_at - created_at.
ALTER TABLE leads ADD COLUMN IF NOT EXISTS first_outreach_at timestamp with time zone;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS first_outreach_by integer REFERENCES users(id);

-- Tutorial: server-side so it follows the user across devices/browsers
-- (the old localStorage flag did not).
ALTER TABLE users ADD COLUMN IF NOT EXISTS tour_completed_at timestamp with time zone;
ALTER TABLE users ADD COLUMN IF NOT EXISTS tour_skipped_at timestamp with time zone;
