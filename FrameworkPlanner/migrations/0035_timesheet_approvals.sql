ALTER TABLE IF EXISTS timesheet_entries
  ADD COLUMN IF NOT EXISTS team_id INTEGER;

ALTER TABLE IF EXISTS timesheet_entries
  ADD COLUMN IF NOT EXISTS status VARCHAR(20) NOT NULL DEFAULT 'draft';

ALTER TABLE IF EXISTS timesheet_entries
  ADD COLUMN IF NOT EXISTS submitted_at TIMESTAMP;

ALTER TABLE IF EXISTS timesheet_entries
  ADD COLUMN IF NOT EXISTS approved_at TIMESTAMP;

ALTER TABLE IF EXISTS timesheet_entries
  ADD COLUMN IF NOT EXISTS approved_by INTEGER;

ALTER TABLE IF EXISTS timesheet_entries
  ADD COLUMN IF NOT EXISTS rejected_reason TEXT;

CREATE INDEX IF NOT EXISTS timesheet_entries_team_id_idx ON timesheet_entries(team_id);
CREATE INDEX IF NOT EXISTS timesheet_entries_status_idx ON timesheet_entries(status);

ALTER TABLE IF EXISTS time_clock_sessions
  ADD COLUMN IF NOT EXISTS team_id INTEGER;

CREATE INDEX IF NOT EXISTS time_clock_sessions_team_id_idx ON time_clock_sessions(team_id);

