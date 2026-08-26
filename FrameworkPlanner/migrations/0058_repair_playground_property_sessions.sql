-- Forward-only data repair for playground_property_sessions.
--
-- History: migration 0008 created a global UNIQUE index on address_key. On
-- databases that accumulated duplicate address_key rows (stale data from earlier
-- builds), replaying 0008 raised a duplicate-key violation and aborted the whole
-- migration run. Migration 0030 later superseded the global index with a per-user
-- unique index (created_by, address_key), so the global index is obsolete.
--
-- This repair:
--   1. Backs up every non-canonical duplicate row into
--      playground_property_sessions_dedup_backup (audit/restore safety net).
--   2. Deletes the non-canonical rows. No FK constraints reference
--      playground_property_sessions, so there are no dependents to relink.
--   3. Drops the obsolete global unique index.
--   4. Ensures the per-user unique index exists (current schema contract).
--
-- Canonical record per address_key group: newest updated_at, then newest
-- created_at, then highest id (deterministic).
--
-- Idempotent: all steps are guarded; a second run is a no-op.

DO $$
DECLARE
  dup_count INTEGER;
BEGIN
  SELECT count(*) INTO dup_count
    FROM (SELECT 1 FROM playground_property_sessions
           GROUP BY address_key HAVING count(*) > 1) d;

  IF dup_count > 0 THEN
    CREATE TABLE IF NOT EXISTS playground_property_sessions_dedup_backup (
      id INTEGER,
      address VARCHAR(500),
      address_key TEXT,
      property_type VARCHAR(50),
      current_url TEXT,
      tags_json TEXT,
      bookmarks_json TEXT,
      checklist_json TEXT,
      notes_json TEXT,
      underwriting_json TEXT,
      lead_id INTEGER,
      property_id INTEGER,
      assigned_to INTEGER,
      assignment_due_at TIMESTAMP,
      assignment_status VARCHAR(50),
      created_by INTEGER,
      updated_by INTEGER,
      last_opened_by INTEGER,
      created_at TIMESTAMP,
      updated_at TIMESTAMP,
      last_opened_at TIMESTAMP,
      deduped_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      dedupe_group_address_key TEXT NOT NULL,
      replaced_by_session_id INTEGER
    );

    WITH canonical AS (
      SELECT DISTINCT ON (address_key) id, address_key
      FROM playground_property_sessions
      ORDER BY address_key,
        updated_at DESC NULLS LAST,
        created_at DESC NULLS LAST,
        id DESC
    )
    INSERT INTO playground_property_sessions_dedup_backup
      (id, address, address_key, property_type, current_url, tags_json, bookmarks_json,
       checklist_json, notes_json, underwriting_json, lead_id, property_id,
       assigned_to, assignment_due_at, assignment_status, created_by, updated_by,
       last_opened_by, created_at, updated_at, last_opened_at,
       dedupe_group_address_key, replaced_by_session_id)
    SELECT p.id, p.address, p.address_key, p.property_type, p.current_url, p.tags_json,
           p.bookmarks_json, p.checklist_json, p.notes_json, p.underwriting_json,
           p.lead_id, p.property_id, p.assigned_to, p.assignment_due_at,
           p.assignment_status, p.created_by, p.updated_by, p.last_opened_by,
           p.created_at, p.updated_at, p.last_opened_at,
           p.address_key, c.id
    FROM playground_property_sessions p
    JOIN canonical c ON c.address_key = p.address_key
    WHERE p.id <> c.id;

    WITH canonical AS (
      SELECT DISTINCT ON (address_key) id, address_key
      FROM playground_property_sessions
      ORDER BY address_key,
        updated_at DESC NULLS LAST,
        created_at DESC NULLS LAST,
        id DESC
    )
    DELETE FROM playground_property_sessions p
    USING canonical c
    WHERE c.address_key = p.address_key AND p.id <> c.id;

    RAISE NOTICE 'Deduplicated % address_key group(s) in playground_property_sessions', dup_count;
  END IF;
END $$;

-- The global unique index from 0008 was superseded by the per-user index in 0030.
DROP INDEX IF EXISTS playground_property_sessions_address_key_uq;

-- Ensure the per-user unique index (current schema contract) exists.
CREATE UNIQUE INDEX IF NOT EXISTS playground_property_sessions_user_address_key_uq
  ON playground_property_sessions (created_by, address_key);
