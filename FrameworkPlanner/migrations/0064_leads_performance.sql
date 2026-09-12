-- 0064_leads_performance.sql
-- Hot-path indexes + cleanup backing for the lead-automation candidate query.
--
-- Context: the background lead-automation worker previously loaded the entire
-- leads table (10k+ rows) every 60s to find negotiation/under_contract leads
-- without a linked property. That query is now:
--   select ... from leads l
--   where l.status in ('negotiation','under_contract')
--     and not exists (select 1 from properties p where p.source_lead_id = l.id)
--   limit 50
-- These indexes make that probe (and the dashboard's stale-lead scan) cheap.

-- Partial index: only the statuses the automation scan cares about.
CREATE INDEX IF NOT EXISTS idx_leads_status_automation
  ON leads (status, id)
  WHERE status IN ('negotiation', 'under_contract');

-- Anti-join probe: properties by source lead (index-only scan).
CREATE INDEX IF NOT EXISTS idx_properties_source_lead_id_only
  ON properties (source_lead_id)
  WHERE source_lead_id IS NOT NULL;

-- Dashboard stats: stale-lead scan filters on archived_at + last_touch_at.
CREATE INDEX IF NOT EXISTS idx_leads_last_touch_at
  ON leads (last_touch_at)
  WHERE last_touch_at IS NOT NULL;

-- Automation dispatch lookup on every entity write.
CREATE INDEX IF NOT EXISTS idx_automation_triggers_team_event
  ON automation_triggers (team_id, event_type);

-- User-facing tables that sort/filter by created_at / team.
CREATE INDEX IF NOT EXISTS idx_leads_created_at ON leads (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_opportunities_created_at ON properties (created_at DESC);

-- Audit log page (/audit-log) filters + sorts by team and timestamp.
CREATE INDEX IF NOT EXISTS idx_audit_events_team_created
  ON audit_events (team_id, created_at DESC, id DESC);

CREATE INDEX IF NOT EXISTS idx_audit_events_team_entity
  ON audit_events (team_id, entity_type, entity_id);

-- Opportunity activity timeline.
CREATE INDEX IF NOT EXISTS idx_opportunity_events_opp_created
  ON opportunity_events (opportunity_id, created_at DESC);
