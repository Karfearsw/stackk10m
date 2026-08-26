-- Media assets, blobs and generic attachments for internal records,
-- seller/customer messaging, SMS/MMS and property/opportunity media.
--
-- media_assets holds metadata only; bytes live in media_blobs (Postgres) or
-- object storage (S3-compatible, same DOCUMENTS_* config as the document vault).

CREATE TABLE IF NOT EXISTS media_assets (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  team_id INTEGER NOT NULL,
  uploaded_by_user_id INTEGER NOT NULL,
  storage_mode TEXT NOT NULL DEFAULT 'db',
  storage_key TEXT,
  s3_key TEXT,
  original_filename TEXT NOT NULL,
  normalized_filename TEXT,
  mime_type TEXT NOT NULL,
  file_size_bytes BIGINT NOT NULL,
  sha256 TEXT,
  width INTEGER,
  height INTEGER,
  duration_seconds INTEGER,
  thumbnail_storage_key TEXT,
  poster_storage_key TEXT,
  processing_status TEXT NOT NULL DEFAULT 'uploaded',
  virus_scan_status TEXT NOT NULL DEFAULT 'not_scanned',
  delivery_mode TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_media_assets_team_created ON media_assets (team_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_media_assets_sha256 ON media_assets (sha256);

CREATE TABLE IF NOT EXISTS media_blobs (
  media_id BIGINT PRIMARY KEY REFERENCES media_assets(id) ON DELETE CASCADE,
  data BYTEA NOT NULL,
  thumbnail_data BYTEA,
  poster_data BYTEA,
  mime_type TEXT,
  size_bytes BIGINT,
  sha256 TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS media_attachments (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  media_asset_id BIGINT NOT NULL REFERENCES media_assets(id) ON DELETE CASCADE,
  entity_type TEXT NOT NULL,
  entity_id BIGINT NOT NULL,
  attachment_role TEXT DEFAULT 'attachment',
  sort_order INTEGER DEFAULT 0,
  created_by_user_id INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_media_attachments_entity ON media_attachments (entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_media_attachments_asset ON media_attachments (media_asset_id);

-- Dual-write metadata for the document vault blob table (0057).
ALTER TABLE vault_document_blobs ADD COLUMN IF NOT EXISTS storage_mode TEXT;
ALTER TABLE vault_document_blobs ADD COLUMN IF NOT EXISTS replication_status TEXT;
