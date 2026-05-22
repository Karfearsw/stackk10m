ALTER TABLE IF EXISTS pipeline_configs
  ADD COLUMN IF NOT EXISTS team_id INTEGER;

CREATE INDEX IF NOT EXISTS pipeline_configs_team_id_idx ON pipeline_configs(team_id);

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'pipeline_configs'
      AND column_name = 'team_id'
  ) THEN
    EXECUTE 'CREATE UNIQUE INDEX IF NOT EXISTS pipeline_configs_team_entity_uq ON pipeline_configs(team_id, entity_type) WHERE team_id IS NOT NULL';
  END IF;
END
$$;

