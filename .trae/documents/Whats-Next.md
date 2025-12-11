# Flipstackk Dialer – What’s Next

## Priorities

1. Finalize WebRTC calling
   - Implement client call controls (mute, hold, transfer)
   - Handle call state events and timers
   - Persist call outcomes and durations in `call_logs`

2. SignalWire routing
   - Configure inbound numbers to point to `/api/telephony/voice/webhook`
   - Set SMS webhook to `/api/telephony/sms/webhook`
   - Verify Voice+SMS capability on all configured numbers

3. Deployment
   - Deploy to Vercel and set `PORT`, `DATABASE_URL`, `SESSION_SECRET`
   - Set `SIGNALWIRE_SPACE_URL`, `SIGNALWIRE_PROJECT_ID`, `SIGNALWIRE_API_TOKEN`
   - Configure `DIALER_DEFAULT_FROM_NUMBER` and `DIALER_NUMBERS_JSON`

4. Security & compliance
   - Enforce auth on all telephony endpoints
   - Add webhook signature verification for SignalWire
   - Review logs and PII handling; mask phone numbers where appropriate

5. Testing
   - Add integration tests for `/api/search`, telephony endpoints
   - Browser tests for search overlay and dialer flows
   - Load tests for high-traffic pages (dashboard, opportunities)

6. Performance
   - Split large client bundles with code-splitting
   - Cache common lists (leads, contacts) with HTTP caching headers
   - Add DB indexes for frequently queried fields (e.g., `contacts.name`, `leads.address`)

## Verification Checklist

- `/api/telephony/health` returns `db: connected`, SignalWire reachability
- `/api/search` aggregates leads, opportunities, contacts
- Header search overlay shows results and navigates correctly
- `call_logs` table exists and history endpoint returns data
- Token endpoint issues short-lived JWTs using `jose`

## Operational Notes

- Route order is correct: API first, then Vite catch-all
- Sessions use Postgres store; ensure `session` table exists in Neon
- Background automation runs every 60s; keep interval configurable
