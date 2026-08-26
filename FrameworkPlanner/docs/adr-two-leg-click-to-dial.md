# ADR: Two-Legged Click-to-Dial with AI Screening + Human Handoff

Status: Implemented (migration 0056)
Date: 2026-08-26
Related: docs/telnyx-portal-setup.md, migration 0053 (webhook hardening)

## Context

The power dialer previously created a single Telnyx call leg to the lead. The
agent had no audio path — fine for AI screening, wrong for human conversation.
We need a human-first dialer where the agent's own phone rings first, the lead
is dialed only after the agent answers, and both legs are bridged only after
both answer. We also need AI-first calling with safe auto-disposition and a
human handoff.

## Decisions

### 1. Model each party as a separate Telnyx call leg
`crm_call_sessions` stores `agent_leg_call_control_id`, `lead_leg_call_control_id`
(and `ai_leg_call_control_id`, which for now equals the lead leg). Transitions
are driven **only** by signed Telnyx `call.*` webhooks — never by API responses.

### 2. Bridge via Telnyx Call Control `bridge` action
Verified against the Telnyx Call Commands API reference:
`POST /v2/calls/{cc_id}/actions/bridge` with `{ call_control_id: otherLeg, prevent_double_bridge: true }`.
Telnyx fires `call.bridged` for both legs. A session carries exactly one
`bridge_request_id`; the bridge command is issued at most once (guards on both
`leadAnsweredAt` and `bridgeRequestId`).

### 3. Human-first state machine
queued → agent_dialing → agent_ringing → agent_answered → lead_dialing →
lead_ringing → bridging → connected → completed.
- Lead is dialed only after `call.answered` on the agent leg.
- Bridge only after `call.answered` on both legs.
- If the agent hangs up before answering: no lead leg is ever dialed.
- If the lead never answers: agent leg is hung up, disposition = no_answer/busy/abandoned.

### 4. AI-first lifecycle (ai_screen / ai_screen_handoff)
The AI dials the lead directly. On `call.answered` the session enters
`ai_screening` and `ai_assistant_start` is issued on the lead leg (assistant ID
from Settings → System or env, resolved by `ai-config.ts`).
- **ai_screen**: AI auto-dispositions only high-confidence outcomes; qualified
  leads get a follow-up task. Low-confidence wrong-number goes to review, never
  silently suppresses the lead.
- **ai_screen_handoff**: on `request_human` / `qualified`, the backend dials the
  assigned agent, and on the agent's `call.answered` bridges the live lead leg
  to the agent. `ai_assistant_stop` is the operator's "turn AI off" path.

### 5. Idempotency
- Webhooks are deduped by provider event id (`processed_webhook_events`).
- Session transitions validate the current status before applying; terminal
  statuses (`completed`/`failed`/`cancelled`) reject further changes.
- Exactly one bridge request per session; exactly one lead leg per session.
- All side effects (activity, task, disposition) are created once per transition.

### 6. Data model (migration 0056)
`crm_call_sessions`, `crm_call_session_events`, `crm_agent_phone_settings`,
`crm_call_dispositions`, `crm_ai_call_qualifications`. Tenant/user isolation via
`initiating_user_id` / `assigned_agent_user_id` checks (`canAccessSession`).

### 7. Permissions
Session read/control requires the initiating or assigned agent, or superadmin.
The browser can never supply a Telnyx API key, connection ID, from-number, or
arbitrary `call_control_id` — all commands look up the session server-side by
leg id after ownership checks.

### 8. Error recovery
- Dial errors → `failed` + activity, never a phantom `connected`.
- Bridge failure → `bridge_failed` disposition; agent is told truthfully.
- Handoff agent unavailable → session returns to `handoff_requested`, activity
  notes the failure, and a callback task is created.

## Feature flags
- `ENABLE_TWO_LEG_CLICK_TO_DIAL` (default ON)
- `ENABLE_AI_SCREENING` (default ON)
- `ENABLE_AI_HUMAN_HANDOFF` (default ON)

## Consequences
- Single-leg surfaces (`/api/telephony/outbound/dispatch`) remain untouched and
  keep working alongside the session machine.
- The webhook router now dispatches `call.*` and `ai_assistant.*` events to both
  the legacy call-log handler and the session machine; each is idempotent and
  no-throw.
- A migration is required (`npm run migrate`) before the new tables exist.
