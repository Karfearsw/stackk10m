-- Ticket 02 — quarantine production test data (reversible; nothing is deleted).
-- Marks records that match reviewed test patterns so they can be excluded from
-- queues and business metrics while preserving relationships and audit history.

CREATE TABLE IF NOT EXISTS quarantined_records (
  id INTEGER PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  entity_type VARCHAR(32) NOT NULL,
  entity_id INTEGER NOT NULL,
  match_reason TEXT NOT NULL,
  matched_pattern VARCHAR(64),
  matched_field VARCHAR(32),
  status VARCHAR(16) NOT NULL DEFAULT 'quarantined',
  flagged_by INTEGER,
  flagged_at TIMESTAMPTZ DEFAULT NOW(),
  restored_by INTEGER,
  restored_at TIMESTAMPTZ,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- At most one active quarantine row per record; history rows are preserved.
CREATE UNIQUE INDEX IF NOT EXISTS quarantined_records_active_uniq
  ON quarantined_records (entity_type, entity_id)
  WHERE status = 'quarantined';

CREATE INDEX IF NOT EXISTS quarantined_records_entity_idx ON quarantined_records (entity_type, entity_id);
CREATE INDEX IF NOT EXISTS quarantined_records_status_idx ON quarantined_records (status);
