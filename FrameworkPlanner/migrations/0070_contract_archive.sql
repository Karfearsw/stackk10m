-- 0070: genuine contract archive state (2026-09-16 audit, item 7)
--       Archive was only ever a status-label change; archived_at is a real
--       flag the list endpoints exclude by default, with a Show archived
--       filter in the UI.

ALTER TABLE contracts
  ADD COLUMN IF NOT EXISTS archived_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_contracts_archived_at ON contracts (archived_at);
