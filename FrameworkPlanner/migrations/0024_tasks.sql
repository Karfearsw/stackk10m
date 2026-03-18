CREATE TABLE IF NOT EXISTS tasks (
  id SERIAL PRIMARY KEY,
  title VARCHAR(255) NOT NULL,
  description TEXT,
  type VARCHAR(80) DEFAULT 'general',
  related_entity_type VARCHAR(50),
  related_entity_id INTEGER,
  due_at TIMESTAMP,
  completed_at TIMESTAMP,
  priority VARCHAR(20) DEFAULT 'medium',
  status VARCHAR(20) DEFAULT 'open',
  assigned_to_user_id INTEGER,
  is_recurring BOOLEAN NOT NULL DEFAULT FALSE,
  recurrence_rule TEXT,
  created_by INTEGER NOT NULL,
  is_private BOOLEAN NOT NULL DEFAULT FALSE,
  reminder_sent_at TIMESTAMP,
  overdue_alert_sent_at TIMESTAMP,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tasks_assignee_status_due ON tasks (assigned_to_user_id, status, due_at);
CREATE INDEX IF NOT EXISTS idx_tasks_related_due ON tasks (related_entity_type, related_entity_id, due_at);
CREATE INDEX IF NOT EXISTS idx_tasks_status_due ON tasks (status, due_at);

