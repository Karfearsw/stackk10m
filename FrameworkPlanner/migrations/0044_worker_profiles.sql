CREATE TABLE IF NOT EXISTS worker_profiles (
  user_id INTEGER PRIMARY KEY,
  worker_type VARCHAR(20) NOT NULL DEFAULT 'employee',
  pay_type VARCHAR(20) NOT NULL DEFAULT 'hourly',
  default_hourly_rate DECIMAL(10, 2),
  salary_amount DECIMAL(12, 2),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  effective_from DATE,
  effective_to DATE,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  CONSTRAINT fk_worker_profiles_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS category_rate_overrides (
  id INTEGER PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  user_id INTEGER NOT NULL,
  category_id INTEGER NOT NULL,
  hourly_rate DECIMAL(10, 2),
  cost_rate DECIMAL(10, 2),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  CONSTRAINT fk_category_rate_overrides_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_category_rate_overrides_category FOREIGN KEY (category_id) REFERENCES work_categories(id) ON DELETE CASCADE,
  CONSTRAINT category_rate_overrides_user_category_unique UNIQUE (user_id, category_id)
);

CREATE INDEX IF NOT EXISTS worker_profiles_pay_type_idx ON worker_profiles(pay_type);
CREATE INDEX IF NOT EXISTS category_rate_overrides_user_id_idx ON category_rate_overrides(user_id);

