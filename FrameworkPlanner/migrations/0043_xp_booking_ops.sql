CREATE TABLE IF NOT EXISTS xp_booking_events (
  id INTEGER PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  booking_id INTEGER NOT NULL,
  type VARCHAR(80) NOT NULL,
  payload JSONB,
  created_by_user_id INTEGER,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_xp_booking_events_booking_id_created_at ON xp_booking_events(booking_id, created_at DESC);

CREATE TABLE IF NOT EXISTS xp_booking_messages (
  id INTEGER PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  booking_id INTEGER NOT NULL,
  channel VARCHAR(20) NOT NULL,
  to_address VARCHAR(255) NOT NULL,
  from_address VARCHAR(255),
  subject VARCHAR(255),
  body TEXT NOT NULL,
  provider VARCHAR(50),
  provider_message_id VARCHAR(255),
  status VARCHAR(50) NOT NULL DEFAULT 'queued',
  error TEXT,
  created_by_user_id INTEGER,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_xp_booking_messages_booking_id_created_at ON xp_booking_messages(booking_id, created_at DESC);

CREATE TABLE IF NOT EXISTS xp_booking_refunds (
  id INTEGER PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  booking_id INTEGER NOT NULL,
  stripe_refund_id VARCHAR(255) NOT NULL,
  stripe_payment_intent_id VARCHAR(255),
  currency VARCHAR(10) NOT NULL DEFAULT 'USD',
  amount_cents INTEGER,
  status VARCHAR(50) NOT NULL DEFAULT 'created',
  created_by_user_id INTEGER,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_xp_booking_refunds_stripe_refund_id_unique ON xp_booking_refunds(stripe_refund_id);
CREATE INDEX IF NOT EXISTS idx_xp_booking_refunds_booking_id_created_at ON xp_booking_refunds(booking_id, created_at DESC);

