-- 0092: Onboarding document workflow (Offer Letter, ICA, W-9).
--
-- Tracks the lifecycle of the three onboarding documents per agent:
--   - Offer Letter: company sends → agent signs
--   - ICA: company sends → agent signs
--   - W-9: agent fills out + signs → company receives
--
-- When a document reaches signed/completed, the corresponding
-- onboarding_checklist item (offer_letter_signed, ica_signed, w9_submitted)
-- is updated automatically by the application layer.
--
-- Document bodies for Offer Letter and ICA are rendered from
-- contract_templates rows (seeded by 0092 seed step below) using
-- {{placeholder}} merge. W-9 data is captured as structured form fields.
--
-- Additive and idempotent.

-- Document lifecycle per agent.
CREATE TABLE IF NOT EXISTS onboarding_documents (
  id integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  user_id integer NOT NULL,                       -- users.id (the agent)
  doc_type varchar(30) NOT NULL,                 -- offer_letter | ica | w9
  status varchar(30) NOT NULL DEFAULT 'pending', -- pending | sent | viewed | signed | completed
  template_id integer,                            -- contract_templates.id (offer_letter, ica)
  template_version integer DEFAULT 1,
  merge_data jsonb NOT NULL DEFAULT '{}',         -- rendered placeholders
  form_data jsonb NOT NULL DEFAULT '{}',           -- W-9 filled fields (agent-entered)
  rendered_body text,                             -- final merged document text
  signature_type varchar(20),                     -- typed | drawn | uploaded
  signature_data text,                            -- typed name or image data URI / storage key
  signed_at timestamptz,
  signer_ip varchar(64),
  signer_user_agent text,
  document_url varchar(1024),                     -- stored PDF / rendered copy
  sent_by integer,                                -- users.id (manager who sent)
  sent_at timestamptz,
  viewed_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT onboarding_documents_type_check CHECK (doc_type IN ('offer_letter', 'ica', 'w9')),
  CONSTRAINT onboarding_documents_status_check CHECK (status IN ('pending', 'sent', 'viewed', 'signed', 'completed'))
);

CREATE INDEX IF NOT EXISTS onboarding_documents_user_idx ON onboarding_documents (user_id);
CREATE INDEX IF NOT EXISTS onboarding_documents_type_status_idx ON onboarding_documents (doc_type, status);
-- One active (non-completed) document per user per type; history preserved via completed rows.
CREATE UNIQUE INDEX IF NOT EXISTS onboarding_documents_active_unique
  ON onboarding_documents (user_id, doc_type) WHERE status != 'completed';

-- Audit trail for every document event.
CREATE TABLE IF NOT EXISTS onboarding_document_events (
  id integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  document_id integer NOT NULL REFERENCES onboarding_documents(id) ON DELETE CASCADE,
  event_type varchar(40) NOT NULL,   -- created | sent | viewed | signed | completed | voided
  performed_by integer,              -- users.id (null for agent self-actions captured via document user)
  metadata jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS onboarding_document_events_doc_idx ON onboarding_document_events (document_id);

-- Seed the Offer Letter + ICA templates into contract_templates (idempotent).
-- Content uses {{placeholders}} merged at send time.
INSERT INTO contract_templates (name, description, category, content, merge_fields, is_active, status, version, source_format)
SELECT
  'OceanLuxe Agent Offer Letter',
  'Offer letter for acquisitions agents — commission-only, 70/30 split, $50/mo platform fee. Attorney review required before production use.',
  'onboarding',
  $$OCEAN LUXE — OFFER OF ENGAGEMENT (ACQUISITIONS AGENT)

Date: {{offer_date}}

{{agent_full_name}}
{{agent_email}}
{{agent_phone}}

Dear {{agent_first_name}},

OceanLuxe ("the Company") is pleased to offer you engagement as an Acquisitions Agent, effective {{start_date}}, subject to the terms below and to your execution of the Independent Contractor Agreement (ICA).

POSITION & DUTIES
- Role: Acquisitions Agent (independent contractor, not an employee).
- Duties: prospecting, lead follow-up, property evaluation, offer preparation, and related wholesaling activities as assigned by your team lead.

COMPENSATION (commission-only)
- Commission split: {{commission_split_agent}}% to Agent / {{commission_split_company}}% to Company on each closed assignment, unless otherwise agreed in writing.
- Platform fee: {{platform_fee}}/month, deducted as described in the ICA.
- No base salary, draw, or guaranteed pay. You are paid only when a deal closes and funds.

TERM & TERMINATION
- This engagement is at-will and may be terminated by either party at any time, with or without cause, subject to the ICA.
- Commission on deals already under contract at termination is governed by the ICA.

CONDITIONS
- Execution of the ICA, submission of a completed IRS Form W-9, identity verification, and completion of onboarding training are required before live-lead access is granted.

Please sign below to accept this offer.

AGREED AND ACCEPTED:

Agent signature: ___________________________   Date: __________
{{agent_full_name}}

For OceanLuxe:
{{sender_name}}, {{sender_title}}                    Date: __________

---
This offer letter is a summary only. The ICA controls in case of conflict. This template requires attorney review before production use.
$$,
  ARRAY['offer_date','agent_full_name','agent_first_name','agent_email','agent_phone','start_date','commission_split_agent','commission_split_company','platform_fee','sender_name','sender_title'],
  TRUE, 'draft', 1, 'text'
WHERE NOT EXISTS (SELECT 1 FROM contract_templates WHERE name = 'OceanLuxe Agent Offer Letter');

INSERT INTO contract_templates (name, description, category, content, merge_fields, is_active, status, version, source_format)
SELECT
  'OceanLuxe Independent Contractor Agreement (Agent)',
  'ICA for acquisitions agents — 70/30 split, $50/mo platform fee, commission-only. Attorney review required before production use.',
  'onboarding',
  $$INDEPENDENT CONTRACTOR AGREEMENT

This Independent Contractor Agreement ("Agreement") is entered into as of {{effective_date}} ("Effective Date"), by and between:

OceanLuxe ("Company"), and
{{contractor_full_name}} ("Contractor"), {{contractor_email}}, {{contractor_phone}}.

1. ENGAGEMENT. Company engages Contractor as an independent contractor to perform acquisitions-agent services, including prospecting, lead follow-up, property evaluation, and offer preparation.

2. INDEPENDENT CONTRACTOR STATUS. Contractor is an independent contractor, not an employee, partner, or agent of Company. Contractor is responsible for all taxes, insurance, and compliance obligations.

3. COMPENSATION.
   (a) Commission split: {{commission_split_agent}}% to Contractor / {{commission_split_company}}% to Company of each closed assignment fee.
   (b) Platform fee: {{platform_fee}}/month.
   (c) No base salary or guaranteed pay. Payment only upon closed, funded deals.

4. TERM & TERMINATION. At-will; either party may terminate at any time. Post-termination commissions governed by Section 5.

5. PIPELINE COMMISSIONS. Deals under executed contract at termination pay per the split if they close within {{tail_days}} days of termination.

6. CONFIDENTIALITY & NON-CIRCUMVENTION. Contractor shall not disclose Company confidential information or circumvent Company on Company-sourced deals for {{noncircumvent_months}} months.

7. COMPLIANCE. Contractor shall comply with all applicable laws, including telemarketing, texting, and DNC rules, and Company policies.

8. GOVERNING LAW. {{governing_law}}.

IN WITNESS WHEREOF, the parties execute this Agreement:

Contractor: ___________________________   Date: __________
{{contractor_full_name}}

For OceanLuxe:
{{sender_name}}, {{sender_title}}                    Date: __________

---
This template requires attorney review before production use. It is not legal advice.
$$,
  ARRAY['effective_date','contractor_full_name','contractor_email','contractor_phone','commission_split_agent','commission_split_company','platform_fee','tail_days','noncircumvent_months','governing_law','sender_name','sender_title'],
  TRUE, 'draft', 1, 'text'
WHERE NOT EXISTS (SELECT 1 FROM contract_templates WHERE name = 'OceanLuxe Independent Contractor Agreement (Agent)');
