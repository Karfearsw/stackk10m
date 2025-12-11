## Current Links
- Leads → Opportunities: properties have `sourceLeadId` referencing `leads.id` (`server/shared-schema.ts`, used by `/api/leads/:id/convert-to-property` in `server/routes.ts:314–378`).
- Deals (assignments) link to opportunities: `deal_assignments.propertyId`, `deal_assignments.buyerId`, optional `contractId` (`server/shared-schema.ts`).
- Offers link to opportunities: `offers.propertyId`, `offers.userId`.
- Contracts link to opportunities/buyers: `contracts.propertyId`, `contracts.buyerId`.
- Documents link to templates/properties: `contract_documents.templateId`, `contract_documents.propertyId`.
- Global search now returns unified results across leads/opportunities/contacts.

## Gaps & Duplications
- `properties.sourceLeadId` is an integer without a DB foreign key/unique constraint (only an index exists); duplicates are prevented in the API by checking for an existing property but not enforced at DB level.
- Notes/images and other uploads can live on either lead or property, causing potential duplication when leads convert to properties.
- No explicit cascade/consistency rules between lead/property when updating overlapping fields.

## Plan: Consistency & No-Duplicate Data
1. Add DB constraints
- Create a foreign key `properties.source_lead_id → leads.id` (ON DELETE SET NULL) and a unique constraint on `properties.source_lead_id` to enforce one property per lead.
- Optional: add foreign keys for `deal_assignments.property_id → properties.id`, `offers.property_id → properties.id`, `contracts.property_id → properties.id` and buyers FKs.

2. Single source of truth
- Treat the property (opportunity) as the canonical record post-conversion; prevent editing duplicate fields on the lead once converted.
- UI: when a property exists for a lead, disable duplicate fields on lead or display a banner with an "Edit opportunity" CTA.

3. Unified notes/uploads
- Store operational notes on the property after conversion; surface lead notes read-only or merge on conversion.
- Store images/documents on the property only; during conversion, migrate lead attachments to property and remove duplicates from lead.
- Ensure `/api/opportunities/:id` returns `{ property, lead }` and `/api/properties/:id` mirrors that, so UIs can read without re-querying.

4. Write-path safeguards
- In `POST /api/leads/:id/convert-to-property`: retain the 409 check and rely on the DB unique constraint to guarantee no duplicates.
- In property/lead `PATCH` endpoints: if a property exists for a lead, route overlapping fields (address/city/state/zip, owner contact) to update the property to avoid divergence.

5. Migrations & Backfill
- Migration to add the FKs/unique constraints and backfill existing rows (set `source_lead_id` where missing, handle orphaned references).
- Script to migrate lead-level notes/images to property on conversion and deduplicate.

6. Validation & Telemetry
- Add simple integration tests to verify link integrity (FK constraints) and that update flows don’t duplicate records.
- Log conversions and note/image migrations with counts to monitor duplication.

## Result
- One opportunity per lead enforced at DB level.
- Notes/uploads centralized on the opportunity, preventing duplicates.
- Downstream deal entities (offers, assignments, contracts, documents) consistently link to the opportunity, keeping the data model clean.

Confirm to proceed; I will add the constraints/migrations, route adjustments, and small client UX guardrails to eliminate duplicate inputs and uploads.