CREATE EXTENSION IF NOT EXISTS pg_trgm;

ALTER TABLE contacts ADD COLUMN IF NOT EXISTS nickname VARCHAR(255);
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS title VARCHAR(255);
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS market VARCHAR(255);
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS last_contacted_at TIMESTAMP;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS next_follow_up_at TIMESTAMP;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS trust_level INT;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS vip BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS do_not_call BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS do_not_text BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS do_not_email BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS idx_contacts_market_trgm ON contacts USING gin (market gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_contacts_last_contacted_at ON contacts (last_contacted_at);
CREATE INDEX IF NOT EXISTS idx_contacts_next_follow_up_at ON contacts (next_follow_up_at);
CREATE INDEX IF NOT EXISTS idx_contacts_vip ON contacts (vip);

CREATE TABLE IF NOT EXISTS contact_notes (
  id INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  contact_id INT NOT NULL,
  created_by INT,
  body TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT now(),
  updated_at TIMESTAMP DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_contact_notes_contact_id ON contact_notes (contact_id);

CREATE TABLE IF NOT EXISTS companies (
  id INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  website VARCHAR(500),
  phone VARCHAR(32),
  notes TEXT,
  dedupe_key VARCHAR(400),
  created_at TIMESTAMP DEFAULT now(),
  updated_at TIMESTAMP DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_companies_name_trgm ON companies USING gin (name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_companies_dedupe_key ON companies (dedupe_key);

CREATE TABLE IF NOT EXISTS contact_company_links (
  id INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  contact_id INT NOT NULL,
  company_id INT NOT NULL,
  role_title VARCHAR(255),
  is_primary BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT now(),
  updated_at TIMESTAMP DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_contact_company_links_contact_id ON contact_company_links (contact_id);
CREATE INDEX IF NOT EXISTS idx_contact_company_links_company_id ON contact_company_links (company_id);
CREATE INDEX IF NOT EXISTS idx_contact_company_links_primary ON contact_company_links (contact_id, is_primary);

CREATE TABLE IF NOT EXISTS contact_roles (
  id INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  key VARCHAR(80) NOT NULL,
  label VARCHAR(120) NOT NULL,
  sort_order INT NOT NULL DEFAULT 0
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_contact_roles_key ON contact_roles (key);

CREATE TABLE IF NOT EXISTS contact_role_links (
  contact_id INT NOT NULL,
  role_id INT NOT NULL,
  created_at TIMESTAMP DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_contact_role_links_unique ON contact_role_links (contact_id, role_id);
CREATE INDEX IF NOT EXISTS idx_contact_role_links_contact_id ON contact_role_links (contact_id);
CREATE INDEX IF NOT EXISTS idx_contact_role_links_role_id ON contact_role_links (role_id);

CREATE TABLE IF NOT EXISTS contact_tags (
  id INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  key VARCHAR(80) NOT NULL,
  label VARCHAR(120) NOT NULL,
  color VARCHAR(40),
  sort_order INT NOT NULL DEFAULT 0
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_contact_tags_key ON contact_tags (key);

CREATE TABLE IF NOT EXISTS contact_tag_links (
  contact_id INT NOT NULL,
  tag_id INT NOT NULL,
  created_at TIMESTAMP DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_contact_tag_links_unique ON contact_tag_links (contact_id, tag_id);
CREATE INDEX IF NOT EXISTS idx_contact_tag_links_contact_id ON contact_tag_links (contact_id);
CREATE INDEX IF NOT EXISTS idx_contact_tag_links_tag_id ON contact_tag_links (tag_id);

CREATE TABLE IF NOT EXISTS contact_methods (
  id INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  contact_id INT NOT NULL,
  kind VARCHAR(20) NOT NULL,
  label VARCHAR(120),
  value VARCHAR(500) NOT NULL,
  is_primary BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT now(),
  updated_at TIMESTAMP DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_contact_methods_contact_id ON contact_methods (contact_id);
CREATE INDEX IF NOT EXISTS idx_contact_methods_kind ON contact_methods (kind);
CREATE INDEX IF NOT EXISTS idx_contact_methods_primary ON contact_methods (contact_id, is_primary);
CREATE INDEX IF NOT EXISTS idx_contact_methods_value_trgm ON contact_methods USING gin (value gin_trgm_ops);

CREATE TABLE IF NOT EXISTS contact_addresses (
  id INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  contact_id INT NOT NULL,
  kind VARCHAR(20) NOT NULL DEFAULT 'other',
  address_1 VARCHAR(255),
  address_2 VARCHAR(255),
  city VARCHAR(100),
  state VARCHAR(2),
  zip_code VARCHAR(10),
  country VARCHAR(2) DEFAULT 'US',
  created_at TIMESTAMP DEFAULT now(),
  updated_at TIMESTAMP DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_contact_addresses_contact_id ON contact_addresses (contact_id);
CREATE INDEX IF NOT EXISTS idx_contact_addresses_city_trgm ON contact_addresses USING gin (city gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_contact_addresses_state ON contact_addresses (state);
CREATE INDEX IF NOT EXISTS idx_contact_addresses_zip_code ON contact_addresses (zip_code);

CREATE TABLE IF NOT EXISTS contact_record_links (
  id INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  contact_id INT NOT NULL,
  entity_type VARCHAR(32) NOT NULL,
  entity_id INT NOT NULL,
  relationship VARCHAR(80) NOT NULL DEFAULT 'related',
  metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMP DEFAULT now(),
  updated_at TIMESTAMP DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_contact_record_links_unique ON contact_record_links (contact_id, entity_type, entity_id, relationship);
CREATE INDEX IF NOT EXISTS idx_contact_record_links_contact_id ON contact_record_links (contact_id);
CREATE INDEX IF NOT EXISTS idx_contact_record_links_entity ON contact_record_links (entity_type, entity_id);

CREATE TABLE IF NOT EXISTS contact_relationships (
  id INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  from_contact_id INT NOT NULL,
  to_contact_id INT NOT NULL,
  relationship VARCHAR(80) NOT NULL,
  strength INT,
  notes TEXT,
  created_at TIMESTAMP DEFAULT now(),
  updated_at TIMESTAMP DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_contact_relationships_unique ON contact_relationships (from_contact_id, to_contact_id, relationship);
CREATE INDEX IF NOT EXISTS idx_contact_relationships_from ON contact_relationships (from_contact_id);
CREATE INDEX IF NOT EXISTS idx_contact_relationships_to ON contact_relationships (to_contact_id);

CREATE TABLE IF NOT EXISTS contact_scores (
  contact_id INT PRIMARY KEY,
  score_total INT NOT NULL,
  score_recency INT NOT NULL,
  score_volume INT NOT NULL,
  score_deals INT NOT NULL,
  score_trust_override INT NOT NULL,
  computed_at TIMESTAMP NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_contact_scores_total ON contact_scores (score_total DESC);
CREATE INDEX IF NOT EXISTS idx_contact_scores_computed_at ON contact_scores (computed_at DESC);

CREATE TABLE IF NOT EXISTS contact_merge_events (
  id INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  winner_contact_id INT NOT NULL,
  merged_contact_id INT NOT NULL,
  merged_by_user_id INT,
  reason VARCHAR(255),
  metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMP DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_contact_merge_events_winner ON contact_merge_events (winner_contact_id);
CREATE INDEX IF NOT EXISTS idx_contact_merge_events_merged ON contact_merge_events (merged_contact_id);

