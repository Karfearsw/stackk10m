-- Extend dialer_scripts into a full script library
ALTER TABLE dialer_scripts ADD COLUMN IF NOT EXISTS category varchar(50) DEFAULT 'general';
ALTER TABLE dialer_scripts ADD COLUMN IF NOT EXISTS description text DEFAULT '';
ALTER TABLE dialer_scripts ADD COLUMN IF NOT EXISTS tags text[] DEFAULT '{}';
ALTER TABLE dialer_scripts ADD COLUMN IF NOT EXISTS is_archived boolean DEFAULT false;
ALTER TABLE dialer_scripts ADD COLUMN IF NOT EXISTS use_count integer DEFAULT 0;
ALTER TABLE dialer_scripts ADD COLUMN IF NOT EXISTS avg_practice_seconds integer DEFAULT 0;
ALTER TABLE dialer_scripts ADD COLUMN IF NOT EXISTS total_practice_count integer DEFAULT 0;
ALTER TABLE dialer_scripts ADD COLUMN IF NOT EXISTS last_practiced_at timestamp;

-- Practice sessions log
CREATE TABLE IF NOT EXISTS script_practice_sessions (
  id integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  user_id integer NOT NULL,
  script_id integer NOT NULL REFERENCES dialer_scripts(id) ON DELETE CASCADE,
  duration_seconds integer NOT NULL DEFAULT 0,
  notes text DEFAULT '',
  lead_id integer,
  created_at timestamp DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_script_practice_user ON script_practice_sessions (user_id);
CREATE INDEX IF NOT EXISTS idx_script_practice_script ON script_practice_sessions (script_id);
CREATE INDEX IF NOT EXISTS idx_script_practice_created ON script_practice_sessions (created_at DESC);

-- Indexes for library features
CREATE INDEX IF NOT EXISTS idx_dialer_scripts_category ON dialer_scripts (user_id, category);
CREATE INDEX IF NOT EXISTS idx_dialer_scripts_archived ON dialer_scripts (user_id, is_archived);
