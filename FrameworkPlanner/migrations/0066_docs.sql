-- 0066_docs.sql
-- In-app documentation / sales-playbook module (replaces the static
-- page-screenshots HTML gallery). Categories group markdown pages; pages are
-- team-scoped, slug-addressed, and searchable.

CREATE TABLE IF NOT EXISTS docs_categories (
  id INTEGER PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  team_id INTEGER NOT NULL,
  name VARCHAR(200) NOT NULL,
  slug VARCHAR(200) NOT NULL,
  description TEXT,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS docs_pages (
  id INTEGER PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  team_id INTEGER NOT NULL,
  category_id INTEGER,
  title VARCHAR(300) NOT NULL,
  slug VARCHAR(300) NOT NULL,
  summary VARCHAR(500),
  body TEXT NOT NULL,
  tags TEXT[],
  sort_order INTEGER DEFAULT 0,
  is_published BOOLEAN DEFAULT TRUE,
  created_by INTEGER,
  updated_by INTEGER,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_docs_categories_team ON docs_categories(team_id);
CREATE INDEX IF NOT EXISTS idx_docs_pages_team ON docs_pages(team_id);
CREATE INDEX IF NOT EXISTS idx_docs_pages_category ON docs_pages(category_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_docs_categories_team_slug ON docs_categories(team_id, slug);
CREATE UNIQUE INDEX IF NOT EXISTS uq_docs_pages_team_slug ON docs_pages(team_id, slug);
