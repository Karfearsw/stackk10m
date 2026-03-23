ALTER TABLE properties ADD COLUMN IF NOT EXISTS images TEXT[];

ALTER TABLE properties ADD COLUMN IF NOT EXISTS property_type VARCHAR(50);
ALTER TABLE properties ADD COLUMN IF NOT EXISTS condition VARCHAR(50);

ALTER TABLE properties ADD COLUMN IF NOT EXISTS latitude NUMERIC(9, 6);
ALTER TABLE properties ADD COLUMN IF NOT EXISTS longitude NUMERIC(9, 6);

ALTER TABLE properties ADD COLUMN IF NOT EXISTS sold_price NUMERIC(12, 2);
ALTER TABLE properties ADD COLUMN IF NOT EXISTS sold_date DATE;

ALTER TABLE properties ADD COLUMN IF NOT EXISTS rent_per_month NUMERIC(12, 2);
ALTER TABLE properties ADD COLUMN IF NOT EXISTS rented_date DATE;

ALTER TABLE properties ADD COLUMN IF NOT EXISTS repair_cost NUMERIC(12, 2);

CREATE INDEX IF NOT EXISTS idx_properties_property_type ON properties (property_type);
CREATE INDEX IF NOT EXISTS idx_properties_geo ON properties (state, zip_code);
CREATE INDEX IF NOT EXISTS idx_properties_sold_date ON properties (sold_date);
CREATE INDEX IF NOT EXISTS idx_properties_rented_date ON properties (rented_date);
