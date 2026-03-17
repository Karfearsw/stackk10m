CREATE TABLE IF NOT EXISTS auth_audit_logs (
  id INTEGER PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  action VARCHAR(100) NOT NULL,
  outcome VARCHAR(50) NOT NULL,
  user_id INTEGER,
  email VARCHAR(255),
  ip VARCHAR(100),
  user_agent TEXT,
  metadata TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS auth_audit_logs_created_at_idx ON auth_audit_logs(created_at);
CREATE INDEX IF NOT EXISTS auth_audit_logs_action_idx ON auth_audit_logs(action);
