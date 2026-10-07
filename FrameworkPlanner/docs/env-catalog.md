# Environment Variable Catalog (Ticket 03)

Versioned catalog of configuration read by the app. **No values live here.** Every
entry documents the name, purpose, and how it is rotated/provisioned. The runtime
validates these at startup via `server/env.ts`, and unsafe/mixed configurations are
refused in production.

- Catalog version: `2026-10-06.1`
- Owner: Platform owner (see rotation column)
- Environments: `development`, `test`, `production` (resolved by `resolveAppEnv`)

## Environment identity

| Variable | Purpose | Required | Rotation / source |
| --- | --- | --- | --- |
| `APP_ENV` | Explicit environment identity (`development`\|`test`\|`production`). Overrides `NODE_ENV`/`VERCEL_ENV`. | No | Set per environment in the hosting provider. |
| `NODE_ENV` | Standard Node environment; contributes to env resolution. | prod yes | Hosting provider. |
| `VERCEL_ENV` | Vercel environment (`production`/`preview`); contributes to env resolution. | Vercel | Vercel platform. |

## Database

| Variable | Purpose | Required | Rotation / source |
| --- | --- | --- | --- |
| `DATABASE_URL` | Primary Postgres (Neon) connection string. | prod yes | Neon console → rotate role password. |
| `POSTGRES_URL` / `POSTGRES_URL_NON_POOLING` / `POSTGRES_PRISMA_URL` | Accepted fallbacks in priority order. | No | Neon console. |
| `PRODUCTION_DATABASE_URL` | Reference prod URL, used only to detect accidental prod targeting from non-prod. | No | Platform owner. |
| `PRODUCTION_DB_HOSTS` | Comma-separated prod host allowlist for the same guard. | No | Platform owner. |
| `ALLOW_PRODUCTION_DB_IN_DEV` | Explicit override to let non-prod point at a prod DB (used only deliberately). | No | Platform owner. |
| `ALLOW_PRODUCTION_MIGRATIONS` | Explicit approval for migration scripts to touch a prod DB. | No | Platform owner. |
| `SYNC_ALLOW_PRODUCTION` / `SYNC_TARGET_DATABASE_URL` | Guard + target for `sync-dev-to-prod.ts`. | No | Platform owner. |
| `DB_POOL_MAX`, `DB_POOL_IDLE_TIMEOUT_MS`, `DB_POOL_CONN_TIMEOUT_MS`, `DB_CONNECTION_TIMEOUT_MS`, `DB_STATEMENT_TIMEOUT_MS`, `DB_IDLE_IN_TX_TIMEOUT_MS`, `DB_SLOW_QUERY_MS`, `DB_QUERY_TIMING`, `DB_RETRY_SELECTS`, `DB_STARTUP_TEST`, `DB_APPLICATION_NAME` | Connection pool tuning + diagnostics. | No | Platform owner. |
| `PGSSLMODE`, `DB_SSL_REJECT_UNAUTHORIZED` | TLS behavior for `pg`-based scripts. | No | Platform owner. |

## Secrets (must be provided via the environment provider, never committed)

| Variable | Purpose | Required | Rotation path |
| --- | --- | --- | --- |
| `SESSION_SECRET` | Session signing secret. | prod yes | Rotate in hosting secrets; invalidates sessions. |
| `EMPLOYEE_ACCESS_CODE` | Signup gate code. | prod yes | Owner-managed; rotate quarterly. |
| `ADMIN_USERNAME` / `ADMIN_PASSWORD` | Legacy admin login path; must be disabled in production. | No | Remove/prefer bootstrap-admin tooling. |
| `ENABLE_ADMIN_BYPASS` | Explicit opt-in for the admin bypass path; forbidden in production. | No | Platform owner. |
| `DEV_AUTH_BYPASS_ENABLED` | Local-only dev sign-in bypass; forbidden in production. | No | Developer. |

## Identity / roles

| Variable | Purpose |
| --- | --- |
| `ORG_EMAIL_DOMAIN` | Allowed signup email domain. |
| `ADMIN_ROLE_CODE`, `TEAM_LEADER_ROLE_CODE`, `AGENT_ROLE_CODE`, `VA_ROLE_CODE`, `CONCIERGE_ROLE_CODE` | Role codes used to classify signups. |

## Feature flags (env-level kill switches)

`FEATURE_SKIP_TRACE`, `FEATURE_CAMPAIGNS`, `FEATURE_RVM`, `FEATURE_ESIGN`,
`FEATURE_FIELD_MODE`, `FEATURE_COMPS`, `FEATURE_BUYER_MATCH`,
`FEATURE_VOICE_PLAYGROUND`, `FEATURE_PUBLIC_LISTINGS` — see `server/featureFlags.ts`
and Ticket 16 for keep/kill decisions.

## Integrations

| Variable | Purpose | Rotation |
| --- | --- | --- |
| `TELNYX_API_KEY`, `TELNYX_CONNECTION_ID`, `TELNYX_MESSAGING_PROFILE_ID`, `TELNYX_PUBLIC_KEY`, `TELNYX_DEFAULT_FROM_NUMBER` | Telephony / SMS. | Telnyx portal. |
| `SIGNALWIRE_SPACE_URL`, `SIGNALWIRE_PROJECT_ID`, `SIGNALWIRE_API_TOKEN` | AI voice config. | SignalWire portal. |
| `SENTRY_DSN` | Error monitoring. | Sentry project. |

## Build / runtime

`PORT`, `CI`, `VITE_HMR_CLIENT_PORT`, `VITE_HMR_PROTOCOL`, `VITE_HMR_HOST`,
`VERCEL`, `SKIP_DB_MIGRATIONS`, `AUTO_APPLY_MIGRATIONS`.

## Rules

1. **No secret is committed to source control.** Provide them through the hosting
   provider (Vercel → Settings → Environment Variables) or the workspace
   environment. Run `npm run security:scan-secrets` before release.
2. **Dev/test must not write to production.** `validateEnv` refuses non-prod
   configurations pointing at a production host unless `ALLOW_PRODUCTION_DB_IN_DEV=true`,
   and migration scripts require `ALLOW_PRODUCTION_MIGRATIONS=true`.
3. **Rotate on exposure.** If a secret appears in git history, rotate it at the
   provider first, then purge history — rotation is what actually limits blast radius.
