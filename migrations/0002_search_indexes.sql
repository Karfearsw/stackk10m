CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Leads search indexes
CREATE INDEX IF NOT EXISTS idx_leads_address_trgm ON leads USING gin (address gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_leads_city_trgm ON leads USING gin (city gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_leads_state ON leads (state);
CREATE INDEX IF NOT EXISTS idx_leads_owner_name_trgm ON leads USING gin (owner_name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_leads_owner_phone_trgm ON leads USING gin (owner_phone gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_leads_owner_email_trgm ON leads USING gin (owner_email gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_leads_zip_code ON leads (zip_code);

-- Properties/Opportunities search indexes
CREATE INDEX IF NOT EXISTS idx_properties_address_trgm ON properties USING gin (address gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_properties_city_trgm ON properties USING gin (city gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_properties_state ON properties (state);
CREATE INDEX IF NOT EXISTS idx_properties_apn_trgm ON properties USING gin (apn gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_properties_zip_code ON properties (zip_code);

-- Contacts search indexes
CREATE INDEX IF NOT EXISTS idx_contacts_name_trgm ON contacts USING gin (name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_contacts_email_trgm ON contacts USING gin (email gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_contacts_phone_trgm ON contacts USING gin (phone gin_trgm_ops);
