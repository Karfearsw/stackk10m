-- 0065_deal_assignments_buyer_nullable.sql
-- Align deal_assignments.buyer_id with shared/schema.ts (nullable).
--
-- Context (disposition master audit, 2026-09-13): "Close Deal & Record Revenue"
-- writes the per-deal payout ledger row (deal_assignments). A deal can close
-- before an end-buyer is linked (fee collected at closing), but the live DB had
-- buyer_id NOT NULL, so every such ledger write failed with a not-null
-- violation and revenue was silently lost. The declared schema already has
-- buyer_id nullable; this migration makes the database match.
--
-- Safe + idempotent: dropping a NOT NULL constraint that is already absent is
-- a no-op; no data is removed and nothing is widened beyond what the ORM
-- already declares.

ALTER TABLE deal_assignments ALTER COLUMN buyer_id DROP NOT NULL;
