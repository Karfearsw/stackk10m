import { Router } from "express";
import { pool } from "../../db.js";
import { emitTelephonyEventToAll } from "../../telephony/ws.js";

export function createTelnyxWebhookRouter() {
  const router = Router();

  router.post("/", async (req, res) => {
    try {
      const event = req.body;
      const eventType = event?.data?.event_type || event?.event_type || "unknown";

      // Acknowledge immediately — Telnyx requires fast 2xx responses
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
      // Always acknowledge to prevent Telnyx retries
      res.status(200).json({ received: true });
    }
  });

  return router;
}

// ── Call Events ────────────────────────────────────────────────────────────

async function handleCallEvent(event: any) {
  const payload = event?.data || event;
  const callControlId = payload.call_control_id || payload.id;
  const from = payload.from || payload.source_number || payload.from_number;
  const to = payload.to || payload.destination_number || payload.to_number;
  const state = payload.call_state || payload.state;
  const direction = payload.direction || "outbound";

  if (!callControlId) return;

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

  // Try to find existing call log by callControlId in metadata
  let existingLogId: number | null = null;
  let existingCreatedAt: Date | null = null;
  try {
    const like = `%${callControlId}%`;
    const result = await pool.query(
      "SELECT id, created_at FROM call_logs WHERE metadata::text LIKE $1 ORDER BY id DESC LIMIT 1",
      [like],
    );
    const row = (result as any).rows?.[0];
    if (row?.id) {
      existingLogId = Number(row.id);
      existingCreatedAt = row.created_at ? new Date(row.created_at) : null;
    }
  } catch (e) {
    console.error("Failed to find call log by callControlId:", e);
  }

  // If no existing log found and this is an inbound call, create one
  if (!existingLogId && direction === "inbound" && (internalStatus === "ringing" || internalStatus === "answered")) {
    try {
      const createResult = await pool.query(
        `INSERT INTO call_logs (user_id, direction, number, status, started_at, metadata)
         VALUES (0, 'inbound', $1, $2, NOW(), $3)
         RETURNING id, created_at`,
        [from || "unknown", internalStatus, JSON.stringify({ callControlId, direction: "inbound" })],
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
        internalStatus === "ended" || internalStatus === "failed"
          ? new Date()
          : null;
      const durationMs =
        internalStatus === "ended" && existingCreatedAt
          ? Math.max(0, Date.now() - existingCreatedAt.getTime())
          : null;

      await pool.query(
        "UPDATE call_logs SET status = $1, ended_at = COALESCE($2, ended_at), duration_ms = COALESCE($3, duration_ms) WHERE id = $4",
        [internalStatus, endedAt, durationMs, existingLogId],
      );

      // Log activity for terminal states
      const terminal = new Set(["answered", "missed", "failed", "ended"]);
      if (terminal.has(internalStatus)) {
        try {
          await pool.query(
            `INSERT INTO global_activity_logs (user_id, action, description, metadata, created_at)
             VALUES ($1, $2, $3, $4, NOW())`,
            [
              0,
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

  // Emit real-time event
  emitTelephonyEventToAll({
    type: "call_state_changed",
    payload: { callControlId, state: internalStatus, from, to, direction },
  } as any);
}

// ── Message Events ─────────────────────────────────────────────────────────

async function handleMessageEvent(event: any) {
  const payload = event?.data || event;
  const from = payload.from?.phone_number || payload.from;
  const to = payload.to?.phone_number || payload.to;
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
  } catch (e) {
    console.error("Failed to log SMS webhook event:", e);
  }
}
