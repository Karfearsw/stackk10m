CREATE TABLE IF NOT EXISTS playground_property_sessions (
  id INTEGER PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  address VARCHAR(500) NOT NULL,
  address_key TEXT NOT NULL,
  property_type VARCHAR(50),
  current_url TEXT,
  tags_json TEXT NOT NULL DEFAULT '[]',
  bookmarks_json TEXT NOT NULL DEFAULT '[]',
  checklist_json TEXT NOT NULL DEFAULT '{}',
  notes_json TEXT NOT NULL DEFAULT '[]',
  underwriting_json TEXT NOT NULL DEFAULT '{}',
  lead_id INTEGER,
  property_id INTEGER,
  assigned_to INTEGER,
  assignment_due_at TIMESTAMP,
  assignment_status VARCHAR(50),
  created_by INTEGER NOT NULL,
  updated_by INTEGER,
  last_opened_by INTEGER,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  last_opened_at TIMESTAMP DEFAULT NOW(),
  CONSTRAINT fk_playground_property_sessions_lead FOREIGN KEY (lead_id) REFERENCES leads(id) ON DELETE SET NULL,
  CONSTRAINT fk_playground_property_sessions_property FOREIGN KEY (property_id) REFERENCES properties(id) ON DELETE SET NULL
);

ALTER TABLE playground_property_sessions ADD COLUMN IF NOT EXISTS lead_id INTEGER;
ALTER TABLE playground_property_sessions ADD COLUMN IF NOT EXISTS property_id INTEGER;

CREATE UNIQUE INDEX IF NOT EXISTS playground_property_sessions_address_key_uq ON playground_property_sessions(address_key);
CREATE INDEX IF NOT EXISTS playground_property_sessions_lead_id_idx ON playground_property_sessions(lead_id);
CREATE INDEX IF NOT EXISTS playground_property_sessions_property_id_idx ON playground_property_sessions(property_id);
