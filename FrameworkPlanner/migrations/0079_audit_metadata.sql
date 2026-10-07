-- 0079: Audit metadata + service identities (Ticket 4).
--
-- The audit trail could not answer "which accountable domain owns this change?"
-- or "which background worker did it?" — an automated write was indistinguishable
-- from a human write with no actor. These additive columns fix that:
--   domain            owning data domain (shared/data-domains.ts)
--   actor_kind        'user' | 'service' | 'system'
--   service_identity  first-party worker id (shared/service-identities.ts)
--   metadata_json     non-secret context, including the domain owner role
--
-- Additive and idempotent; existing rows default to actor_kind='user' and NULL
-- for the new attribution columns, which is the correct historical reading.

ALTER TABLE IF EXISTS audit_events
  ADD COLUMN IF NOT EXISTS domain varchar(32);
ALTER TABLE IF EXISTS audit_events
  ADD COLUMN IF NOT EXISTS actor_kind varchar(16) NOT NULL DEFAULT 'user';
ALTER TABLE IF EXISTS audit_events
  ADD COLUMN IF NOT EXISTS service_identity varchar(64);
ALTER TABLE IF EXISTS audit_events
  ADD COLUMN IF NOT EXISTS metadata_json text;

CREATE INDEX IF NOT EXISTS audit_events_entity_idx
  ON audit_events (entity_type, entity_id, created_at);
CREATE INDEX IF NOT EXISTS audit_events_domain_idx
  ON audit_events (domain, created_at);
CREATE INDEX IF NOT EXISTS audit_events_service_identity_idx
  ON audit_events (service_identity, created_at);
