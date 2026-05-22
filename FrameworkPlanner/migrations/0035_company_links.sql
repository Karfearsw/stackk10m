CREATE TABLE IF NOT EXISTS company_links (
  id INTEGER PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  team_id INTEGER NOT NULL,
  company_id INTEGER NOT NULL,
  entity_type VARCHAR(50) NOT NULL,
  entity_id INTEGER NOT NULL,
  role VARCHAR(50),
  created_at TIMESTAMP DEFAULT NOW(),
  CONSTRAINT company_links_team_fk FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE CASCADE,
  CONSTRAINT company_links_company_fk FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS company_links_team_id_idx ON company_links(team_id);
CREATE INDEX IF NOT EXISTS company_links_company_id_idx ON company_links(company_id);
CREATE INDEX IF NOT EXISTS company_links_entity_idx ON company_links(entity_type, entity_id);
CREATE UNIQUE INDEX IF NOT EXISTS company_links_unique_idx ON company_links(company_id, entity_type, entity_id, COALESCE(role, ''));

