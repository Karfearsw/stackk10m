-- 0096_call_session_note.sql
-- Make crm_call_sessions the single source of truth for Quick Log Call notes.
-- Previously notes were only stored on crm_call_dispositions.note, making them
-- invisible to any read path that queries sessions without joining dispositions.
-- This adds note to the session and backfills from existing disposition notes.

ALTER TABLE crm_call_sessions ADD COLUMN IF NOT EXISTS note TEXT;

-- Backfill: copy disposition notes onto their sessions where the session has no note yet.
UPDATE crm_call_sessions s
SET note = d.note
FROM crm_call_dispositions d
WHERE d.session_id = s.id
  AND d.note IS NOT NULL
  AND d.note <> ''
  AND (s.note IS NULL OR s.note = '');

-- Index for note-presence checks in list views (e.g. "has note" indicator).
CREATE INDEX IF NOT EXISTS idx_call_sessions_note_present
  ON crm_call_sessions (id) WHERE note IS NOT NULL AND note <> '';
