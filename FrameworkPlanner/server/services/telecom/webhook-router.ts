import { Router } from "express";
import { pool } from "../../db.js";
import { emitTelephonyEventToAll } from "../../telephony/ws.js";

export function createTelnyxWebhookRouter() {
  const router = Router();

  router.post("/", async (req, res) => {
    try {
      const event = req.body;
      const eventType = event?.data?.event_type || event?.event_type || "unknown";

      // Acknowledge immediately
      res.status(200).json({ received: true, eventType });

      // Process asynchronously
      setImmediate(async () => {
        try {
          if (eventType.startsWith("call.")) {
            await handleCallEvent(event);
          }
          if (eventType.startsWith("message.")) {
            await handleMessageEvent(event);
          }
        } catch (err) {
          console.error("Telnyx webhook background error:", err);
        }
      });
    } catch (error: any) {
      console.error("Telnyx webhook error:", error);
      res.status(200).json({ received: true });
    }
  });

  return router;
}

async function handleCallEvent(event: any) {
  const payload = event?.data || event;
  const callControlId = payload.call_control_id || payload.id;
  const from = payload.from || payload.source_number || payload.from_number;
  const to = payload.to || payload.destination_number || payload.to_number;
  const state = payload.call_state || payload.state;

  if (!callControlId) return;

  const statusMap: Record<string, string> = {
    ringing: "ringing",
    answered: "answered",
    completed: "ended",
    failed: "failed",
    busy: "failed",
    no_answer: "missed",
  };

  const internalStatus = statusMap[state] || state;

  try {
    const result = await pool.query(
      "SELECT id, created_at FROM call_logs WHERE metadata::text LIKE $1 ORDER BY id DESC LIMIT 1",
      [`%${callControlId}%`]
    );
    const row = result.rows?.[0];
    if (row?.id) {
      const endedAt = internalStatus === "ended" || internalStatus === "failed" ? new Date() : null;
      const durationMs = internalStatus === "ended" ? Math.max(0, Date.now() - new Date(row.created_at).getTime()) : null;
      await pool.query(
        "UPDATE call_logs SET status = $1, ended_at = $2, duration_ms = $3 WHERE id = $4",
        [internalStatus, endedAt, durationMs, row.id]
      );
    }
  } catch (e) {
    console.error("Failed to update call log from webhook:", e);
  }

  emitTelephonyEventToAll({
    type: "call_state_changed",
    payload: { callControlId, state: internalStatus, from, to },
  } as any);
}

async function handleMessageEvent(event: any) {
  const payload = event?.data || event;
  const from = payload.from?.phone_number || payload.from;
  const to = payload.to?.phone_number || payload.to;
  const body = payload.text || payload.body;
  const direction = payload.direction || "inbound";

  if (!from || !to) return;

  try {
    await pool.query(
      "INSERT INTO global_activity_logs (user_id, action, description, metadata, created_at) VALUES ($1, $2, $3, $4, NOW())",
      [0, "sms_received", String(body || ""), JSON.stringify({ from, to, body, direction })]
    );
  } catch (e) {
    console.error("Failed to log SMS webhook event:", e);
  }
}
