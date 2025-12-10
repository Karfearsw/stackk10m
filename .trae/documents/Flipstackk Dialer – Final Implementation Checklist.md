## Environment & Secrets
- Set server env: `SIGNALWIRE_PROJECT_ID`, `SIGNALWIRE_SPACE_URL`, `SIGNALWIRE_API_TOKEN`.
- Set `DATABASE_URL` (Neon pooler) with `sslmode=require` and remove `channel_binding=require`.
- Set `DIALER_DEFAULT_FROM_NUMBER`=`+12314060943` and `DIALER_NUMBERS_JSON` with both numbers.
- Store secrets only server-side; never expose to client.

## SignalWire Numbers & Routing
- Verify both numbers have Voice+SMS capability.
- Inbound voice: route both to main IVR/AI; business-hours → AI greet → qualify → bridge; after-hours → voicemail/SMS callback.
- Document capability differences for routing decisions.

## Messaging (Inbound/Outbound)
- Outbound SMS via Compatibility API proxy (`POST /api/telephony/sms`).
- Attach cXML to each SMS-capable number;
  ```xml
  <Response>
    <Message>Thanks, we’ll call you shortly.</Message>
    <Route to="+12314060943" body="{{Body}}" from="{{To}}"/>
  </Response>
  ```
- Implement messaging webhook handlers with signature verification and fast `200 OK` responses.

## Server Endpoints & Data
- Telephony endpoints in place: calls create/patch, history, contacts, presence (placeholder), SMS proxy.
- Add `GET /api/telephony/health` to check DB connectivity and SignalWire reachability.
- Use shared Neon DB; confirm `call_logs` table and apply indexes as needed.

## WebRTC Calling (Next Increment)
- Add `POST /api/telephony/signalwire/token` to issue short-lived WebRTC tokens.
- Client: integrate `@signalwire/webrtc` to dial PSTN leg; drive UI state transitions (`dialing → ringing → connected → ended|failed`).

## Client Dialer UI
- Numeric keypad (`0–9`, `*`, `#`, `+`), formatted number input, call start/end controls.
- Contacts search/filter and "Dial" actions.
- Call history with timestamps and durations.
- Accessibility: ARIA labels, focus states, responsive layout.

## Testing & Verification
- Health: `/api/health` → DB `ok`; `/api/telephony/health` → SignalWire reachable.
- Voice: outbound from `+12314060943`; inbound to both numbers; verify IVR/AI and logs.
- SMS: outbound delivery + inbound cXML auto-reply; verify webhooks and audit trail.
- Cross-browser (Chrome/Firefox/Safari) and performance (setup latency, UI responsiveness).

## Security & Compliance
- Mask numbers in logs; redact SMS bodies with PII.
- Enforce quiet hours and 10DLC opt-in/opt-out language on US long codes.
- Token lifetimes < 5 minutes; rate limit telephony endpoints.

## Deployment
- Add envs in Vercel; redeploy.
- Attach cXML and voice routing in SignalWire dashboard.
- Run end-to-end checks; monitor metrics and error rates.

## Deliverables
- Working Dialer page `/dialer` with call logging, contacts, history, SMS proxy.
- Inbound cXML scripts active; voice routing configured.
- WebRTC integration and health endpoint added.
- Documentation: env setup, routing, API references, troubleshooting.