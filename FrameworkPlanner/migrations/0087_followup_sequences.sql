-- 0087: Stage-aware follow-up sequences (Ticket 14).
--
-- Configurable multi-step follow-up sequences (SMS/email/call tasks) per
-- pipeline stage, with quiet hours, opt-out handling, idempotency keys,
-- and full timeline logging. Additive and idempotent. DO NOT RUN manually;
-- applied via the /api/admin/migrate endpoint.

-- Sequence definitions: a named sequence triggered by a pipeline stage.
CREATE TABLE IF NOT EXISTS followup_sequences (
  id integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  name varchar(200) NOT NULL,
  description text,
  trigger_stage varchar(100),
  is_active boolean NOT NULL DEFAULT true,
  created_by integer,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Ordered steps within a sequence.
CREATE TABLE IF NOT EXISTS sequence_steps (
  id integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  sequence_id integer NOT NULL REFERENCES followup_sequences(id) ON DELETE CASCADE,
  step_order integer NOT NULL DEFAULT 0,
  channel varchar(20) NOT NULL CHECK (channel IN ('sms', 'email', 'call_task')),
  delay_hours integer NOT NULL DEFAULT 24 CHECK (delay_hours >= 0),
  subject varchar(255),
  body text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_sequence_steps_sequence ON sequence_steps(sequence_id, step_order);

-- Lead enrollments in a sequence.
CREATE TABLE IF NOT EXISTS sequence_enrollments (
  id integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  sequence_id integer NOT NULL REFERENCES followup_sequences(id) ON DELETE CASCADE,
  lead_id integer NOT NULL,
  current_step integer NOT NULL DEFAULT 0,
  status varchar(20) NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'paused', 'completed', 'opted_out', 'cancelled')),
  next_step_due_at timestamptz,
  enrolled_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  last_error text
);
CREATE INDEX IF NOT EXISTS idx_sequence_enrollments_lead ON sequence_enrollments(lead_id);
CREATE INDEX IF NOT EXISTS idx_sequence_enrollments_due
  ON sequence_enrollments(status, next_step_due_at)
  WHERE status = 'active';
-- One active enrollment per lead per sequence (deduplication).
CREATE UNIQUE INDEX IF NOT EXISTS uq_active_enrollment
  ON sequence_enrollments(sequence_id, lead_id)
  WHERE status IN ('active', 'paused');

-- Execution log: one row per executed step. Idempotency key is UNIQUE so
-- retry/replay can NEVER double-send.
CREATE TABLE IF NOT EXISTS sequence_step_logs (
  id integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  enrollment_id integer NOT NULL REFERENCES sequence_enrollments(id) ON DELETE CASCADE,
  step_id integer REFERENCES sequence_steps(id) ON DELETE SET NULL,
  executed_at timestamptz NOT NULL DEFAULT now(),
  channel varchar(20) NOT NULL,
  status varchar(20) NOT NULL DEFAULT 'sent'
    CHECK (status IN ('sent', 'skipped', 'failed', 'suppressed')),
  error text,
  idempotency_key varchar(128) NOT NULL UNIQUE
);
CREATE INDEX IF NOT EXISTS idx_step_logs_enrollment ON sequence_step_logs(enrollment_id);
