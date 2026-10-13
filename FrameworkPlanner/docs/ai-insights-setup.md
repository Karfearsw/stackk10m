# AI Insights Setup — High-Intent Lead Screener

This configures the Telnyx AI assistant to emit structured screening results
that the CRM auto-dispositions. Without this, the CRM falls back to regex
guessing on transcripts.

## What it does

After every AI-screened call, Telnyx runs these insights and POSTs the
structured results to the CRM webhook as `conversation_insight_result` events.
The CRM maps them to dispositions automatically:

| AI disposition | CRM disposition | Side effects |
|---|---|---|
| `qualified` | `qualified` | High-priority follow-up task (or human handoff in AI+handoff mode) |
| `not_interested` | `not_interested` | — |
| `callback_requested` | `callback_requested` | Callback task created |
| `voicemail` | `voicemail` | Auto-SMS follow-up |
| `no_answer` | `no_answer` | Auto-SMS follow-up |
| `busy` | `busy` | — |
| `wrong_number` | `wrong_number_confirmed` | — |
| `do_not_call` | `do_not_call` | Lead flagged DNC, suppressed everywhere |

## How "qualified" is determined

The Qualification insight scores the lead on four dimensions. A lead is
`qualified: true` when **all** of these hold:

1. **Intent** — the person expressed interest in selling, getting an offer, or
   learning what their property is worth (not just "not interested" or "wrong number")
2. **Property fit** — they own/control a property (not a renter, not a wrong number)
3. **Engagement** — they answered substantive questions (not a 10-second hangup)
4. **No disqualifiers** — didn't say "not interested," "don't call again," or "wrong number"

The insight returns a confidence score (0-1). The CRM treats ≥0.8 as high,
0.6-0.8 as medium, below 0.6 as low confidence.

## Portal setup (5 minutes)

1. Go to **AI Assistants** → open **High-Intent Lead Screener**
2. Go to the **Insights** tab → **Create Insight Group**
   - Name: `Lead Screening Disposition`
   - Webhook URL: `https://crm.oceanluxe.org/api/v1/telecom/webhooks/telnyx`
3. Add two insights to the group:

### Insight 1: Call Disposition
- Name: `disposition`
- Instructions:
  ```
  Analyze this real estate lead screening call. Determine the single best
  disposition from this list:
  - qualified: person wants to sell / get an offer / discuss their property value
  - not_interested: explicitly not interested in selling
  - callback_requested: wants a callback at a better time
  - voicemail: call went to voicemail, no conversation
  - no_answer: nobody picked up
  - busy: line was busy
  - wrong_number: not the right person / wrong number
  - do_not_call: asked not to be called again / opt out
  - connected: had a conversation but none of the above apply
  Return ONLY the disposition word.
  ```
- JSON Schema:
  ```json
  {
    "type": "object",
    "properties": {
      "disposition": {
        "type": "string",
        "enum": ["qualified", "not_interested", "callback_requested", "voicemail", "no_answer", "busy", "wrong_number", "do_not_call", "connected"]
      },
      "confidence": { "type": "number", "minimum": 0, "maximum": 1 },
      "summary": { "type": "string", "description": "One-sentence summary of the call outcome" }
    },
    "required": ["disposition", "confidence"]
  }
  ```

### Insight 2: Lead Qualification
- Name: `qualification`
- Instructions:
  ```
  Extract lead qualification details from this real estate screening call.
  - qualified: true ONLY if the person (1) expressed interest in selling or
    getting an offer, (2) owns or controls a property, (3) engaged in
    substantive conversation, (4) did not disqualify (not interested / DNC /
    wrong number).
  - intent: one of sell, buy, not_interested, callback, unknown
  - request_human: true if the person asked to speak to a human / real person
  - Extract property details, timeline, motivation if mentioned.
  ```
- JSON Schema:
  ```json
  {
    "type": "object",
    "properties": {
      "qualified": { "type": "boolean" },
      "confidence": { "type": "number", "minimum": 0, "maximum": 1 },
      "intent": { "type": "string", "enum": ["sell", "buy", "not_interested", "callback", "unknown"] },
      "request_human": { "type": "boolean" },
      "do_not_call": { "type": "boolean" },
      "motivation": { "type": "string" },
      "timeline": { "type": "string" },
      "property_type": { "type": "string" },
      "location": { "type": "string" },
      "budget": { "type": "string" },
      "summary": { "type": "string" }
    },
    "required": ["qualified", "intent"]
  }
  ```

4. **Attach the Insight Group to the assistant** (in the assistant's settings)
5. Make a test call → verify the CRM receives `conversation_insight_result`
   and the session auto-dispositions

## API alternative

If you prefer scripting it, use `scripts/setup-ai-insights.mjs` with
`TELNYX_API_KEY` in the environment. It creates the group, both insights,
sets the webhook, and attaches to the assistant.
