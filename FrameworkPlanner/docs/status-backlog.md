# Status Backlog (Prioritized)

This backlog is designed to eliminate “it exists but I can’t find it” issues, reduce regressions, and make the app easier to operate at scale.

## P0 — Reliability / Correctness

1) Dependency security upgrade plan (breaking changes managed)
- **Impact**: reduces known high severity advisories; safer dev server + build chain.
- **Owner**: ops/backend
- **Acceptance**:
  - `npm run security:audit` passes (or policy updated with explicit exceptions)
  - CI stays green (`check`, `build`, `vitest`)

2) Standardize pagination across all large lists
- **Impact**: prevents “records disappear” when datasets grow.
- **Owner**: frontend/backend
- **Acceptance**:
  - Leads, Opportunities, Contacts, Tasks all support `limit`, `offset`, return `{items,total}`
  - UI shows “Showing X of Y” and supports “Load more”

3) Search deep-link reliability (always open the record)
- **Impact**: search becomes trustworthy.
- **Owner**: frontend
- **Acceptance**:
  - `/leads?leadId=ID` / `/opportunities/:id` open even if list data not preloaded
  - add regression tests (Playwright or unit)

4) Pipeline status completeness rule
- **Impact**: items never vanish because config lacks a status.
- **Owner**: frontend
- **Acceptance**:
  - pipeline renders an “Other” or auto-appends missing statuses
  - UI warns when config mismatches data

## P1 — Operations / Observability

5) Client error boundary + standardized fetch error surface
- **Impact**: reduces blank screens; improves debugging.
- **Owner**: frontend
- **Acceptance**:
  - render-time errors show a friendly fallback
  - network errors show consistent toasts/messages
  - Sentry events include route and user context

6) Release runbook + environment validation
- **Impact**: fewer broken deploys due to missing env/migrations.
- **Owner**: ops
- **Acceptance**:
  - single “preflight” endpoint or page confirms env + schema readiness
  - docs: `status-ops-release.md` + `ops-monitoring.md` kept current

## P2 — Speed / UX Multipliers

7) Command palette (“Jump to Lead/Opportunity/Contact”)
- **Impact**: fastest way to find records; reduces friction for power users.
- **Owner**: frontend
- **Acceptance**:
  - Ctrl/Cmd+K opens palette
  - supports: id lookup, address search, owner phone/email
  - uses `/api/search` as backend

8) Pipeline summary counts endpoint
- **Impact**: faster pipeline rendering and quick KPI checks.
- **Owner**: backend
- **Acceptance**:
  - `GET /api/leads/pipeline-summary` returns counts by status
  - UI shows counts per column with minimal latency

9) Background jobs dashboard (campaigns/rvm/tasks)
- **Impact**: visibility into automation.
- **Owner**: backend/frontend
- **Acceptance**:
  - a page that shows last run time, last error, next scheduled run per worker

## P3 — Maintainability

10) Split backend routes by domain
- **Impact**: reduces regression risk; improves ownership and review.
- **Owner**: backend
- **Acceptance**:
  - `server/routes/*` structure (auth, leads, opportunities, telephony, tasks, playground)
  - tests still pass

