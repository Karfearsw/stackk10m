CREATE TABLE IF NOT EXISTS teams (
  id INTEGER PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  owner_id INTEGER NOT NULL,
  join_code VARCHAR(64),
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

ALTER TABLE teams ADD COLUMN IF NOT EXISTS join_code VARCHAR(64);

UPDATE teams
SET join_code = substring(md5(random()::text || clock_timestamp()::text) from 1 for 12)
WHERE join_code IS NULL OR join_code = '';

CREATE UNIQUE INDEX IF NOT EXISTS idx_teams_join_code_unique ON teams(join_code);

ALTER TABLE teams
ALTER COLUMN join_code SET NOT NULL;

CREATE TABLE IF NOT EXISTS team_members (
  id INTEGER PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  team_id INTEGER NOT NULL,
  user_id INTEGER NOT NULL,
  role VARCHAR(50) DEFAULT 'member',
  permissions TEXT[],
  invited_by INTEGER,
  invited_at TIMESTAMP DEFAULT NOW(),
  joined_at TIMESTAMP,
  status VARCHAR(50) DEFAULT 'active'
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_team_members_team_user_unique ON team_members(team_id, user_id);
CREATE INDEX IF NOT EXISTS idx_team_members_user_id ON team_members(user_id);

CREATE TABLE IF NOT EXISTS team_activity_logs (
  id INTEGER PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  team_id INTEGER NOT NULL,
  user_id INTEGER,
  action VARCHAR(255) NOT NULL,
  description TEXT,
  metadata TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_team_activity_logs_team_id_created_at ON team_activity_logs(team_id, created_at);
