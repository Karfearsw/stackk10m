## What’s Happening
- Vercel logs show 500s from the serverless function due to ESM module resolution failures (e.g., `/server/sentry` not found) rather than database errors.
- These errors block auth routes like `/api/auth/me` and `/api/auth/signup` before any DB operation runs.

## Root Causes Identified
- Node ESM requires explicit file extensions for local imports. `server/app.ts` imported `./sentry` and `./metrics` without `.js`, causing runtime failures on Vercel.
- Vercel Build Command typo (`npm run buil`) caused earlier deploy failures. We’ve added `buildCommand` and `outputDirectory` to `vercel.json`, but the project settings may still override it.
- Potential configuration drift: duplicate `vercel.json` at repo root versus `FrameworkPlanner`, and Vercel root directory not set to `FrameworkPlanner`.

## Verification (No Changes)
- Audit server imports for extensionless local modules across `server/**/*` to ensure ESM-safe imports.
- Confirm `api/index.ts` invokes `registerRoutes(app)` only once per cold start and uses the Express app handler correctly.
- Review `server/db.ts` to verify conservative pooling (`max=3`, timeouts) and environment variable usage; confirm no `channel_binding=require` in `DATABASE_URL`.
- Check Vercel project settings (read-only): Root Directory=`FrameworkPlanner`, Build Command=`npm run build`, Output Directory=`dist`.

## Implementation Plan
1. ESM Import Fixes
- Update any remaining local imports in `server/**/*` to include `.js` (e.g., `./sentry.js`, `./metrics.js`). Keep existing `.js` imports as-is.
- Rebuild and verify the serverless function bundle includes `server/sentry.js` and `server/metrics.js`.

2. Vercel Configuration Hardening
- Ensure only one `vercel.json` is active (in `FrameworkPlanner`).
- Keep `buildCommand`=`npm run build` and `outputDirectory`=`dist` in `vercel.json` to defend against dashboard typos.
- Verify Vercel Root Directory is set to `FrameworkPlanner`.

3. Auth & DB Sanity Checks
- Add a `/api/__health` endpoint to return `{ db: ok }` after a simple `SELECT 1`, confirming DB connectivity in production.
- Add minimal auth integration tests (supertest) for `/api/auth/me` and `/api/auth/signup` to catch regressions locally.
- Log explicit errors around DB connect/session store init to surface credential or SSL issues.

4. Environment Validation
- Verify required envs in Vercel:
  - `DATABASE_URL` (Neon): include `sslmode=require`, remove `channel_binding=require`.
  - `SESSION_SECRET`, `EMPLOYEE_ACCESS_CODE`, `NODE_ENV=production`.
  - Optional: `SENTRY_DSN` for server; `VITE_SENTRY_DSN` for client.

5. Redeploy & Observe
- Redeploy on Vercel.
- Test `/api/auth/me`, `/api/auth/signup`, and `/api/__health`.
- Inspect logs for any remaining ESM or DB errors; iterate quickly if seen.

## Expected Outcome
- ESM resolution issues eliminated; serverless function initializes cleanly.
- Auth endpoints respond without 500s; DB connectivity verified via health check.
- Deployment no longer depends on dashboard Build Command typos.

## Confirmation
- If you approve, I’ll implement the import fixes, add the health endpoint and tests, verify builds locally, and push. Then I’ll trigger a redeploy and validate the endpoints in production.