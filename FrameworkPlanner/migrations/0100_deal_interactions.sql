-- 0100_deal_interactions.sql
-- Phase 11/12: rich audit trail for investor discovery interactions.
-- Every action an investor takes on a deal card in the discovery feed is
-- logged here (viewed/saved/passed/interested/offer_submitted) along with
-- the screen it came from, the buy box in effect, and the state transition.
-- This table is additive: the older investor_deal_interactions table
-- (migration 0080) is left untouched for compatibility.
--
-- NOTE: "undo" is intentionally not an action value. Undoing a pass deletes
-- the pass row, restoring the deal to the feed.

CREATE TABLE IF NOT EXISTS deal_interactions (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  investor_user_id INTEGER NOT NULL,
  deal_property_id INTEGER NOT NULL,
  action VARCHAR(32) NOT NULL
    CHECK (action IN ('viewed', 'saved', 'passed', 'interested', 'offer_submitted')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  source_screen VARCHAR(64),
  buy_box_id INTEGER,
  prev_state VARCHAR(32),
  new_state VARCHAR(32)
);

CREATE INDEX IF NOT EXISTS deal_interactions_investor_deal_idx
  ON deal_interactions (investor_user_id, deal_property_id);

CREATE INDEX IF NOT EXISTS deal_interactions_investor_created_idx
  ON deal_interactions (investor_user_id, created_at DESC);
