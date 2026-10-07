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
   EMPLOYEE_ACCESS_CODE="3911"
   NODE_ENV="development"
   ```

3. Push Database Schema:
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

## Deployment (Vercel)

1. Push to GitHub.
2. Import project into Vercel.
3. Configure **Environment Variables** (Settings -> Environment Variables):
   - `DATABASE_URL`: Your Neon connection string (Use `sslmode=require`, **remove** `channel_binding=require` if present).
   - `SESSION_SECRET`: A strong random string.
   - `EMPLOYEE_ACCESS_CODE`: e.g. `3911`.
   - `NODE_ENV`: `production`.
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

## License

MIT

## AI Implementation

- Provider: SignalWire
- Docs: `docs/ai-next-steps.md`, `docs/preview-environment.md`, `docs/testing-protocols.md`, `docs/success-criteria.md`
- Required env vars: `SIGNALWIRE_SPACE_URL`, `SIGNALWIRE_PROJECT_ID`, `SIGNALWIRE_API_TOKEN`
