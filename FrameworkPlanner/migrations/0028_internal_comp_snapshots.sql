CREATE TABLE IF NOT EXISTS comp_snapshot_rows (
  id SERIAL PRIMARY KEY,
  opportunity_id INTEGER NOT NULL,
  comp_property_id INTEGER NOT NULL,
  distance_miles NUMERIC(8, 3),
  sold_price NUMERIC(12, 2),
  sold_date DATE,
  is_rental_comp BOOLEAN NOT NULL DEFAULT false,
  rent_per_month NUMERIC(12, 2),
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE (opportunity_id, comp_property_id, is_rental_comp)
);

CREATE INDEX IF NOT EXISTS idx_comp_snapshot_rows_opportunity ON comp_snapshot_rows (opportunity_id, is_rental_comp);
CREATE INDEX IF NOT EXISTS idx_comp_snapshot_rows_sold_date ON comp_snapshot_rows (sold_date);
