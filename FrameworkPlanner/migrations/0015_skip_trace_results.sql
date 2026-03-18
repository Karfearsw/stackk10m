CREATE TABLE IF NOT EXISTS skip_trace_results (
  id SERIAL PRIMARY KEY,
  lead_id INTEGER,
  property_id INTEGER,
  provider_name VARCHAR(100) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'pending',
  phones_json TEXT NOT NULL DEFAULT '[]',
  emails_json TEXT NOT NULL DEFAULT '[]',
  cost_cents INTEGER,
  requested_at TIMESTAMP NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMP,
  cache_key VARCHAR(400) NOT NULL,
  raw_response_json TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_skip_trace_cache_key_completed ON skip_trace_results (cache_key, completed_at DESC);
CREATE INDEX IF NOT EXISTS idx_skip_trace_lead_id ON skip_trace_results (lead_id);
CREATE INDEX IF NOT EXISTS idx_skip_trace_property_id ON skip_trace_results (property_id);

