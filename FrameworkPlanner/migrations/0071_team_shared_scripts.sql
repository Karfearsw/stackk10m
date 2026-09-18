-- 0071: Team-shared scripts.
-- dialer_scripts becomes a team-wide library: every member of a team sees the
-- same scripts (dialer, SMS template chips, Script Library). Viewing/using/
-- practicing requires team membership; create/edit/archive/delete requires
-- admin or owner. team_id scopes rows; created_by records the real author.
-- user_id keeps its NOT NULL contract and now stores the team owner
-- (the effective data owner for a shared row).

ALTER TABLE dialer_scripts ADD COLUMN IF NOT EXISTS team_id INTEGER;
ALTER TABLE dialer_scripts ADD COLUMN IF NOT EXISTS created_by INTEGER;

CREATE INDEX IF NOT EXISTS idx_dialer_scripts_team ON dialer_scripts (team_id, is_archived);
CREATE INDEX IF NOT EXISTS idx_dialer_scripts_team_category ON dialer_scripts (team_id, category);
CREATE INDEX IF NOT EXISTS idx_dialer_scripts_team_list ON dialer_scripts (team_id, list_id);

-- Backfill: attach each existing script to its owner's first active team and
-- re-point user_id at that team's owner so the whole team owns every row.
WITH owners AS (
  SELECT DISTINCT ON (tm.team_id)
    tm.team_id, tm.user_id AS owner_user_id
  FROM team_members tm
  WHERE tm.status = 'active'
  ORDER BY tm.team_id,
    CASE lower(tm.role) WHEN 'owner' THEN 0 WHEN 'admin' THEN 1 ELSE 2 END,
    tm.user_id
),
user_team AS (
  SELECT DISTINCT ON (ds.user_id)
    ds.user_id, tm.team_id
  FROM dialer_scripts ds
  JOIN team_members tm ON tm.user_id = ds.user_id AND tm.status = 'active'
  ORDER BY ds.user_id, tm.team_id
)
UPDATE dialer_scripts ds
SET team_id = ut.team_id,
    created_by = ds.user_id,
    user_id = COALESCE(o.owner_user_id, ds.user_id)
FROM user_team ut
LEFT JOIN owners o ON o.team_id = ut.team_id
WHERE ds.user_id = ut.user_id
  AND ds.team_id IS NULL;
