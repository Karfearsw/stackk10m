-- DB-backed property/opportunity photo storage: stores image bytes in Postgres
-- when no S3 (PROPERTY_PHOTOS_BUCKET + PROPERTY_PHOTOS_REGION) is configured.
CREATE TABLE IF NOT EXISTS property_photo_blobs (
  storage_key TEXT PRIMARY KEY,
  data BYTEA NOT NULL,
  mime_type TEXT,
  size_bytes BIGINT,
  sha256 TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_property_photo_blobs_sha256 ON property_photo_blobs (sha256);
