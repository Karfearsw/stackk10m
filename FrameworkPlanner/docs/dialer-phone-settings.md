# Per-User Dialer Phone Settings (Ticket 8)

Each user configures their own dialer phone settings. They are stored on the
existing `crm_agent_phone_settings` row (one per user) and consumed by the
two-leg click-to-dial state machine.

## Fields

| Field | Column | Notes |
| --- | --- | --- |
| Agent phone | `phone_e164` | The number the user's agent leg is dialed to. Required for `human_first` and `ai_screen_handoff`. |
| Caller ID | `caller_id_e164` | The outbound number a lead/buyer sees. Optional — falls back to `TELNYX_DEFAULT_FROM_NUMBER`. |
| Default call mode | `default_call_mode` | `human_first` \| `ai_screen` \| `ai_screen_handoff`. |
| Recording default | `recording_enabled` | Whether this user's dialer calls are recorded by default. |
| Verified | `verified` | Reserved for a future number-verification flow; untouched by edits. |

## API

- `GET /api/v1/telecom/agent-phone` → `{ phoneE164, callerIdE164, defaultCallMode, recordingEnabled, verified }`
- `PUT /api/v1/telecom/agent-phone` → validates and normalizes to E.164, merges onto
  the stored row (so a caller-ID-only save keeps the agent phone), and returns 400
  with `errors` when a number or mode is invalid.

Validation/normalization lives in `server/dialer/user-settings.ts` (pure, unit
tested in `tests/dialer-user-settings.test.ts`): US 10/11-digit numbers are
upgraded to E.164, blank caller IDs mean "use the platform default".

## Where it takes effect

- `server/services/telecom/call-sessions.ts` resolves the outbound caller ID per
  user via `resolveCallerId(userId)` for the agent leg, the lead leg, and the AI
  handoff leg — falling back to the platform default when unset or unreadable.
- `client/src/components/telnyx/TwoLegCallPanel.tsx` edits the agent phone,
  caller ID, and recording default.

## Migration

`0078_agent_phone_caller_id.sql` adds `caller_id_e164` and `recording_enabled`
(additive, idempotent). The same `ALTER TABLE ... IF NOT EXISTS` runs at startup
in `server/app.ts` for older databases.

## Still needs vendor/host input

Placing a real call requires an active Telnyx connection and numbers
(`TELNYX_CONNECTION_ID`, `TELNYX_DEFAULT_FROM_NUMBER` / approved caller IDs).
Verifying a chosen caller ID against the Telnyx account is not possible without
that account access, so live call placement/branding remains owner/vendor-gated.
