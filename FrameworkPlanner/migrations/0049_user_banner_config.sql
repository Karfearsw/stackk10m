-- 0049: Dashboard banner management.
-- users.banner_config stores the full banner state (enabled flag + ordered image
-- list with per-image active flag) so defaults can be removed/reordered/disabled
-- and the whole banner can be hidden. Additive only.
ALTER TABLE users ADD COLUMN IF NOT EXISTS banner_config jsonb;
