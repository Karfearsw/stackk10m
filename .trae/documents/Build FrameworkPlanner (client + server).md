## Overview
- Build bundles the React client with Vite and the Node/Express server with esbuild.
- Output artifacts: client in `FrameworkPlanner/dist/public/` and server entry at `FrameworkPlanner/dist/index.js`.
- Scripts are defined in `FrameworkPlanner/package.json:6-13`; Vite outDir is set in `FrameworkPlanner/vite.config.ts:38-42`; server serves static from `dist/public` (`FrameworkPlanner/server/index-prod.ts:9-23`).

## Prerequisites
- Install Node 20+ and npm.
- Ensure PostgreSQL connection string if you plan to run the server: `DATABASE_URL`.
- Set `SESSION_SECRET` for production runs (`FrameworkPlanner/server/app.ts:35-67`).

## Install Dependencies
- `cd c:\Users\Stack\Downloads\stackk10m\FrameworkPlanner`
- `npm install` (or `npm ci` if lockfile should be honored).

## Build
- `npm run build`
- This runs `vite build` to emit the client to `dist/public` and `esbuild` to bundle `server/index-prod.ts` to `dist/index.js` (`FrameworkPlanner/package.json:9`).

## Verify Artifacts
- Confirm `FrameworkPlanner/dist/public/index.html` exists.
- Confirm `FrameworkPlanner/dist/index.js` exists.
- Optional: open `FrameworkPlanner/dist/public/` to spot-check assets.

## Run (Production)
- The server listens on `PORT` (default `5000`) (`FrameworkPlanner/server/app.ts:127-134`).
- Windows env note: npm scripts like `NODE_ENV=production node ...` are POSIX-style and may fail on Windows. Use PowerShell session variables:
  - `setx SESSION_SECRET "your-strong-secret"` (persists) or `$env:SESSION_SECRET="your-strong-secret"` (current session)
  - `$env:DATABASE_URL="postgres://..."`
  - `$env:NODE_ENV="production"`
  - `node dist/index.js`
- In development you can skip secrets; the app uses a dev default secret when `NODE_ENV=development`.

## Common Issues
- Missing `SESSION_SECRET` in production throws at startup (`FrameworkPlanner/server/app.ts:35-45`).
- Missing `DATABASE_URL` breaks session store; set it for server runs (`FrameworkPlanner/server/app.ts:51-55`).
- Port conflicts: change `PORT` via env.

## Next Steps
- After you confirm, I will run the build, verify outputs, and (if desired) start the server locally with correct Windows env handling. If you prefer, I can also add `cross-env` to make `start` cross-platform.