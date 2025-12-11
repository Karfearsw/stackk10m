## What Happened
- Vercel logs show an extremely fast build and immediate deployment because `vercel.json` defines only a Node `builds` entry and no step to run `npm run build`.
- With `builds` present, dashboard Build & Development settings are ignored; therefore your client build did not run on Vercel.

## Recommended Configuration
- Use a two-build setup:
  1) `@vercel/static-build` to run `npm run build` and emit client assets to `dist/public`.
  2) `@vercel/node` to deploy the Express server entry (TypeScript accepted) that serves API routes.
- Route `/api/*` to the serverless function and everything else to static assets, so Vercel serves the React app directly and the API via the function.

## Proposed vercel.json
- Replace current config with:
```
{
  "version": 2,
  "builds": [
    {
      "src": "server/index-prod.ts",
      "use": "@vercel/node"
    },
    {
      "src": "package.json",
      "use": "@vercel/static-build",
      "config": { "distDir": "dist/public", "buildCommand": "npm run build" }
    }
  ],
  "routes": [
    { "src": "/api/(.*)", "dest": "/server/index-prod.ts" },
    { "src": "/(.*)", "dest": "/dist/public/$1" }
  ]
}
```
- This ensures Vercel runs the full build, produces `dist/public` and deploys the API function.

## Environment Variables (Production)
- In Vercel Project → Settings → Environment Variables:
  - `DATABASE_URL`: your Neon URL with `sslmode=require`
  - `SESSION_SECRET`: strong random string
  - `EMPLOYEE_ACCESS_CODE`: `3911` (or your value)
  - `NODE_ENV`: `production`

## Steps After Approval
1. Update `vercel.json` as above and push to GitHub.
2. Redeploy the project on Vercel; verify build logs show `npm run build` executing.
3. Validate:
  - UI loads from static assets.
  - API calls hit `/api/...` and function returns responses.
  - Test signup (with employee code) and login against Neon.

## Notes
- Keeping serverless for API avoids long-lived processes and works better on Vercel.
- If you prefer the server function to serve static too, we can route all to the function and omit the static-build, but we must then trigger the client build via another mechanism; the above config is the most reliable.
