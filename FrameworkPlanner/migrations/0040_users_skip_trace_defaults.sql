ALTER TABLE users
ADD COLUMN IF NOT EXISTS skip_trace_default_mode TEXT NOT NULL DEFAULT 'both';

ALTER TABLE users
ADD CONSTRAINT users_skip_trace_default_mode_check
CHECK (skip_trace_default_mode IN ('provider', 'public_research', 'both'));

