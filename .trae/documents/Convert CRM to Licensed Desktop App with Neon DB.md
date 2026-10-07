## Issues Detected
- `NODE_ENV=PRODUCTON` (typo) — must be `production`.
- `DATABASE_URL` includes `channel_binding=require` — remove it; keep `sslmode=require`.

## Correct Values (Vercel → Project → Settings → Environment Variables)

> Secrets are **never** recorded in source control. The values below were redacted
> on 2026-10-07 (they had been committed here); retrieve the real values from the
> Vercel environment or Neon console. **Rotate any value that was exposed.**

- `EMPLOYEE_ACCESS_CODE=<set in Vercel, not in source>`
- `SESSION_SECRET=<set in Vercel, not in source>`
- `DATABASE_URL=postgresql://<user>:<password>@<host>/<db>?sslmode=require`
- `NODE_ENV=production`

## Steps
1. Update these env vars in Vercel (Production scope) and Save.
2. Trigger a redeploy.
3. Test the signup form:
   - Expect `POST /api/auth/signup` to return success and set a cookie.
   - Verify Neon shows activity for the insert.

## Outcome
- The serverless function no longer crashes; signup works against Neon DB in production.