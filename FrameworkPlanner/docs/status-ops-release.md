# Status — Ops / Release

## Deployment Model

- Target: Vercel (Static assets + serverless function bundle) ([README.md](file:///workspace/FrameworkPlanner/README.md#L81-L98))
- Build script:
  - normal: `npm run build` ([package.json](file:///workspace/FrameworkPlanner/package.json#L9-L26))
  - Vercel: `npm run vercel-build` runs optional migrations then build ([server/scripts/vercel-build.ts](file:///workspace/FrameworkPlanner/server/scripts/vercel-build.ts))

## CI

GitHub Actions workflow (Node 20.x):
- installs deps with `npm ci`
- runs `npm run check`
- runs `npm run build`
- runs `npx vitest run`

Source: [ci.yml](file:///workspace/FrameworkPlanner/.github/workflows/ci.yml)

## Required Environment Variables (Production)

Core:
- `DATABASE_URL` (or one of `POSTGRES_URL_NON_POOLING`, `POSTGRES_PRISMA_URL`, `POSTGRES_URL`) — required for DB access ([schema-readiness.ts](file:///workspace/FrameworkPlanner/server/schema-readiness.ts#L41-L55))
- `SESSION_SECRET` — required for auth/session in production ([server/app.ts](file:///workspace/FrameworkPlanner/server/app.ts#L61-L71))
- `EMPLOYEE_ACCESS_CODE` — required in production ([server/app.ts](file:///workspace/FrameworkPlanner/server/app.ts#L73-L76))

Deployment toggles:
- `AUTO_APPLY_MIGRATIONS` (`true` / `false`) — controls migration auto-run on Vercel builds ([vercel-build.ts](file:///workspace/FrameworkPlanner/server/scripts/vercel-build.ts#L4-L18))

Monitoring:
- `SENTRY_DSN` — enables server error reporting ([server/sentry.ts](file:///workspace/FrameworkPlanner/server/sentry.ts#L4-L12))
- `VITE_SENTRY_DSN` — enables client error reporting (used in frontend; dependency present in [package.json](file:///workspace/FrameworkPlanner/package.json#L62-L65))

Messaging:
- SignalWire SMS: `SIGNALWIRE_PROJECT_ID`, `SIGNALWIRE_API_TOKEN`, `SIGNALWIRE_SPACE_URL`, `SIGNALWIRE_FROM_NUMBER` ([signalwire.ts](file:///workspace/FrameworkPlanner/server/services/messaging/signalwire.ts#L13-L20))
- Resend email: `RESEND_API_KEY`, `RESEND_FROM` ([resend.ts](file:///workspace/FrameworkPlanner/server/services/messaging/resend.ts#L15-L19))

Storage (optional):
- Telephony media storage: `TELEPHONY_MEDIA_BUCKET`, `TELEPHONY_MEDIA_REGION`, `TELEPHONY_MEDIA_ENDPOINT` (optional), `TELEPHONY_MEDIA_ACCESS_KEY_ID`, `TELEPHONY_MEDIA_SECRET_ACCESS_KEY` ([objectStorage.ts](file:///workspace/FrameworkPlanner/server/telephony/objectStorage.ts#L12-L20))

## Release Checklist

1) Ensure env vars above are set for the target environment.
2) Apply migrations (or enable auto-apply):
   - `npm --prefix FrameworkPlanner run migrate`
3) Verify schema readiness:
   - UI: `/system/health` ([system-health.tsx](file:///workspace/FrameworkPlanner/client/src/pages/system-health.tsx))
   - API behavior: non-auth `/api/*` should return 503 with missing schema hints if not ready ([server/app.ts](file:///workspace/FrameworkPlanner/server/app.ts#L113-L127))
4) Verify core flows:
   - signup/login
   - leads list/pipeline
   - opportunities list/detail
   - phone history loads
   - playground session opens

## Monitoring & Diagnostics

- Existing ops notes: [ops-monitoring.md](file:///workspace/FrameworkPlanner/docs/ops-monitoring.md)
- Metrics instrumentation uses `prom-client` counters (requests + 5xx):
  - [metrics.ts](file:///workspace/FrameworkPlanner/server/metrics.ts)
- Request IDs are generated and echoed via `x-request-id` for debugging:
  - [server/app.ts](file:///workspace/FrameworkPlanner/server/app.ts#L154-L188)

## Security Audit (Current)

`npm run security:audit` currently fails with high severity advisories (expected behavior until upgraded):
- `drizzle-orm <0.45.2` SQL injection advisory (fix is breaking via `npm audit fix --force`)
- `vite 7.0.0 - 7.3.1` multiple high severity dev-server issues
- `rollup`, `lodash`, `path-to-regexp`, `minimatch`, `picomatch`, etc.

Recommendation:
- Create a dedicated “dependency upgrade” branch and upgrade in a controlled sequence:
  1) Vite/Rollup toolchain
  2) Express ecosystem advisories
  3) Drizzle ORM upgrade with integration tests

