## Overview
- Add a production-ready Dialer page and route (`/dialer`) positioned above Buyers in navigation.
- Implement browser calling using SignalWire WebRTC with REST fallback.
- Integrate SwitchFree for contacts, call history, and presence.
- Provide testing, security, monitoring, and documentation for maintainable rollout.

## Architecture
- **Client (React + Wouter + shadcn/ui)**: `DialerPage` composed of input, controls, status, timer, history, and presence components.
- **Server (Express)**:
  - `POST /api/telephony/signalwire/token` issues short-lived SignalWire WebRTC tokens.
  - `POST /api/telephony/calls` persists call logs and statuses.
  - `GET /api/telephony/history` paginates call history; `GET /api/telephony/presence` returns presence snapshots.
  - SwitchFree proxy endpoints for contact lookup and status.
- **Data**: New `call_logs` table (Drizzle) for auditing; optional `presence_status` for real-time snapshots.
- **Session**: Active call session stored in memory + persisted in `call_logs` with `start_time`, `end_time`, `status`, `duration_ms`.

## UI Components
- **DialerNumberInput**: masked input, E.164 validation, paste handling, keypad.
- **DialerControls**: Call/End/Mute/Unmute/DTMF; disabled states during transitions.
- **DialerStatus**: current state (idle, dialing, ringing, connected, ended, failed) + error messages.
- **DialerTimer**: connected time; stops on end; persists to history.
- **ContactLookup**: integrates SwitchFree to resolve number to known contact; shows presence.
- **CallHistory**: paginated list; filters by date, status, contact; retrieve from server.
- **PresenceIndicator**: real-time presence via SwitchFree; poll interval or websocket.

## Routing & Navigation
- Add `Route path="/dialer"` protected route.
- Update `Sidebar` to insert Dialer above Buyers.
- Ensure deep links and back navigation consistent with existing patterns.

## APIs (Server)
- `POST /api/telephony/signalwire/token`
  - Input: `{ deviceType: 'browser' }`
  - Output: `{ token, expiresAt }`
- `POST /api/telephony/calls`
  - Input: `{ direction, number, contactId?, status, startedAt, endedAt?, durationMs?, errorCode?, errorMessage? }`
  - Output: `{ id }`
- `PATCH /api/telephony/calls/:id`
  - Updates status, endedAt, duration, error.
- `GET /api/telephony/history?limit&offset&status&contactId`
  - Returns call log paginated.
- `GET /api/telephony/presence?number`
  - Returns `{ available: boolean, lastSeenAt }` from SwitchFree.
- `GET /api/telephony/contacts?query`
  - SwitchFree-backed lookup returning normalized contacts.

## Data Model & Migration (Drizzle)
- `call_logs` fields: `id, user_id, direction, number, contact_id, status, started_at, ended_at, duration_ms, error_code, error_message, metadata, created_at`.
- Indexes: `idx_call_logs_user_id`, `idx_call_logs_status`, `idx_call_logs_started_at`.
- Optional `presence_status`: `number, available, last_seen_at, updated_at`.

## SDK Integration
- **SignalWire**:
  - Use `@signalwire/webrtc` for browser dialer.
  - Server signs tokens using `SIGNALWIRE_PROJECT_ID`, `SIGNALWIRE_API_TOKEN`, `SIGNALWIRE_SPACE_URL`.
  - Client establishes WebRTC call with token; handle events: `onConnected`, `onDisconnected`, `onError`, `onRinging`.
  - REST fallback via `@signalwire/realtime-api` for status queries when WebRTC not supported.
- **SwitchFree**:
  - SDK for contacts and presence: `SWITCHFREE_API_KEY` server-side; server proxies requests to avoid exposing keys.
  - Client calls server endpoints for lookup and presence; server caches results briefly.

## Call Session Management
- Client state machine: `idle → dialing → ringing → connected → ended|failed`.
- Persist start on dialing; patch end state with duration and errors.
- Protect against duplicate sessions using a unique `clientSessionId` and server dedup on open calls.

## Error Handling & Logging
- Client: toast + inline errors; retry for transient network.
- Server: structured logs (requestId, userId, action, outcome); mask PII (only last 4 of numbers in logs).
- Graceful failure paths for token issuance, call setup, and SwitchFree calls.

## Security & Compliance
- Auth: Only authenticated users can call APIs; session tied to user.
- WebRTC: enforce HTTPS; use short-lived tokens; scope to voice permissions.
- Secrets: store in env (`SIGNALWIRE_*`, `SWITCHFREE_API_KEY`); never log secrets.
- Data masking: numbers obfuscated in logs; avoid storing call audio; encrypt sensitive metadata at rest if required.

## Monitoring
- Metrics: counts of calls by status, average call duration, failure rate.
- Health: `/api/telephony/health` returns API connectivity statuses.
- Alerts: error rate threshold triggers notification.

## Testing Strategy
- Unit tests: input validation, state machine transitions, timer accuracy, reducers.
- Integration tests: server endpoints, token issuance, call log lifecycle, SwitchFree contact/presence proxy.
- Cross-browser: Chromium, Firefox, Safari; verify WebRTC support and fallbacks.
- Performance: measure connection setup time, audio jitter; ensure UI updates under 50ms and pipeline refresh ≤1s.

## Deployment Instructions
- Env vars (Vercel): `SIGNALWIRE_PROJECT_ID`, `SIGNALWIRE_API_TOKEN`, `SIGNALWIRE_SPACE_URL`, `SWITCHFREE_API_KEY`.
- HTTPS enforced; browser calling requires TLS.
- Rate limits for contact/presence endpoints; caching layer for presence lookups.

## Documentation Deliverables
- Technical doc: API references for telephony endpoints; SDK setup notes.
- User guide: dialing steps, indicators, contact resolution, history, troubleshooting.
- Ops runbook: handling call failures, token issuance troubleshooting, presence inconsistencies.

## Incremental Implementation Steps
1. Create Dialer UI and route; update navigation.
2. Implement server token issuance and call logs endpoints.
3. Integrate SignalWire WebRTC in client; REST fallback.
4. Add SwitchFree-backed contact and presence proxies; client wiring.
5. Add tests (unit/integration) and CI hooks; cross-browser checks.
6. Add migrations and metrics endpoints; finalize docs.
7. Deploy with envs; monitor initial use and iterate.
