-- Commission snapshots per opportunity + agent: stores the payout inputs
-- (side %, referral out, agent split, annual cap with rollover, transaction
-- fee, tax reserve) alongside the server-recomputed outputs (gross commission,
-- referral fee, company dollar, cap rollover, agent net, after-tax) so
-- projected vs actual payouts can be tracked per deal.
CREATE TABLE IF NOT EXISTS commission_snapshots (
  id INTEGER PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  opportunity_id INTEGER NOT NULL,
  user_id INTEGER NOT NULL,
  label VARCHAR(120),
  deal_type VARCHAR(40) NOT NULL DEFAULT 'standard_sale',
  side VARCHAR(20) NOT NULL DEFAULT 'listing',
  sale_price NUMERIC(12, 2),
  assignment_fee NUMERIC(12, 2),
  listing_commission_pct NUMERIC(6, 2),
  buyer_agent_pct NUMERIC(6, 2),
  referral_out_pct NUMERIC(6, 2),
  agent_split_pct NUMERIC(6, 2),
  annual_cap NUMERIC(12, 2),
  company_dollar_ytd NUMERIC(12, 2),
  transaction_fee_flat NUMERIC(12, 2),
  tax_reserve_pct NUMERIC(6, 2),
  gross_commission NUMERIC(12, 2),
  referral_fee NUMERIC(12, 2),
  company_dollar NUMERIC(12, 2),
  cap_portion_to_agent NUMERIC(12, 2),
  agent_net NUMERIC(12, 2),
  after_tax NUMERIC(12, 2),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS commission_snapshots_opportunity_idx ON commission_snapshots (opportunity_id);
CREATE INDEX IF NOT EXISTS commission_snapshots_user_idx ON commission_snapshots (user_id);
