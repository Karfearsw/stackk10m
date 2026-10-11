-- Signal import idempotency: re-running a municipal import must not duplicate rows.
-- Adds source_record_id + a partial unique index on (source, source_record_id)
-- so INSERT ... ON CONFLICT DO NOTHING skips already-imported records.
-- Existing rows keep NULL (excluded from the partial index); a backfill script
-- stamps the earliest row per content hash after deploy.

ALTER TABLE distress_signals ADD COLUMN IF NOT EXISTS source_record_id varchar(200);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS uq_distress_signals_source_record
  ON distress_signals (source, source_record_id)
  WHERE source_record_id IS NOT NULL;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_distress_signals_source_record
  ON distress_signals (source_record_id)
  WHERE source_record_id IS NOT NULL;
