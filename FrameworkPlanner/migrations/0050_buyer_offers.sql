-- 0050: Buyer offer management for the deal-execution workflow.
-- Adds a buyer_offers table dedicated to offers received via public listings or
-- entered manually against an opportunity. Supports counter-offer history via
-- parent_offer_id/version and preserves prior terms (superseded = true).
-- Additive only; no existing data is touched.
CREATE TABLE IF NOT EXISTS buyer_offers (
  id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  opportunity_id integer NOT NULL,
  buyer_inquiry_id integer,
  buyer_contact_id integer,
  amount numeric(12,2) NOT NULL,
  earnest_money numeric(12,2),
  financing_type varchar(50),
  close_by timestamp,
  terms text,
  assignment_terms text,
  notes text,
  status varchar(50) NOT NULL DEFAULT 'received',
  version integer NOT NULL DEFAULT 1,
  parent_offer_id integer,
  superseded boolean NOT NULL DEFAULT false,
  created_by integer NOT NULL,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS buyer_offers_opportunity_idx ON buyer_offers(opportunity_id);
CREATE INDEX IF NOT EXISTS buyer_offers_inquiry_idx ON buyer_offers(buyer_inquiry_id);
