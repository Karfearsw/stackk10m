-- Migration to support Opportunity terminology and pipeline automation
-- This migration ensures we can use "Opportunities" terminology while keeping "Properties" for backward compatibility
-- For this phase, we are using the existing properties table but adding indexes for performance

-- Add indexes to support frequent pipeline status queries
CREATE INDEX IF NOT EXISTS idx_properties_status ON properties(status);
CREATE INDEX IF NOT EXISTS idx_leads_status ON leads(status);

-- Add index to support lead-to-opportunity automation lookups
CREATE INDEX IF NOT EXISTS idx_properties_source_lead_id ON properties(source_lead_id);

-- Optional: Create a view for 'opportunities' if we want to query it directly in SQL
-- CREATE OR REPLACE VIEW opportunities AS SELECT * FROM properties;
