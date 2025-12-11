## Diagnosis
- The client fails with `TypeError: (void 0) is not a function` during SignalWire setup, which maps to calling a missing method on the client returned by `@signalwire/js`.
- Current code uses `createClient` and `dialPhone` with event names like `signalwire.ready` and `call.state` (`client/src/hooks/useSignalWire.ts:43–89`, `91–127`). The installed `@signalwire/js@3.29.1` exposes the newer Browser SDK API that instantiates with `SignalWire({ token })` and dials with `client.dial(...)`. This mismatch causes the runtime `undefined is not a function` error when invoking methods that don’t exist.
- The telephony update endpoint returns `400` when patching `/api/telephony/calls/:id` (`server/routes.ts:575–585`). The client sends `endedAt` as an ISO string (`client/src/pages/dialer.tsx:108–113`), but the DB column is a timestamp and the route doesn’t coerce it to a `Date`, leading to a DB type error.

## Changes (Client)
- Replace dynamic import usage to instantiate with `SignalWire({ token })` and use `client.dial({ to, from })` instead of `dialPhone`.
- Remove `client.connect()` and event names tied to the legacy Realtime SDK; the new API uses `client.online(...)` for incoming invites and returns a `Call` with state handlers for outbound.
- Add guards before invoking SDK methods to avoid `TypeError` if the SDK fails to load.
- Update call state propagation to use the `Call` object returned by `dial` (set `ringing/active/finished`) so Dialer status remains consistent (`client/src/pages/dialer.tsx`).

## Changes (Server)
- In `PATCH /api/telephony/calls/:id` (`server/routes.ts:575–585`), coerce date-like fields: if `patch.endedAt` (or `startedAt`) is a string, convert to `new Date(...)`; ensure `durationMs` is a number.
- Keep metadata normalization as-is; no schema restrictions on `status`.

## Validation
- Start the app and place an outbound call; confirm no `TypeError` and that status transitions update as expected in Dialer.
- Confirm `/api/telephony/calls/:id` returns `200` on PATCH with `endedAt` and `durationMs`.
- Verify `/api/telephony/signalwire/token` responds with token and `from` number; ensure env `SIGNALWIRE_*` and `DIALER_DEFAULT_FROM_NUMBER` are set.

## Rollback Safety
- Client change is isolated to `useSignalWire.ts`; server change is a small patch in the route. Both are low-risk and reversible.

## Next Steps
- Proceed to implement the client hook update and the server PATCH coercion.
- Re-test Dialer flows and call logging end-to-end.