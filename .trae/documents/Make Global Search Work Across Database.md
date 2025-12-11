## Current State
- Top search lives in `FrameworkPlanner/client/src/components/layout/Header.tsx` and calls `GET /api/search?q=...`.
- Backend handler in `FrameworkPlanner/server/routes.ts` loads up to 200 `leads`, `properties/opportunities`, and `contacts`, then filters in memory.
- This misses matches outside the first page and is inefficient on large datasets.

## Goals
- Search across the whole database for `leads`, `properties/opportunities`, and `contacts`.
- Fast queries with relevant results and consistent navigation paths.
- Minimal API changes so the existing UI continues to work.

## Backend Changes
- Replace in‑memory filtering with DB queries using `ILIKE` across key fields:
  - Leads: `address`, `city`, `state`, `zip`, `ownerName`, `ownerPhone`, `ownerEmail`.
  - Properties/Opportunities: `address`, `city`, `state`, `zip`, `apn`.
  - Contacts: `name`, `email`, `phone`.
- Implement a unified search that returns a normalized item shape: `type`, `id`, `title`, `subtitle`, `path`, `rank`.
- Use a `UNION ALL` across the three queries, with `limit` and `offset` parameters (default `limit=20`).
- Add simple ranking: prioritize exact prefix matches, then `ILIKE` contains, then secondary fields. Optionally add Postgres full‑text search later (`to_tsvector` + `websearch_to_tsquery`) for better ranking.
- Add indexes to keep queries fast:
  - Short‑term: B‑tree indexes on commonly searched columns.
  - Optional: `pg_trgm` GIN indexes for `ILIKE` performance on `address`, `ownerName`, `name`, `email`, `phone`, `apn`.
- Keep endpoint contract: `GET /api/search?q&limit&offset` → `{ q, results, counts: { leads, properties, contacts, total } }`.

## Frontend Changes
- Keep `Header.tsx` UI and dropdown; add a 250ms debounce and ensure it queries when `q.length >= 2`.
- Display type badges and subtitles consistently; show a "View all results" row that navigates to a dedicated page with full pagination when present.
- Preserve keyboard navigation and selection; clear input on selection and close dropdown.

## Optional Enhancements
- Add a dedicated `Search` page with tabs for `Leads`, `Opportunities`, `Contacts`, supporting pagination and filters.
- Highlight matched terms in results.
- Expand search to additional entities (buyers, offers, assignments) in a second pass using the same pattern.

## Testing & Verification
- Add backend integration tests for `/api/search` covering each entity and multiple fields.
- Seed representative data locally and verify query performance and correctness.
- Manual verification in dev: type queries for address, owner names, APN, emails, phones; confirm navigation works.

## Rollout
- Apply indexes in a migration; verify with `EXPLAIN ANALYZE` on sample queries.
- Keep current in‑memory fallback behind a flag temporarily; remove after verification.
- Add basic telemetry (log query time and returned counts) for the endpoint to monitor performance.