# Dedicated Testing Platform (Production-Parity)

## Goals
- Validate production behavior without touching the live domain.
- Keep infrastructure, dependencies, and runtime configuration as close to production as possible.
- Provide automated functional, regression, performance, and security testing with clear reporting and rollback.

## Production-Parity Model
- Runtime: Node.js 20 (matches `engines.node`).
- Build artifact: `npm run build` produces `dist/` (client) and `dist-server/index.js` (server).
- Hosting: Vercel deployment model (static assets + serverless API wrapper in `api/index.ts`).
- Database: Postgres (Neon recommended).
- Sessions: `express-session` with Postgres-backed session store (`connect-pg-simple`) in production mode.

## Environment Isolation
- Domain: use a dedicated subdomain such as `staging.<your-domain>` or a Vercel preview URL.
- Database: use a dedicated Neon project/branch for staging (do not reuse production `DATABASE_URL`).
- Secrets: configure staging env vars in the hosting provider (do not commit).
- External providers: use staging keys/accounts where possible (SignalWire, Sentry).

## Staging Deployment (Vercel)
This repository is designed for Vercel deployments. Create a separate Vercel project for staging that points to the same repository and same build settings as production.

1. Create a new Vercel Project (staging) from the same repo.
2. Copy production build settings:
   - Root Directory: `FrameworkPlanner`
   - Build Command: `npm run build`
   - Output Directory: `dist`
3. Set staging environment variables (use staging equivalents, not production):
   - `DATABASE_URL`
   - `SESSION_SECRET`
   - `EMPLOYEE_ACCESS_CODE`
   - `ADMIN_USERNAME`, `ADMIN_PASSWORD`
   - `SENTRY_DSN` (staging DSN)
   - `SIGNALWIRE_SPACE_URL`, `SIGNALWIRE_PROJECT_ID`, `SIGNALWIRE_API_TOKEN` (staging)
4. Map a dedicated domain to the staging project (optional).

## Staging Admin Bootstrap
The admin bootstrap script supports environment-driven credentials so staging can be seeded without hardcoding secrets.

- Script: [bootstrap-admin.ts](file:///c:/Users/asapb/OneDrive/Desktop/Stackk10M/stackk10m/FrameworkPlanner/server/bootstrap-admin.ts)
- Required env vars:
  - `BOOTSTRAP_ADMIN_EMAIL` (or `ADMIN_USERNAME`)
  - `BOOTSTRAP_ADMIN_PASSWORD` (or `ADMIN_PASSWORD`)

Run once against the staging database:
```bash
npm --prefix FrameworkPlanner run db:push
node --env-file .env --no-warnings FrameworkPlanner/dist-server/index.js
```

If you run the script directly in a Node environment with DB connectivity:
```bash
BOOTSTRAP_ADMIN_EMAIL="admin@staging.example"
BOOTSTRAP_ADMIN_PASSWORD="strong-password"
node --loader tsx FrameworkPlanner/server/bootstrap-admin.ts
```

## Automated Test Suites

### Functional + Regression (Unit/Integration)
- Runner: Vitest.
- Location: `FrameworkPlanner/tests`.
- CI job: runs on every push/PR via `.github/workflows/ci.yml`.

Run locally:
```bash
npm --prefix FrameworkPlanner ci
npm --prefix FrameworkPlanner run test:unit
```

### Smoke (Production-like validation)
- Runner: Vitest (HTTP-based).
- Location: `FrameworkPlanner/server/tests`.
- Executes against a deployed environment via `TEST_BASE_URL`.

Run against staging:
```bash
set TEST_BASE_URL=https://staging.example.com
npm --prefix FrameworkPlanner run test:smoke
```

### Performance (Traffic simulation)
- Runner: k6.
- Script: `FrameworkPlanner/perf/k6-smoke.js`
- Default: 10 virtual users for 2 minutes (override with `K6_VUS`, `K6_DURATION`).

Run:
```bash
set BASE_URL=https://staging.example.com
k6 run FrameworkPlanner/perf/k6-smoke.js
```

### Security
- Dependency scanning: `npm audit` (`npm run security:audit`).
- DAST: OWASP ZAP baseline scan against staging.

## CI: Dedicated Testing Platform Workflow
Workflow: [testing-platform.yml](file:///c:/Users/asapb/OneDrive/Desktop/Stackk10M/stackk10m/.github/workflows/testing-platform.yml)

Supports:
- Manual runs (set `base_url`) and nightly schedule.
- Unit tests + typecheck/build.
- Smoke tests against staging (`TEST_BASE_URL`).
- Performance test (k6) against staging.
- Security checks (npm audit + ZAP baseline) against staging.

Required secret for scheduled execution:
- `STAGING_BASE_URL`

## Expected Results / Pass Criteria
- Unit/regression: `npm run test:unit` passes with zero failures.
- Smoke: `/api/health` returns 200 and key workflows respond with expected status codes.
- Performance:
  - `http_req_failed` < 1%
  - `p95` latency < 1200ms on tested endpoints
- Security:
  - `npm audit` has no high/critical issues (or issues are triaged/accepted explicitly).
  - ZAP baseline produces no high-confidence critical findings.

## Reporting
- CI logs show each suite’s output.
- Security: ZAP produces a report in the workflow job output.
- Performance: k6 prints latency and error-rate summaries per run.

## Rollback
- Application rollback: use the hosting provider’s redeploy/rollback to a previous successful deployment.
- Database rollback:
  - Prefer staging DB isolation so destructive tests never touch production.
  - Use Neon branch restore / point-in-time recovery where available.
- Secrets rollback: revert staging env vars to the last known good values.

