-- Buyer dedupe enforcement (Part 2 of disposition polish).
-- 1) Clear duplicated dedupe_key values (keep the earliest row's key) so the
--    unique index can build. No buyer rows are deleted — the key is just
--    un-stamped on later duplicates; application-level matching still finds
--    them via normalized email/phone.
-- 2) Partial unique index so new inserts with the same stamped key conflict
--    instead of duplicating (storage.createBuyer uses ON CONFLICT DO NOTHING).

UPDATE buyers SET dedupe_key = NULL
WHERE id IN (
  SELECT id FROM (
    SELECT id, ROW_NUMBER() OVER (PARTITION BY dedupe_key ORDER BY id) AS rn
    FROM buyers
    WHERE dedupe_key IS NOT NULL AND dedupe_key <> ''
  ) s WHERE rn > 1
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS uq_buyers_dedupe_key
  ON buyers (dedupe_key)
  WHERE dedupe_key IS NOT NULL AND dedupe_key <> '';
