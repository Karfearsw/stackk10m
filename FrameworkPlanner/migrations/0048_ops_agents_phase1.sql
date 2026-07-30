CREATE TABLE IF NOT EXISTS ops_agents (
  id INTEGER PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  team_id INTEGER NOT NULL,
  slug VARCHAR(80) NOT NULL UNIQUE,
  display_name VARCHAR(120) NOT NULL,
  hostname VARCHAR(120),
  provider VARCHAR(80),
  region VARCHAR(80),
  environment VARCHAR(40) NOT NULL DEFAULT 'production',
  agent_type VARCHAR(40) NOT NULL DEFAULT 'hermes',
  model VARCHAR(120),
  expected_heartbeat_interval_seconds INTEGER NOT NULL DEFAULT 60,
  heartbeat_secret_hash VARCHAR(128) NOT NULL,
  config_ref_ciphertext TEXT,
  config_ref_iv VARCHAR(128),
  last_status VARCHAR(20) NOT NULL DEFAULT 'offline',
  last_heartbeat_at TIMESTAMP,
  last_error TEXT,
  last_task TEXT,
  latest_metrics_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by INTEGER NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  CONSTRAINT ops_agents_team_fk FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE CASCADE,
  CONSTRAINT ops_agents_created_by_fk FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS ops_agents_team_id_idx ON ops_agents(team_id);
CREATE INDEX IF NOT EXISTS ops_agents_last_heartbeat_at_idx ON ops_agents(last_heartbeat_at);

CREATE TABLE IF NOT EXISTS ops_agent_heartbeats (
  id INTEGER PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  agent_id INTEGER NOT NULL,
  reported_at TIMESTAMP NOT NULL,
  status VARCHAR(20) NOT NULL,
  cpu_percent INTEGER,
  ram_used_mb INTEGER,
  ram_total_mb INTEGER,
  disk_used_mb INTEGER,
  disk_total_mb INTEGER,
  uptime_seconds INTEGER,
  hermes_status VARCHAR(20),
  ollama_status VARCHAR(20),
  model VARCHAR(120),
  latest_task TEXT,
  last_error TEXT,
  payload_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  received_at TIMESTAMP DEFAULT NOW(),
  CONSTRAINT ops_agent_heartbeats_agent_fk FOREIGN KEY (agent_id) REFERENCES ops_agents(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS ops_agent_heartbeats_agent_received_idx ON ops_agent_heartbeats(agent_id, received_at DESC);
CREATE INDEX IF NOT EXISTS ops_agent_heartbeats_received_at_idx ON ops_agent_heartbeats(received_at);
