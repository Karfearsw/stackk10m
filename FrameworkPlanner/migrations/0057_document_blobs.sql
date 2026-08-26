-- DB-backed document storage: stores file bytes in Postgres when no S3
-- vault (DOCUMENTS_BUCKET + DOCUMENTS_REGION) is configured.
CREATE TABLE IF NOT EXISTS vault_document_blobs (
  storage_key TEXT PRIMARY KEY,
  data BYTEA NOT NULL,
  mime_type TEXT,
  size_bytes BIGINT,
  sha256 TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_vault_document_blobs_sha256 ON vault_document_blobs (sha256);
