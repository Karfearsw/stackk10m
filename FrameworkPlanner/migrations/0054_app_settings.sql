-- 0054: app_settings key/value store — a DB override layer for env-driven
--       configuration so admins can manage values like TELNYX_AI_ASSISTANT_ID
--       and FEATURE_AI_ASSISTANT from Settings → System without editing .env.
--       Env vars remain the default; a stored row overrides them.

CREATE TABLE IF NOT EXISTS app_settings (
  key text PRIMARY KEY,
  value text,
  updated_by integer,
  updated_at timestamptz NOT NULL DEFAULT now()
);
