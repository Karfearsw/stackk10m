-- Municipal distress signal ingestion (Phase 1 of free-tool build plan).
-- Stores code violations, tax delinquency, vacancy, court filings, permits,
-- water shutoffs, fire damage, evictions — stacked on a parcel key for timeline view.

CREATE TABLE IF NOT EXISTS parcel_watchlist (
  id integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  parcel_key varchar(400) NOT NULL UNIQUE,
  address varchar(255) NOT NULL,
  city varchar(100) NOT NULL,
  state varchar(2) NOT NULL,
  zip_code varchar(10) NOT NULL,
  apn varchar(100),
  owner_name varchar(255),
  notes text,
  created_by integer,
  created_at timestamp DEFAULT NOW(),
  updated_at timestamp DEFAULT NOW()
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_parcel_watchlist_key ON parcel_watchlist (parcel_key);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_parcel_watchlist_state_city ON parcel_watchlist (state, city);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS distress_signals (
  id integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  parcel_key varchar(400) NOT NULL,
  watchlist_id integer REFERENCES parcel_watchlist(id) ON DELETE SET NULL,
  lead_id integer,
  signal_type varchar(50) NOT NULL,
  severity varchar(20) NOT NULL DEFAULT 'info',
  title varchar(255) NOT NULL,
  description text,
  source varchar(100) NOT NULL,
  source_url text,
  occurred_at date,
  discovered_at timestamp DEFAULT NOW(),
  raw_data jsonb,
  created_by integer,
  created_at timestamp DEFAULT NOW()
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_distress_signals_parcel ON distress_signals (parcel_key);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_distress_signals_type ON distress_signals (signal_type);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_distress_signals_lead ON distress_signals (lead_id);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_distress_signals_occurred ON distress_signals (occurred_at DESC);
