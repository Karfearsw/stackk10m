-- Migration 0080: Investor Portal Phase 2 ("Tinder for real estate")
-- Feature-flagged OFF by default via INVESTOR_PORTAL_ENABLED env var.
-- All statements are idempotent (safe to re-run / run out of order).

-- 1. Investor identity on users (role='investor' rows only use these)
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS investor_status varchar(20) NOT NULL DEFAULT 'pending';
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS investor_rejected_reason text;

-- 2. Link portal users to buyer rows (portal user <-> buyer pipeline sync)
ALTER TABLE buyers
  ADD COLUMN IF NOT EXISTS user_id integer;

-- 3. Buy-box wizard fields on buyer_profiles (extends existing columns)
ALTER TABLE buyer_profiles
  ADD COLUMN IF NOT EXISTS property_types text[];
ALTER TABLE buyer_profiles
  ADD COLUMN IF NOT EXISTS price_min numeric(12, 2);
ALTER TABLE buyer_profiles
  ADD COLUMN IF NOT EXISTS price_max numeric(12, 2);
ALTER TABLE buyer_profiles
  ADD COLUMN IF NOT EXISTS min_beds integer;
ALTER TABLE buyer_profiles
  ADD COLUMN IF NOT EXISTS max_beds integer;
ALTER TABLE buyer_profiles
  ADD COLUMN IF NOT EXISTS notify_prefs jsonb NOT NULL DEFAULT '{"mode":"digest"}'::jsonb;

-- 4. Deal visibility to investors (public | approved_investors | off_market)
ALTER TABLE properties
  ADD COLUMN IF NOT EXISTS investor_visibility varchar(24) NOT NULL DEFAULT 'off_market';

-- 5. Swipe interactions (interested/pass per investor x deal)
CREATE TABLE IF NOT EXISTS investor_deal_interactions (
  id serial PRIMARY KEY,
  investor_user_id integer NOT NULL,
  property_id integer NOT NULL,
  action varchar(16) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_investor_deal_interaction UNIQUE (investor_user_id, property_id),
  CONSTRAINT chk_investor_deal_action CHECK (action IN ('interested', 'pass'))
);
CREATE INDEX IF NOT EXISTS idx_investor_interactions_user
  ON investor_deal_interactions (investor_user_id);
CREATE INDEX IF NOT EXISTS idx_investor_interactions_deal
  ON investor_deal_interactions (property_id);

-- 6. Investor offers -> LOIs
CREATE TABLE IF NOT EXISTS investor_offers (
  id serial PRIMARY KEY,
  investor_user_id integer NOT NULL,
  buyer_id integer,
  property_id integer NOT NULL,
  offer_amount numeric(12, 2) NOT NULL,
  earnest_money numeric(12, 2),
  closing_timeline_days integer,
  contingencies text[],
  special_terms text,
  status varchar(32) NOT NULL DEFAULT 'submitted',
  loi_id integer,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT chk_investor_offer_status CHECK (
    status IN ('submitted', 'under_review', 'accepted', 'countered', 'dead')
  )
);
CREATE INDEX IF NOT EXISTS idx_investor_offers_user
  ON investor_offers (investor_user_id);
CREATE INDEX IF NOT EXISTS idx_investor_offers_property
  ON investor_offers (property_id);

-- 7. Proof-of-funds documents (server-side only; portal sees verified/unverified)
CREATE TABLE IF NOT EXISTS investor_pof_documents (
  id serial PRIMARY KEY,
  investor_user_id integer NOT NULL,
  original_filename text NOT NULL,
  mime_type text NOT NULL,
  size_bytes bigint NOT NULL,
  sha256 text,
  data bytea NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_investor_pof_user
  ON investor_pof_documents (investor_user_id);
