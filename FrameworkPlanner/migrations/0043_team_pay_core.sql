CREATE TABLE IF NOT EXISTS work_categories (
  id INTEGER PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  code VARCHAR(64) NOT NULL UNIQUE,
  name VARCHAR(255) NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  default_hourly_rate DECIMAL(10, 2),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

ALTER TABLE timesheet_entries ADD COLUMN IF NOT EXISTS category_id INTEGER;
ALTER TABLE timesheet_entries ADD COLUMN IF NOT EXISTS linked_entity_type VARCHAR(32);
ALTER TABLE timesheet_entries ADD COLUMN IF NOT EXISTS linked_entity_id INTEGER;
ALTER TABLE timesheet_entries ADD COLUMN IF NOT EXISTS status VARCHAR(20) NOT NULL DEFAULT 'draft';
ALTER TABLE timesheet_entries ADD COLUMN IF NOT EXISTS approved_by_user_id INTEGER;
ALTER TABLE timesheet_entries ADD COLUMN IF NOT EXISTS approved_at TIMESTAMP;
ALTER TABLE timesheet_entries ADD COLUMN IF NOT EXISTS paid_at TIMESTAMP;
ALTER TABLE timesheet_entries ADD COLUMN IF NOT EXISTS anomaly_flags TEXT[];
ALTER TABLE timesheet_entries ADD COLUMN IF NOT EXISTS payable_hours DECIMAL(5, 2);

ALTER TABLE time_clock_sessions ADD COLUMN IF NOT EXISTS auto_closed BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE time_clock_sessions ADD COLUMN IF NOT EXISTS auto_closed_reason TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.table_constraints
    WHERE constraint_name = 'fk_timesheet_entries_work_category'
  ) THEN
    ALTER TABLE timesheet_entries
      ADD CONSTRAINT fk_timesheet_entries_work_category
      FOREIGN KEY (category_id) REFERENCES work_categories(id) ON DELETE SET NULL;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.table_constraints
    WHERE constraint_name = 'fk_timesheet_entries_approved_by_user'
  ) THEN
    ALTER TABLE timesheet_entries
      ADD CONSTRAINT fk_timesheet_entries_approved_by_user
      FOREIGN KEY (approved_by_user_id) REFERENCES users(id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS timesheet_entries_category_id_idx ON timesheet_entries(category_id);
CREATE INDEX IF NOT EXISTS timesheet_entries_status_idx ON timesheet_entries(status);
CREATE INDEX IF NOT EXISTS timesheet_entries_linked_entity_idx ON timesheet_entries(linked_entity_type, linked_entity_id);

INSERT INTO work_categories (code, name) VALUES
  ('calls', 'Calls'),
  ('follow_up', 'Follow-up'),
  ('underwriting', 'Underwriting'),
  ('skip_tracing', 'Skip Tracing'),
  ('admin', 'Admin'),
  ('dispo', 'Dispo'),
  ('training', 'Training'),
  ('field_work', 'Field Work')
ON CONFLICT (code) DO NOTHING;

