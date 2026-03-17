ALTER TABLE contacts ADD COLUMN IF NOT EXISTS dedupe_key VARCHAR(400);
ALTER TABLE buyers ADD COLUMN IF NOT EXISTS dedupe_key VARCHAR(400);

UPDATE contacts
SET dedupe_key =
  LOWER(TRIM(COALESCE(email, ''))) || '|' ||
  LOWER(TRIM(COALESCE(phone, ''))) || '|' ||
  LOWER(REGEXP_REPLACE(TRIM(COALESCE(name, '')), '\\s+', ' ', 'g'))
WHERE dedupe_key IS NULL;

UPDATE buyers
SET dedupe_key =
  LOWER(TRIM(COALESCE(email, ''))) || '|' ||
  LOWER(TRIM(COALESCE(phone, ''))) || '|' ||
  LOWER(REGEXP_REPLACE(TRIM(COALESCE(name, '')), '\\s+', ' ', 'g')) || '|' ||
  LOWER(REGEXP_REPLACE(TRIM(COALESCE(company, '')), '\\s+', ' ', 'g'))
WHERE dedupe_key IS NULL;

CREATE INDEX IF NOT EXISTS idx_contacts_dedupe_key ON contacts (dedupe_key);
CREATE INDEX IF NOT EXISTS idx_buyers_dedupe_key ON buyers (dedupe_key);
