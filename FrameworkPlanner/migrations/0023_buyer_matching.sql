ALTER TABLE buyers ADD COLUMN IF NOT EXISTS zip_codes TEXT[];
ALTER TABLE buyers ADD COLUMN IF NOT EXISTS min_price NUMERIC;
ALTER TABLE buyers ADD COLUMN IF NOT EXISTS max_price NUMERIC;
ALTER TABLE buyers ADD COLUMN IF NOT EXISTS min_beds INTEGER;
ALTER TABLE buyers ADD COLUMN IF NOT EXISTS max_beds INTEGER;
ALTER TABLE buyers ADD COLUMN IF NOT EXISTS property_types TEXT[];

CREATE TABLE IF NOT EXISTS deal_buyer_matches (
  id SERIAL PRIMARY KEY,
  property_id INTEGER NOT NULL,
  buyer_id INTEGER NOT NULL,
  score INTEGER NOT NULL,
  computed_at TIMESTAMP NOT NULL DEFAULT NOW(),
  UNIQUE (property_id, buyer_id)
);

CREATE INDEX IF NOT EXISTS idx_deal_buyer_matches_property ON deal_buyer_matches (property_id, score DESC);

