ALTER TABLE properties ADD COLUMN IF NOT EXISTS lead_source VARCHAR(100);
ALTER TABLE properties ADD COLUMN IF NOT EXISTS lead_source_detail VARCHAR(255);

CREATE INDEX IF NOT EXISTS idx_properties_lead_source ON properties (lead_source);

CREATE TABLE IF NOT EXISTS lead_source_options (
  id SERIAL PRIMARY KEY,
  user_id INTEGER,
  value VARCHAR(100) NOT NULL,
  label VARCHAR(120) NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

ALTER TABLE lead_source_options ADD COLUMN IF NOT EXISTS sort_order INTEGER NOT NULL DEFAULT 0;

CREATE UNIQUE INDEX IF NOT EXISTS ux_lead_source_options_user_value ON lead_source_options (user_id, value);

INSERT INTO lead_source_options (user_id, value, label, is_active, sort_order)
VALUES
  (NULL, 'driving_for_dollars', 'Driving for Dollars', true, 10),
  (NULL, 'cold_calling', 'Cold Calling', true, 20),
  (NULL, 'ppc', 'PPC', true, 30),
  (NULL, 'direct_mail', 'Direct Mail', true, 40),
  (NULL, 'mls', 'MLS', true, 50),
  (NULL, 'referral', 'Referral', true, 60)
ON CONFLICT DO NOTHING;

