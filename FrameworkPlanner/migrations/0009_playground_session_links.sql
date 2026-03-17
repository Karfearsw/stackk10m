ALTER TABLE playground_property_sessions
  ADD COLUMN IF NOT EXISTS lead_id INTEGER REFERENCES leads(id) ON DELETE SET NULL;

ALTER TABLE playground_property_sessions
  ADD COLUMN IF NOT EXISTS property_id INTEGER REFERENCES properties(id) ON DELETE SET NULL;

