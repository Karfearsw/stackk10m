-- Phase 2: n8n automation bridge — outbound webhooks + delivery log.
-- Inbound uses existing api_keys (Bearer lxrm_...) on /api/v1/* routes.

CREATE TABLE IF NOT EXISTS automation_webhooks (
  id integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  name varchar(255) NOT NULL,
  url text NOT NULL,
  events text[] NOT NULL DEFAULT '{}',
  secret varchar(255),
  active boolean NOT NULL DEFAULT true,
  created_by integer,
  created_at timestamp DEFAULT NOW(),
  updated_at timestamp DEFAULT NOW()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS webhook_deliveries (
  id integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  webhook_id integer REFERENCES automation_webhooks(id) ON DELETE CASCADE,
  event varchar(100) NOT NULL,
  payload jsonb NOT NULL,
  status varchar(20) NOT NULL DEFAULT 'pending',
  http_status integer,
  response_body text,
  attempts integer NOT NULL DEFAULT 0,
  next_retry_at timestamp,
  created_at timestamp DEFAULT NOW()
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_webhook ON webhook_deliveries (webhook_id);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_status ON webhook_deliveries (status);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_created ON webhook_deliveries (created_at DESC);
