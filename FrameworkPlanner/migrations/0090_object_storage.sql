-- 0090: Durable object storage registry (Ticket 18).
--
-- Moves file storage off the ephemeral local filesystem (Vercel) into
-- S3-compatible object storage with:
--   * separate dev/prod buckets (STORAGE_BUCKET / STORAGE_BUCKET_DEV)
--   * private-by-default access (expiring signed URLs only, never public)
--   * checksum-verified migration (no data loss)
--   * immutable flag for signed legal docs (write-once, read-only to ordinary roles)
--
-- Additive and idempotent. Does NOT move any bytes by itself — the
-- POST /api/storage/migrate endpoint (dry-run first) performs the migration.
-- Sources are never deleted by the migrator; cleanup is an explicit,
-- owner-approved step after verification.

-- Registry of every file living in durable object storage.
CREATE TABLE IF NOT EXISTS stored_files (
  id integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  original_name varchar(255) NOT NULL,
  storage_key text NOT NULL,
  bucket varchar(255) NOT NULL,
  size_bytes bigint NOT NULL,
  mime_type varchar(120) NOT NULL,
  checksum_sha256 varchar(64) NOT NULL,
  entity_type varchar(50) NOT NULL,          -- document | media | contract | recording | legacy_upload ...
  entity_id varchar(64) NOT NULL DEFAULT '0',
  is_immutable boolean NOT NULL DEFAULT FALSE, -- signed legal docs: write-once
  source_kind varchar(30),                   -- local_dir | db_blob | upload
  source_ref text,                            -- original path or table:id
  uploaded_by integer,                        -- users.id
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT stored_files_checksum_unique UNIQUE (checksum_sha256)
);

CREATE INDEX IF NOT EXISTS stored_files_entity_idx
  ON stored_files (entity_type, entity_id);
CREATE INDEX IF NOT EXISTS stored_files_bucket_key_idx
  ON stored_files (bucket, storage_key);

-- Per-environment storage configuration (informational; secrets stay in env vars).
-- Actual credentials are NEVER stored here — only bucket/region/endpoint names
-- so the settings UI can show what's active.
CREATE TABLE IF NOT EXISTS storage_config (
  id integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  environment varchar(20) NOT NULL,          -- development | production
  backend varchar(20) NOT NULL,              -- s3 | local
  bucket varchar(255),
  region varchar(64),
  endpoint text,
  is_active boolean NOT NULL DEFAULT TRUE,
  notes text,
  updated_by integer,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT storage_config_env_unique UNIQUE (environment)
);

-- Audit log of migration runs.
CREATE TABLE IF NOT EXISTS storage_migrations (
  id integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  dry_run boolean NOT NULL DEFAULT TRUE,
  scanned integer NOT NULL DEFAULT 0,
  uploaded integer NOT NULL DEFAULT 0,
  verified integer NOT NULL DEFAULT 0,
  failed integer NOT NULL DEFAULT 0,
  skipped integer NOT NULL DEFAULT 0,
  run_by integer,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Mark DB blob tables as migration-aware (idempotent; only if tables exist).
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'vault_document_blobs') THEN
    ALTER TABLE vault_document_blobs
      ADD COLUMN IF NOT EXISTS migrated_to_storage boolean NOT NULL DEFAULT FALSE;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'media_blobs') THEN
    ALTER TABLE media_blobs
      ADD COLUMN IF NOT EXISTS migrated_to_storage boolean NOT NULL DEFAULT FALSE;
  END IF;
END
$$;

-- Seed the config rows (inactive until an admin confirms settings).
INSERT INTO storage_config (environment, backend, is_active, notes)
VALUES
  ('development', 'local', FALSE, 'Default dev fallback. Set STORAGE_BUCKET_DEV to use object storage.'),
  ('production', 's3', FALSE, 'Requires STORAGE_BUCKET + credentials. Local backend is refused in prod.')
ON CONFLICT (environment) DO NOTHING;
