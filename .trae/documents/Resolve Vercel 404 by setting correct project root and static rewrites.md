## Goal
Resolve 404 NOT_FOUND on the deployed site by correctly serving the SPA from `FrameworkPlanner/dist` and routing API requests.

## High-Level Strategy
1) Point the project root to `FrameworkPlanner` subdirectory. 2) Ensure Output Directory is `dist`. 3) Apply SPA rewrites. 4) Verify API function routing. 5) Redeploy and validate.

## Step-by-Step (Browser UI)
1. Open Vercel Dashboard → select the project.
2. Project Settings → General:
   - Set "Root Directory" to `FrameworkPlanner` (save).
3. Project Settings → Build & Development:
   - Framework Preset: "Other".
   - Output Directory: `dist` (toggle Override ON, save).
   - Leave Build Command empty (Vercel uses `npm run build` from package.json).
4. Project Settings → Environment Variables:
   - Confirm required envs are present (e.g., `DATABASE_URL`, `SESSION_SECRET`, `EMPLOYEE_ACCESS_CODE`, `ADMIN_USERNAME`, `ADMIN_PASSWORD`, optional `STACK_*`).
5. Repository Files (View Code in Vercel or GitHub):
   - Ensure `FrameworkPlanner/vercel.json` contains:
     ```json
     {"version":2,"rewrites":[{"source":"/api/(.*)","destination":"/api/index"},{"source":"/(.*)","destination":"/index.html"}]}
     ```
   - Confirm `FrameworkPlanner/api/index.ts` exists.
   - Confirm `FrameworkPlanner/tsconfig.json` includes `api/**/*` in `include`.
6. Trigger Redeploy:
   - Deploy → "Redeploy" latest commit, or push a no-op commit.
7. Validate Deployment:
   - Open the deployment URL.
   - Visit `/index.html` (should render the app shell).
   - Visit `/dashboard` (should render via SPA rewrite).
   - Visit `/api/index` (should not 404; if you have a health route, test `/api/health`).
   - Deployment Logs: confirm files uploaded from `FrameworkPlanner/dist` (no "missing output directory").

## Acceptance Criteria
- Root path loads (no 404).
- Navigating to non-file routes (e.g., `/dashboard`) renders the SPA.
- API path responds (not 404), or returns your defined JSON.

## Fallback Checks (if 404 persists)
- Confirm the deployment shows static files under "Artifacts"; ensure `index.html` is present.
- Temporarily remove rewrites except `{ "source": "/(.*)", "destination": "/index.html" }`, redeploy, and retest.
- Ensure no `routes` property exists in `vercel.json` (conflicts with `rewrites`).
- Verify Project Settings → Node.js version is compatible (20.x or 24.x).