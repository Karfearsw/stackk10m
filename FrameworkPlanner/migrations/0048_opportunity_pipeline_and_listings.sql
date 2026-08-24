-- 0048: Sync schema drift between server/shared-schema.ts and the live DB.
--
-- The live DB was created before the opportunity-pipeline and public-listing
-- work landed, so it is missing:
--   * 12 opportunity pipeline columns on properties (stage, opportunity_type, ...)
--   * contracts.title
--   * contract_fields.field_key / field_label
--   * the public_listings, buyer_inquiries, opportunity_parties,
--     opportunity_events tables
-- These statements are idempotent and additive only; no data is dropped or altered.

-- properties: opportunity pipeline / deal-room columns
ALTER TABLE properties ADD COLUMN IF NOT EXISTS opportunity_type varchar(50) NOT NULL DEFAULT 'acquisition';
ALTER TABLE properties ADD COLUMN IF NOT EXISTS stage varchar(50) NOT NULL DEFAULT 'lead';
ALTER TABLE properties ADD COLUMN IF NOT EXISTS opportunity_status varchar(50) NOT NULL DEFAULT 'active';
ALTER TABLE properties ADD COLUMN IF NOT EXISTS internal_summary text;
ALTER TABLE properties ADD COLUMN IF NOT EXISTS asking_price numeric(12,2);
ALTER TABLE properties ADD COLUMN IF NOT EXISTS target_disposition_price numeric(12,2);
ALTER TABLE properties ADD COLUMN IF NOT EXISTS earnest_money numeric(12,2);
ALTER TABLE properties ADD COLUMN IF NOT EXISTS closing_date timestamp;
ALTER TABLE properties ADD COLUMN IF NOT EXISTS inspection_deadline timestamp;
ALTER TABLE properties ADD COLUMN IF NOT EXISTS next_action_at timestamp;
ALTER TABLE properties ADD COLUMN IF NOT EXISTS last_activity_at timestamp;
ALTER TABLE properties ADD COLUMN IF NOT EXISTS stage_changed_at timestamp;

-- contracts: title
ALTER TABLE contracts ADD COLUMN IF NOT EXISTS title varchar(255);

-- contract_fields: template merge keys
ALTER TABLE contract_fields ADD COLUMN IF NOT EXISTS field_key varchar(120) NOT NULL DEFAULT '';
ALTER TABLE contract_fields ADD COLUMN IF NOT EXISTS field_label varchar(255);

-- public_listings
CREATE TABLE IF NOT EXISTS public_listings (
  id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  opportunity_id integer NOT NULL,
  slug varchar(255) NOT NULL UNIQUE,
  token varchar(255) NOT NULL UNIQUE,
  status varchar(50) NOT NULL DEFAULT 'draft',
  visibility varchar(20) NOT NULL DEFAULT 'link_only',
  password_hash varchar(255),
  title varchar(255),
  description text,
  expose_address boolean NOT NULL DEFAULT false,
  expose_comps boolean NOT NULL DEFAULT false,
  expose_financials boolean NOT NULL DEFAULT false,
  expose_docs boolean NOT NULL DEFAULT false,
  contact_name varchar(255),
  contact_email varchar(255),
  contact_phone varchar(20),
  view_count integer NOT NULL DEFAULT 0,
  password_attempts integer NOT NULL DEFAULT 0,
  password_locked_until timestamp,
  created_at timestamp DEFAULT now(),
  updated_at timestamp DEFAULT now(),
  published_at timestamp,
  expires_at timestamp
);

-- buyer_inquiries
CREATE TABLE IF NOT EXISTS buyer_inquiries (
  id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  listing_id integer NOT NULL,
  opportunity_id integer NOT NULL,
  name varchar(255) NOT NULL,
  email varchar(255),
  phone varchar(20),
  company varchar(255),
  buyer_type varchar(50),
  message text,
  offer_amount numeric(12,2),
  pof_url varchar(500),
  status varchar(50) NOT NULL DEFAULT 'new',
  assigned_to_user_id integer,
  notes text,
  ip varchar(50),
  user_agent text,
  created_at timestamp DEFAULT now(),
  updated_at timestamp DEFAULT now()
);

-- opportunity_parties
CREATE TABLE IF NOT EXISTS opportunity_parties (
  id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  opportunity_id integer NOT NULL,
  contact_id integer,
  role varchar(32) NOT NULL,
  name varchar(255),
  email varchar(255),
  phone varchar(20),
  company varchar(255),
  notes text,
  created_at timestamp DEFAULT now(),
  updated_at timestamp DEFAULT now()
);

-- opportunity_events (audit trail)
CREATE TABLE IF NOT EXISTS opportunity_events (
  id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  opportunity_id integer NOT NULL,
  event_type varchar(100) NOT NULL,
  actor_type varchar(50) NOT NULL DEFAULT 'user',
  actor_user_id integer,
  actor_contact_id integer,
  title varchar(255) NOT NULL,
  description text,
  metadata_json text,
  ip varchar(50),
  user_agent text,
  created_at timestamp DEFAULT now()
);

-- Indexes used by the deal room and public listing flows
CREATE INDEX IF NOT EXISTS idx_public_listings_opportunity ON public_listings(opportunity_id);
CREATE INDEX IF NOT EXISTS idx_buyer_inquiries_listing ON buyer_inquiries(listing_id);
CREATE INDEX IF NOT EXISTS idx_buyer_inquiries_opportunity ON buyer_inquiries(opportunity_id);
CREATE INDEX IF NOT EXISTS idx_opportunity_parties_opportunity ON opportunity_parties(opportunity_id);
CREATE INDEX IF NOT EXISTS idx_opportunity_events_opportunity ON opportunity_events(opportunity_id);
