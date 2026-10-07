-- 0077: Unify pipeline stage taxonomy (Ticket 7).
--
-- Non-destructive: this maps legacy stage values onto the canonical taxonomy
-- defined in shared/pipeline-stages.ts. It never deletes rows. Any value that
-- cannot be mapped is left untouched and is listed by the exception report at
-- the bottom of this file (run it manually and review before any follow-up).
--
-- Idempotent: canonical values are unchanged, so re-running is a no-op.

-- Opportunities: properties.stage
UPDATE properties SET stage = 'lead'         WHERE lower(stage) IN ('active', 'prospect');
UPDATE properties SET stage = 'negotiating'  WHERE lower(stage) = 'negotiation';
UPDATE properties SET stage = 'in_disposition' WHERE lower(stage) = 'pending';
UPDATE properties SET stage = 'dead'         WHERE lower(stage) IN ('withdrawn', 'lost');
UPDATE properties SET stage = 'voided'       WHERE lower(stage) IN ('cancelled', 'canceled');

-- Leads: leads.status
UPDATE leads SET status = 'new'           WHERE lower(status) = 'active';
UPDATE leads SET status = 'contacted'     WHERE lower(status) = 'pending';
UPDATE leads SET status = 'negotiation'   WHERE lower(status) IN ('negotiating', 'in_disposition');
UPDATE leads SET status = 'under_contract' WHERE lower(status) = 'reserved';
UPDATE leads SET status = 'closed'        WHERE lower(status) = 'sold';
UPDATE leads SET status = 'lost'          WHERE lower(status) IN ('dead', 'void', 'voided', 'cancelled', 'canceled');

-- Exception report — run manually to find anything still non-canonical:
--
--   SELECT stage, count(*) AS n FROM properties
--    WHERE stage NOT IN ('lead','contacted','negotiating','under_contract',
--                        'in_disposition','reserved','sold','closed','dead','voided')
--    GROUP BY stage ORDER BY n DESC;
--
--   SELECT status, count(*) AS n FROM leads
--    WHERE status NOT IN ('new','contacted','qualified','negotiation',
--                         'under_contract','closed','lost')
--    GROUP BY status ORDER BY n DESC;
--
-- Stored per-user pipeline_configs rows are normalized on read/write by the
-- /api/pipeline-config endpoints, so no JSON rewrite is needed here.
