## Issues Detected
- `NODE_ENV=PRODUCTON` (typo) — must be `production`.
- `DATABASE_URL` includes `channel_binding=require` — remove it; keep `sslmode=require`.

## Correct Values (Vercel → Project → Settings → Environment Variables)
- `EMPLOYEE_ACCESS_CODE=3911`
- `SESSION_SECRET=e9a2d8b7-6f5c-4d3e-8a1b-0c9d8e7f6a5b`
- `DATABASE_URL=postgresql://neondb_owner:npg_CouIeypSA80K@ep-damp-bonus-adm8s91b-pooler.c-2.us-east-1.aws.neon.tech/neondb?sslmode=require`
- `NODE_ENV=production`

## Steps
1. Update these env vars in Vercel (Production scope) and Save.
2. Trigger a redeploy.
3. Test the signup form:
   - Expect `POST /api/auth/signup` to return success and set a cookie.
   - Verify Neon shows activity for the insert.

## Outcome
- The serverless function no longer crashes; signup works against Neon DB in production.