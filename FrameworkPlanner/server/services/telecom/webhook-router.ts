import { Router } from "express";
import { pool } from "../../db.js";
import { sql } from "drizzle-orm";
import { telnyx } from "./telnyx-client.js";
import { storage } from "../../storage.js";
import { createTask } from "../tasks/task-service.js";
import { emitTelephonyEventToAll } from "../../telephony/ws.js";
import { handleWebhookEvent as handleSessionCallEvent, handleAiSessionEvent as handleSessionAiEvent } from "./call-sessions.js";
import { getRvmAudioUrl } from "../rvm/provider.js";

export function createTelnyxWebhookRouter() {
  const router = Router();

  router.post("/", async (req, res) => {
    try {
      const signatureHeader = String(
        req.headers["telnyx-signature-ed25519"] || req.headers["telnyx-signature"] || "",
      );
      const rawBody: Buffer = Buffer.isBuffer((req as any).rawBody)
        ? (req as any).rawBody
        : Buffer.from(JSON.stringify(req.body || {}));

      // When a public key is configured, reject unsigned/invalid webhooks so
      // forged events never mutate call logs or leads.
      if (process.env.TELNYX_PUBLIC_KEY) {
        if (!signatureHeader || !telnyx.verifyWebhookSignature(rawBody, signatureHeader)) {
          return res.status(401).json({ error: "Invalid webhook signature" });
        }
      }

      const event = req.body || {};
      const eventType = String(event?.data?.event_type || event?.event_type || "unknown");
      const eventId = String(event?.data?.id || event?.id || event?.data?.event_id || "");

      // Process inline: on serverless (Vercel) the function is frozen as soon
      // as the response is sent, so setImmediate/setTimeout background work
      // never runs. Await the (idempotent) processing before responding so the
      // call state machine actually advances in production.
      if (!(await claimEvent(eventId, eventType))) {
        return res.status(200).json({ received: true, eventType, duplicate: true });
      }
      try {
        if (eventType.startsWith("call.")) {
          await handleCallEvent(event);
          await handleSessionCallEvent(event);
          await handleRvmCallEvent(event, eventType);
        } else if (eventType.startsWith("message.")) {
          await handleMessageEvent(event);
        } else if (eventType.startsWith("ai_assistant.")) {
          await handleAiAssistantEvent(event);
          await handleSessionAiEvent(event);
        }
      } catch (err) {
        console.error("Telnyx webhook processing error:", err);
        // Release the idempotency claim so a Telnyx retry can reprocess.
        try {
          if (eventId) {
            await pool.query(`DELETE FROM processed_webhook_events WHERE event_id = $1`, [eventId]);
          }
        } catch { /* ignore */ }
      }
      res.status(200).json({ received: true, eventType });
    } catch (error: any) {
      console.error("Telnyx webhook error:", error);
      // Always acknowledge to prevent Telnyx retries
      res.status(200).json({ received: true });
    }
  });

  return router;
}

// ── RVM drop lifecycle (real Telnyx answering-machine detection) ──────────

// client_state on RVM dials carries { kind: "rvm", audioAssetId } (base64).
function decodeRvmClientState(raw: unknown): { audioAssetId: number | null } {
  try {
    const b64 = String(raw || "");
    if (!b64) return { audioAssetId: null };
    const json = JSON.parse(Buffer.from(b64, "base64").toString("utf8"));
    if (json?.kind !== "rvm") return { audioAssetId: null };
    const id = Number(json.audioAssetId);
    return { audioAssetId: Number.isFinite(id) ? id : null };
  } catch {
    return { audioAssetId: null };
  }
}

/**
 * Drives a real ringless-voicemail drop over Call Control:
 *  - call.machine.greeting.ended / call.machine.ended → play audio into the voicemail box
 *  - call.human.detected → hang up immediately (a human answered; never drop VM audio on a person)
 *  - call.playback.ended → hang up, mark the drop sent (voicemail actually left)
 *  - call.hangup → mark failed unless it already completed via playback
 *  - call.answered / call.initiated → keep the row in "sending"
 */
async function handleRvmCallEvent(event: any, eventType: string): Promise<void> {
  const payload = event?.data?.payload || event?.payload || {};
  const callControlId = String(payload.call_control_id || payload.callControlId || "");
  if (!callControlId) return;
  const { audioAssetId } = decodeRvmClientState(payload.client_state);

  try {
    const rowRes = await pool.query(
      `SELECT id, campaign_id, status FROM rvm_drops WHERE provider_id = $1 ORDER BY id DESC LIMIT 1`,
      [callControlId],
    );
    const row = (rowRes as any).rows?.[0];

    if (eventType === "call.machine.greeting.ended" || eventType === "call.machine.ended") {
      const assetId = audioAssetId ?? row?.campaign_id ?? null;
      if (!assetId) return;
      const audioUrl = await getRvmAudioUrl(Number(assetId)).catch(() => null);
      if (!audioUrl) {
        console.error(JSON.stringify({ ts: new Date().toISOString(), event: "rvm_webhook", kind: "audio_url_failed", callControlId }));
        return;
      }
      await telnyx.playbackStart(callControlId, audioUrl);
      if (row?.id) {
        await pool.query(`UPDATE rvm_drops SET status = 'sending' WHERE id = $1`, [row.id]);
      }
      return;
    }

    if (eventType === "call.human.detected") {
      // A real person answered — hang up and record the truth (no voicemail left).
      await telnyx.hangup(callControlId).catch(() => {});
      if (row?.id) {
        await pool.query(
          `UPDATE rvm_drops SET status = 'failed', error = 'human_answered', completed_at = NOW() WHERE id = $1`,
          [row.id],
        );
      }
      return;
    }

    if (eventType === "call.playback.ended" || eventType === "call.playback.finished") {
      await telnyx.hangup(callControlId).catch(() => {});
      if (row?.id) {
        await pool.query(
          `UPDATE rvm_drops SET status = 'sent', completed_at = NOW() WHERE id = $1`,
          [row.id],
        );
      }
      return;
    }

    if (eventType === "call.hangup" || eventType === "call.hangup.completed") {
      const cause = String(payload.hangup_cause || payload.hangupCause || "").toLowerCase();
      const already = row?.status === "sent" || row?.status === "failed";
      if (row?.id && !already) {
        await pool.query(
          `UPDATE rvm_drops SET status = 'failed', error = $2, completed_at = NOW() WHERE id = $1`,
          [row.id, cause || "hangup_before_voicemail"],
        );
      }
      return;
    }

    if (eventType === "call.answered" || eventType === "call.initiated") {
      if (row?.id && row.status === "queued") {
        await pool.query(`UPDATE rvm_drops SET status = 'sending' WHERE id = $1`, [row.id]);
      }
      return;
    }
  } catch (e: any) {
    console.error(JSON.stringify({ ts: new Date().toISOString(), event: "rvm_webhook", kind: "handler_failed", eventType, message: String(e?.message || e) }));
  }
}

// ── Idempotency ────────────────────────────────────────────────────────────

async function claimEvent(eventId: string, eventType: string): Promise<boolean> {
  if (!eventId) return true;
  try {
    const result = await pool.query(
      `INSERT INTO processed_webhook_events (event_id, event_type)
       VALUES ($1, $2)
       ON CONFLICT (event_id) DO NOTHING
       RETURNING event_id`,
      [eventId, eventType],
    );
    return Boolean((result as any).rows?.length);
  } catch {
    // Dedupe table unavailable (migration not applied yet) — process anyway.
    return true;
  }
}

// ── Call log lookup ────────────────────────────────────────────────────────

async function findCallLogByControlId(callControlId: string): Promise<any | null> {
  try {
    const exact = await pool.query(
      `SELECT id, started_at, user_id, status, lead_id, metadata, transcript
       FROM call_logs
       WHERE call_control_id = $1
       ORDER BY id DESC
       LIMIT 1`,
      [callControlId],
    );
    if ((exact as any).rows?.[0]?.id) return (exact as any).rows[0];

    // Legacy rows created before migration 0053: match via metadata JSON text.
    const like = await pool.query(
      `SELECT id, started_at, user_id, status, lead_id, metadata, transcript
       FROM call_logs
       WHERE metadata::text LIKE $1
       ORDER BY id DESC
       LIMIT 1`,
      [`%${callControlId}%`],
    );
    return (like as any).rows?.[0] || null;
  } catch (e) {
    console.error("Failed to find call log by callControlId:", e);
    return null;
  }
}

function maskNumber(n: string): string {
  const s = String(n || "");
  if (s.length <= 7) return s;
  return s.slice(0, s.length - 7) + "•••" + s.slice(-4);
}

async function findInboundByAgentLeg(agentLegCc: string): Promise<any | null> {
  try {
    const result = await pool.query(
      `SELECT id, call_control_id, metadata FROM call_logs
       WHERE direction = 'inbound' AND metadata::text LIKE $1
       ORDER BY id DESC LIMIT 1`,
      [`%"agentLegCc":"${agentLegCc}"%`],
    );
    const row = (result as any).rows?.[0];
    if (!row) return null;
    let meta: any = {};
    try { meta = typeof row.metadata === "string" ? JSON.parse(row.metadata) : row.metadata || {}; } catch { meta = {}; }
    return { id: Number(row.id), callControlId: String(row.call_control_id || ""), metadata: meta };
  } catch (e) {
    console.error("findInboundByAgentLeg failed:", e);
    return null;
  }
}
// ── Parked-outbound WebRTC dialer (WebRTC browser leg → PSTN leg) ─────────

// The browser softphone attaches this client_state to newCall(); the SIP
// credential connection must have "Park Outbound Calls" enabled so the parked
// leg arrives here with the same client_state, and we dial + bridge the PSTN
// leg (https://developers.telnyx.com/docs/voice/webrtc/use-cases/outbound-dialer).
function decodeWebrtcDialClientState(raw: unknown): { destinationNumber: string | null; userId: number | null } {
  try {
    const b64 = String(raw || "");
    if (!b64) return { destinationNumber: null, userId: null };
    const json = JSON.parse(Buffer.from(b64, "base64").toString("utf8"));
    if (json?.kind !== "webrtc_dial") return { destinationNumber: null, userId: null };
    const dest = String(json.destinationNumber || "").trim() || null;
    const uid = Number(json.userId);
    return { destinationNumber: dest, userId: Number.isFinite(uid) && uid > 0 ? uid : null };
  } catch {
    return { destinationNumber: null, userId: null };
  }
}

function parseCallLogMeta(raw: unknown): Record<string, any> {
  if (!raw) return {};
  if (typeof raw === "object") return raw as Record<string, any>;
  try { return JSON.parse(String(raw)) || {}; } catch { return {}; }
}

function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (m) => `\\${m}`);
}

function eventTypeIs(expected: string, event: any): boolean {
  return String(event?.data?.event_type || event?.event_type || "") === expected;
}

// Most recent dialer-registered call log not yet bound to a call leg.
async function findPendingWebrtcDialLog(userId: number | null, destination: string): Promise<any | null> {
  try {
    const result = await pool.query(
      `SELECT id, user_id, metadata FROM call_logs
       WHERE call_control_id IS NULL
         AND metadata::text LIKE '%"webrtcPending":true%'
         AND metadata::text LIKE $1
       ORDER BY id DESC
       LIMIT 1`,
      [`%${escapeLike(destination)}%`],
    );
    return (result as any).rows?.[0] || null;
  } catch (e) {
    console.error("findPendingWebrtcDialLog failed:", e);
    return null;
  }
}

// Compliance: re-verify do-not-call at the webhook, independent of the UI.
async function isDncBlockedDestination(destination: string): Promise<boolean> {
  try {
    const digits = String(destination).replace(/\D/g, "");
    const last10 = digits.slice(-10);
    if (last10.length < 7) return false;
    const leads = await pool.query(
      `SELECT 1 FROM leads
       WHERE do_not_call = true
         AND regexp_replace(COALESCE(owner_phone, ''), '\\D', '', 'g') LIKE $1
       LIMIT 1`,
      [`%${last10}%`],
    );
    if ((leads as any).rows?.length) return true;
    const contacts = await pool.query(
      `SELECT 1 FROM contacts
       WHERE do_not_call = true
         AND regexp_replace(COALESCE(phone, ''), '\\D', '', 'g') LIKE $1
       LIMIT 1`,
      [`%${last10}%`],
    );
    return Boolean((contacts as any).rows?.length);
  } catch (e) {
    console.error("isDncBlockedDestination failed (non-blocking):", e);
    return false;
  }
}

async function handleParkedWebrtcLeg(payload: any, browserLegCc: string) {
  const { destinationNumber, userId } = decodeWebrtcDialClientState(payload.client_state);
  if (!destinationNumber) return; // not a dialer-initiated parked leg
  const log = await findPendingWebrtcDialLog(userId, destinationNumber);
  try {
    if (await isDncBlockedDestination(destinationNumber)) {
      await telnyx.hangup(browserLegCc).catch(() => {});
      if (log?.id) {
        await pool.query(
          `UPDATE call_logs SET status = 'failed', ended_at = NOW(),
             metadata = $1 WHERE id = $2`,
          [JSON.stringify({ ...parseCallLogMeta(log.metadata), webrtcPending: false, error: "do_not_call" }), log.id],
        );
      }
      return;
    }
    const dial = await telnyx.dial({ to: destinationNumber, from: String(process.env.TELNYX_DEFAULT_FROM_NUMBER || "") });
    if (log?.id) {
      const meta = parseCallLogMeta(log.metadata);
      await pool.query(
        `UPDATE call_logs
         SET call_control_id = $1, status = 'ringing', metadata = $2
         WHERE id = $3`,
        [
          browserLegCc,
          JSON.stringify({ ...meta, webrtcPending: false, webrtcCallControlId: browserLegCc, pstnCallControlId: dial.callControlId }),
          log.id,
        ],
      );
    }
    emitTelephonyEventToAll({
      type: "call_state_changed",
      payload: { callControlId: browserLegCc, state: "ringing", direction: "outbound" },
    } as any);
  } catch (e: any) {
    console.error("Parked WebRTC → PSTN dial failed:", e);
    await telnyx.hangup(browserLegCc).catch(() => {});
    if (log?.id) {
      await pool.query(
        `UPDATE call_logs SET status = 'failed', ended_at = NOW(),
           metadata = $1 WHERE id = $2`,
        [JSON.stringify({ ...parseCallLogMeta(log.metadata), webrtcPending: false, error: String(e?.message || e) }), log.id],
      ).catch(() => {});
    }
  }
}

// ── Call Events ────────────────────────────────────────────────────────────

async function handleCallEvent(event: any) {
  // Telnyx envelope: { data: { event_type, id, payload: { ... } } }
  const payload = event?.data?.payload || event?.data || event;
  const callControlId = String(payload.call_control_id || "");
  const from =
    payload.from?.phone_number ||
    (typeof payload.from === "string" ? payload.from : null) ||
    payload.source_number ||
    payload.from_number ||
    null;
  const toRaw = payload.to;
  const to =
    (Array.isArray(toRaw) ? toRaw[0]?.phone_number || toRaw[0] : toRaw?.phone_number || toRaw) ||
    payload.destination_number ||
    payload.to_number ||
    null;
  const state = payload.call_state || payload.state;
  const direction = payload.direction || "outbound";

  if (!callControlId) return;

  // Parked-outbound WebRTC dialer: when the parked browser leg arrives, dial
  // the PSTN leg now; bridge the two when the PSTN leg answers (below).
  if (eventTypeIs("call.initiated", event) && String(state || "").toLowerCase() === "parked") {
    await handleParkedWebrtcLeg(payload, callControlId);
    return;
  }

  // PSTN leg answered: bridge it to the parked WebRTC leg — this is where
  // audio starts flowing both ways.
  if (eventTypeIs("call.answered", event) && String(state || "").toLowerCase() === "answered") {
    const exact = await findCallLogByControlId(callControlId);
    const meta = parseCallLogMeta(exact?.metadata);
    if (meta.webrtcCallControlId) {
      try {
        await telnyx.bridge(meta.webrtcCallControlId, callControlId, { preventDoubleBridge: true });
        await pool.query(
          `UPDATE call_logs SET metadata = $1 WHERE id = $2`,
          [JSON.stringify({ ...meta, bridged: true, bridgedAt: new Date().toISOString() }), exact.id],
        );
        emitTelephonyEventToAll({
          type: "call_state_changed",
          payload: { callControlId: meta.webrtcCallControlId, state: "active", direction: "outbound", bridgedTo: callControlId },
        } as any);
      } catch (e) {
        console.error("PSTN → WebRTC bridge failed:", e);
      }
    }
  }

  const statusMap: Record<string, string> = {
    ringing: "ringing",
    answering: "ringing",
    answered: "answered",
    completed: "ended",
    failed: "failed",
    busy: "failed",
    no_answer: "missed",
  };

  const internalStatus = statusMap[state] || state;

  const found = await findCallLogByControlId(callControlId);
  let existingLogId: number | null = found?.id ? Number(found.id) : null;
  let existingCreatedAt: Date | null = found?.started_at ? new Date(found.started_at) : null;

  // Terminal guard: never downgrade an already-recorded terminal state
  // (e.g. a late "ringing" webhook arriving after "ended").
  if (existingLogId && found?.status) {
    const current = String(found.status);
    const terminal = new Set(["ended", "failed", "missed"]);
    if (terminal.has(current) && !terminal.has(internalStatus)) return;
  }

  // If no existing log found and this is an inbound call, create one
  if (!existingLogId && direction === "inbound" && (internalStatus === "ringing" || internalStatus === "answered")) {
    try {
      const createResult = await pool.query(
        `INSERT INTO call_logs (user_id, direction, number, status, started_at, call_control_id, metadata)
         VALUES (0, 'inbound', $1, $2, NOW(), $3, $4)
         RETURNING id, created_at`,
        [
          from || "unknown",
          internalStatus,
          callControlId,
          JSON.stringify({ callControlId, direction: "inbound" }),
        ],
      );
      const newRow = (createResult as any).rows?.[0];
      if (newRow?.id) {
        existingLogId = Number(newRow.id);
        existingCreatedAt = newRow.created_at ? new Date(newRow.created_at) : null;
      }
    } catch (e) {
      console.error("Failed to create inbound call log from webhook:", e);
    }
  }

  // Update existing call log
  if (existingLogId) {
    try {
      const endedAt =
        internalStatus === "ended" || internalStatus === "failed" || internalStatus === "missed"
          ? new Date()
          : null;
      const durationMs =
        endedAt && existingCreatedAt
          ? Math.max(0, Date.now() - existingCreatedAt.getTime())
          : null;

      await pool.query(
        `UPDATE call_logs
         SET status = $1,
             ended_at = COALESCE($2, ended_at),
             duration_ms = COALESCE($3, duration_ms),
             call_control_id = COALESCE($4, call_control_id)
         WHERE id = $5`,
        [internalStatus, endedAt, durationMs, callControlId, existingLogId],
      );

      // Log activity for terminal states
      const terminal = new Set(["answered", "missed", "failed", "ended"]);
      if (terminal.has(internalStatus)) {
        try {
          await pool.query(
            `INSERT INTO global_activity_logs (user_id, action, description, metadata, created_at)
             VALUES ($1, $2, $3, $4, NOW())`,
            [
              found?.user_id ? Number(found.user_id) : 0,
              `call_${internalStatus}`,
              `Inbound call ${internalStatus}: ${from || "unknown"}`,
              JSON.stringify({
                callLogId: existingLogId,
                callControlId,
                from,
                to,
                direction,
                status: internalStatus,
              }),
            ],
          );
        } catch (e) {
          console.error("Failed to log call activity:", e);
        }
      }
    } catch (e) {
      console.error("Failed to update call log from webhook:", e);
    }
  }

  // Inbound: notify agents of the ringing call (matched to a lead when possible)
  if (direction === "inbound" && internalStatus === "ringing") {
    try {
      const lead = from ? await storage.getLeadByPhone(String(from)) : undefined;
      emitTelephonyEventToAll({
        type: "inbound_call_ringing",
        payload: {
          callControlId,
          from,
          maskedFrom: maskNumber(String(from || "")),
          leadId: lead?.id ?? null,
          leadName: lead?.ownerName || null,
          leadPhone: lead?.ownerPhone || null,
          ts: Date.now(),
        },
      } as any);
    } catch (e) {
      console.error("Inbound ring notification failed:", e);
    }
  }
  if (direction === "inbound" && (internalStatus === "ended" || internalStatus === "missed" || internalStatus === "failed")) {
    emitTelephonyEventToAll({ type: "inbound_call_ended", payload: { callControlId, status: internalStatus } } as any);
  }

  // Inbound accept flow: when the claimed agent's leg answers, bridge to the inbound leg
  if (internalStatus === "answered" && direction === "outbound") {
    try {
      const inbound = await findInboundByAgentLeg(callControlId);
      if (inbound?.callControlId && inbound.callControlId !== callControlId) {
        await telnyx.bridge(callControlId, inbound.callControlId, { preventDoubleBridge: true });
        await pool.query(
          `UPDATE call_logs SET status = 'answered', metadata = $1 WHERE id = $2`,
          [JSON.stringify({ ...inbound.metadata, bridged: true, bridgedAt: new Date().toISOString() }), inbound.id],
        );
        emitTelephonyEventToAll({
          type: "call_state_changed",
          payload: { callControlId: inbound.callControlId, state: "answered", direction: "inbound", bridgedTo: callControlId },
        } as any);
      }
    } catch (e) {
      console.error("Inbound → agent bridge failed:", e);
    }
  }
  // Emit real-time event
  emitTelephonyEventToAll({
    type: "call_state_changed",
    payload: { callControlId, state: internalStatus, from, to, direction },
  } as any);
}

// ── Message Events ─────────────────────────────────────────────────────────

async function handleMessageEvent(event: any) {
  // Telnyx envelope: { data: { event_type, id, payload: { from, to, text } } }
  const payload = event?.data?.payload || event?.data || event;
  const from =
    payload.from?.phone_number ||
    (typeof payload.from === "string" ? payload.from : null) ||
    null;
  const toRaw = payload.to;
  const to = Array.isArray(toRaw) ? toRaw[0]?.phone_number || toRaw[0] : toRaw?.phone_number || toRaw || null;
  const body = payload.text || payload.body;
  const direction = payload.direction || "inbound";
  const eventType = event?.data?.event_type || event?.event_type || "unknown";
  const messageId = payload.id || payload.message_id || "";

  if (!from || !to) return;

  // Handle delivery status updates
  if (
    eventType === "message.delivered" ||
    eventType === "message.delivery_update" ||
    eventType === "message.sent" ||
    eventType === "message.failed"
  ) {
    try {
      const statusMap: Record<string, string> = {
        "message.delivered": "delivered",
        "message.delivery_update": "delivery_update",
        "message.sent": "sent",
        "message.failed": "failed",
      };
      const status = statusMap[eventType] || eventType;

      await pool.query(
        `INSERT INTO global_activity_logs (user_id, action, description, metadata, created_at)
         VALUES ($1, $2, $3, $4, NOW())`,
        [
          0,
          "sms_status_update",
          `SMS ${status}: ${from} → ${to}`,
          JSON.stringify({ from, to, direction, status, messageId, eventType }),
        ],
      );
      // Reflect delivery state on the persisted message row (idempotent).
      if (messageId) {
        try {
          await pool.query(
            `UPDATE crm_sms_messages SET status = $1 WHERE provider_message_id = $2`,
            [status, messageId],
          );
        } catch (e) {
          console.error("Failed to update SMS message status:", e);
        }
      }
    } catch (e) {
      console.error("Failed to log SMS delivery status:", e);
    }
    return;
  }

  // Handle inbound messages (message.received or message.inbound)
  try {
    // Try to match destination number to a lead
    let leadId: number | null = null;
    try {
      const toDigits = String(to || "").replace(/\D/g, "");
      if (toDigits.length >= 7) {
        const last10 = toDigits.slice(-10);
        const leadResult = await pool.query(
          "SELECT id FROM leads WHERE regexp_replace(COALESCE(owner_phone, ''), '\\D', '', 'g') LIKE $1 ORDER BY id DESC LIMIT 1",
          [`%${last10}`],
        );
        const leadRow = (leadResult as any).rows?.[0];
        if (leadRow?.id) leadId = Number(leadRow.id);
      }
    } catch {}

    // Try to match source number to a lead (inbound from known seller)
    let fromLeadId: number | null = null;
    try {
      const fromDigits = String(from || "").replace(/\D/g, "");
      if (fromDigits.length >= 7) {
        const last10 = fromDigits.slice(-10);
        const leadResult = await pool.query(
          "SELECT id FROM leads WHERE regexp_replace(COALESCE(owner_phone, ''), '\\D', '', 'g') LIKE $1 ORDER BY id DESC LIMIT 1",
          [`%${last10}`],
        );
        const leadRow = (leadResult as any).rows?.[0];
        if (leadRow?.id) fromLeadId = Number(leadRow.id);
      }
    } catch {}

    const effectiveLeadId = fromLeadId || leadId;

    // Try to match the source number to a buyer (inbound from a known buyer)
    let buyerId: number | null = null;
    try {
      const fromDigits = String(from || "").replace(/\D/g, "");
      if (fromDigits.length >= 7) {
        const last10 = fromDigits.slice(-10);
        const buyerResult = await pool.query(
          "SELECT id FROM buyers WHERE regexp_replace(COALESCE(phone, ''), '\\D', '', 'g') LIKE $1 ORDER BY id DESC LIMIT 1",
          [`%${last10}`],
        );
        const buyerRow = (buyerResult as any).rows?.[0];
        if (buyerRow?.id) buyerId = Number(buyerRow.id);
      }
    } catch {}

    await pool.query(
      `INSERT INTO global_activity_logs (user_id, action, description, metadata, created_at)
       VALUES ($1, $2, $3, $4, NOW())`,
      [
        0,
        direction === "inbound" ? "sms_received" : "sms_sent",
        String(body || "(no content)"),
        JSON.stringify({
          from,
          to,
          body,
          direction,
          messageId,
          leadId: effectiveLeadId || undefined,
        }),
      ],
    );

    // Persist the inbound message row for the conversation thread view.
    // Skip when there is no provider message id (cannot dedupe redeliveries).
    if (messageId && direction === "inbound") {
      try {
        const existing: any = await pool.query(
          `SELECT 1 FROM crm_sms_messages WHERE provider_message_id = $1 LIMIT 1`,
          [messageId],
        );
        if (!(existing as any).rows?.length) {
          await pool.query(
            `INSERT INTO crm_sms_messages
               (user_id, lead_id, buyer_id, direction, from_number, to_number, body, status, provider_message_id, metadata, created_at)
             VALUES (0, $1, $2, 'inbound', $3, $4, $5, 'received', $6, $7, NOW())`,
            [
              effectiveLeadId,
              buyerId,
              String(from),
              String(to),
              String(body || ""),
              messageId,
              JSON.stringify({ eventType, from, to, messageId, leadId: effectiveLeadId || undefined, buyerId: buyerId || undefined }),
            ],
          );
        }
      } catch (e) {
        console.error("Failed to persist inbound SMS message:", e);
      }
    }

    // STOP/START keyword handling: inbound opt-out keywords flip the buyer's DNC flag.
    if (direction === "inbound" && buyerId) {
      const keyword = String(body || "").trim().toUpperCase();
      const optOuts = ["STOP", "END", "CANCEL", "UNSUBSCRIBE", "QUIT"];
      const optIns = ["START", "UNSTOP"];
      if (optOuts.includes(keyword) || optIns.includes(keyword)) {
        const optingOut = optOuts.includes(keyword);
        try {
          await storage.setBuyerDnc(buyerId, optingOut);
          await pool.query(
            `INSERT INTO global_activity_logs (user_id, action, description, metadata, created_at)
             VALUES ($1, $2, $3, $4, NOW())`,
            [
              0,
              optingOut ? "sms_opt_out" : "sms_opt_in",
              `Buyer ${buyerId} ${optingOut ? "opted out" : "opted back in"} via SMS keyword "${keyword}"`,
              JSON.stringify({ buyerId, keyword, from, to, messageId }),
            ],
          );
        } catch (e) {
          console.error("Failed to apply buyer SMS opt-out/opt-in:", e);
        }
      }
    }
  } catch (e) {
    console.error("Failed to log SMS webhook event:", e);
  }
}

// ── AI Assistant Events ────────────────────────────────────────────────────

function extractTranscript(payload: any): string | null {
  const hist = payload?.message_history || payload?.messages || payload?.history || payload?.transcript;
  if (Array.isArray(hist)) {
    const lines = hist
      .map((m: any) => {
        const role = String(m?.role || m?.type || m?.actor || "");
        const content = String(m?.content ?? m?.text ?? m?.message ?? "");
        return content ? (role ? `${role}: ${content}` : content) : "";
      })
      .filter(Boolean);
    return lines.length ? lines.join("\n") : null;
  }
  if (typeof hist === "string" && String(hist).trim()) return String(hist).trim();
  return null;
}

function extractStructuredFields(payload: any, transcript: string): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  const cand = payload?.structured_data || payload?.ai_data || payload?.qualified_data;
  if (cand && typeof cand === "object" && !Array.isArray(cand)) {
    for (const k of [
      "intent",
      "budget",
      "location",
      "timeline",
      "contactPreference",
      "contact_preference",
      "qualified",
      "score",
    ]) {
      const v = (cand as any)[k];
      if (v !== undefined && v !== null && String(v).trim() !== "") {
        out[k === "contact_preference" ? "contactPreference" : k] = v;
      }
    }
    return out;
  }
  if (!transcript) return out;
  const patterns: Array<[string, RegExp]> = [
    ["intent", /\bintent\b[:\s]*([A-Za-z][A-Za-z\s]{0,20})/i],
    ["budget", /\bbudget\b[:\s]*\$?\s*([0-9][0-9,]{2,}(?:k|K|,?000)?|\d{3,})/i],
    ["location", /\blocation\b[:\s]*([A-Za-z][A-Za-z\s,]{2,40})/i],
    ["timeline", /\btimeline\b[:\s]*([A-Za-z0-9][A-Za-z0-9\s-]{2,30})/i],
    ["contactPreference", /\b(?:contact|preferred contact)\b[:\s]*(phone|text|email|call|sms)/i],
  ];
  for (const [key, re] of patterns) {
    const m = transcript.match(re);
    if (m?.[1]) out[key] = String(m[1]).trim();
  }
  return out;
}

function detectQualified(payload: any, transcript: string, structured: Record<string, unknown>): boolean {
  if (structured.qualified !== undefined) return Boolean(structured.qualified);
  if (structured.intent !== undefined) {
    const i = String(structured.intent).toLowerCase();
    if (["sell", "offer", "interested", "yes", "ready", "list"].some((k) => i.includes(k))) return true;
  }
  return /qualified|high.intent|ready to (sell|move forward|proceed)|interested in an offer|let's (move|proceed)/i.test(
    transcript,
  );
}

function mapIntentToMotivation(intent: unknown): string | null {
  const i = String(intent || "").toLowerCase();
  if (/sell|offer|list/.test(i)) return "selling";
  if (/invest|buy/.test(i)) return "buying";
  if (/cash|all.cash/.test(i)) return "cash";
  return null;
}

function buildAiNoteBlock(structured: Record<string, unknown>, qualified: boolean, transcript: string): string {
  const lines: string[] = [];
  lines.push(`[AI Screener ${new Date().toISOString()}]`);
  if (qualified) lines.push("Qualified: YES");
  for (const k of ["intent", "budget", "location", "timeline", "contactPreference"]) {
    if (structured[k] !== undefined) lines.push(`${k}: ${String(structured[k])}`);
  }
  if (transcript) lines.push(transcript);
  return lines.join("\n");
}

function appendAiBlock(existing: string | null, block: string): string | null {
  const base = String(existing || "").trim();
  if (base && base.includes(block)) return null; // already appended (cumulative transcript)
  const next = base ? `${base}\n\n${block}` : block;
  return next.length > 200_000 ? next.slice(-200_000) : next;
}

async function handleAiAssistantEvent(event: any) {
  const eventType = String(event?.data?.event_type || event?.event_type || "");
  const payload = event?.data?.payload || event?.payload || event?.data || event || {};
  const callControlId = String(payload.call_control_id || payload.callControlId || "");
  const leadIdHint = payload.lead_id ? Number(payload.lead_id) : null;
  const assistantId = String(payload.assistant_id || payload.assistantId || "");
  if (!callControlId) return;

  const log = await findCallLogByControlId(callControlId);
  const logId = log?.id ? Number(log.id) : null;
  const leadId = log?.lead_id ? Number(log.lead_id) : leadIdHint;
  const owningUserId = log?.user_id ? Number(log.user_id) : 0;

  const transcript = extractTranscript(payload);
  const structured = extractStructuredFields(payload, transcript || "");
  const qualified = detectQualified(payload, transcript || "", structured);

  // Persist transcript + qualification on the call log (replaces with the
  // latest cumulative transcript Telnyx sends).
  if (logId && (transcript || qualified)) {
    try {
      await pool.query(
        `UPDATE call_logs
         SET transcript = COALESCE($1, transcript),
             ai_qualified = COALESCE($2, ai_qualified),
             ai_assistant_id = COALESCE($3, ai_assistant_id)
         WHERE id = $4`,
        [transcript || null, qualified ? true : null, assistantId || null, logId],
      );
    } catch (e) {
      console.error("Failed to persist AI assistant transcript:", e);
    }
  }

  // Update the linked lead with the transcript + recognized fields.
  if (leadId && (transcript || qualified || Object.keys(structured).length)) {
    try {
      const lead = await storage.getLeadById(leadId);
      if (lead) {
        const patch: any = {};
        const block = buildAiNoteBlock(structured, qualified, transcript || "");
        const notes = appendAiBlock(lead.notes, block);
        if (notes) patch.notes = notes;
        const motivation = mapIntentToMotivation(structured.intent);
        if (motivation) patch.motivation = motivation;
        await storage.updateLead(leadId, patch);
      }
    } catch (e) {
      console.error("Failed to update lead from AI assistant event:", e);
    }
  }

  // Activity log entry.
  try {
    await pool.query(
      `INSERT INTO global_activity_logs (user_id, action, description, metadata, created_at)
       VALUES ($1, $2, $3, $4, NOW())`,
      [
        owningUserId,
        "ai_screener_update",
        qualified
          ? `AI Screener qualified lead (${String(structured.intent || "unknown intent")})`
          : `AI Screener transcript update (${(transcript || "").length} chars)`,
        JSON.stringify({
          eventType,
          callControlId,
          assistantId: assistantId || undefined,
          callLogId: logId || undefined,
          leadId: leadId || undefined,
          qualified,
          structured,
        }),
      ],
    );
  } catch (e) {
    console.error("Failed to log AI assistant activity:", e);
  }

  // Create a follow-up task once when the assistant qualifies the lead.
  if (qualified && leadId) {
    try {
      const key = "AI Screener follow-up";
      const existing = await storage.getTasksByRelatedEntity("lead", leadId);
      if (!existing.some((t: any) => String(t.title || "").trim() === key)) {
        await createTask({
          title: key,
          description: `High-Intent Lead Screener qualified this lead. Intent: ${String(structured.intent || "unknown")}. Review and schedule a property consultation.`,
          type: "follow_up",
          relatedEntityType: "lead",
          relatedEntityId: leadId,
          dueAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
          priority: "high",
          status: "open",
          assignedToUserId: owningUserId || null,
          createdBy: owningUserId || 0,
        });
      }
    } catch (e) {
      console.error("AI follow-up task creation failed:", e);
    }
  }

  if (logId) {
    emitTelephonyEventToAll({ type: "call_log_updated", payload: { id: logId } } as any);
  }
  emitTelephonyEventToAll({
    type: "ai_assistant_updated",
    payload: { callControlId, qualified, transcriptLength: (transcript || "").length },
  } as any);
}
