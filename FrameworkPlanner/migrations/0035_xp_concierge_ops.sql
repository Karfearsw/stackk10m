CREATE TABLE IF NOT EXISTS xp_locations (
  id INTEGER PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  name VARCHAR(255) NOT NULL,
  type VARCHAR(40) NOT NULL DEFAULT 'resort',
  address1 VARCHAR(255),
  address2 VARCHAR(255),
  city VARCHAR(120),
  state VARCHAR(40),
  zip VARCHAR(20),
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_xp_locations_active ON xp_locations(active);
CREATE INDEX IF NOT EXISTS idx_xp_locations_type ON xp_locations(type);

CREATE TABLE IF NOT EXISTS xp_vehicles (
  id INTEGER PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  name VARCHAR(255) NOT NULL,
  type VARCHAR(40) NOT NULL DEFAULT 'tesla',
  license_plate VARCHAR(40),
  location_id INTEGER REFERENCES xp_locations(id) ON DELETE SET NULL,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_xp_vehicles_active ON xp_vehicles(active);
CREATE INDEX IF NOT EXISTS idx_xp_vehicles_location_id ON xp_vehicles(location_id);

CREATE TABLE IF NOT EXISTS xp_booking_assignments (
  booking_id INTEGER PRIMARY KEY REFERENCES xp_bookings(id) ON DELETE CASCADE,
  location_id INTEGER REFERENCES xp_locations(id) ON DELETE SET NULL,
  vehicle_id INTEGER REFERENCES xp_vehicles(id) ON DELETE SET NULL,
  concierge_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  assigned_at TIMESTAMP,
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_xp_booking_assignments_location_id ON xp_booking_assignments(location_id);
CREATE INDEX IF NOT EXISTS idx_xp_booking_assignments_vehicle_id ON xp_booking_assignments(vehicle_id);
CREATE INDEX IF NOT EXISTS idx_xp_booking_assignments_concierge_user_id ON xp_booking_assignments(concierge_user_id);

CREATE TABLE IF NOT EXISTS xp_booking_notes (
  id INTEGER PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  booking_id INTEGER NOT NULL REFERENCES xp_bookings(id) ON DELETE CASCADE,
  author_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  body TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_xp_booking_notes_booking_id_created_at
  ON xp_booking_notes(booking_id, created_at DESC);

