## Scope

* Add a single "System Health" button in Settings

* Build a new System Health page with comprehensive diagnostics

## UI

* Update `client/src/pages/settings.tsx` to include one button: “System Health” → navigates to `/system/health`

* Create `client/src/pages/system-health.tsx`

  * Fetch `GET /api/system/health`

  * Render sections:

    * Environment: `NODE_ENV`, required env vars present/missing

    * Database: connectivity status

    * Telephony: SignalWire reachability, configured numbers, default from

    * Sessions: session store operational

    * Background Worker: automation worker running status

    * Build Info: commit id, start time

    * API Liveness: key endpoints reachable (auth, leads, telephony)

  * Show “Next Steps” (prioritized checklist) computed from the diagnostics

  * Actions: Refresh, Copy JSON

## Server

* Add `GET /api/system/health`

  * Compose diagnostics by:

    * Pinging DB via `storage.getUserByEmail()`

    * Reusing SignalWire health logic from `/api/telephony/health`

    * Verifying presence of `SESSION_SECRET`, `EMPLOYEE_ACCESS_CODE`, `DATABASE_URL`, `SIGNALWIRE_*`, `DIALER_DEFAULT_FROM_NUMBER`

    * Checking session store (pg-simple) via a lightweight query to the `session` table

    * Reporting background worker “started”/interval (from `startAutomationWorker`)

    * Building `nextSteps`: array of recommended actions based on any warnings/missing values

  * Return JSON `{ status, env, db, signalwire, sessions, worker, build, endpoints, nextSteps, timestamp }`

## Routing

* Update `client/src/App.tsx` to add protected route `/system/health` → SystemHealthPage

## Tests

* Add vitest to confirm `/api/system/health` returns expected fields

## Verification

* Click Settings → System Health; confirm all sections render

* Trigger health checks: DB connected, SignalWire reachable, sessions OK

  <br />

## Notes

* No dependencies added; markdown rendering not required

* Keeps a single entry point for health plus guidance;

