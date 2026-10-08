-- 0094_loi_esign_bridge.sql
-- Link LOIs to opportunities/deals and to e-sign envelopes.

-- Link LOIs to opportunities (deals)
ALTER TABLE lois ADD COLUMN IF NOT EXISTS opportunity_id integer;

-- Link LOIs to their e-sign envelope (when sent for signature)
ALTER TABLE lois ADD COLUMN IF NOT EXISTS envelope_id integer;

-- Track LOI PDF storage
ALTER TABLE lois ADD COLUMN IF NOT EXISTS pdf_storage_key varchar(500);

-- Expiration date for the LOI offer
ALTER TABLE lois ADD COLUMN IF NOT EXISTS expires_at timestamp;

-- Index for deal-based LOI lookups
CREATE INDEX IF NOT EXISTS idx_lois_opportunity_id ON lois(opportunity_id);
CREATE INDEX IF NOT EXISTS idx_lois_envelope_id ON lois(envelope_id);
CREATE INDEX IF NOT EXISTS idx_lois_status ON lois(status);
