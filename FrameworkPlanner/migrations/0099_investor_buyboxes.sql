-- 0099_investor_buyboxes.sql
-- Phase 9/10: investor Deal Matchroom — investor profiles + named buy boxes.
--
-- Adds three tables:
--   investor_profiles     full Phase-10 investor profile (identity, criteria,
--                         notification prefs, privacy, completeness score)
--   buy_boxes             named buy boxes per investor (active/paused/archived,
--                         hard requirements, preferences, exclusions, team owner)
--   buy_box_match_history scored matches recorded per buy box
--
-- Every statement is idempotent (IF NOT EXISTS / ADD COLUMN IF NOT EXISTS).

-- ---------------------------------------------------------------------------
-- investor_profiles
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS investor_profiles (
  id integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  investor_user_id integer NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  display_name varchar(160),
  company_name varchar(200),
  role varchar(80),
  criteria jsonb NOT NULL DEFAULT '{}'::jsonb,
  notification_prefs jsonb NOT NULL DEFAULT '{"frequency":"digest","channels":["in_app"]}'::jsonb,
  privacy jsonb NOT NULL DEFAULT '{"profile_visibility":"private","share_with_sellers":false}'::jsonb,
  completeness_score integer NOT NULL DEFAULT 0,
  is_complete boolean NOT NULL DEFAULT false,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT chk_investor_profile_score CHECK (completeness_score >= 0 AND completeness_score <= 100)
);

ALTER TABLE investor_profiles ADD COLUMN IF NOT EXISTS display_name varchar(160);
ALTER TABLE investor_profiles ADD COLUMN IF NOT EXISTS company_name varchar(200);
ALTER TABLE investor_profiles ADD COLUMN IF NOT EXISTS role varchar(80);
ALTER TABLE investor_profiles ADD COLUMN IF NOT EXISTS criteria jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE investor_profiles ADD COLUMN IF NOT EXISTS notification_prefs jsonb NOT NULL DEFAULT '{"frequency":"digest","channels":["in_app"]}'::jsonb;
ALTER TABLE investor_profiles ADD COLUMN IF NOT EXISTS privacy jsonb NOT NULL DEFAULT '{"profile_visibility":"private","share_with_sellers":false}'::jsonb;
ALTER TABLE investor_profiles ADD COLUMN IF NOT EXISTS completeness_score integer NOT NULL DEFAULT 0;
ALTER TABLE investor_profiles ADD COLUMN IF NOT EXISTS is_complete boolean NOT NULL DEFAULT false;
ALTER TABLE investor_profiles ADD COLUMN IF NOT EXISTS created_at timestamp with time zone NOT NULL DEFAULT now();
ALTER TABLE investor_profiles ADD COLUMN IF NOT EXISTS updated_at timestamp with time zone NOT NULL DEFAULT now();

CREATE INDEX IF NOT EXISTS idx_investor_profiles_user ON investor_profiles (investor_user_id);

-- ---------------------------------------------------------------------------
-- buy_boxes
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS buy_boxes (
  id integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  investor_id integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name varchar(120) NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  is_archived boolean NOT NULL DEFAULT false,
  hard_requirements jsonb NOT NULL DEFAULT '{}'::jsonb,
  preferences jsonb NOT NULL DEFAULT '{}'::jsonb,
  exclusions jsonb NOT NULL DEFAULT '{}'::jsonb,
  notify_frequency varchar(16) NOT NULL DEFAULT 'digest',
  team_owner_id integer REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT chk_buy_box_notify CHECK (notify_frequency IN ('instant', 'digest', 'weekly', 'off'))
);

ALTER TABLE buy_boxes ADD COLUMN IF NOT EXISTS investor_id integer;
ALTER TABLE buy_boxes ADD COLUMN IF NOT EXISTS name varchar(120);
ALTER TABLE buy_boxes ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true;
ALTER TABLE buy_boxes ADD COLUMN IF NOT EXISTS is_archived boolean NOT NULL DEFAULT false;
ALTER TABLE buy_boxes ADD COLUMN IF NOT EXISTS hard_requirements jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE buy_boxes ADD COLUMN IF NOT EXISTS preferences jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE buy_boxes ADD COLUMN IF NOT EXISTS exclusions jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE buy_boxes ADD COLUMN IF NOT EXISTS notify_frequency varchar(16) NOT NULL DEFAULT 'digest';
ALTER TABLE buy_boxes ADD COLUMN IF NOT EXISTS team_owner_id integer;
ALTER TABLE buy_boxes ADD COLUMN IF NOT EXISTS created_at timestamp with time zone NOT NULL DEFAULT now();
ALTER TABLE buy_boxes ADD COLUMN IF NOT EXISTS updated_at timestamp with time zone NOT NULL DEFAULT now();

-- team_owner_id foreign key (skip if already present from a partial apply)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'fk_buy_boxes_team_owner'
  ) THEN
    ALTER TABLE buy_boxes
      ADD CONSTRAINT fk_buy_boxes_team_owner FOREIGN KEY (team_owner_id)
      REFERENCES users(id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_buy_boxes_investor ON buy_boxes (investor_id);
CREATE INDEX IF NOT EXISTS idx_buy_boxes_investor_state ON buy_boxes (investor_id, is_active, is_archived);

-- ---------------------------------------------------------------------------
-- buy_box_match_history
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS buy_box_match_history (
  id integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  buy_box_id integer NOT NULL REFERENCES buy_boxes(id) ON DELETE CASCADE,
  property_id integer REFERENCES properties(id) ON DELETE SET NULL,
  score integer NOT NULL DEFAULT 0,
  reasons jsonb NOT NULL DEFAULT '[]'::jsonb,
  matched_at timestamp with time zone NOT NULL DEFAULT now(),
  notified_at timestamp with time zone,
  CONSTRAINT chk_bb_match_score CHECK (score >= 0 AND score <= 100)
);

ALTER TABLE buy_box_match_history ADD COLUMN IF NOT EXISTS buy_box_id integer;
ALTER TABLE buy_box_match_history ADD COLUMN IF NOT EXISTS property_id integer;
ALTER TABLE buy_box_match_history ADD COLUMN IF NOT EXISTS score integer NOT NULL DEFAULT 0;
ALTER TABLE buy_box_match_history ADD COLUMN IF NOT EXISTS reasons jsonb NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE buy_box_match_history ADD COLUMN IF NOT EXISTS matched_at timestamp with time zone NOT NULL DEFAULT now();
ALTER TABLE buy_box_match_history ADD COLUMN IF NOT EXISTS notified_at timestamp with time zone;

CREATE INDEX IF NOT EXISTS idx_bb_match_history_box ON buy_box_match_history (buy_box_id, matched_at DESC);
CREATE INDEX IF NOT EXISTS idx_bb_match_history_property ON buy_box_match_history (property_id);
