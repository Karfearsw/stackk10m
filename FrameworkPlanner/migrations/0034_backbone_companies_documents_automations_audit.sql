CREATE TABLE IF NOT EXISTS companies (
  id INTEGER PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  team_id INTEGER NOT NULL,
  name VARCHAR(255) NOT NULL,
  company_type VARCHAR(50),
  website VARCHAR(500),
  phone VARCHAR(32),
  email VARCHAR(255),
  address TEXT,
  notes TEXT,
  tags TEXT[],
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  CONSTRAINT companies_team_fk FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS companies_team_id_idx ON companies(team_id);
CREATE INDEX IF NOT EXISTS companies_name_idx ON companies(name);
CREATE INDEX IF NOT EXISTS companies_type_idx ON companies(company_type);

CREATE TABLE IF NOT EXISTS company_people (
  id INTEGER PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  team_id INTEGER NOT NULL,
  company_id INTEGER NOT NULL,
  contact_id INTEGER NOT NULL,
  title VARCHAR(120),
  is_primary BOOLEAN DEFAULT false,
  created_at TIMESTAMP DEFAULT NOW(),
  CONSTRAINT company_people_team_fk FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE CASCADE,
  CONSTRAINT company_people_company_fk FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE,
  CONSTRAINT company_people_contact_fk FOREIGN KEY (contact_id) REFERENCES contacts(id) ON DELETE CASCADE,
  CONSTRAINT company_people_company_contact_uq UNIQUE (company_id, contact_id)
);

CREATE INDEX IF NOT EXISTS company_people_team_id_idx ON company_people(team_id);
CREATE INDEX IF NOT EXISTS company_people_company_id_idx ON company_people(company_id);
CREATE INDEX IF NOT EXISTS company_people_contact_id_idx ON company_people(contact_id);

CREATE TABLE IF NOT EXISTS documents (
  id INTEGER PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  team_id INTEGER NOT NULL,
  title VARCHAR(255) NOT NULL,
  kind VARCHAR(50),
  mime_type VARCHAR(120) NOT NULL,
  size_bytes INTEGER,
  storage_key TEXT NOT NULL,
  sha256 VARCHAR(64),
  tags TEXT[],
  is_private BOOLEAN DEFAULT false,
  created_by INTEGER,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  CONSTRAINT documents_team_fk FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE CASCADE,
  CONSTRAINT documents_created_by_fk FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS documents_team_id_idx ON documents(team_id);
CREATE INDEX IF NOT EXISTS documents_kind_idx ON documents(kind);
CREATE INDEX IF NOT EXISTS documents_created_at_idx ON documents(created_at);

CREATE TABLE IF NOT EXISTS document_links (
  id INTEGER PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  team_id INTEGER NOT NULL,
  document_id INTEGER NOT NULL,
  entity_type VARCHAR(50) NOT NULL,
  entity_id INTEGER NOT NULL,
  relation VARCHAR(50),
  created_at TIMESTAMP DEFAULT NOW(),
  CONSTRAINT document_links_team_fk FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE CASCADE,
  CONSTRAINT document_links_document_fk FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS document_links_team_id_idx ON document_links(team_id);
CREATE INDEX IF NOT EXISTS document_links_document_id_idx ON document_links(document_id);
CREATE INDEX IF NOT EXISTS document_links_entity_idx ON document_links(entity_type, entity_id);

CREATE TABLE IF NOT EXISTS vault_document_versions (
  id INTEGER PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  team_id INTEGER NOT NULL,
  document_id INTEGER NOT NULL,
  version INTEGER NOT NULL,
  storage_key TEXT NOT NULL,
  mime_type VARCHAR(120) NOT NULL,
  size_bytes INTEGER,
  sha256 VARCHAR(64),
  created_by INTEGER,
  created_at TIMESTAMP DEFAULT NOW(),
  CONSTRAINT vault_document_versions_team_fk FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE CASCADE,
  CONSTRAINT vault_document_versions_document_fk FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE CASCADE,
  CONSTRAINT vault_document_versions_created_by_fk FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT vault_document_versions_document_version_uq UNIQUE (document_id, version)
);

CREATE INDEX IF NOT EXISTS vault_document_versions_team_id_idx ON vault_document_versions(team_id);
CREATE INDEX IF NOT EXISTS vault_document_versions_document_id_idx ON vault_document_versions(document_id);

CREATE TABLE IF NOT EXISTS automations (
  id INTEGER PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  team_id INTEGER NOT NULL,
  name VARCHAR(120) NOT NULL,
  description TEXT,
  enabled BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  CONSTRAINT automations_team_fk FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS automations_team_id_idx ON automations(team_id);

CREATE TABLE IF NOT EXISTS automation_triggers (
  id INTEGER PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  team_id INTEGER NOT NULL,
  automation_id INTEGER NOT NULL,
  event_type VARCHAR(80) NOT NULL,
  config_json TEXT NOT NULL DEFAULT '{}',
  created_at TIMESTAMP DEFAULT NOW(),
  CONSTRAINT automation_triggers_team_fk FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE CASCADE,
  CONSTRAINT automation_triggers_automation_fk FOREIGN KEY (automation_id) REFERENCES automations(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS automation_triggers_team_id_idx ON automation_triggers(team_id);
CREATE INDEX IF NOT EXISTS automation_triggers_event_type_idx ON automation_triggers(event_type);

CREATE TABLE IF NOT EXISTS automation_conditions (
  id INTEGER PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  team_id INTEGER NOT NULL,
  automation_id INTEGER NOT NULL,
  config_json TEXT NOT NULL DEFAULT '{}',
  created_at TIMESTAMP DEFAULT NOW(),
  CONSTRAINT automation_conditions_team_fk FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE CASCADE,
  CONSTRAINT automation_conditions_automation_fk FOREIGN KEY (automation_id) REFERENCES automations(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS automation_conditions_team_id_idx ON automation_conditions(team_id);
CREATE INDEX IF NOT EXISTS automation_conditions_automation_id_idx ON automation_conditions(automation_id);

CREATE TABLE IF NOT EXISTS automation_actions (
  id INTEGER PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  team_id INTEGER NOT NULL,
  automation_id INTEGER NOT NULL,
  action_type VARCHAR(80) NOT NULL,
  config_json TEXT NOT NULL DEFAULT '{}',
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW(),
  CONSTRAINT automation_actions_team_fk FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE CASCADE,
  CONSTRAINT automation_actions_automation_fk FOREIGN KEY (automation_id) REFERENCES automations(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS automation_actions_team_id_idx ON automation_actions(team_id);
CREATE INDEX IF NOT EXISTS automation_actions_automation_id_idx ON automation_actions(automation_id);

CREATE TABLE IF NOT EXISTS automation_runs (
  id INTEGER PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  team_id INTEGER NOT NULL,
  automation_id INTEGER NOT NULL,
  event_type VARCHAR(80) NOT NULL,
  event_json TEXT NOT NULL,
  status VARCHAR(20) NOT NULL,
  error TEXT,
  delivery_id VARCHAR(36),
  created_at TIMESTAMP DEFAULT NOW(),
  finished_at TIMESTAMP,
  CONSTRAINT automation_runs_team_fk FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE CASCADE,
  CONSTRAINT automation_runs_automation_fk FOREIGN KEY (automation_id) REFERENCES automations(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS automation_runs_team_id_idx ON automation_runs(team_id);
CREATE INDEX IF NOT EXISTS automation_runs_automation_id_idx ON automation_runs(automation_id);
CREATE INDEX IF NOT EXISTS automation_runs_created_at_idx ON automation_runs(created_at);

CREATE TABLE IF NOT EXISTS audit_events (
  id INTEGER PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  team_id INTEGER NOT NULL,
  actor_user_id INTEGER,
  entity_type VARCHAR(50) NOT NULL,
  entity_id INTEGER,
  action VARCHAR(80) NOT NULL,
  before_json TEXT,
  after_json TEXT,
  diff_json TEXT,
  ip VARCHAR(64),
  user_agent TEXT,
  request_id VARCHAR(64),
  created_at TIMESTAMP DEFAULT NOW(),
  CONSTRAINT audit_events_team_fk FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE CASCADE,
  CONSTRAINT audit_events_actor_fk FOREIGN KEY (actor_user_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS audit_events_team_id_idx ON audit_events(team_id);
CREATE INDEX IF NOT EXISTS audit_events_created_at_idx ON audit_events(created_at);
CREATE INDEX IF NOT EXISTS audit_events_entity_idx ON audit_events(entity_type, entity_id);
