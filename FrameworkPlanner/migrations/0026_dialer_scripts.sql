CREATE TABLE IF NOT EXISTS dialer_scripts (
  id integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  user_id integer NOT NULL,
  list_id varchar(50),
  name varchar(120) NOT NULL,
  content text NOT NULL DEFAULT '',
  is_default boolean NOT NULL DEFAULT false,
  created_at timestamp DEFAULT now(),
  updated_at timestamp DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_dialer_scripts_user_id ON dialer_scripts (user_id);
CREATE INDEX IF NOT EXISTS idx_dialer_scripts_user_list_id ON dialer_scripts (user_id, list_id);
