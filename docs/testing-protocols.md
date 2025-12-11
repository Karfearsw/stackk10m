# Testing Protocols

## Test Types
- Unit tests: schema validation, helpers.
- API integration: Express routes via `supertest`.
- UI smoke: navigation and key components render.

## Setup
- Runner: `vitest`.
- Command: `npx vitest run`.

## AI Readiness Tests
- `GET /api/ai/config` returns structure `{ ready, missing }`.
- `GET /api/ai/ping` returns `{ ok: true }` when configured, `{ ok: false }` otherwise.

## External Providers
- Do not call external APIs in unit/integration tests.
- Mock provider behavior; validate configuration presence only.

