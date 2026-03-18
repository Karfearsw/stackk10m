CREATE TABLE IF NOT EXISTS user_feature_flags (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL,
  flag VARCHAR(80) NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE (user_id, flag)
);

CREATE INDEX IF NOT EXISTS idx_user_feature_flags_user_id ON user_feature_flags (user_id);
CREATE INDEX IF NOT EXISTS idx_user_feature_flags_flag ON user_feature_flags (flag);

