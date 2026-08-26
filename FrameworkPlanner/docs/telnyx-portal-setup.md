# Telnyx Portal Setup Guide

This document provides step-by-step instructions for configuring each Telnyx communication channel in the OceanLuxe CRM.

---

## Voice (Click-to-Call / Dialer)

### Prerequisites
- Telnyx account with outbound calling enabled
- At least one voice-capable DID number assigned to your account

### Steps

1. **Log into the Telnyx Portal** → https://portal.telnyx.com

2. **Navigate to Call Control** → Connections → Create New Connection

3. **Create a Call Control Application**:
   - Name: `OceanLuxe CRM`
   - Webhook URL: `https://your-domain.com/api/v1/telecom/webhooks/telnyx`
   - Failover Webhook URL (optional): your backup webhook URL
   - Set the connection type to **Call Control Application** (NOT SIP Credential)

4. **Assign a voice-capable DID**:
   - Go to Numbers → Select your DID → Assign to the Call Control Application you just created

5. **Copy the Connection ID**:
   - The Connection ID is a **numeric** ID (e.g., `1826749520394856307`)
   - If your ID looks like a UUID (e.g., `a1b2c3d4-e5f6-...`), it's a SIP Credential — you need a Call Control Application instead

6. **Set environment variables**:
   ```
   TELNYX_CONNECTION_ID=1826749520394856307
   TELNYX_API_KEY=your-api-key
   TELNYX_DEFAULT_FROM_NUMBER=+1XXXXXXXXXX
   TELNYX_WEBHOOK_URL=https://your-domain.com/api/v1/telecom/webhooks/telnyx
   TELNYX_PUBLIC_KEY=your-public-key
   ```

7. **Verify in CRM**: Go to Settings → System → Voice card should show "Ready"

### Common Issues

| Issue | Cause | Fix |
|-------|-------|-----|
| "Connection not found" | Wrong connection ID | Use Call Control Application ID (numeric), not SIP Credential |
| "Invalid API key" | Wrong TELNYX_API_KEY | Generate a new API key in Telnyx Portal → API Keys |
| Call hangs up immediately | No outbound capability | Confirm DID has outbound voice enabled |
| "Connection inactive" | App not deployed | The Call Control Application must be in "active" state |

---

## SMS Messaging

### Prerequisites
- Telnyx account with messaging capability
- A DID number with SMS capability

### Steps

1. **Navigate to Messaging** → Profiles → Create New Profile

2. **Create a Messaging Profile**:
   - Name: `OceanLuxe CRM`
   - Add your SMS-capable DID to this profile

3. **Copy the Messaging Profile ID**:
   - Go to the profile details and copy the Profile ID

4. **Set environment variables**:
   ```
   TELNYX_MESSAGING_PROFILE_ID=your-messaging-profile-id
   ```

5. **Verify in CRM**: Settings → System → SMS card should show "Ready"

### Common Issues

| Issue | Cause | Fix |
|-------|-------|-----|
| "TELNYX_MESSAGING_PROFILE_ID is missing" | Env var not set | Set the profile ID |
| Messages not delivered | DID not in profile | Add DID to the messaging profile |
| 10DLC registration required | US long-code messaging | Register your brand and campaign with The Campaign Registry |

---

## Video Meetings

### Prerequisites
- Telnyx account with Video API access (may require beta enablement)

### Steps

1. **Confirm Video API access**:
   - Check Telnyx Portal → Video or contact support to enable

2. **Set environment variables**:
   ```
   TELNYX_VIDEO_ENABLED=true
   TELNYX_API_KEY=your-api-key
   ```

3. **Verify in CRM**: Settings → System → Video card should show "Ready"

### How Video Works in the CRM

1. A user clicks "Video Room" or "Create Meeting"
2. The CRM creates a room server-side via Telnyx API
3. A join token is generated for each participant (short-lived, secure)
4. Participants join using the token — no permanent secrets exposed to browser

### Common Issues

| Issue | Cause | Fix |
|-------|-------|-----|
| "Telnyx Video is not enabled" | TELNYX_VIDEO_ENABLED not set | Set to `true` |
| Room creation fails | No Video API access | Enable Video API in Telnyx portal |
| Token generation fails | Expired room or wrong ID | Verify room_id is correct and room is active |

---

## Email (Transactional)

### Option A: Resend (Recommended)

1. **Create a Resend account** → https://resend.com
2. **Generate an API key**
3. **Verify your sending domain** (add DNS records)
4. **Set environment variables**:
   ```
   RESEND_API_KEY=re_xxxxxxxxxx
   RESEND_FROM=noreply@yourdomain.com
   ```

### Option B: Telnyx Email API (Beta)

1. **Confirm Email API beta access** in Telnyx Portal
2. **Verify sending domain** or use shared domain
3. **Publish DNS records**: SPF, DKIM, MX, DMARC as required
4. **Set environment variables**:
   ```
   TELNYX_EMAIL_ENABLED=true
   EMAIL_FROM_ADDRESS=notifications@yourdomain.com
   EMAIL_FROM_NAME=OceanLuxe CRM
   ```

### Email in the CRM

- Contract signing emails use the configured email provider
- Listing shares, reminders, and notifications also use this provider
- The CRM will use Resend if available, Telnyx Email if configured and Resend is not

---

## Document Storage

### Steps

1. **Create an S3-compatible bucket** (AWS S3, Cloudflare R2, etc.)

2. **Set environment variables**:
   ```
   DOCUMENTS_BUCKET=your-bucket-name
   DOCUMENTS_REGION=us-east-1
   DOCUMENTS_ACCESS_KEY_ID=your-key-id (optional for IAM roles)
   DOCUMENTS_SECRET_ACCESS_KEY=your-secret (optional for IAM roles)
   ```

3. **Verify in CRM**: Settings → System → Document Storage card should show "Ready"

---

## Feature Flags

Set these environment variables to `true` to enable optional features:

| Variable | Feature |
|----------|---------|
| `FEATURE_ESIGN` | Electronic signatures for contracts |
| `FEATURE_VIDEO_MEETINGS` | Video meeting creation |
| `FEATURE_PUBLIC_LISTINGS` | Public listing pages |
| `FEATURE_RVM` | Ringless voicemail campaigns |
| `FEATURE_SKIP_TRACE` | Lead skip tracing |
| `FEATURE_CAMPAIGNS` | Campaign management |
| `FEATURE_FIELD_MODE` | Field agent mode |
| `FEATURE_COMPS` | Property comparisons |
| `FEATURE_BUYER_MATCH` | Automated buyer matching |
| `FEATURE_VOICE_PLAYGROUND` | Voice research playground |
| `FEATURE_AI_ASSISTANT` | AI lead screener on calls |

---

## AI Assistant (High-Intent Lead Screener)

Telnyx Inference AI assistants can be attached to an active Call Control call
via the `ai_assistant_start` command. The CRM uses this for the **High-Intent
Lead Screener**: it qualifies intent, budget, location, timeline, and contact
preferences, and streams transcripts back as `ai_assistant.message_history_updated`
webhooks.

### Portal steps

1. Go to **AI Assistants** in Mission Control and open **High-Intent Lead Screener**.
2. Copy its **Assistant ID** (a UUID) from the detail page.
3. Paste it into **Settings → System → AI Assistant** (editable field, saved to
   `app_settings` in the database) and toggle **Enable AI Screener** on — no
   `.env` edit required. Alternatively set `TELNYX_AI_ASSISTANT_ID` to that
   UUID and `FEATURE_AI_ASSISTANT=true` in the environment.
4. Make sure the Call Control Application (`TELNYX_CONNECTION_ID`) is the one
   used for outbound dialing so the assistant can be attached to active calls.

### Configuration precedence

The CRM resolves the AI assistant config from two layers:

1. **`app_settings` (DB)** — values saved from Settings → System. These win.
2. **Environment** — `TELNYX_AI_ASSISTANT_ID` / `FEATURE_AI_ASSISTANT`.

Admin-only API:

- `GET /api/settings/telecom/ai-assistant` — effective config + source
- `PUT /api/settings/telecom/ai-assistant` — `{ "assistantId": "…", "enabled": true }`

Both changes are recorded in the activity/audit log.

### How it works in the CRM

- **Manual start**: Dialer / Phone → active call → **Start AI Screener**.
- **Auto-start**: enable **AI Screener** toggle in the Power Dialer card to
  start the assistant automatically on answered calls.
- **Transcripts**: `ai_assistant.message_history_updated` webhooks update the
  call log transcript and append an `[AI Screener …]` block to the linked
  lead's notes (deduped by event id).
- **Qualification**: when the assistant qualifies a lead (intent sell/offer/
  interested, or a structured `qualified: true`), the lead's motivation is set
  and a high-priority **AI Screener follow-up** task is created.
- **Stop**: **Stop AI Screener** on an active call, or when the call ends.

### API

`POST /api/telephony/outbound/:callControlId/ai-assistant`

```json
{ "action": "start", "assistantId": "<assistant-uuid>" }
{ "action": "stop" }
```

Errors: `403 AI_ASSISTANT_DISABLED` (flag off), `400 MISSING_ASSISTANT_ID`,
`503 TELNYX_NOT_CONFIGURED`.

---

## Verification Checklist

After configuring all channels, verify in Settings → System:

- [ ] Voice: "Ready" (green badge)
- [ ] SMS: "Ready" (green badge)
- [ ] Video: "Ready" or "Not enabled" (depending on access)
- [ ] Email: "Active (resend)" or "Active (telnyx)"
- [ ] Document Storage: "Ready" or "Not configured"
- [ ] Webhook: "Configured"
- [ ] Feature Flags: All flags showing correct state
- [ ] AI Assistant: "Ready" when flag + Assistant ID configured

### Manual QA

1. **One test call**: Phone page → Dial a number → See ringing → Hangup → Verify call log
2. **One test SMS**: Leads page → Send SMS → Verify activity log
3. **One meeting**: Calendar → Video Room → Create → Verify room appears → Join
4. **One email**: Contract detail → Send → Verify email delivered
5. **One AI screener call**: Dial a lead → Start AI Screener on the active call →
   speak with the assistant → verify the transcript lands on the call log and
   lead notes, and a follow-up task appears when qualified
6. **System Health**: Settings → System → All cards render correctly

## Two-Legged Click-to-Dial + AI Screening (migration 0056)

The two-leg flow is the recommended dialer path. Each telephone party is a
separate Telnyx leg; the CRM only bridges legs after confirmed answers.

### Required env / settings

| Variable | Purpose |
|---|---|
| `ENABLE_TWO_LEG_CLICK_TO_DIAL` | Master flag (default `true`) |
| `ENABLE_AI_SCREENING` | AI-first calling (default `true`) |
| `ENABLE_AI_HUMAN_HANDOFF` | AI → human bridge (default `true`) |
| `TELNYX_AGENT_PHONE` | Optional fallback agent number; per-user setting in the dialer wins |
| `TELNYX_AI_ASSISTANT_ID` | High-Intent Lead Screener assistant UUID (or set in Settings → System) |

### Agent phone setup

1. Dialer Workspace → **Two-Leg Call** card → **Edit** next to "Your phone".
2. Enter your mobile number in E.164 form (e.g. `+14155550123`) and save.
   It is stored in `crm_agent_phone_settings`, masked in the UI, never exposed
   in full to other users.
3. Human call and AI + handoff modes require this number; AI screen does not.

### Telnyx portal prerequisites (unchanged)

- Call Control Application with the CRM webhook URL
  (`https://crm.oceanluxe.org/api/v1/telecom/webhooks/telnyx`).
- `TELNYX_CONNECTION_ID` = Call Control Application ID, not a SIP credential.
- Outbound-capable number assigned to the app (`TELNYX_DEFAULT_FROM_NUMBER`).
- AI assistant: AI Assistants → High-Intent Lead Screener → copy Assistant ID.

### Smoke test

1. **Human-first**: pick a lead with a valid phone → Two-Leg Call → mode
   **Human call** → Call. Your phone rings. Answer → the lead's phone rings.
   Lead answers → you hear the bridge. End call → status flips to
   `completed`, disposition `connected`, timeline gains the events.
2. **Agent no-answer**: start a human call and let your phone ring out → the
   lead leg is never dialed; session closes with `agent_unavailable`.
3. **AI screen**: mode **AI screen** → Call → the AI speaks with the lead and
   you watch `ai_screening` → a follow-up task appears when qualified.
4. **AI + handoff**: mode **AI + handoff** → while screening, press
   **Request human** (or the lead asks for a human) → your phone rings →
   answer → you are bridged into the live conversation.
5. **DNC**: disposition `do_not_call` (or the AI hears an opt-out) → the lead
   is immediately suppressed and future calls/SMS are blocked.

### Troubleshooting

- `AGENT_PHONE_REQUIRED` → set your phone in the Two-Leg Call card.
- Session stuck on `bridging` → check the webhook endpoint received
  `call.bridged`; confirm the Call Control Application webhook URL is live.
- `bridge_failed` disposition → both legs answered but Telnyx rejected the
  bridge; check the number/connection is outbound-capable for both legs.
- AI never starts → Settings → System → AI Assistant: paste the Assistant ID
  and enable the toggle; readiness must show Ready.
