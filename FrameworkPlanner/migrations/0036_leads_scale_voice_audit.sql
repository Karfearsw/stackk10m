ALTER TABLE leads ADD COLUMN IF NOT EXISTS archived_at TIMESTAMP;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS status_changed_at TIMESTAMP;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS lead_type VARCHAR(50);
ALTER TABLE leads ADD COLUMN IF NOT EXISTS county VARCHAR(100);
ALTER TABLE leads ADD COLUMN IF NOT EXISTS owner_occupied BOOLEAN;

CREATE INDEX IF NOT EXISTS idx_leads_archived_at ON leads (archived_at);
CREATE INDEX IF NOT EXISTS idx_leads_status_changed_at ON leads (status_changed_at);
CREATE INDEX IF NOT EXISTS idx_leads_assigned_to_created_at ON leads (assigned_to, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_leads_status ON leads (status);
CREATE INDEX IF NOT EXISTS idx_leads_zip_code ON leads (zip_code);
CREATE INDEX IF NOT EXISTS idx_leads_state ON leads (state);
CREATE INDEX IF NOT EXISTS idx_leads_city ON leads (city);
CREATE INDEX IF NOT EXISTS idx_leads_tags_gin ON leads USING GIN (tags);

CREATE TABLE IF NOT EXISTS lead_notes (
  id INTEGER PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  lead_id INTEGER NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  body TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_lead_notes_lead_id_created_at ON lead_notes(lead_id, created_at DESC);

CREATE TABLE IF NOT EXISTS saved_views (
  id INTEGER PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  entity_type VARCHAR(32) NOT NULL,
  name VARCHAR(120) NOT NULL,
  owner_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  team_id INTEGER REFERENCES teams(id) ON DELETE CASCADE,
  visibility VARCHAR(20) NOT NULL DEFAULT 'private',
  share_token VARCHAR(64),
  config_json JSONB NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_saved_views_share_token_unique ON saved_views(share_token) WHERE share_token IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_saved_views_owner_entity ON saved_views(owner_user_id, entity_type);
CREATE INDEX IF NOT EXISTS idx_saved_views_team_entity ON saved_views(team_id, entity_type);

CREATE TABLE IF NOT EXISTS lead_bulk_action_jobs (
  id INTEGER PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  created_by INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status VARCHAR(32) NOT NULL DEFAULT 'queued',
  action VARCHAR(50) NOT NULL,
  selection_scope VARCHAR(32) NOT NULL,
  lead_ids JSONB,
  filter_json JSONB,
  total_targets INTEGER DEFAULT 0,
  processed INTEGER DEFAULT 0,
  succeeded INTEGER DEFAULT 0,
  failed INTEGER DEFAULT 0,
  result_json JSONB,
  started_at TIMESTAMP,
  finished_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_lead_bulk_action_jobs_created_by_created_at ON lead_bulk_action_jobs(created_by, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_lead_bulk_action_jobs_status ON lead_bulk_action_jobs(status);

CREATE TABLE IF NOT EXISTS ai_action_logs (
  id INTEGER PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  created_by INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  entity_type VARCHAR(32) NOT NULL,
  transcript TEXT NOT NULL,
  parsed_json JSONB NOT NULL,
  selection_json JSONB NOT NULL,
  applied_json JSONB,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ai_action_logs_created_by_created_at ON ai_action_logs(created_by, created_at DESC);

CREATE TABLE IF NOT EXISTS ai_action_undo (
  id INTEGER PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  ai_action_log_id INTEGER NOT NULL REFERENCES ai_action_logs(id) ON DELETE CASCADE,
  undo_json JSONB NOT NULL,
  expires_at TIMESTAMP NOT NULL,
  undone_at TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_ai_action_undo_action_unique ON ai_action_undo(ai_action_log_id);
CREATE INDEX IF NOT EXISTS idx_ai_action_undo_expires_at ON ai_action_undo(expires_at);

CREATE TABLE IF NOT EXISTS app_audit_runs (
  id INTEGER PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  created_by INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  scope_json JSONB NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_app_audit_runs_created_by_created_at ON app_audit_runs(created_by, created_at DESC);

CREATE TABLE IF NOT EXISTS app_audit_findings (
  id INTEGER PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  run_id INTEGER NOT NULL REFERENCES app_audit_runs(id) ON DELETE CASCADE,
  severity VARCHAR(20) NOT NULL,
  area VARCHAR(80) NOT NULL,
  title VARCHAR(160) NOT NULL,
  description TEXT NOT NULL,
  recommendation TEXT,
  technical_notes TEXT,
  status VARCHAR(20) NOT NULL DEFAULT 'open',
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_app_audit_findings_run_id ON app_audit_findings(run_id);
CREATE INDEX IF NOT EXISTS idx_app_audit_findings_severity ON app_audit_findings(severity);
CREATE INDEX IF NOT EXISTS idx_app_audit_findings_status ON app_audit_findings(status);

