-- 0085: Lead assignment and routing rules (Ticket 12 — P1 engine).
--
-- Deterministic lead assignment via ordered, versioned rules:
--   assignment_rules  — rule definitions (round_robin, territory, guards)
--   assignment_log    — every assignment decision, who/what rule/why (history preserved on reassign)
--   user_capacity     — per-agent capacity, availability, and market eligibility
-- leads.assigned_to is added conditionally (already present in shared-schema).
-- Additive and idempotent. Migration is NOT run automatically.

CREATE TABLE IF NOT EXISTS assignment_rules (
  id integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  name varchar(255) NOT NULL,
  rule_type varchar(50) NOT NULL,
  config jsonb NOT NULL DEFAULT '{}'::jsonb,
  priority_order integer NOT NULL DEFAULT 0,
  version integer NOT NULL DEFAULT 1,
  is_active boolean NOT NULL DEFAULT true,
  created_by integer,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT assignment_rules_type_check CHECK (rule_type IN (
    'round_robin', 'territory', 'capacity_check', 'availability_check', 'market_eligibility'
  ))
);

CREATE INDEX IF NOT EXISTS idx_assignment_rules_priority
  ON assignment_rules (priority_order ASC, id ASC);

CREATE TABLE IF NOT EXISTS assignment_log (
  id integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  lead_id integer NOT NULL,
  assigned_to_user_id integer,
  rule_id integer,
  rule_name varchar(255),
  assigned_at timestamptz NOT NULL DEFAULT now(),
  reason text,
  assigned_by integer
);

CREATE INDEX IF NOT EXISTS idx_assignment_log_lead
  ON assignment_log (lead_id, assigned_at DESC);
CREATE INDEX IF NOT EXISTS idx_assignment_log_rule
  ON assignment_log (rule_id, assigned_at DESC);
CREATE INDEX IF NOT EXISTS idx_assignment_log_user
  ON assignment_log (assigned_to_user_id, assigned_at DESC);

CREATE TABLE IF NOT EXISTS user_capacity (
  user_id integer PRIMARY KEY,
  max_leads integer NOT NULL DEFAULT 50,
  is_available boolean NOT NULL DEFAULT true,
  markets text[] NOT NULL DEFAULT '{}',
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- leads.assigned_to exists in shared-schema; guard for databases created before it.
ALTER TABLE leads ADD COLUMN IF NOT EXISTS assigned_to integer;
CREATE INDEX IF NOT EXISTS idx_leads_assigned_to ON leads (assigned_to);
