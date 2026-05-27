CREATE TABLE IF NOT EXISTS commission_events (
  id INTEGER PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  source_type VARCHAR(20) NOT NULL,
  source_id INTEGER NOT NULL,
  milestone VARCHAR(40) NOT NULL,
  event_date DATE NOT NULL,
  gross_amount DECIMAL(12, 2),
  currency VARCHAR(8) NOT NULL DEFAULT 'USD',
  metadata JSONB,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS commission_events_unique ON commission_events(source_type, source_id, milestone);
CREATE INDEX IF NOT EXISTS commission_events_event_date_idx ON commission_events(event_date);

CREATE TABLE IF NOT EXISTS deal_participants (
  id INTEGER PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  source_type VARCHAR(20) NOT NULL,
  source_id INTEGER NOT NULL,
  user_id INTEGER NOT NULL,
  role VARCHAR(32) NOT NULL,
  split_pct DECIMAL(5, 2),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  CONSTRAINT fk_deal_participants_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT deal_participants_unique UNIQUE (source_type, source_id, user_id, role)
);

CREATE INDEX IF NOT EXISTS deal_participants_source_idx ON deal_participants(source_type, source_id);
CREATE INDEX IF NOT EXISTS deal_participants_user_id_idx ON deal_participants(user_id);

CREATE TABLE IF NOT EXISTS commission_ledger_entries (
  id INTEGER PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  event_id INTEGER NOT NULL,
  user_id INTEGER NOT NULL,
  amount DECIMAL(12, 2) NOT NULL DEFAULT 0,
  status VARCHAR(20) NOT NULL DEFAULT 'draft',
  rule_snapshot JSONB,
  approved_by_user_id INTEGER,
  approved_at TIMESTAMP,
  paid_at TIMESTAMP,
  disputed_reason TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  CONSTRAINT fk_commission_ledger_event FOREIGN KEY (event_id) REFERENCES commission_events(id) ON DELETE CASCADE,
  CONSTRAINT fk_commission_ledger_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_commission_ledger_approved_by_user FOREIGN KEY (approved_by_user_id) REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT commission_ledger_entries_unique UNIQUE (event_id, user_id)
);

CREATE INDEX IF NOT EXISTS commission_ledger_entries_user_status_idx ON commission_ledger_entries(user_id, status);
CREATE INDEX IF NOT EXISTS commission_ledger_entries_status_idx ON commission_ledger_entries(status);

