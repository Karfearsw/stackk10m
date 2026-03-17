ALTER TABLE leads
  ADD COLUMN IF NOT EXISTS assigned_to INTEGER REFERENCES users(id) ON DELETE SET NULL;

ALTER TABLE leads
  ADD COLUMN IF NOT EXISTS dedupe_key VARCHAR(400);

ALTER TABLE properties
  ADD COLUMN IF NOT EXISTS dedupe_key VARCHAR(400);

UPDATE leads
  SET dedupe_key = lower(regexp_replace(trim(coalesce(address, '')), '\s+', ' ', 'g'))
    || '|' || lower(regexp_replace(trim(coalesce(city, '')), '\s+', ' ', 'g'))
    || '|' || lower(regexp_replace(trim(coalesce(state, '')), '\s+', ' ', 'g'))
    || '|' || lower(regexp_replace(trim(coalesce(zip_code, '')), '\s+', ' ', 'g'))
    || '|' || lower(regexp_replace(trim(coalesce(owner_name, '')), '\s+', ' ', 'g'))
  WHERE dedupe_key IS NULL;

UPDATE properties
  SET dedupe_key = lower(regexp_replace(trim(coalesce(apn, '')), '\s+', ' ', 'g'))
    || '|' || lower(regexp_replace(trim(coalesce(address, '')), '\s+', ' ', 'g'))
    || '|' || lower(regexp_replace(trim(coalesce(city, '')), '\s+', ' ', 'g'))
    || '|' || lower(regexp_replace(trim(coalesce(state, '')), '\s+', ' ', 'g'))
    || '|' || lower(regexp_replace(trim(coalesce(zip_code, '')), '\s+', ' ', 'g'))
  WHERE dedupe_key IS NULL;

CREATE INDEX IF NOT EXISTS leads_dedupe_key_idx ON leads (dedupe_key);
CREATE INDEX IF NOT EXISTS properties_dedupe_key_idx ON properties (dedupe_key);

CREATE TABLE IF NOT EXISTS crm_import_jobs (
  id INTEGER PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  entity_type VARCHAR(32) NOT NULL,
  created_by INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status VARCHAR(32) DEFAULT 'queued',
  original_filename VARCHAR(255),
  file_mime_type VARCHAR(100),
  file_base64 TEXT NOT NULL,
  mapping TEXT NOT NULL,
  options TEXT NOT NULL,
  total_rows INTEGER,
  processed_rows INTEGER DEFAULT 0,
  created_count INTEGER DEFAULT 0,
  updated_count INTEGER DEFAULT 0,
  skipped_count INTEGER DEFAULT 0,
  error_count INTEGER DEFAULT 0,
  started_at TIMESTAMP,
  finished_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS crm_import_jobs_created_by_idx ON crm_import_jobs (created_by);
CREATE INDEX IF NOT EXISTS crm_import_jobs_status_idx ON crm_import_jobs (status);

CREATE TABLE IF NOT EXISTS crm_import_job_errors (
  id INTEGER PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  job_id INTEGER NOT NULL REFERENCES crm_import_jobs(id) ON DELETE CASCADE,
  row_number INTEGER NOT NULL,
  errors TEXT NOT NULL,
  raw_row TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS crm_import_job_errors_job_id_idx ON crm_import_job_errors (job_id);

CREATE TABLE IF NOT EXISTS crm_export_files (
  id INTEGER PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  entity_type VARCHAR(32) NOT NULL,
  created_by INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status VARCHAR(32) DEFAULT 'queued',
  format VARCHAR(16) NOT NULL,
  filename VARCHAR(255),
  mime_type VARCHAR(100),
  content_base64 TEXT,
  token_hash VARCHAR(64),
  expires_at TIMESTAMP,
  filters TEXT NOT NULL,
  columns TEXT NOT NULL,
  started_at TIMESTAMP,
  finished_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS crm_export_files_created_by_idx ON crm_export_files (created_by);
CREATE INDEX IF NOT EXISTS crm_export_files_status_idx ON crm_export_files (status);
