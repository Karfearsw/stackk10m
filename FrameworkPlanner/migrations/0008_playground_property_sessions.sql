CREATE TABLE IF NOT EXISTS playground_property_sessions (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  address VARCHAR(500) NOT NULL,
  address_key TEXT NOT NULL,
  property_type VARCHAR(50),
  current_url TEXT,
  tags_json TEXT NOT NULL DEFAULT '[]',
  bookmarks_json TEXT NOT NULL DEFAULT '[]',
  checklist_json TEXT NOT NULL DEFAULT '{}',
  notes_json TEXT NOT NULL DEFAULT '[]',
  underwriting_json TEXT NOT NULL DEFAULT '{}',
  assigned_to INTEGER REFERENCES users(id) ON DELETE SET NULL,
  assignment_due_at TIMESTAMP,
  assignment_status VARCHAR(50),
  created_by INTEGER NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  updated_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  last_opened_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  last_opened_at TIMESTAMP DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS playground_property_sessions_address_key_uq
  ON playground_property_sessions(address_key);

CREATE INDEX IF NOT EXISTS playground_property_sessions_recent_idx
  ON playground_property_sessions(last_opened_at DESC);

