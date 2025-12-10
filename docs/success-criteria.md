# Success Criteria

## System Readiness
- Preview environment runs with no runtime errors.
- `GET /api/health` returns `200`.
- `GET /api/metrics` returns metrics text.

## AI Readiness
- `GET /api/ai/config` reports `ready: true` when all SignalWire env vars are present; lists missing when not.
- `GET /api/ai/ping` responds with `{ ok: true }` when configured.

## Testing
- All tests pass via `npx vitest run`.

## Security & Logging
- No secrets logged.
- Errors captured with statuses; no unhandled exceptions during preview.

