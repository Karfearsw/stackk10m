## Scope of Changes
- Client: `FrameworkPlanner/client/src/hooks/useSignalWire.ts` updated to use Browser SDK (`SignalWire({ token })`, `client.dial`).
- Client: `FrameworkPlanner/client/src/pages/dialer.tsx` now omits `endedAt` in PATCH bodies and failure path; server derives end time.
- Server: `FrameworkPlanner/server/routes.ts` normalizes PATCH and auto-sets `endedAt` when `status` is `ended`/`failed`.

## Pre‑Push Validation
- Build client and server: `npm run build`.
- Smoke test API:
  - `POST /api/telephony/calls` returns `201`.
  - `PATCH /api/telephony/calls/:id` with `{ status: "ended", durationMs }` returns `200`.
- UI check: hard refresh at `http://localhost:3001/` and place/finish a call from Dialer (no `createClient` error).

## Commit and Push
- Stage files: `git add FrameworkPlanner/client/src/hooks/useSignalWire.ts FrameworkPlanner/client/src/pages/dialer.tsx FrameworkPlanner/server/routes.ts`.
- Commit: `git commit -m "fix(dialer): align with @signalwire/js Browser SDK; normalize telephony PATCH"`.
- Push: `git push origin main` (use your target branch if different).

## Rollback
- If needed: `git revert <commit_sha>` or reset branch to prior commit.

## Notes
- No DB schema changes; `npm run db:push` not required.
- Ensure `SIGNALWIRE_*` and `DIALER_DEFAULT_FROM_NUMBER` env vars remain set in deployment environment.