## Current Issue
- Production shows `PATCH /api/telephony/calls/:id` returning 400 during dialer end call. This typically happens when the server attempts to `toISOString` a non-Date-like value (e.g., `endedAt`), or the client sends a shape the server doesn’t coerce.

## Plan to Resolve 400
- Client: Ensure production dialer does not send `endedAt` in `PATCH` bodies; only send `{ status, durationMs }`.
- Server: Normalize PATCH input and set `endedAt` automatically when `status` is `ended` or `failed`.
- Redeploy both client and server with these changes.

## Steps
1) Verify the production bundle still includes `endedAt` in the PATCH body by inspecting browser Network payload; if present, deploy the updated client (`FrameworkPlanner/client/src/pages/dialer.tsx`) that omits `endedAt`.
2) Verify the production server route matches normalization: in `/api/telephony/calls/:id`, coerce date-like fields and auto-assign `endedAt` on `ended/failed`.
3) Redeploy and run a smoke test:
   - Create a call with `POST /api/telephony/calls`.
   - End it with `PATCH /api/telephony/calls/:id` → expect 200.
4) Confirm Call History updates (`status: ended`, duration present).

## Node Version Warning
- Set Node.js Version to a pinned major in Vercel Project Settings (e.g., `20.x`, `22.x`, or `24.x`) to avoid auto-upgrade warnings.
- Ensure `engines.node` in `package.json` is a major pin (repo already pins `20.x` in FrameworkPlanner/package.json:5–7). Add the same at repo root if Vercel uses the root manifest.
- Optionally log `process.version` at startup to verify runtime Node version.

## Verification
- No 400s on PATCH in Network tab.
- Server logs show normalized payload; call records show proper `endedAt` and `durationMs`.
- Deployment logs no longer warn about Node version range.