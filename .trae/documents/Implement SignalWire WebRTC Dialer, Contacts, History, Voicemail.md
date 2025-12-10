## Scope & Goals
- Add real SignalWire WebRTC calling with secure server-side token provisioning.
- Build Contacts page with CRUD, search/filter, and speed-dial assignment.
- Build History page backed by server persistence with filters and quick redial.
- Build Voicemail page with playback and optional transcription.
- Maintain current architecture: React + Vite frontend, Express + Drizzle on PostgreSQL backend.

## Backend Implementation
- **Config & Secrets**
  - Use environment vars: `SIGNALWIRE_SPACE_URL`, `SIGNALWIRE_PROJECT_ID`, `SIGNALWIRE_API_TOKEN`.
  - Validate via existing `GET /api/ai/config` readiness; never log secrets.
- **WebRTC Token Provisioning**
  - Endpoint: `POST /api/dialer/token` → returns short-lived SignalWire auth token.
  - Input: `deviceId` (optional), `userId` (from session) to scope permissions.
  - Rate-limit and require authenticated session.
- **Data Model (Drizzle)**
  - `contacts`: id, userId, name, phone, avatarUrl, notes, isFavorite, speedDialSlot, createdAt, updatedAt.
  - `call_logs`: id, userId, contactId (nullable), direction, phone, status, startedAt, endedAt, durationSec, recordingUrl (nullable), notes.
  - `voicemail`: id, userId, fromPhone, toPhone, receivedAt, durationSec, audioUrl, transcriptionText (nullable), isRead.
- **Routes**
  - Contacts: `GET/POST/PATCH/DELETE /api/contacts`, with `?q=` search and pagination.
  - History: `GET /api/calls` (filters: `direction`, `dateFrom`, `dateTo`, `contactId`, `q`), `POST /api/calls` (log updates from client), `GET /api/calls/:id`.
  - Voicemail: `GET /api/voicemail` (pagination + filters), `GET /api/voicemail/:id`, `PATCH /api/voicemail/:id/read`, optional `POST /api/voicemail/:id/transcribe`.
- **Services**
  - `signalwire.ts`: thin adapter to request WebRTC token using `SIGNALWIRE_*` envs; later extend for call events and voicemail retrieval.
- **Security & Observability**
  - Session required for all dialer/contacts/history/voicemail endpoints.
  - Helmet already enabled; keep error handling consistent.
  - Metrics: increment counters for token requests and call log writes.

## Frontend Implementation
- **Dialer Page Enhancements**
  - Keypad grid with `0–9`, `*`, `#` buttons; haptic-like feedback.
  - Number display with international formatting and backspace/clear.
  - Call controls: call, end, mute, hold; reflect real-time state via SignalWire client SDK.
  - Speed-dial tiles sourced from contacts `speedDialSlot`.
  - Integration flow: request token → init SignalWire WebRTC client → place call.
- **Contacts Page**
  - Table/List view with avatar, name, phone; search input with client-side filter backed by server query.
  - Add/Edit/Delete modals; assign `speedDialSlot` 1–9.
- **History Page**
  - Paginated call log; filters for date range, direction, contact; quick redial action.
  - Shows duration, status, timestamps; link to related contact.
- **Voicemail Page**
  - List messages with caller info, duration, timestamp.
  - Playback controls with progress; mark-as-read; optional transcription toggle when available.
- **Routing & Navigation**
  - Add pages: `contacts.tsx`, `history.tsx`, `voicemail.tsx`.
  - Register routes in `App.tsx` and add entries to `Sidebar.tsx`.
- **UX & Accessibility**
  - Use existing shadcn/ui components; maintain project styling.
  - Keyboard navigation, ARIA labels for call status changes.

## Testing
- **Unit**
  - Server: token provisioning service (mock SignalWire), schema validation, filters.
  - Client: number formatter, dialer state transitions.
- **Integration**
  - Contacts CRUD and search endpoints via `supertest`.
  - Call logs list and write; voicemail list and mark-as-read.
  - Auth-required access checks.
- **E2E-lite**
  - Simulate token request and client init (mock SDK) to validate UI flows.
- **Commands**
  - `npx vitest run` for CI; extend `FrameworkPlanner/tests` with new specs.

## Preview & Deployment
- **Dev**: `npm run dev` → `http://localhost:3000/` for client + API.
- **Prod-like**: `npm run build` then `PORT=3001 npm start` → `http://localhost:3001/`.
- **Env Setup**: add SignalWire vars and `DATABASE_URL` (remove `channel_binding=require` in hosted environments if necessary).

## Success Criteria
- Dialer places and manages calls via SignalWire WebRTC with server-issued token.
- Contacts CRUD and search work; speed-dial integrates in Dialer.
- History persists and filters; quick redial works.
- Voicemail lists, plays audio, marks as read; transcription appears when configured.
- Test suite passes; no secrets logged; preview servers stable.

## Confirmation
Shall I proceed to implement the backend routes and storage, integrate the SignalWire token provisioning, and build the Contacts/History/Voicemail pages, along with tests and preview verification?