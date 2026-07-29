ALTER TABLE tasks
ADD COLUMN IF NOT EXISTS legacy_task_id INTEGER,
ADD COLUMN IF NOT EXISTS source_db VARCHAR(50),
ADD COLUMN IF NOT EXISTS migration_batch_id VARCHAR(100);

CREATE UNIQUE INDEX IF NOT EXISTS idx_tasks_legacy_source_unique
ON tasks (source_db, legacy_task_id);
