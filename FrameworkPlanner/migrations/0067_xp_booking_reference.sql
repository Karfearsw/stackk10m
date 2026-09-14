-- P0 #5 (audit 2026-09-14): every XP booking needs a customer-facing
-- reference code (PNR-style) shown on confirmations and searchable in the
-- admin grid. Column is nullable so the checkout flow can generate it
-- atomically on insert; legacy rows get backfilled below.
ALTER TABLE xp_bookings ADD COLUMN IF NOT EXISTS reference_code VARCHAR(20);

CREATE UNIQUE INDEX IF NOT EXISTS idx_xp_bookings_reference_code
  ON xp_bookings(reference_code)
  WHERE reference_code IS NOT NULL;

-- Backfill any pre-existing rows that were created before the column existed.
UPDATE xp_bookings
SET reference_code = 'OL-' || upper(
  regexp_replace(
    encode(gen_random_bytes(4), 'hex'),
    '[^A-Z0-9]', '', 'g'
  )
)
WHERE reference_code IS NULL;
