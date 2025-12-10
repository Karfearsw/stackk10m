## Mission & Scope
- Deliver an outbound/inbound dialer with calls + SMS, AI/human handoff, presence, contact lookup, full logging, and CRM‑ready integrations. Use SignalWire (FreeSWITCH core) for media/signaling and Messaging APIs, plus SwitchFree for contacts/presence.

## Phase 0 — Provisioning & Compliance
- Create/verify:
  - SignalWire Space: `SIGNALWIRE_PROJECT_ID`, `SIGNALWIRE_API_TOKEN`, `SIGNALWIRE_SPACE_URL`
  - Phone number(s) with voice + SMS, assigned to correct application/region.
  - 10DLC registration for US long‑code campaigns; opt‑in/opt‑out flows and brand/campaign data.
  - SwitchFree account + `SWITCHFREE_API_KEY` with contacts/presence enabled.
- Deliverable: Provisioning report with numbers, capabilities, and compliance status.

## Phase 1 — Architecture & Env
- Components:
  - **Client**: Dialer page (`/dialer`) with number input, controls, status, timer, contact/presence, history.
  - **Server**: Telephony APIs, webhooks, SwitchFree proxies, event consumer.
  - **Data**: `call_logs` table; optional `presence_status` cache.
- Env vars (server‑side only): `SIGNALWIRE_*`, `SWITCHFREE_API_KEY`, `DIALER_DEFAULT_FROM_NUMBER`, `DIALER_QUIET_HOURS`.
- Logging: Structured JSON (mask phone numbers), trace IDs (`requestId`), user context.

## Phase 2 — Server APIs (Specs)
- `POST /api/telephony/signalwire/token`
  - Input: `{ deviceType: 'browser' }`
  - Output: `{ token: string, expiresAt: string }`
  - Errors: `401` (auth), `500` (issuance failure)
- `POST /api/telephony/calls`
  - Input: `{ direction: 'outbound'|'inbound', number: string, contactId?: number, status: 'dialing', startedAt: string, metadata?: object }`
  - Output: `{ id: number }`
- `PATCH /api/telephony/calls/:id`
  - Input: `{ status: 'ringing'|'connected'|'ended'|'failed', endedAt?: string, durationMs?: number, errorCode?: string, errorMessage?: string }`
  - Output: `{ ok: true }`
- `GET /api/telephony/history?limit=50&offset=0&status&contactId`
  - Output: `{ items: CallLog[], total: number }`
- `GET /api/telephony/presence?number=+1XXXXXXXXXX`
  - Output: `{ available: boolean, lastSeenAt?: string }`
- `GET /api/telephony/contacts?query=John+Doe`
  - Output: `{ items: [{ id, name, numbers: string[] }] }`
- `POST /api/telephony/sms`
  - Input: `{ to: string, from: string, body: string }`
  - Output: `{ sid: string, status: 'queued'|'sent' }`
- Webhooks:
  - `POST /api/telephony/webhooks/signalwire/voice`
    - Payload (examples): `{ event: 'answered'|'hangup'|'no_answer'|'voicemail', callId, from, to, durationMs, disposition }`
  - `POST /api/telephony/webhooks/signalwire/messaging`
    - Payload (examples): `{ event: 'received'|'delivered'|'failed', sid, from, to, body, errorCode? }`
- All endpoints require auth; rate limited; logs masked: `+1******1234`.

## Phase 3 — Data Model (Drizzle)
- `call_logs` table:
  - Fields: `id, user_id, direction, number, contact_id, status, started_at, ended_at, duration_ms, error_code, error_message, metadata(json), created_at`
  - Indexes: `idx_call_logs_user_id`, `idx_call_logs_status`, `idx_call_logs_started_at`
- Optional `presence_status` cache: `number, available, last_seen_at, updated_at`

## Phase 4 — Dialer Client (Specs)
- Number input (E.164 validation), keypad, paste cleanup.
- Controls: Call, End, Mute/Unmute, DTMF; tooltips; disabled states; hotkeys.
- Status state machine: `idle → dialing → ringing → connected → ended|failed`.
- Timer: start on `connected`, stop on `ended`; persistent duration.
- Contact lookup: fetch via `/api/telephony/contacts?query=<number>`; select resolved contact.
- Presence: `/api/telephony/presence?number=<number>`; badge for availability.
- History: `/api/telephony/history`; filters by status/date/contact.
- Accessibility: labels, ARIA live regions for status; high contrast focus states; responsive.

## Phase 5 — Voice Call Flows
- **Outbound flow**:
  1. Validate number; respect quiet hours.
  2. Create `call_logs` with status `dialing`.
  3. Obtain SignalWire WebRTC token; connect browser; dial PSTN leg.
  4. Play script or AI agent greeting; branch:
     - Qualifies → bridge to human closer.
     - Not qualified → tag and end; optional SMS follow‑up.
  5. Update call log status/duration/disposition.
- **Inbound flow**:
  - Route inbound number to IVR or AI agent by time/campaign.
  - Collect fields: name/property/motivation/price/timeline; offer human handoff.
- **Dialplan (concept)**:
  ```xml
  <extension name="inbound_main">
    <condition field="destination_number" expression="^\d+$">
      <action application="answer"/>
      <action application="playback" data="ivr/intro.wav"/>
      <action application="bridge" data="user/human_closer"/>
    </condition>
  </extension>
  ```

## Phase 6 — Messaging
- **Outbound SMS (Compatibility API)**:
  - POST `https://{SPACE_URL}/api/laml/2010-04-01/Accounts/{PROJECT_ID}/Messages.json`
  - Form body: `From=+1XXXXXXXXXX&To=+1YYYYYYYYYY&Body=Hello ...`
  - Handle statuses via messaging webhook.
- **Inbound SMS (cXML)** attached to number:
  ```xml
  <Response>
    <Message>Thanks, we’ll call you shortly.</Message>
    <Route to="+1DESTINATION" body="{{Body}}" from="{{To}}"/>
  </Response>
  ```
- Templates: store outbound messages with opt‑in/opt‑out language; enforce brand/campaign compliance.

## Phase 7 — AI Agent Coordination
- Identity prompt: acquisitions assistant; questions: name/property/motivation/price/timeline; handoff rules.
- Log structured fields; push to backend via webhook after call/SMS.
- Respect quiet hours and opt‑out flags.

## Phase 8 — Eventing & CRM Integration
- Emit voice events (`answered`, `no_answer`, `voicemail`, `qualified`, `handoff`) and SMS events (`received`, `delivered`, `failed`).
- Webhook payload shape (example):
  ```json
  {
    "type": "call.disposition",
    "callId": 123,
    "number": "+1******1234",
    "status": "qualified",
    "durationMs": 182000,
    "fields": { "name": "John", "price": 245000, "timeline": "30d" },
    "at": "2025-12-09T17:12:00Z"
  }
  ```
- Upsert endpoints in Flipstackk backend (future): `/crm/events/call`, `/crm/events/sms`.

## Phase 9 — Security & Compliance
- Auth: all endpoints protected; scope server access; CSRF for POST.
- WebRTC: HTTPS only; short‑lived tokens (<5 min); server‑issued; no client secrets.
- Logging: mask phone numbers; exclude SMS bodies with PII from logs; configurable redaction.
- Regulatory: quiet hours, opt‑in/opt‑out keywords, brand identification in messages.

## Phase 10 — Monitoring & Health
- `/api/telephony/health`: check SignalWire token issuance, Messaging, SwitchFree presence.
- Metrics: call counts by status, average duration, SMS delivery rate, failure rates.
- Alerts: thresholds for token issuance errors, call failure spikes, SMS carrier rejects.

## Phase 11 — Testing
- Unit: number validation, state machine transitions, timer accuracy, UI reducers.
- Integration: token issuance, call lifecycle (dial→ring→connect→end), history pagination, presence/contacts proxy, outbound/inbound SMS, webhooks.
- Cross‑browser: Chrome/Firefox/Safari; validate WebRTC support and PSTN fallback.
- Performance: call setup latency (<2s target), UI update latency (<50ms), audio jitter monitoring.

## Phase 12 — Deployment
- Configure Vercel envs: `SIGNALWIRE_*`, `SWITCHFREE_API_KEY`.
- Attach cXML to SMS number(s); confirm number routing to dialplan/IVR.
- Enable AI agent settings in SignalWire; test inbound and outbound flows.
- Roll out to pilot users; monitor metrics; iterate.

## Deliverables
- Dialer page + route `/dialer`; navigation update (above Buyers).
- Server APIs: token, calls, history, presence, contacts, SMS, webhooks.
- Data model/migrations for `call_logs`; optional presence cache.
- cXML for inbound SMS; outbound SMS proxy; AI agent configuration.
- Tests and monitoring; security controls; documentation: API references, user guide, troubleshooting.
