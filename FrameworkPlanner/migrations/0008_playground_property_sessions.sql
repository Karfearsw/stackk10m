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

DO $$
BEGIN
  -- The global unique index on address_key is historical: migration 0030 drops
  -- it in favor of a per-user unique index (created_by, address_key). On replay
  -- against databases that accumulated duplicate address_key rows (stale data
  -- from earlier builds), a bare CREATE UNIQUE INDEX would raise a
  -- duplicate-key violation and abort the whole migration run.
  -- Skip creation while duplicates exist; 0058_repair_*.sql repairs the data.
  IF NOT EXISTS (
    SELECT 1 FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE c.relname = 'playground_property_sessions_address_key_uq'
      AND n.nspname = current_schema()
  ) AND NOT EXISTS (
    SELECT 1 FROM playground_property_sessions
    GROUP BY address_key HAVING count(*) > 1
    LIMIT 1
  ) THEN
    CREATE UNIQUE INDEX playground_property_sessions_address_key_uq
      ON playground_property_sessions(address_key);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS playground_property_sessions_recent_idx
  ON playground_property_sessions(last_opened_at DESC);
