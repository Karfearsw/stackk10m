CREATE TABLE IF NOT EXISTS time_clock_sessions (
  id INTEGER PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  user_id INTEGER NOT NULL,
  employee VARCHAR(255) NOT NULL,
  task VARCHAR(255) NOT NULL DEFAULT 'General',
  clock_in_at TIMESTAMP NOT NULL,
  clock_out_at TIMESTAMP,
  tz_offset_minutes INTEGER NOT NULL,
  auto_started BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  CONSTRAINT fk_time_clock_sessions_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS time_clock_sessions_user_id_idx ON time_clock_sessions(user_id);
CREATE INDEX IF NOT EXISTS time_clock_sessions_open_idx ON time_clock_sessions(user_id, clock_out_at);
CREATE UNIQUE INDEX IF NOT EXISTS time_clock_sessions_one_open_per_user ON time_clock_sessions(user_id) WHERE clock_out_at IS NULL;
