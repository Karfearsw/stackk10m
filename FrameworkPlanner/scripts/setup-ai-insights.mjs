#!/usr/bin/env node
/**
 * Creates the Telnyx AI Insight Group for lead screening auto-disposition.
 *
 * Usage:
 *   TELNYX_API_KEY=KEY... ASSISTANT_ID=assistant-... node scripts/setup-ai-insights.mjs
 *
 * Creates:
 *  1. Insight Group "Lead Screening Disposition" with CRM webhook URL
 *  2. "disposition" insight (JSON schema → CRM disposition mapping)
 *  3. "qualification" insight (JSON schema → qualified/intent/fields)
 *  4. Attaches the group to the assistant
 */

const API_KEY = process.env.TELNYX_API_KEY;
const ASSISTANT_ID = process.env.ASSISTANT_ID || "assistant-c4d6eca4-d7a2-4465-9f65-437cf5063d59";
const WEBHOOK_URL = process.env.WEBHOOK_URL || "https://crm.oceanluxe.org/api/v1/telecom/webhooks/telnyx";

if (!API_KEY) {
  console.error("TELNYX_API_KEY required");
  process.exit(1);
}

const headers = {
  Authorization: `Bearer ${API_KEY}`,
  "Content-Type": "application/json",
};

async function api(method, path, body) {
  const res = await fetch(`https://api.telnyx.com/v2${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(`${method} ${path} → ${res.status}: ${JSON.stringify(data).slice(0, 300)}`);
  }
  return data.data;
}

// 1. Create insight group
console.log("Creating insight group...");
const group = await api("POST", "/ai/insights/groups", {
  name: "Lead Screening Disposition",
  webhook_url: WEBHOOK_URL,
  // webhook_failover_url: (optional backup)
});
console.log(`  Group: ${group.id}`);

// 2. Disposition insight
console.log("Creating disposition insight...");
const dispInsight = await api("POST", `/ai/insights/groups/${group.id}/insights`, {
  name: "disposition",
  instructions: `Analyze this real estate lead screening call. Determine the single best disposition from this list:
- qualified: person wants to sell / get an offer / discuss their property value
- not_interested: explicitly not interested in selling
- callback_requested: wants a callback at a better time
- voicemail: call went to voicemail, no conversation
- no_answer: nobody picked up
- busy: line was busy
- wrong_number: not the right person / wrong number
- do_not_call: asked not to be called again / opt out
- connected: had a conversation but none of the above apply
Return ONLY the disposition word.`,
  json_schema: {
    type: "object",
    properties: {
      disposition: {
        type: "string",
        enum: ["qualified", "not_interested", "callback_requested", "voicemail", "no_answer", "busy", "wrong_number", "do_not_call", "connected"],
      },
      confidence: { type: "number", minimum: 0, maximum: 1 },
      summary: { type: "string" },
    },
    required: ["disposition", "confidence"],
  },
});
console.log(`  Insight: ${dispInsight.id}`);

// 3. Qualification insight
console.log("Creating qualification insight...");
const qualInsight = await api("POST", `/ai/insights/groups/${group.id}/insights`, {
  name: "qualification",
  instructions: `Extract lead qualification details from this real estate screening call.
- qualified: true ONLY if the person (1) expressed interest in selling or getting an offer, (2) owns or controls a property, (3) engaged in substantive conversation, (4) did not disqualify (not interested / DNC / wrong number).
- intent: one of sell, buy, not_interested, callback, unknown
- request_human: true if the person asked to speak to a human / real person
- Extract property details, timeline, motivation if mentioned.`,
  json_schema: {
    type: "object",
    properties: {
      qualified: { type: "boolean" },
      confidence: { type: "number", minimum: 0, maximum: 1 },
      intent: { type: "string", enum: ["sell", "buy", "not_interested", "callback", "unknown"] },
      request_human: { type: "boolean" },
      do_not_call: { type: "boolean" },
      motivation: { type: "string" },
      timeline: { type: "string" },
      property_type: { type: "string" },
      location: { type: "string" },
      budget: { type: "string" },
      summary: { type: "string" },
    },
    required: ["qualified", "intent"],
  },
});
console.log(`  Insight: ${qualInsight.id}`);

// 4. Attach to assistant
console.log(`Attaching group to assistant ${ASSISTANT_ID}...`);
await api("PATCH", `/ai/assistants/${ASSISTANT_ID}`, {
  insight_group_id: group.id,
});
console.log("Done. Make a test call to verify insights flow to the CRM webhook.");
