CREATE TABLE IF NOT EXISTS video_rooms (
  id serial PRIMARY KEY,
  room_id text NOT NULL,
  room_sid text,
  name text NOT NULL,
  created_by integer REFERENCES users(id),
  property_id integer,
  status text NOT NULL DEFAULT 'active',
  max_participants integer DEFAULT 2,
  created_at timestamptz NOT NULL DEFAULT now(),
  ended_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_video_rooms_status ON video_rooms(status);
CREATE INDEX IF NOT EXISTS idx_video_rooms_property_id ON video_rooms(property_id);
CREATE INDEX IF NOT EXISTS idx_video_rooms_created_by ON video_rooms(created_by);
CREATE UNIQUE INDEX IF NOT EXISTS idx_video_rooms_room_id ON video_rooms(room_id);
