CREATE TABLE IF NOT EXISTS teams (
  id INTEGER PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  owner_id INTEGER NOT NULL,
  invite_code VARCHAR(32) NOT NULL,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  CONSTRAINT teams_invite_code_uq UNIQUE (invite_code)
);

ALTER TABLE teams ADD COLUMN IF NOT EXISTS invite_code VARCHAR(32);
UPDATE teams
SET invite_code = substring(md5(random()::text || clock_timestamp()::text) from 1 for 12)
WHERE invite_code IS NULL OR invite_code = '';
ALTER TABLE teams ALTER COLUMN invite_code SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'teams_invite_code_uq'
      AND conrelid = 'teams'::regclass
  ) THEN
    EXECUTE 'ALTER TABLE teams ADD CONSTRAINT teams_invite_code_uq UNIQUE (invite_code)';
  END IF;
END
$$;

CREATE INDEX IF NOT EXISTS teams_owner_id_idx ON teams(owner_id);
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'teams'
      AND column_name = 'invite_code'
  ) THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS teams_invite_code_idx ON teams(invite_code)';
  END IF;
END
$$;

CREATE TABLE IF NOT EXISTS team_members (
  id INTEGER PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  team_id INTEGER NOT NULL,
  user_id INTEGER NOT NULL,
  role VARCHAR(50) DEFAULT 'member',
  permissions TEXT[],
  invited_by INTEGER,
  invited_at TIMESTAMP DEFAULT NOW(),
  joined_at TIMESTAMP,
  status VARCHAR(50) DEFAULT 'active',
  CONSTRAINT team_members_team_fk FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE CASCADE,
  CONSTRAINT team_members_user_fk FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT team_members_team_user_uq UNIQUE (team_id, user_id)
);

CREATE INDEX IF NOT EXISTS team_members_team_id_idx ON team_members(team_id);
CREATE INDEX IF NOT EXISTS team_members_user_id_idx ON team_members(user_id);

CREATE TABLE IF NOT EXISTS team_activity_logs (
  id INTEGER PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  team_id INTEGER NOT NULL,
  user_id INTEGER,
  action VARCHAR(255) NOT NULL,
  description TEXT,
  metadata TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  CONSTRAINT team_activity_team_fk FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE CASCADE,
  CONSTRAINT team_activity_user_fk FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS team_activity_team_id_idx ON team_activity_logs(team_id);
CREATE INDEX IF NOT EXISTS team_activity_created_at_idx ON team_activity_logs(created_at);
