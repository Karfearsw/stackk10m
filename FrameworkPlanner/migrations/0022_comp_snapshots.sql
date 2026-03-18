CREATE TABLE IF NOT EXISTS comp_snapshots (
  id SERIAL PRIMARY KEY,
  property_id INTEGER NOT NULL,
  provider_name VARCHAR(100) NOT NULL,
  requested_at TIMESTAMP NOT NULL DEFAULT NOW(),
  comps_json TEXT NOT NULL DEFAULT '[]',
  raw_response_json TEXT,
  arv_suggestion NUMERIC,
  offer_range_min NUMERIC,
  offer_range_max NUMERIC,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_comp_snapshots_property ON comp_snapshots (property_id, requested_at DESC);

