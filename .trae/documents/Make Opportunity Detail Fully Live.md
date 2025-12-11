## Overview
- Wire the Opportunities “View Details” page to live backend data for property facts, owner info, RELAS score, deal status, images, notes, and activity log.
- Use `sourceLeadId` to join opportunity → lead for owner + scoring data.
- Keep the existing design, remove all hardcoded placeholders.

## Current State
- Detail route exists at `/opportunities/:id` and renders `PropertyDetail` (`client/src/App.tsx:81–83`).
- Page currently fetches the opportunity but still shows static placeholders for owner, RELAS, and some facts.
- Manual conversion endpoint: `POST /api/leads/:id/convert-to-property` creates an opportunity and sets `sourceLeadId` (`server/routes.ts:340–376`).
- Auto conversion job scans leads and creates opportunities (`server/cron/lead-automation.ts:1–61`).
- Opportunities data: `GET /api/opportunities/:id` returns property only (`server/routes.ts:419–427`).

## Backend Changes
1. Add composite detail response
- Option A: extend `GET /api/opportunities/:id` to include linked lead by `sourceLeadId`.
- Response shape:
  - `property`: full property record (address, beds, baths, sqft, status, images, etc.)
  - `lead`: `ownerName`, `ownerPhone`, `ownerEmail`, `relasScore`, `motivation`, `notes` (if exists)
  - `activity`: recent global activity for this property/lead (optional now, can add later)
- Implement via `storage.getPropertyById` then `storage.getLeadById(property.sourceLeadId)`.

2. Activity endpoint reuse
- The app already logs actions (`storage.createGlobalActivity` in `server/routes.ts:435–441, 455–461, 475–481`).
- Expose `GET /api/activity?propertyId=` to filter activity for the detail page if not already available.

3. Deal status and next steps
- Use `property.status` to render stage.
- Add a simple `nextSteps` derived list based on status (e.g., negotiation → “Confirm repairs”, “Send offer”). Optional: add a `next_steps` column later.

## Frontend Changes
1. PropertyDetail data wiring
- Fetch composite detail from new/extended endpoint.
- Replace placeholders with real values:
  - Header: address, city/state/zip, status badge
  - Images: use `property.images` with fallback
  - Property facts: beds, baths, sqft, yearBuilt, lotSize, occupancy, apn
  - Owner info: `lead.ownerName`, `lead.ownerPhone`, `lead.ownerEmail`, mailing address if tracked
  - RELAS: `lead.relasScore` badge; factors list remains static until we store them
  - Notes: render `lead.notes`
  - Activity Log: load from `/api/activity?propertyId=<id>` and list entries
- Add loading and error states and guard for missing fields so incomplete records still render.

2. Navigation
- Opportunities grid button already navigates to `/opportunities/:id`.
- After manual convert, navigate to the newly created opportunity’s detail route.

## Manual Process Flow (Live in App)
- Create or update a lead in `/leads` (`client/src/pages/leads.tsx:205–357`).
- Change lead status to `under_contract`.
- Click “Add to Properties” → calls `POST /api/leads/:id/convert-to-property` (`server/routes.ts:340`), creates opportunity with `sourceLeadId` and status `under_contract`.
- Open `/opportunities` and click “View Details” → lands on `/opportunities/:id` with live data.

## Auto Process Flow (Already Implemented)
- Job scans for leads in `negotiation` or `under_contract` without an opportunity (`server/cron/lead-automation.ts:6–22`).
- Creates an opportunity mapped from lead fields and logs activity (`lead-automation.ts:34–61`).
- Runs on a 60s interval per startup logs; ensure DB connectivity to avoid timeouts.

## Data Model Notes
- `properties` includes `images[]`, `beds`, `baths`, `sqft`, `apn`, `yearBuilt`, `lotSize`, `occupancy` (`server/shared-schema.ts:32–54`).
- `leads` includes `owner*`, `relasScore`, `motivation`, `notes` (`server/shared-schema.ts:7–25`).
- We will join these at read-time; no migration needed.

## Implementation Steps
1. Server
- Update `GET /api/opportunities/:id` to return `{ property, lead }`.
- Add optional `GET /api/activity?propertyId=` filter.

2. Client
- Update `PropertyDetail` to consume `{ property, lead }` and render all dynamic sections.
- Wire Activity Log tab to `/api/activity` filtered by property or source lead.
- Improve loading/error UX.

3. Quality & Tests
- Add server tests: detail endpoint returns lead data when `sourceLeadId` is set.
- Add UI tests: navigate to detail and assert dynamic fields display.

## Risks & Mitigations
- DB connectivity issues in logs (PG timeouts). Verify env vars for Postgres and session store (`connect-pg-simple` is imported in `server/app.ts:5`). Add retry/backoff or show user-friendly error.
- Incomplete data: guard all UI reads with fallbacks.

## Deliverables
- Fully live detail page rendering property, owner, and RELAS data.
- Navigation from Opportunities list works.
- Documented manual and auto conversion processes in the code and README.

## Request
- Confirm this plan. Upon approval, I’ll implement the server and client changes, add tests, and verify in the running app.