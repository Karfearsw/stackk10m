CREATE TABLE IF NOT EXISTS xp_experiences (
  id INTEGER PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  slug VARCHAR(80) NOT NULL,
  title VARCHAR(255) NOT NULL,
  description TEXT,
  mode VARCHAR(20) NOT NULL DEFAULT 'time_slot',
  currency VARCHAR(10) NOT NULL DEFAULT 'USD',
  price_total NUMERIC(12, 2),
  deposit_amount NUMERIC(12, 2) NOT NULL,
  capacity INTEGER NOT NULL DEFAULT 1,
  active BOOLEAN NOT NULL DEFAULT true,
  images TEXT[],
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_xp_experiences_slug_unique ON xp_experiences(slug);

CREATE TABLE IF NOT EXISTS xp_time_slots (
  id INTEGER PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  experience_id INTEGER NOT NULL,
  start_at TIMESTAMP NOT NULL,
  end_at TIMESTAMP NOT NULL,
  capacity INTEGER NOT NULL DEFAULT 1,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_xp_time_slots_experience_id ON xp_time_slots(experience_id);
CREATE INDEX IF NOT EXISTS idx_xp_time_slots_start_at ON xp_time_slots(start_at);

CREATE TABLE IF NOT EXISTS xp_blackouts (
  id INTEGER PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  experience_id INTEGER NOT NULL,
  start_at TIMESTAMP NOT NULL,
  end_at TIMESTAMP NOT NULL,
  reason TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_xp_blackouts_experience_id ON xp_blackouts(experience_id);
CREATE INDEX IF NOT EXISTS idx_xp_blackouts_start_at ON xp_blackouts(start_at);

CREATE TABLE IF NOT EXISTS xp_bookings (
  id INTEGER PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  experience_id INTEGER NOT NULL,
  kind VARCHAR(20) NOT NULL,
  customer_name VARCHAR(255) NOT NULL,
  customer_email VARCHAR(255) NOT NULL,
  customer_phone VARCHAR(40),
  start_at TIMESTAMP NOT NULL,
  end_at TIMESTAMP NOT NULL,
  status VARCHAR(40) NOT NULL DEFAULT 'pending_payment',
  currency VARCHAR(10) NOT NULL DEFAULT 'USD',
  deposit_amount NUMERIC(12, 2) NOT NULL,
  stripe_checkout_session_id VARCHAR(255),
  stripe_payment_intent_id VARCHAR(255),
  stripe_customer_id VARCHAR(255),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_xp_bookings_experience_id ON xp_bookings(experience_id);
CREATE INDEX IF NOT EXISTS idx_xp_bookings_start_at ON xp_bookings(start_at);
CREATE INDEX IF NOT EXISTS idx_xp_bookings_status ON xp_bookings(status);
CREATE UNIQUE INDEX IF NOT EXISTS idx_xp_bookings_checkout_session_unique ON xp_bookings(stripe_checkout_session_id) WHERE stripe_checkout_session_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS xp_stripe_events (
  id INTEGER PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  event_id VARCHAR(255) NOT NULL,
  type VARCHAR(120) NOT NULL,
  payload JSONB,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_xp_stripe_events_event_id_unique ON xp_stripe_events(event_id);

