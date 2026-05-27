ALTER TABLE xp_locations
  ADD COLUMN IF NOT EXISTS slug VARCHAR(120),
  ADD COLUMN IF NOT EXISTS images TEXT[],
  ADD COLUMN IF NOT EXISTS description TEXT,
  ADD COLUMN IF NOT EXISTS highlights TEXT[],
  ADD COLUMN IF NOT EXISTS hero_image TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_xp_locations_slug_unique ON xp_locations(slug) WHERE slug IS NOT NULL;

ALTER TABLE xp_experiences
  ADD COLUMN IF NOT EXISTS location_id INTEGER;

CREATE INDEX IF NOT EXISTS idx_xp_experiences_location_id ON xp_experiences(location_id) WHERE location_id IS NOT NULL;

