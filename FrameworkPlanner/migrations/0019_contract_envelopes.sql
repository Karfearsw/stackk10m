CREATE TABLE IF NOT EXISTS contract_envelopes (
  id SERIAL PRIMARY KEY,
  document_id INTEGER NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'draft',
  signer_name VARCHAR(255),
  signer_email VARCHAR(255),
  token_hash VARCHAR(64) NOT NULL,
  expires_at TIMESTAMP,
  sent_at TIMESTAMP,
  viewed_at TIMESTAMP,
  signed_at TIMESTAMP,
  declined_at TIMESTAMP,
  signature_type VARCHAR(20),
  signature_text VARCHAR(255),
  signature_image_base64 TEXT,
  audit_json TEXT NOT NULL DEFAULT '[]',
  signed_pdf_base64 TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_contract_envelopes_token_hash ON contract_envelopes (token_hash);
CREATE INDEX IF NOT EXISTS idx_contract_envelopes_document ON contract_envelopes (document_id, created_at DESC);

