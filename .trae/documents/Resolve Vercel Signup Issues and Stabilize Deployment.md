## Objectives
- Fix production signup failures and SPA routing 404s while keeping Neon DB as the backend.
- Ensure deployments are reliable, monitored, and reversible.

## Architecture References
- Signup route rendering: `FrameworkPlanner/client/src/App.tsx:60-62`
- Login link to signup: `FrameworkPlanner/client/src/pages/login.tsx:88-90`
- Server env guards: `FrameworkPlanner/server/app.ts:35-49`
- Server listen: `FrameworkPlanner/server/app.ts:127-134`
- Vercel configuration: `FrameworkPlanner/vercel.json:1-20`

## Root-Cause Analysis
- SPA 404 at `/signup`: Missing SPA fallback rewrite caused Vercel to look for a file. The rewrite must route all non-API paths to `dist/public/index.html`.
- 500 on `POST /api/auth/signup`: Production env values incorrect:
  - `NODE_ENV` misspelled (`PRODUCTON` instead of `production`).
  - `DATABASE_URL` included `channel_binding=require`, which can break Node Postgres connections on Vercel; use `sslmode=require` only.
  - Missing `EMPLOYEE_ACCESS_CODE` or `SESSION_SECRET` triggers startup throws.
- Client navigation used a raw `<a href>` initially, which forced a full document request; now replaced with Wouter `Link` to keep navigation client-side.
- Dashboard build settings ignored due to `builds` in `vercel.json` (expected).

## Prioritization
- P0: Fix production env values and DB connectivity to resolve signup 500.
- P0: Confirm SPA rewrites so `/signup` and other client routes load.
- P1: Verify Node runtime consistency, session cookies, and API health.
- P2: Add monitoring, error normalization, docs, and tests.

## Technical Solutions
- Env corrections (Vercel → Project → Settings → Environment Variables, Production scope):
  - `NODE_ENV=production`
  - `EMPLOYEE_ACCESS_CODE=3911`
  - `SESSION_SECRET=<strong-random-string>`
  - `DATABASE_URL=postgresql://.../neondb?sslmode=require`
- Vercel rewrites:
  - `source: "/api/(.*)"` → `destination: "/server/index-prod.ts"`
  - `source: "/(.*)"` → `destination: "/dist/public/index.html"`
- Runtime: Ensure Node 20 for functions via `engines.node` in `package.json` or function runtime in `vercel.json`.
- Error handling: Standardize JSON errors for auth endpoints; never leak stack traces.
- Health checks: Add `/api/health` to verify DB and session store connectivity.
- Monitoring: Use Vercel function logs + Neon dashboard; add alerts.
- Tests: Unit (Vitest), integration (supertest), and E2E (Playwright) for signup/login.

## Implementation Steps
1. Update Vercel env vars to the corrected values and remove `channel_binding=require`.
2. Confirm `vercel.json` uses `rewrites` for SPA fallback and API routing.
3. Redeploy; verify function logs are clean.
4. Run live tests: open `/signup`, submit form; expect 200/201 and set-cookie.
5. Add `/api/health` endpoint; deploy; wire monitoring.
6. Add E2E tests for `/signup` and `/login` flows; integrate into CI.
7. Document operational runbook and environment setup.

## Testing Requirements
- Unit: input validation and employee code checks.
- Integration: `POST /api/auth/signup` and `POST /api/auth/login` against a test DB or mocked storage.
- E2E: Browser-driven signup/login, cookie persistence, redirect checks.
- Cross-environment: local dev, Docker, and Vercel.

## Rollout Strategy
- Use staging on Vercel with the corrected env vars; run E2E.
- Promote to production after passing checks.
- Canary: monitor first minutes post-deploy; if errors spike, rollback to previous successful deployment.

## Monitoring Plan
- Vercel function logs and error rate dashboards.
- Neon connection/activity metrics; alert on connection failures.
- Optional uptime monitoring on `GET /api/health`.

## Documentation Updates
- README: production env requirements; troubleshooting for 404/500.
- `vercel.json` comments explaining rewrites and why dashboard build settings are ignored.
- Runbook: rollback procedures, common failure modes, and escalation.

## Risks & Contingencies
- Env misconfiguration: add pre-deploy checks in CI to validate required envs.
- DB connectivity issues: fall back to retry with backoff; meaningful error responses.
- Session cookie issues: verify domain/secure/sameSite in production.
- Backward compatibility: keep existing API contracts stable; feature-flag changes.

## QA Checkpoints
- After env correction: smoke test `/api/auth/signup` with valid employee code.
- After rewrite confirmation: deep-link to `/signup` and `/properties/...`.
- After monitoring setup: verify alerts fire on simulated failures.
- After tests added: CI green on unit/integration/E2E.

Please confirm this plan. Once approved, I will execute the steps and report verification results.