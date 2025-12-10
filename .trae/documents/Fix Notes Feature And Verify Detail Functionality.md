## Goals
- Make the “Add Note” on the Opportunity Detail page fully functional using live backend data
- Verify and harden key detail-page features (navigation, data loading, RELAS, owner info, activity log)
- Document manual vs. auto conversion flows and ensure they reflect in the detail page

## Current Context
- Lead notes column exists (`server/shared-schema.ts:21`)
- Lead update endpoint exists (`server/routes.ts:300–318`) and logs `updated_lead`
- Detail route returns `{ property, lead }` (`server/routes.ts:419`) and UI renders them (`client/src/pages/property-detail.tsx`)
- Activity API supports filtering by `propertyId` / `leadId` (`server/routes.ts:1399`)

## Implementation
1. Notes: make Add functional
- Client: in `property-detail.tsx`, control the textarea; on “Add”, PATCH `/api/leads/:leadId` with `notes` (append newline + timestamp to existing notes)
- Server: enhance `PATCH /api/leads/:id` to log a more specific action when only `notes` changes (e.g., `added_note`) with metadata `{ leadId, propertyId }`
- UI: show success/error toast; refresh detail data

2. Activity: surface note adds
- Activity tab already filters; confirm the new `added_note` entries appear
- Lightweight formatting of actions (replace `_` with space)

3. Verification & Tests
- Server test: PATCH notes returns updated lead and creates activity entry
- UI test: simulate add note; assert note text shows and activity item appears
- Manual checks: navigation from `/opportunities` to detail, image fallbacks, property facts, RELAS badge from lead, owner section, next steps rendering

## Manual vs Auto Conversion
- Manual: Set lead status to `under_contract`, click “Add to Properties” (`server/routes.ts:340–378`) → property gains `sourceLeadId`; detail page then shows owner/RELAS/notes via joined lead
- Auto: Cron checks `negotiation`/`under_contract` leads without property and converts them (`server/cron/lead-automation.ts:6–61`); activity logs reflect the conversion

## Risks
- DB connectivity errors in terminal (Neon host resolution) can block activity recording and automation; we’ll handle UI gracefully and note the env action needed

## Deliverables
- Working Add Note with persistence and activity
- Verified detail page functionality end-to-end
- Tests for server + UI