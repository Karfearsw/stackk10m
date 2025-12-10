## Inputs Received
- SignalWire Project: `PROJECT_ID`, `SPACE_URL`, `API_TOKEN` (server-side only)
- Neon DB: use shared CRM connection with `sslmode=require` (remove `channel_binding=require`)
- Numbers:
  - `+1 (324) 202-2760` id: `b18f7071-f2aa-4139-8425-a3d0a687c4f2`
  - `+1 (231) 406-0943` id: `3acba3bb-3385-456f-95b9-cc00dae46d8c`

## Configuration Plan
1. Environment Variables (Server-only)
- `SIGNALWIRE_PROJECT_ID`, `SIGNALWIRE_SPACE_URL`, `SIGNALWIRE_API_TOKEN`
- `DATABASE_URL`: Neon pooler URL with `sslmode=require` (no channel binding)
- `DIALER_DEFAULT_FROM_NUMBER`: `+12314060943`
- `DIALER_NUMBERS_JSON`: `[{"id":"3acba3bb-3385-456f-95b9-cc00dae46d8c","number":"+12314060943"},{"id":"b18f7071-f2aa-4139-8425-a3d0a687c4f2","number":"+13242022760"}]`

2. Number Capabilities & Assignment
- Set `+12314060943` as primary outbound Voice/SMS (default FROM)
- Verify both numbers are enabled for Voice and SMS in SignalWire Space
- Document capabilities per number for routing decisions

3. Inbound Routing (Voice)
- Route both numbers to the main dialplan/IVR:
  - Business hours → AI greeting → qualify → bridge to human closer
  - After hours → voicemail or callback SMS
- Log call events (answered, no-answer, disposition) to Neon `call_logs`

4. Inbound SMS (cXML)
- Attach cXML script to each SMS-capable number:
  - Auto-reply: “Thanks, we’ll call you shortly.”
  - Optional forward to an ops number/team
  - Log inbound messages and delivery status via messaging webhook

5. Outbound SMS (Compatibility API)
- Use `DIALER_DEFAULT_FROM_NUMBER` as `From`
- Enforce opt-in/opt-out language; track delivery status and failures

6. DB Connectivity
- Configure `DATABASE_URL` (Neon pooler + `sslmode=require`)
- Health check: `/api/health` runs `SELECT 1`
- Confirm `call_logs` writes and reads

7. Security & Compliance
- Secrets: server-only; never expose to client
- Mask phone numbers in logs; redact sensitive SMS bodies
- Quiet hours, brand/campaign and 10DLC compliance for US long code

8. Verification
- Outbound call from `+12314060943` to a test number; observe states and logs
- Inbound call to both numbers; IVR/AI path and logging
- Inbound/outbound SMS flows; confirm webhook status logging

## Next Actions (Upon Approval)
- Add env vars locally and in Vercel
- Attach cXML to numbers; set inbound voice routing
- Run health checks and end-to-end tests for calls and SMS