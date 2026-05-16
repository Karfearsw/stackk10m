# Database & Neon Env Contract

## Source of truth

Runtime database URL resolution (first valid wins):
1) `DATABASE_URL`
2) `POSTGRES_URL_NON_POOLING`
3) `POSTGRES_PRISMA_URL`
4) `POSTGRES_URL`

Migration database URL resolution (first valid wins):
1) `MIGRATIONS_DATABASE_URL`
2) `POSTGRES_URL_NON_POOLING`
3) `DATABASE_URL`
4) `POSTGRES_PRISMA_URL`
5) `POSTGRES_URL`

All values are validated as `postgres:` / `postgresql:` URLs. If `channel_binding=require` is present, it is removed automatically.

## Target Neon architecture

- Production: one Neon project/branch used by all app variants (`deals`, `xp`, `career`, `public`).
- Preview: separate Neon branch or database (recommended: isolated from production).
- Local: separate Neon branch or local Postgres (recommended: isolated from production and preview).

## Environment contract

### Shared server env (all variants)

Required for production:
- `SESSION_SECRET`
- Database URL via one of: `DATABASE_URL`, `POSTGRES_URL_NON_POOLING`, `POSTGRES_PRISMA_URL`, `POSTGRES_URL`

Recommended for production:
- `MIGRATIONS_DATABASE_URL`
- `AUTO_APPLY_MIGRATIONS=true`

Signup / access control:
- `APP_PUBLIC_SIGNUP` (`true` / `false`)
- `SIGNUP_ALLOWED_HOSTS` (comma separated hostnames)
- Role codes: `ADMIN_ROLE_CODE`, `TEAM_LEADER_ROLE_CODE`, `AGENT_ROLE_CODE`, `VA_ROLE_CODE` (or legacy `EMPLOYEE_ACCESS_CODE`)

XP / Stripe:
- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`

### Client env

- `VITE_APP_VARIANT` (`deals` | `xp` | `career` | `public`)

## Migration workflow

Local:
```bash
npm --prefix FrameworkPlanner run migrate
```

Preview:
- Use an isolated Neon branch or database.
- Set `AUTO_APPLY_MIGRATIONS=true` so previews stay schema-compatible.

Production:
- Point all projects to the same production Neon database.
- Set `AUTO_APPLY_MIGRATIONS=true` for controlled deploy-time migration.
- Use `MIGRATIONS_DATABASE_URL` (recommended) to ensure migrations use a non-pooling Neon URL.

## Preventing drift

- Migrations are tracked in `schema_migrations` (filename + checksum).
- A changed checksum after apply fails the migration run.
- Migration runs take a Postgres advisory lock so concurrent deploys cannot race.

