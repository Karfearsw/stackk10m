CREATE TABLE IF NOT EXISTS pay_periods (
  id INTEGER PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'open',
  created_by_user_id INTEGER,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  CONSTRAINT fk_pay_periods_created_by_user FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS pay_periods_unique_range ON pay_periods(start_date, end_date);
CREATE INDEX IF NOT EXISTS pay_periods_status_idx ON pay_periods(status);

CREATE TABLE IF NOT EXISTS approval_events (
  id INTEGER PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  entity_type VARCHAR(32) NOT NULL,
  entity_id INTEGER NOT NULL,
  action VARCHAR(32) NOT NULL,
  by_user_id INTEGER,
  notes TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  CONSTRAINT fk_approval_events_by_user FOREIGN KEY (by_user_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS approval_events_entity_idx ON approval_events(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS approval_events_created_at_idx ON approval_events(created_at);

