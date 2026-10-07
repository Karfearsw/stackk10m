# Release & Rollback (Ticket 03)

## Environment model

| Environment | Purpose | Database | Notes |
| --- | --- | --- | --- |
| development | Local feature work | dev Neon branch/db | `DEV_AUTH_BYPASS_ENABLED` allowed locally only |
| test | Automated tests | test db | never point at prod |
| production | Live CRM | prod Neon db | `SESSION_SECRET`/`EMPLOYEE_ACCESS_CODE` required |

Environment separation is enforced in code (`server/env.ts`):

- `validateEnv()` + `assertEnvSafe()` run at startup. In production, missing
  required variables, the documentation-default session secret, dev/admin bypass
  flags, or a non-prod-looking config refuse to start.
- Non-production configs pointing at a production database (detected by
  `PRODUCTION_DATABASE_URL`, `PRODUCTION_DB_HOSTS`, or a prod hostname) are
  rejected unless `ALLOW_PRODUCTION_DB_IN_DEV=true`.
- `assertSafeMigrationTarget()` blocks `apply-migrations` from touching a prod DB
  unless `ALLOW_PRODUCTION_MIGRATIONS=true`.

## Release checklist (all must pass before release)

1. `npm run check` — typecheck.
2. `npm run test:unit` — unit/integration tests.
3. `npm run security:scan-secrets` — no committed credentials.
4. Startup with production env vars validates (`env resolved ... ok=true`).
5. Owner review of the change set. **No merge until owner approves.**

## Production release steps

1. Confirm the target database is the production database and that a recovery
   point/backup exists.
2. Deploy the build (hosting provider). Runs the configured install + build only.
3. Apply migrations explicitly, with `ALLOW_PRODUCTION_MIGRATIONS=true` and a
   verified backup, or via the admin migration endpoint.
4. Smoke test: `/api/health`, sign-in, lead list, dialer config.

## Rollback steps

1. Stop/disable the new code path (feature flag) if possible.
2. Redeploy the previous build.
3. If a migration ran, apply the documented reverse migration. **Never**
   `db:push` against production to "fix" drift.
4. Record the incident, the recovery point used, and the operator.

## Approval & ownership

- Release owner: (to be named by owner).
- Rollback owner: (to be named by owner).
- Any failed integrity, permissions, suppression, audit-trail, backup, or
  env-isolation test **blocks release** until corrected and re-approved
  (production stop).

## Known open items (not satisfied by code alone)

- Separate Neon dev/prod databases, branches, and least-privilege roles must be
  provisioned and their credentials stored in the environment provider.
- A live credential is currently committed in `FrameworkPlanner/vitest.config.ts`
  and must be **rotated** and replaced with an environment-provided value before
  the secret-hygiene criterion is met.
