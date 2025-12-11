## Cause
- In Vercel dev/build, the client-side route `/signup` must rewrite to `index.html`. If rewrite rules are incorrect, Vercel tries to find a real file and returns 404. The login page loads because you hit `/`, which maps to `index.html`.

## Verify
- Confirm current config: `vercel.json` uses `routes` with `src` and sends everything to `/dist/public/index.html` via a catch-all. Vercel’s modern config prefers `rewrites` with `source`/`destination`.
- Check that `dist/public/index.html` exists post-build and that assets are under `dist/public/assets/`.

## Fix
1) Replace `routes` with `rewrites` using path-to-regexp syntax:
```
{
  "version": 2,
  "builds": [
    { "src": "server/index-prod.ts", "use": "@vercel/node" },
    { "src": "package.json", "use": "@vercel/static-build", "config": { "distDir": "dist/public", "buildCommand": "npm run build" } }
  ],
  "rewrites": [
    { "source": "/api/(.*)", "destination": "/server/index-prod.ts" },
    { "source": "/(.*)", "destination": "/dist/public/index.html" }
  ]
}
```
- This ensures all client routes (including `/signup`) rewrite to the SPA entry. API requests still hit the serverless function.
- Optional: Add a static assets rule if needed:
```
{ "source": "/assets/(.*)", "destination": "/dist/public/assets/$1" }
```

## Environment Checks
- Vercel ignores dashboard Build & Development settings when `builds` is present — expected.
- Ensure env vars are set in Vercel (DATABASE_URL, SESSION_SECRET, EMPLOYEE_ACCESS_CODE, NODE_ENV=production). These do not affect the route rewrite itself but are required for auth API calls.

## Compare Local vs Vercel
- Local dev (Vite) always transforms `index.html` and handles client routes; Vercel needs explicit SPA fallback.
- After the rewrite change, behavior matches local dev.

## Steps After Approval
- Update `vercel.json` to use `rewrites` as above.
- Push to GitHub; trigger Vercel redeploy.
- Test `/signup`, `/login`, and a nested route (e.g., `/properties/123`) to confirm SPA fallback.
- Verify API calls (`/api/auth/signup`) succeed against Neon DB.

## Expected Outcome
- `/signup` loads correctly in Vercel dev and production environments; no 404. Login and other routes behave the same as local dev.