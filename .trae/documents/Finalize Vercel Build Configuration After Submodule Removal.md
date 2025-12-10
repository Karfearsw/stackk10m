## Problems to Eliminate
- SDK mismatch: Client calls legacy SignalWire APIs (createClient/dialPhone) while installed SDK requires Browser API (SignalWire({ token }), client.dial). Leads to "undefined is not a function" and failed calls.
- PATCH type errors: Client sends ISO strings for date fields; server expects Date. Results in 400 and toISOString errors.
- Build misconfig: Vercel running a mistyped command or targeting the wrong project root; submodule made app code unavailable, causing ENOENT.
- Runtime drift: Node version not pinned across repo and Vercel, leading to warnings/upgrades.

## Permanent Fixes (Code)
- Align Dialer to Browser SDK
  - Use `SignalWire({ token })` and `client.dial({ to, from })`.
  - Remove legacy `createClient/connect/dialPhone` and event names.
  - Add guards around client instantiation and dial calls.
  - File: `FrameworkPlanner/client/src/hooks/useSignalWire.ts`.
- Stable Call Lifecycle
  - Use the Call object returned by `dial` to track `ringing/active/finished` consistently.
  - File: `FrameworkPlanner/client/src/pages/dialer.tsx`.
- Safe PATCH Contract
  - Client: stop sending `endedAt`; send `{ status, durationMs }` only.
  - Server: auto-set `endedAt` when `status` is `ended/failed`; coerce `durationMs` to number.
  - File: `FrameworkPlanner/server/routes.ts`.

## Permanent Fixes (Build/Deploy)
- Monorepo correctness
  - Remove git submodule; track `FrameworkPlanner` files directly so Vercel can access `package.json`.
  - Verify repository has `FrameworkPlanner/package.json` and code.
- Vercel Project Root and Commands
  - Option A: Project Root = `FrameworkPlanner`, Build Command = `npm run build`, Output Directory = `dist`.
  - Option B: Root project, Build Command = `npm --prefix FrameworkPlanner run build`, Output Directory = `FrameworkPlanner/dist`.
- Pin Node version
  - Set `engines.node: "20.x"` in root and app `package.json`.
  - Set Vercel Node.js Version to `20.x`.

## Environment & Health
- SignalWire envs
  - Ensure `SIGNALWIRE_SPACE_URL`, `SIGNALWIRE_PROJECT_ID`, `SIGNALWIRE_API_TOKEN`, `DIALER_DEFAULT_FROM_NUMBER` are set in Vercel.
- Add health endpoints
  - Use `/api/telephony/health` and `/api/system/health` to confirm reachability and env readiness.
- Logging
  - Keep concise logs for token generation and dial failures; suppress sensitive values.

## Reliability
- Asset cache-busting
  - Ensure Vite build name hashing is enabled (default) so clients fetch updated `dialer-*.js`.
- Automated tests
  - Add unit/integration tests for PATCH route and dialer mutation.
  - Files: `FrameworkPlanner/tests/telephony.test.ts`, client tests under `client/src/pages/__tests__/`.

## Verification Steps
1) Local: run `npm run build` and `npm run start`; place/end a call; confirm no SDK errors and PATCH returns 200.
2) Vercel: redeploy with corrected Project Root and Build Command; check logs for successful build and no ENOENT.
3) Browser: hard-refresh; confirm new dialer asset loaded and call works end-to-end.
4) Health: check `/api/telephony/health`; ensure `signalwire: reachable` and `defaultFrom` set.

## Deliverables
- Updated client hook and dialer files using Browser SDK and safe PATCH.
- Server route normalizing dates and status.
- Repository free of submodule; Vercel configured with correct root and build command.
- Node pinned to 20.x across repo and Vercel.
- Tests and health checks to prevent regressions.