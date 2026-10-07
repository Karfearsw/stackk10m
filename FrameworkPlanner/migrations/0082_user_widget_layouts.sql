-- 0082: Per-user dialer widget layouts (Dialer Unification PRD, Task B).
--
-- Stores each user's drag/resize arrangement of the dialer-workspace widgets
-- as a JSONB layout array [{i,x,y,w,h}]. Keyed by (user_id, page) so agent A's
-- arrangement never affects agent B. Additive and idempotent.
-- NOTE: PRs #26/#27/#28 all claimed 0079; 0080/0081 are held for their
-- renumbering at merge time, so this uses 0082.

CREATE TABLE IF NOT EXISTS user_widget_layouts (
  user_id integer NOT NULL,
  page varchar(64) NOT NULL,
  layout jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, page)
);
