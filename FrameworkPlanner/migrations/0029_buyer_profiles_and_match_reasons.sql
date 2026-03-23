CREATE TABLE IF NOT EXISTS buyer_profiles (
  id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL,
  target_states TEXT[],
  target_zips TEXT[],
  strategies TEXT[],
  min_spread NUMERIC(12, 2),
  min_yield NUMERIC(8, 4),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

ALTER TABLE buyer_profiles
  ADD CONSTRAINT buyer_profiles_id_fk
  FOREIGN KEY (id) REFERENCES buyers (id) ON DELETE CASCADE;

ALTER TABLE buyer_profiles
  ADD CONSTRAINT buyer_profiles_user_id_fk
  FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_buyer_profiles_user_id ON buyer_profiles (user_id);

ALTER TABLE deal_buyer_matches ADD COLUMN IF NOT EXISTS reasons JSONB NOT NULL DEFAULT '[]'::jsonb;
