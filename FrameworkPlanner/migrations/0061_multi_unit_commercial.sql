-- Multi-unit & commercial deal support.
-- 1) Additive columns on properties (all nullable — no backfill needed):
--    unit_count = doors for multifamily/MHP; noi/cap_rate/zoning/parking_spaces/
--    tenancy = commercial underwriting snapshot fields.
-- 2) property_units = per-unit rent roll roster (label, beds/baths/sqft, rent,
--    status, lease dates) for apartments, duplexes, mobile home parks.
ALTER TABLE properties ADD COLUMN IF NOT EXISTS unit_count INTEGER;
ALTER TABLE properties ADD COLUMN IF NOT EXISTS noi NUMERIC(12, 2);
ALTER TABLE properties ADD COLUMN IF NOT EXISTS cap_rate NUMERIC(6, 2);
ALTER TABLE properties ADD COLUMN IF NOT EXISTS zoning VARCHAR(50);
ALTER TABLE properties ADD COLUMN IF NOT EXISTS parking_spaces INTEGER;
ALTER TABLE properties ADD COLUMN IF NOT EXISTS tenancy VARCHAR(50);

CREATE TABLE IF NOT EXISTS property_units (
  id INTEGER PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  opportunity_id INTEGER NOT NULL,
  unit_label VARCHAR(50) NOT NULL,
  beds INTEGER,
  baths NUMERIC(4, 1),
  sqft INTEGER,
  rent NUMERIC(10, 2),
  unit_status VARCHAR(50) NOT NULL DEFAULT 'vacant',
  lease_start DATE,
  lease_end DATE,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS property_units_opportunity_idx ON property_units (opportunity_id);
