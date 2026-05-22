ALTER TABLE app_audit_findings ADD COLUMN IF NOT EXISTS affected_pages JSONB;
ALTER TABLE app_audit_findings ADD COLUMN IF NOT EXISTS fix_plan TEXT;
ALTER TABLE app_audit_findings ADD COLUMN IF NOT EXISTS owner_user_id INTEGER;
ALTER TABLE app_audit_findings ADD COLUMN IF NOT EXISTS prd_section TEXT;

UPDATE app_audit_findings
SET affected_pages = '[]'::jsonb
WHERE affected_pages IS NULL;
