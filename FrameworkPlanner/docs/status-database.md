# Status — Database (Postgres + SQL migrations)

## Migration System

- SQL migrations live in: [FrameworkPlanner/migrations](file:///workspace/FrameworkPlanner/migrations)
- Migration runner: `npm run migrate` executes [apply-migrations.ts](file:///workspace/FrameworkPlanner/server/scripts/apply-migrations.ts)
- Vercel build can auto-apply migrations:
  - controlled by `AUTO_APPLY_MIGRATIONS` and Vercel env detection: [vercel-build.ts](file:///workspace/FrameworkPlanner/server/scripts/vercel-build.ts#L4-L18)

## Schema Readiness Gate (Production Safeguard)

Most `/api/*` requests are blocked with 503 until schema readiness is OK (auth routes bypass the gate):
- Gate logic: [server/app.ts](file:///workspace/FrameworkPlanner/server/app.ts#L113-L127)
- What “ready” means (checked every 30s): [schema-readiness.ts](file:///workspace/FrameworkPlanner/server/schema-readiness.ts#L37-L128)

### Current required objects

Tables that must exist:
- `tasks`
- `pipeline_configs` (created in [0006_pipeline_configs.sql](file:///workspace/FrameworkPlanner/migrations/0006_pipeline_configs.sql))
- `dialer_scripts` (created in [0026_dialer_scripts.sql](file:///workspace/FrameworkPlanner/migrations/0026_dialer_scripts.sql))
- `call_media`

Columns that must exist:
- `leads.do_not_call`
- `leads.do_not_email`
- `properties.lead_source`
- `properties.lead_source_detail`

Impact:
- If any of the above is missing, the API returns 503 with a `howToFix` payload instructing to run migrations.

## Notable Performance Indexes (Confirmed)

- Leads created_at index: [0025_perf_indexes.sql](file:///workspace/FrameworkPlanner/migrations/0025_perf_indexes.sql#L1)
- Tasks created_by index: [0025_perf_indexes.sql](file:///workspace/FrameworkPlanner/migrations/0025_perf_indexes.sql#L2)
- Playground session user scoping + recents index: [0030_playground_sessions_user_scope.sql](file:///workspace/FrameworkPlanner/migrations/0030_playground_sessions_user_scope.sql)

## Known Risk Areas / Next DB Improvements

1) **Consistency between list endpoints and indexes**
- Any endpoint that supports `limit/offset` should have indexes aligned with its `ORDER BY` and filter fields (leads/opportunities/tasks).

2) **Search scalability**
- Search index migrations exist (e.g. [0002_search_indexes.sql](file:///workspace/FrameworkPlanner/migrations/0002_search_indexes.sql)); verify query plans under realistic data sizes.

3) **Migration hygiene**
- Keep schema readiness requirements in sync with migrations:
  - when adding a new “required” column/table, include it in both SQL migrations and readiness checks.

