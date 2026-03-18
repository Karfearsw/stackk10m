# Ops Monitoring and Failure Mitigations

## Error Sources
- ESM import resolution errors in Node serverless.
- Database pool saturation or connectivity issues.
- Session store write failures.
- Resource constraints (timeouts, memory) on serverless.
- Misconfigured environment variables.

## Mitigations
- Enforce `.js` imports across server.
- Configure `pg.Pool` with conservative limits and timeouts.
- Optional Neon serverless driver for improved pooling.
- Paginate list endpoints to cap payload sizes.
- Structured logs with request IDs and Sentry integration.
- Health and metrics endpoints for quick diagnostics.

## Monitoring
- Sentry alerts: error rate >1% (5 minutes), p95 latency >1000ms on auth routes.
- Metrics: request/5xx counters via `/api/metrics`.
- Vercel Monitoring and log drains for centralized observability.

## Database Schema Readiness
- The API may return `503` with `message: "Database schema is not ready"` and a `missing` list when required tables/columns are not present.
- Fix by applying migrations:
  - FrameworkPlanner SQL migrations: `node FrameworkPlanner/server/scripts/apply-migrations.ts`
  - Drizzle schema push: `npm --prefix FrameworkPlanner run db:push`
- If the API returns `503` with `message: "DATABASE_URL is not set"` or `message: "Database is unavailable"`, verify the `DATABASE_URL` environment variable and network access to Postgres.

## Regression Testing
- Auth, health, and list endpoint tests with storage mocks.

## Security
- Use Vercel env vars for secrets; avoid committing `.env`.
