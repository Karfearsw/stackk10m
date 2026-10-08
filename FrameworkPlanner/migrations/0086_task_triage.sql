-- 0086: Task triage and SLA enforcement (Ticket 13 — P1).
--
-- Adds SLA rules, per-task audit trail, and triage/escalation columns on tasks.
-- Tasks linked to quarantined/test records are excluded from workload counts
-- at the query layer (see quarantined_records from 0076); nothing is deleted here.
-- Additive and idempotent.

-- SLA rules: per task-type response-time targets with escalation routing.
CREATE TABLE IF NOT EXISTS task_sla_rules (
  id integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  name varchar(120) NOT NULL,
  task_type varchar(80) NOT NULL,
  sla_hours integer NOT NULL CHECK (sla_hours > 0),
  escalation_user_id integer,
  is_active boolean NOT NULL DEFAULT true,
  created_by integer,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_task_sla_rules_type ON task_sla_rules(task_type) WHERE is_active;

-- Task audit: one immutable event per triage/escalation action per task.
CREATE TABLE IF NOT EXISTS task_audit (
  id integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  task_id integer NOT NULL,
  action varchar(40) NOT NULL,
  old_value text,
  new_value text,
  reason text,
  performed_by integer,
  performed_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_task_audit_task ON task_audit(task_id, performed_at DESC);

-- Triage + SLA columns on tasks.
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS sla_due_at timestamptz;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS escalated_at timestamptz;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS escalated_to_user_id integer;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS triage_status varchar(24) NOT NULL DEFAULT 'pending';
CREATE INDEX IF NOT EXISTS idx_tasks_sla_due ON tasks(sla_due_at) WHERE sla_due_at IS NOT NULL AND status <> 'completed';
CREATE INDEX IF NOT EXISTS idx_tasks_triage ON tasks(triage_status) WHERE triage_status <> 'triaged';

-- Seed a sensible default rule set (only when the table is empty).
INSERT INTO task_sla_rules (name, task_type, sla_hours, is_active)
SELECT 'Call follow-up', 'call', 24, true
WHERE NOT EXISTS (SELECT 1 FROM task_sla_rules)
UNION ALL
SELECT 'SMS follow-up', 'sms', 24, true
WHERE NOT EXISTS (SELECT 1 FROM task_sla_rules)
UNION ALL
SELECT 'Email follow-up', 'email', 48, true
WHERE NOT EXISTS (SELECT 1 FROM task_sla_rules)
UNION ALL
SELECT 'Meeting / appointment', 'meeting', 72, true
WHERE NOT EXISTS (SELECT 1 FROM task_sla_rules)
UNION ALL
SELECT 'General task', 'general', 72, true
WHERE NOT EXISTS (SELECT 1 FROM task_sla_rules);
