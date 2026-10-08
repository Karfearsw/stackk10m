-- 0089: Buyer qualification workflow (Ticket 17 — P2 buyer list warm-up).
--
-- Problem: 166 buyers, zero documented outreach. This turns the cold list into
-- a qualified buyers list: owners, relationship stages, outreach logging,
-- buy-box criteria, and a review queue for suspected test/duplicate entries.
-- Additive and idempotent. DO NOT run destructive deletes here.

-- Per-buyer qualification state. One row per buyer (created on demand or
-- backfilled below). relationship_stage is the qualification funnel, distinct
-- from buyers.buyer_status (the 0074 buyer pipeline).
CREATE TABLE IF NOT EXISTS buyer_qualification (
  id integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  buyer_id integer NOT NULL UNIQUE REFERENCES buyers(id) ON DELETE CASCADE,
  owner_user_id integer REFERENCES users(id) ON DELETE SET NULL,
  relationship_stage varchar(32) NOT NULL DEFAULT 'new'
    CHECK (relationship_stage IN ('new','contacted','responded','qualified','deal_ready','inactive')),
  last_contact_at timestamptz,
  next_action text,
  next_action_at timestamptz,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_buyer_qualification_stage ON buyer_qualification(relationship_stage);
CREATE INDEX IF NOT EXISTS idx_buyer_qualification_owner ON buyer_qualification(owner_user_id);
CREATE INDEX IF NOT EXISTS idx_buyer_qualification_next_action ON buyer_qualification(next_action_at)
  WHERE next_action_at IS NOT NULL;

-- Immutable-ish log of every outreach attempt and its result.
CREATE TABLE IF NOT EXISTS buyer_outreach_log (
  id integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  buyer_id integer NOT NULL REFERENCES buyers(id) ON DELETE CASCADE,
  user_id integer REFERENCES users(id) ON DELETE SET NULL,
  channel varchar(16) NOT NULL
    CHECK (channel IN ('call','sms','email','meeting','other')),
  outcome varchar(64),
  notes text,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_buyer_outreach_log_buyer ON buyer_outreach_log(buyer_id, occurred_at DESC);

-- Confirmed buy-box criteria. Deal alerts may ONLY target buyers whose buy-box
-- is confirmed (proof_of_funds_verified or stage deal_ready) — never the full list.
CREATE TABLE IF NOT EXISTS buyer_buybox (
  id integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  buyer_id integer NOT NULL UNIQUE REFERENCES buyers(id) ON DELETE CASCADE,
  markets text[] NOT NULL DEFAULT '{}',
  asset_types text[] NOT NULL DEFAULT '{}',
  min_price numeric(12,2),
  max_price numeric(12,2),
  strategy varchar(64),
  buybox_confirmed boolean NOT NULL DEFAULT false,
  proof_of_funds_verified boolean NOT NULL DEFAULT false,
  proof_of_funds_at timestamptz,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_buyer_buybox_confirmed ON buyer_buybox(buybox_confirmed)
  WHERE buybox_confirmed = true;

-- Review-queue flags on the buyers table itself.
ALTER TABLE buyers ADD COLUMN IF NOT EXISTS is_suspected_test boolean NOT NULL DEFAULT false;
ALTER TABLE buyers ADD COLUMN IF NOT EXISTS duplicate_of integer REFERENCES buyers(id) ON DELETE SET NULL;
ALTER TABLE buyers ADD COLUMN IF NOT EXISTS review_decision varchar(16)
  CHECK (review_decision IN ('approved','rejected','merged'));
ALTER TABLE buyers ADD COLUMN IF NOT EXISTS reviewed_at timestamptz;
ALTER TABLE buyers ADD COLUMN IF NOT EXISTS reviewed_by integer REFERENCES users(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_buyers_suspected_test ON buyers(is_suspected_test)
  WHERE is_suspected_test = true;
CREATE INDEX IF NOT EXISTS idx_buyers_duplicate_of ON buyers(duplicate_of)
  WHERE duplicate_of IS NOT NULL;

-- One-time backfill (runs once via applied_migrations; never re-runs, so human
-- review decisions made through the UI are never overwritten):
-- 1) Flag obvious test entries: test-like names or 555/fake phone patterns.
UPDATE buyers
SET is_suspected_test = true
WHERE is_suspected_test = false
  AND (
    lower(name) LIKE '%test%' OR lower(name) LIKE '%demo%' OR lower(name) LIKE '%sample%'
    OR lower(name) LIKE '%fake%' OR lower(name) LIKE '%asdf%'
    OR name ~* '^(joe homebuyer|dave|william #1)$'
    OR phone LIKE '%555%'
    OR email LIKE '%test%' OR email LIKE '%example.com%'
  );

-- 2) Flag likely duplicates: same normalized phone or same email as an
-- earlier-created buyer. duplicate_of points at the earliest record.
WITH norm AS (
  SELECT id,
         nullif(regexp_replace(coalesce(phone,''), '[^0-9]', '', 'g'), '') AS nphone,
         nullif(lower(trim(coalesce(email,''))), '') AS nemail,
         created_at
  FROM buyers
  WHERE is_suspected_test = false
),
dupes AS (
  SELECT n.id, MIN(o.id) AS keep_id
  FROM norm n
  JOIN norm o
    ON o.id <> n.id
   AND o.created_at <= n.created_at
   AND (
         (n.nphone IS NOT NULL AND n.nphone = o.nphone)
      OR (n.nemail IS NOT NULL AND n.nemail = o.nemail)
   )
  GROUP BY n.id
)
UPDATE buyers b
SET duplicate_of = d.keep_id, is_suspected_test = true
FROM dupes d
WHERE b.id = d.id
  AND b.duplicate_of IS NULL;

-- 3) Seed qualification rows for existing buyers so the dashboard works on day
-- one. Stage 'new' = never worked. Owners are NOT auto-assigned (human call).
INSERT INTO buyer_qualification (buyer_id, relationship_stage)
SELECT b.id, 'new'
FROM buyers b
LEFT JOIN buyer_qualification q ON q.buyer_id = b.id
WHERE q.buyer_id IS NULL
ON CONFLICT (buyer_id) DO NOTHING;
