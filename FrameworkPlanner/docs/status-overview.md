# Status Overview (FrameworkPlanner / Stackk10m)

## Snapshot

- **Frontend**: React + Vite + Tailwind + shadcn/ui ([README.md](file:///workspace/FrameworkPlanner/README.md))
- **Backend**: Express + Drizzle + Postgres (Neon recommended) ([README.md](file:///workspace/FrameworkPlanner/README.md))
- **Auth**: Session-based (express-session) with Postgres session store in production ([server/app.ts](file:///workspace/FrameworkPlanner/server/app.ts#L77-L152))
- **Deploy**: Vercel (serverless + static assets) with optional auto-migrations ([server/scripts/vercel-build.ts](file:///workspace/FrameworkPlanner/server/scripts/vercel-build.ts))

## CI / Build Status (Local Verification)

Verified in this environment:
- `npm ci` ✅ (shows Node engine mismatch warning because repo expects Node 20.x; CI uses 20.x)
- `npm run check` ✅
- `npm run test:all` ✅ (tests pass; some smoke tests are intentionally skipped)
- `npm run build` ✅
- `npm run security:audit` ❌ (10 high vulnerabilities; see `docs/status-ops-release.md`)

## What Works (High-Level)

- **Core CRM pages exist and route correctly**: Dashboard, Leads, Opportunities, Playground, Phone/Dialer, Tasks, Contacts, Campaigns, RVM, Contracts, Analytics ([App.tsx](file:///workspace/FrameworkPlanner/client/src/App.tsx))
- **Operational safeguards**:
  - if auth isn’t configured, `/api/*` returns 503 ([server/app.ts](file:///workspace/FrameworkPlanner/server/app.ts#L61-L112))
  - if DB/schema isn’t ready, most `/api/*` returns 503 with “howToFix” guidance ([server/app.ts](file:///workspace/FrameworkPlanner/server/app.ts#L113-L127), [schema-readiness.ts](file:///workspace/FrameworkPlanner/server/schema-readiness.ts))
- **Monitoring primitives**:
  - Sentry server hook (enabled via `SENTRY_DSN`) ([server/sentry.ts](file:///workspace/FrameworkPlanner/server/sentry.ts))
  - Prometheus metrics counters (`/metrics` route in server) ([server/metrics.ts](file:///workspace/FrameworkPlanner/server/metrics.ts))

## Highest-Risk Areas (Ranked)

1) **Dependency security**: current `npm audit --audit-level=high` fails with multiple high severity advisories; some fixes are breaking.  
2) **Schema readiness/migrations discipline**: app blocks API access when required tables/columns are missing; this is correct behavior but can surprise deployments if migrations aren’t applied.  
3) **Large-list scaling (Leads/Opportunities/Contacts)**: any “hard limit” patterns (like `limit=500`) create “exists in search but not in list” issues unless pagination is consistent and UX exposes totals.  
4) **Single-file backend surface area**: most routes are in one file ([server/routes.ts](file:///workspace/FrameworkPlanner/server/routes.ts)), which increases regression risk and makes ownership unclear.  

## Recommended Next Moves (Shortlist)

- **Security hardening pass**: upgrade/patch vulnerable deps (with a controlled breaking-change plan) and add a CI gate for `npm audit` severity thresholds.
- **List endpoint standards**: make pagination consistent everywhere (`limit`, `offset`, `total`) and ensure every UI list supports “load more” + “showing X of Y”.
- **Route ownership and refactor**: split backend routes by domain modules (auth/leads/opportunities/telephony/etc.) to reduce regressions.
- **Observability**: add consistent client error boundary + request logging (Sentry tags for user/route) and document how to debug common 500/503 cases.

