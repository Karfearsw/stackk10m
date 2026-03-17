CREATE TABLE IF NOT EXISTS pipeline_configs (
  id INTEGER PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  user_id INTEGER NOT NULL,
  entity_type VARCHAR(20) NOT NULL,
  columns TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  CONSTRAINT fk_pipeline_configs_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT uq_pipeline_configs_user_entity UNIQUE (user_id, entity_type)
);

CREATE INDEX IF NOT EXISTS pipeline_configs_user_id_idx ON pipeline_configs(user_id);
