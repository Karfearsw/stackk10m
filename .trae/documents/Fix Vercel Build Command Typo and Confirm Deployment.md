## Issue
- Vercel tried to run `npm run buil` (missing "d"), causing the build to fail. The root package.json has a valid `build` script that proxies to `FrameworkPlanner`.

## Steps to Resolve
1) In Vercel Project Settings → Build & Output Settings:
   - Set Build Command to `npm run build` (exact spelling).
   - Set Install Command to `npm install` (or leave default).
   - Ensure Project Root is the repository root (not `FrameworkPlanner`), since root `build` calls the app build.
2) Keep Node.js Version set to `20.x` (you already switched from `24.x`).
3) Trigger a redeploy.

## Verify
- Build logs show `npm run build` and complete with generated `dist/` and `dist-server/index.js`.
- The site serves correctly (SPA rewrites already set in `vercel.json`).
- Dialer can place/end calls and `PATCH /api/telephony/calls/:id` returns 200.

## Contingency
- If Vercel uses a non-root project setup, set Build Command to `npm --prefix FrameworkPlanner run build` instead, and verify output. 