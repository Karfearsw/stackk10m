-- 0101_dealrooms_offers.sql
-- Phase 13/14: mutual-match deal rooms + structured offer workflow.
-- Interest lifecycle: available -> viewed -> saved/passed -> interested
--   -> owner_review -> mutual_match -> due_diligence -> offer_submitted
--   -> negotiating -> offer_accepted -> contract_sent -> fully_executed
--   -> locked_up -> closing -> closed.
-- NOTE: This migration only defines tables. Do not run it manually;
-- the coordinator's migration runner applies migrations against Neon.

-- ---------------------------------------------------------------------------
-- Interest records (per investor x property). An expression of interest is
-- a record, never a contract.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS deal_interests (
  id integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  investor_user_id integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  property_id integer NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  status varchar(30) NOT NULL DEFAULT 'available'
    CHECK (status IN (
      'available','viewed','saved','passed','interested','owner_review',
      'mutual_match','due_diligence','offer_submitted','negotiating',
      'offer_accepted','contract_sent','fully_executed','locked_up',
      'closing','closed'
    )),
  viewed_at timestamp with time zone,
  saved_at timestamp with time zone,
  passed_at timestamp with time zone,
  interested_at timestamp with time zone,
  owner_review_at timestamp with time zone,
  matched_at timestamp with time zone,
  declined_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE (investor_user_id, property_id)
);
CREATE INDEX IF NOT EXISTS idx_deal_interests_investor ON deal_interests (investor_user_id, status);
CREATE INDEX IF NOT EXISTS idx_deal_interests_owner_review ON deal_interests (status) WHERE status = 'owner_review';
CREATE INDEX IF NOT EXISTS idx_deal_interests_property ON deal_interests (property_id, status);

-- ---------------------------------------------------------------------------
-- Deal rooms: unlocked when mutual match occurs (investor interested AND
-- owner approved). One room per property.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS deal_rooms (
  id integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  property_id integer NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  interest_id integer REFERENCES deal_interests(id) ON DELETE SET NULL,
  status varchar(20) NOT NULL DEFAULT 'open'
    CHECK (status IN ('open','negotiating','contracting','closing','closed','archived')),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE (property_id)
);

CREATE TABLE IF NOT EXISTS deal_room_participants (
  id integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  room_id integer NOT NULL REFERENCES deal_rooms(id) ON DELETE CASCADE,
  user_id integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role varchar(20) NOT NULL DEFAULT 'investor'
    CHECK (role IN ('investor','owner','team_admin')),
  joined_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE (room_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_deal_room_participants_user ON deal_room_participants (user_id);

-- In-app conversation + Q&A (parent_id chains answers under a question).
CREATE TABLE IF NOT EXISTS deal_room_messages (
  id integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  room_id integer NOT NULL REFERENCES deal_rooms(id) ON DELETE CASCADE,
  author_user_id integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind varchar(20) NOT NULL DEFAULT 'message'
    CHECK (kind IN ('message','question','answer','announcement')),
  body text NOT NULL,
  parent_id integer REFERENCES deal_room_messages(id) ON DELETE SET NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_deal_room_messages_room ON deal_room_messages (room_id, created_at);

-- Tasks, deadlines, closing checklist.
CREATE TABLE IF NOT EXISTS deal_room_tasks (
  id integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  room_id integer NOT NULL REFERENCES deal_rooms(id) ON DELETE CASCADE,
  title varchar(255) NOT NULL,
  description text,
  due_at timestamp with time zone,
  status varchar(20) NOT NULL DEFAULT 'open'
    CHECK (status IN ('open','done','overdue')),
  category varchar(30) NOT NULL DEFAULT 'general'
    CHECK (category IN ('general','due_diligence','showing','contract','closing')),
  assigned_to integer REFERENCES users(id) ON DELETE SET NULL,
  created_by integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  completed_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_deal_room_tasks_room ON deal_room_tasks (room_id, status, due_at);

-- Photos, videos, files. Access scope enforced at the API layer:
-- investors only see rows scoped to rooms they are a participant of.
CREATE TABLE IF NOT EXISTS deal_room_files (
  id integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  room_id integer NOT NULL REFERENCES deal_rooms(id) ON DELETE CASCADE,
  uploaded_by integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  filename varchar(255) NOT NULL,
  mime_type varchar(100) NOT NULL,
  storage_key text NOT NULL,
  category varchar(20) NOT NULL DEFAULT 'document'
    CHECK (category IN ('photo','video','document','other')),
  visible_to_investor boolean NOT NULL DEFAULT true,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_deal_room_files_room ON deal_room_files (room_id);

-- Showing / access scheduling (an event-type task with a time window).
CREATE TABLE IF NOT EXISTS deal_room_showings (
  id integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  room_id integer NOT NULL REFERENCES deal_rooms(id) ON DELETE CASCADE,
  starts_at timestamp with time zone NOT NULL,
  ends_at timestamp with time zone NOT NULL,
  status varchar(20) NOT NULL DEFAULT 'requested'
    CHECK (status IN ('requested','confirmed','cancelled','completed')),
  notes text,
  requested_by integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_deal_room_showings_room ON deal_room_showings (room_id, starts_at);

-- ---------------------------------------------------------------------------
-- Structured offers. NEVER auto-created from interest: a draft is only made
-- by explicit investor action, and submit requires explicit confirmation.
-- A counteroffer creates a NEW row (parent_offer_id = the countered offer);
-- rows are never overwritten. offer_versions holds immutable snapshots.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS offers (
  id integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  deal_room_id integer REFERENCES deal_rooms(id) ON DELETE SET NULL,
  property_id integer NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  investor_user_id integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  offer_amount numeric(14,2),
  earnest_money numeric(14,2),
  financing_type varchar(40)
    CHECK (financing_type IS NULL OR financing_type IN ('cash','hard_money','conventional','other')),
  inspection_period_days integer,
  closing_date date,
  deal_structure varchar(20)
    CHECK (deal_structure IS NULL OR deal_structure IN ('assignment','double_close')),
  contingencies text[] NOT NULL DEFAULT '{}',
  additional_terms text,
  pof_storage_key text,
  expiration_at timestamp with time zone,
  buyer_entity varchar(255),
  authorized_signer varchar(255),
  status varchar(30) NOT NULL DEFAULT 'draft'
    CHECK (status IN (
      'draft','submitted','viewed','countered','accepted','rejected',
      'withdrawn','expired','converted_to_contract'
    )),
  version_number integer NOT NULL DEFAULT 1,
  parent_offer_id integer REFERENCES offers(id) ON DELETE SET NULL,
  submitted_at timestamp with time zone,
  accepted_at timestamp with time zone,
  rejected_at timestamp with time zone,
  withdrawn_at timestamp with time zone,
  expired_at timestamp with time zone,
  -- Link to the e-sign contract envelope once accepted (wired later to
  -- server/routes.ts /api/contracts endpoints + contract_envelopes).
  contract_id integer,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_offers_investor ON offers (investor_user_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_offers_room ON offers (deal_room_id, version_number DESC);
CREATE INDEX IF NOT EXISTS idx_offers_parent ON offers (parent_offer_id);
CREATE INDEX IF NOT EXISTS idx_offers_contract ON offers (contract_id) WHERE contract_id IS NOT NULL;

-- Immutable version history: one row per state transition. Never updated.
CREATE TABLE IF NOT EXISTS offer_versions (
  id integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  offer_id integer NOT NULL REFERENCES offers(id) ON DELETE CASCADE,
  version_number integer NOT NULL,
  snapshot jsonb NOT NULL,
  created_by integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE (offer_id, version_number)
);
CREATE INDEX IF NOT EXISTS idx_offer_versions_offer ON offer_versions (offer_id, version_number);
