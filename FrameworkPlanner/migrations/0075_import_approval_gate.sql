-- Ticket 01 — Freeze uncontrolled lead imports.
-- Adds explicit source attribution + approval metadata to import batches so an
-- unapproved bulk import cannot mutate production records.

ALTER TABLE crm_import_jobs
  ADD COLUMN IF NOT EXISTS source VARCHAR(64) DEFAULT 'manual_upload';

ALTER TABLE crm_import_jobs
  ADD COLUMN IF NOT EXISTS approval_status VARCHAR(32) DEFAULT 'pending';

ALTER TABLE crm_import_jobs
  ADD COLUMN IF NOT EXISTS approved_by INTEGER;

ALTER TABLE crm_import_jobs
  ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ;

ALTER TABLE crm_import_jobs
  ADD COLUMN IF NOT EXISTS rejection_reason TEXT;

ALTER TABLE crm_import_jobs
  ADD COLUMN IF NOT EXISTS import_signature VARCHAR(64);

-- Rows that already completed under the old behaviour remain valid batches.
UPDATE crm_import_jobs
  SET approval_status = 'not_required'
  WHERE approval_status IS NULL OR approval_status = 'pending';

CREATE INDEX IF NOT EXISTS crm_import_jobs_source_idx ON crm_import_jobs (source);
CREATE INDEX IF NOT EXISTS crm_import_jobs_approval_status_idx ON crm_import_jobs (approval_status);
CREATE INDEX IF NOT EXISTS crm_import_jobs_import_signature_idx ON crm_import_jobs (import_signature);
