## Current Findings
- Project uses ESM (`type: "module"`) and serverless on Vercel; missing `.js` extensions on local imports causes `ERR_MODULE_NOT_FOUND`.
- Server imports now use `.js` in `server/routes.ts`, `server/storage.ts`, `server/app.ts`, `server/index-vercel.ts`. Dev-only files still use extensionless imports (`server/index-dev.ts:10`, `server/index-prod.ts:8`).
- `vercel.json` routes API to `server/index-vercel.ts` and SPA fallback to `/index.html`.
- DB configured via `DATABASE_URL` (Neon). Sessions use `connect-pg-simple` backed by Postgres (`server/app.ts:59-76`).
- Health endpoint exists and performs a DB query (`server/routes.ts:32-41`).

## Root Causes
- ESM module resolution in Vercel requires explicit file extensions; previously missing, leading to `500` via `ERR_MODULE_NOT_FOUND`.
- Potential serverless DB issues: excessive `pg.Pool` connections across cold starts, misconfigured SSL, transient Neon limits.
- Session store writes on each request can amplify DB pressure and cause `500` when the pool errors.
- Unbounded list endpoints may increase memory/CPU and trigger timeouts under serverless constraints.

## Fixes To Implement
- Standardize ESM imports across server:
  - Add `.js` extensions in `server/index-dev.ts` and `server/index-prod.ts` for consistency.
- Harden DB pool for serverless:
  - Configure `pg.Pool` with `max: 1-3`, `idleTimeoutMillis: 10000`, `connectionTimeoutMillis: 5000` in `server/db.ts`.
  - Optionally migrate to Neon serverless driver (`@neondatabase/serverless`) + Drizzle’s Neon adapter for optimal serverless behavior.
- Add robust retries for transient DB errors and backoff on critical operations (auth, write endpoints).
- Guard heavy endpoints:
  - Add pagination/limits on list endpoints (`/api/leads`, `/api/properties`, etc.).
- Strengthen session settings:
  - Ensure cookie domain, `secure`, `sameSite` set appropriately for Vercel domains (`server/app.ts:59-76`) and log session write failures.

## Monitoring & Alerts
- Instrument structured logging:
  - Add a request ID per request; include method, path, status, duration (already partly in `server/app.ts:85-110`).
  - Log DB errors via pool events (`server/db.ts:17-20`).
- Integrate Sentry for server and client:
  - `@sentry/node` in Express with DSN via env; capture uncaught exceptions in error handler (`server/app.ts:120-128`).
  - `@sentry/react` on client for UI errors.
- Vercel Monitoring & Log Drains:
  - Enable Vercel Monitoring, set log drains to BetterStack/Logtail, and create alerts for error rate and latency.
- Metrics endpoint:
  - Expose `/api/metrics` via `prom-client` (process memory, heap, event loop lag, request counts) for internal checks.

## Alert Thresholds
- Error rate: >1% 5xx over 5 minutes.
- Latency: p95 > 1000ms for `/api/auth/*` over 5 minutes.
- DB errors: >5 connection/query errors per minute.
- Pool saturation: waits > 2000ms, concurrent pool clients > 3.

## Failure Scenarios & Mitigations
- Module resolution/ESM:
  - Mitigation: enforce `.js` imports, add CI lint to check import extensions.
- DB connectivity failures:
  - Mitigation: configure SSL, pool limits, retries with backoff; optional Neon serverless driver.
- Session store failures:
  - Mitigation: ensure table auto-create enabled, log failures, fallback to memory in emergency (non-prod).
- Resource/timeouts:
  - Mitigation: paginate queries, cache common reads, avoid heavy synchronous work in request path.
- Misconfigured env:
  - Mitigation: require `DATABASE_URL`, `SESSION_SECRET`, `EMPLOYEE_ACCESS_CODE` in production; fail-fast with clear logs.

## Regression Testing
- Expand `tests/auth.test.ts` to cover:
  - Signup success and failure paths (invalid employee code, duplicate email).
  - Login with valid/invalid credentials; session persistence.
- Add tests for health and heavy list endpoints with pagination.
- Add mocked DB error tests to ensure 500s are handled with clear messages and Sentry capture.

## Deployment Validation
- Verify Vercel build and routes:
  - Confirm `/api/health` returns `200` and logs duration.
  - Confirm `/api/auth/signup` no longer throws module errors.
  - Confirm SPA routes `/login`, `/signup` resolve via rewrite to `/index.html`.

## Security Hardening
- Remove secrets from repo; rely on Vercel project env vars.
- Audit production logs for PII; sanitize error messages before returning to clients.

## Implementation Steps
1. Update remaining ESM imports in dev/prod server files; add CI lint to enforce extensions.
2. Configure `pg.Pool` limits; optionally adopt Neon serverless driver.
3. Add Sentry integration for server/client; set DSN via env and define alert rules.
4. Add structured logger with request ID; expand error logs.
5. Add `/api/metrics` with `prom-client` and basic counters/gauges.
6. Add pagination on list endpoints; add unit tests for auth and health.
7. Validate in Vercel: check health, auth endpoints, error rates, latency, DB stability.

If you approve, I will implement these changes, wire up monitoring and alerts, and run regression tests to confirm 500s are fully resolved.