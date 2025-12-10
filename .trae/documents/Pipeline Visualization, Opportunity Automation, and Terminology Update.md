## Overview
- Add a responsive pipeline visualization below the motivational banner.
- Automate moving Leads to Opportunities when they reach Negotiation/Contract.
- Rename Properties → Opportunities across UI, API, and schema with safe migration, maintain backward compatibility.
- Enable stage progression for opportunities with visual cues.
- Deliver tests, release notes, and training materials.

## Current Code Insights
- Banner: `client/src/components/dashboard/MotivationalBanner.tsx` used on `client/src/pages/dashboard.tsx`.
- Properties page & nav: `client/src/pages/properties.tsx`, `client/src/components/layout/Sidebar.tsx` ("Properties").
- API: many `/api/properties` endpoints in `server/routes.ts` backed by `properties` table in `shared/schema.ts`.
- Status fields exist on `leads` and `properties`, suitable for pipeline stages.

## Implementation Plan
### 1) Pipeline Visualization (UI)
- Create `client/src/components/dashboard/PipelineBar.tsx` that:
  - Displays stages: Lead → Negotiation → Contract → Closed.
  - Shows counts via React Query from `/api/leads?status=...` and `/api/properties?status=...` (or new endpoints).
  - Responsive: horizontal bar on desktop, stack or scrollable chips on mobile.
  - Subtle shadcn/ui styling to match existing cards and muted foreground.
- Integrate below `MotivationalBanner` in `dashboard.tsx`.
- Real-time updates: use React Query `refetchInterval: 1000` (1s) initially; optionally upgrade later to websockets.

### 2) Lead→Opportunity Automation (Server)
- Add background worker (interval-based in server process) or event-driven trigger:
  - Scan `leads` for `status IN ('Negotiation','Contract')` not yet linked to an opportunity.
  - Create Opportunity record preserving lead data (address, price, notes, etc.) and linking `source_lead_id`.
  - Maintain referential integrity (FKs) and copy related relations (if any) without loss.
- Add audit log entries to `globalActivityLogs` when transfers occur.
- Provide a manual API endpoint to trigger transfer for a given lead to support testing.

### 3) Terminology Updates (UI, API, Schema)
- UI: rename nav and page titles from "Properties" to "Opportunities"; update routes `/opportunities`.
- API: deprecate `/api/properties` while adding `/api/opportunities` endpoints mirroring the old ones.
  - Keep `/api/properties` working by proxying to the new services for backward compatibility.
- Schema: introduce `opportunities` table (initially view or table), supply Drizzle migration:
  - Option A (safe): keep `properties` table, add `opportunities` view alias; update code to use opportunities while legacy persists.
  - Option B (full rename): migration to rename table to `opportunities` and update FK names; provide compatibility views named `properties` to avoid breaking integrations.
- Documentation: note deprecation timeline and dual endpoint support.

### 4) Pipeline Movement (Opportunity Stages)
- Add endpoints to update opportunity stage/status.
- Update UI components to show clickable stage transitions (with visual chips and animations).
- Reuse existing workflow logic from properties; adapt references to opportunities.

### 5) Testing & Quality
- Unit tests: React components (PipelineBar), server transfer logic, endpoints.
- Integration tests: signup/me (already added baseline), leads→opportunity transfer, stage transitions.
- Regression: run existing test suite and add smoke tests for legacy `/api/properties` endpoints.

### 6) Migrations & Release Notes
- Drizzle migration file for schema changes (rename or view creation, new indexes on `status`).
- Release notes describing terminology change, pipeline feature, and automation.
- Short user training doc: explains Opportunities, pipeline stages, and how movement works.

## Incremental Delivery
1. Add PipelineBar to dashboard with read-only counts.
2. Add new `/api/opportunities` endpoints (read-only) and proxy `/api/properties`.
3. Implement automation worker and manual transfer endpoint.
4. UI rename and nav updates with dual routing (`/properties` → `/opportunities`).
5. Stage movement controls and visual indicators.
6. Migrations, tests, release notes, training materials.

## Backward Compatibility & Performance
- Maintain old endpoints via proxies; no immediate breakage.
- Index `status` columns to keep 1s update cadence within performance budgets.
- Use capped refetch interval and batched queries.

## Confirmation
- On approval, I will implement the components, endpoints, migrations, tests, and documentation in small PR-sized steps, verify locally, and push for deployment.