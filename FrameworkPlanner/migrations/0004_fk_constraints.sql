-- Enforce relational integrity and de-duplication

-- One property per lead; enforce FK and uniqueness
ALTER TABLE properties
  ADD CONSTRAINT fk_properties_source_lead
    FOREIGN KEY (source_lead_id) REFERENCES leads(id)
    ON DELETE SET NULL;

ALTER TABLE properties
  ADD CONSTRAINT uq_properties_source_lead UNIQUE (source_lead_id);

-- Offers link to properties and users
ALTER TABLE offers
  ADD CONSTRAINT fk_offers_property FOREIGN KEY (property_id) REFERENCES properties(id) ON DELETE CASCADE;
ALTER TABLE offers
  ADD CONSTRAINT fk_offers_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL;

-- Deal assignments link to properties, buyers, and optionally contracts
ALTER TABLE deal_assignments
  ADD CONSTRAINT fk_assignments_property FOREIGN KEY (property_id) REFERENCES properties(id) ON DELETE CASCADE;
ALTER TABLE deal_assignments
  ADD CONSTRAINT fk_assignments_buyer FOREIGN KEY (buyer_id) REFERENCES buyers(id) ON DELETE SET NULL;
ALTER TABLE deal_assignments
  ADD CONSTRAINT fk_assignments_contract FOREIGN KEY (contract_id) REFERENCES contracts(id) ON DELETE SET NULL;

-- Contracts link to properties and buyers
ALTER TABLE contracts
  ADD CONSTRAINT fk_contracts_property FOREIGN KEY (property_id) REFERENCES properties(id) ON DELETE CASCADE;
ALTER TABLE contracts
  ADD CONSTRAINT fk_contracts_buyer FOREIGN KEY (buyer_id) REFERENCES buyers(id) ON DELETE SET NULL;

-- Contract documents link to templates and properties
ALTER TABLE contract_documents
  ADD CONSTRAINT fk_documents_template FOREIGN KEY (template_id) REFERENCES contract_templates(id) ON DELETE SET NULL;
ALTER TABLE contract_documents
  ADD CONSTRAINT fk_documents_property FOREIGN KEY (property_id) REFERENCES properties(id) ON DELETE CASCADE;
