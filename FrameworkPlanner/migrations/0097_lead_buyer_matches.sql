-- 0097_lead_buyer_matches.sql
-- Lead-to-buyer matching: when a seller lead comes in, score every active buyer
-- against the lead's location/price/profile and persist the top matches.
-- Mirrors deal_buyer_matches (which is opportunity/property-scoped).

CREATE TABLE IF NOT EXISTS lead_buyer_matches (
  id integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  lead_id integer NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  buyer_id integer NOT NULL REFERENCES buyers(id) ON DELETE CASCADE,
  score integer NOT NULL DEFAULT 0,
  reasons jsonb NOT NULL DEFAULT '[]'::jsonb,
  notified_at timestamp with time zone,
  computed_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE (lead_id, buyer_id)
);

CREATE INDEX IF NOT EXISTS idx_lead_buyer_matches_lead ON lead_buyer_matches (lead_id);
CREATE INDEX IF NOT EXISTS idx_lead_buyer_matches_buyer ON lead_buyer_matches (buyer_id);
CREATE INDEX IF NOT EXISTS idx_lead_buyer_matches_score ON lead_buyer_matches (lead_id, score DESC);
