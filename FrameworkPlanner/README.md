# FrameworkPlanner (Stackk10m)

A comprehensive real estate wholesaler CRM built with React, Express, and PostgreSQL.

## Architecture

- **Frontend**: React + Vite + Tailwind CSS + shadcn/ui
- **Backend**: Express.js + Drizzle ORM
- **Database**: PostgreSQL (Neon DB)
- **Auth**: Session-based (express-session) + 2FA support
- **Deployment**: Vercel (Serverless Function + Static Assets)

## Prerequisites

- Node.js v20+
- PostgreSQL Database (Neon recommended)

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Create `.env` file:
   ```env
   DATABASE_URL="postgresql://..."
   SESSION_SECRET="your-secret"
   EMPLOYEE_ACCESS_CODE="your-employee-code"
   NODE_ENV="development"
   ```

### Dev Auth Bypass (local only)

For development/testing, you can enable a temporary employee-code bypass endpoint that signs in an existing user without a password.

Add to `.env`:
```env
DEV_AUTH_BYPASS_ENABLED="true"
```

- Endpoint: `POST /api/auth/dev-bypass` with JSON `{ "email": "...", "employeeCode": "..." }`
- Restrictions: disabled in `NODE_ENV=production` and only accepts loopback requests (`127.0.0.1` / `::1`)
- Audit trail: writes to `auth_audit_logs` when the table exists

3. Apply Database Migrations:
   ```bash
   npm run migrate
   ```

   Optional (schema sync without SQL migrations):
   ```bash
   npm run db:push
   ```

4. Run Development Server:
   ```bash
   npm run dev
   ```

## Testing

Run unit and integration tests:
```bash
npx vitest run
```

## Database Promotion (Dev → Prod)

To apply checked-in SQL migrations to a target database with checksum tracking:

```bash
SYNC_ALLOW_PRODUCTION=true tsx server/scripts/sync-dev-to-prod.ts
```

Optional env vars:
- `SYNC_TARGET_DATABASE_URL`: overrides `DATABASE_URL`
- `DB_SSL_REJECT_UNAUTHORIZED`: set to `false` only if your TLS environment requires it

## Deployment (Vercel)

1. Push to GitHub.
2. Import project into Vercel.
3. Configure **Environment Variables** (Settings -> Environment Variables):
   - `DATABASE_URL`: Your Neon connection string (Use `sslmode=require`, **remove** `channel_binding=require` if present).
   - `SESSION_SECRET`: A strong random string.
   - `EMPLOYEE_ACCESS_CODE`: your internal employee access code.
   - `NODE_ENV`: `production`.
   - `AUTO_APPLY_MIGRATIONS`: `true` (Production only; runs SQL migrations at build time).
4. Deploy.

### Troubleshooting Vercel 500 Errors
If you encounter `500 INTERNAL_SERVER_ERROR` on signup/login:
- Verify `DATABASE_URL` does not have `channel_binding=require`.
- Ensure `SESSION_SECRET` and `EMPLOYEE_ACCESS_CODE` are set.
- Check Vercel Function logs for startup errors.

## CI/CD

GitHub Actions are configured in `.github/workflows/ci.yml` to run type checks, builds, and tests on every push/PR.
Docker builds are pushed to GHCR via `.github/workflows/docker-publish.yml`.

## Security

- Helmet.js for HTTP headers
- Rate limiting (planned)
- 2FA enforcement
- Employee code validation on signup
- Dev auth bypass endpoint is disabled in production by default

## License

MIT

## AI Implementation

- Provider: SignalWire
- Docs: `docs/ai-next-steps.md`, `docs/preview-environment.md`, `docs/testing-protocols.md`, `docs/success-criteria.md`
- Required env vars: `SIGNALWIRE_SPACE_URL`, `SIGNALWIRE_PROJECT_ID`, `SIGNALWIRE_API_TOKEN`
