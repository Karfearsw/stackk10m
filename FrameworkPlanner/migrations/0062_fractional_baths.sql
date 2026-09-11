-- 0062: Fractional bathrooms on properties (e.g. 1.5 / 2.5 baths).
-- properties.baths was INTEGER, which rejected half-bath values at the DB level
-- (forms flagged "1.5" as invalid spinbutton input). Switch to NUMERIC(4,1) to
-- match property_units.baths from migration 0061.
ALTER TABLE properties ALTER COLUMN baths TYPE NUMERIC(4, 1) USING baths::numeric;
