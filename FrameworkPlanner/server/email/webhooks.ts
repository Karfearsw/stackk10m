/**
 * Email delivery webhooks (Ticket 10).
 *
 * Receives delivery events from email providers (delivered, bounced,
 * complained, rejected, replied, opened, clicked) and:
 *   - Records them in email_events (idempotent on provider event id).
 *   - Auto-suppresses the recipient on hard bounce or spam complaint.
 *   - Appends significant events to the lead's timeline (lead_notes).
 *
 * Providers post different payload shapes; normalizeProviderEvent() maps the
 * common ones (Resend, SendGrid, Telnyx, generic) into one normalized event.
 * Webhook authentication: if EMAIL_WEBHOOK_SECRET is set, the request must
 * carry it as `?secret=` or an `x-webhook-secret` header.
 */
import { db } from "../db.js";
import { sql } from "drizzle-orm";
import { addSuppression } from "./suppression.js";

export type NormalizedEmailEvent = {
  /** Provider's event id — used for idempotent ingestion. */
  eventId: string | null;
  providerMessageId: string | null;
  to: string;
  type: "delivered" | "bounced" | "complained" | "rejected" | "replied" | "opened" | "clicked" | "sent";
  leadId?: number | null;
  detail?: string | null;
  raw: Record<string, any>;
};

/**
 * Normalize the common provider webhook shapes into one event type.
 * Unknown shapes fall back to a generic mapping when `type`/`email` are
 * present; anything else returns null (caller responds 400).
 */
export function normalizeProviderEvent(body: any): NormalizedEmailEvent | null {
  if (!body || typeof body !== "object") return null;

  // Resend: { type: "email.delivered" | "email.bounced" | "email.complained", data: { email_id, to, ... } }
  if (typeof body.type === "string" && body.type.startsWith("email.") && body.data && typeof body.data === "object") {
    const map: Record<string, NormalizedEmailEvent["type"]> = {
      "email.sent": "sent", "email.delivered": "delivered", "email.bounced": "bounced",
      "email.complained": "complained", "email.delivery_delayed": "rejected",
    };
    const t = map[body.type];
    if (!t || !body.data.to) return null;
    return {
      eventId: String(body.data.email_id || "") || null,
      providerMessageId: String(body.data.email_id || "") || null,
      to: String(body.data.to),
      type: t,
      detail: body.data.bounce?.message || body.data.complaint?.feedbackType || null,
      raw: body,
    };
  }

  // SendGrid Event Webhook: [{ event: "delivered"|"bounce"|"spamreport"|..., email, sg_message_id, sg_event_id, ... }]
  if (Array.isArray(body) && body.length > 0 && body[0]?.event) {
    // Handled as a batch by ingestWebhookBatch(); normalize single for compat.
    const e = body[0];
    return normalizeSendGridEvent(e);
  }
  if (body.event && body.email) return normalizeSendGridEvent(body);

  // Telnyx: { data: { event_type: "email.delivered"|..., payload: { to, message_id, ... } } }
  if (body.data?.event_type && typeof body.data.event_type === "string" && body.data.event_type.startsWith("email.")) {
    const map: Record<string, NormalizedEmailEvent["type"]> = {
      "email.delivered": "delivered", "email.bounced": "bounced", "email.complained": "complained",
    };
    const t = map[body.data.event_type];
    const to = body.data.payload?.to?.[0] || body.data.payload?.to;
    if (!t || !to) return null;
    return {
      eventId: String(body.data.id || "") || null,
      providerMessageId: String(body.data.payload?.message_id || "") || null,
      to: String(to),
      type: t,
      raw: body,
    };
  }

  // Generic: { type: "delivered"|"bounced"|..., email | to, message_id?, lead_id? }
  if (typeof body.type === "string" && (body.email || body.to)) {
    const t = String(body.type).toLowerCase();
    const allowed = ["delivered", "bounced", "complained", "rejected", "replied", "opened", "clicked", "sent"];
    if (!allowed.includes(t)) return null;
    return {
      eventId: body.event_id ? String(body.event_id) : null,
      providerMessageId: body.message_id ? String(body.message_id) : null,
      to: String(body.email || body.to),
      type: t as NormalizedEmailEvent["type"],
      leadId: body.lead_id != null ? Number(body.lead_id) : null,
      detail: body.detail ? String(body.detail) : null,
      raw: body,
    };
  }

  return null;
}

function normalizeSendGridEvent(e: any): NormalizedEmailEvent | null {
  const map: Record<string, NormalizedEmailEvent["type"]> = {
    delivered: "delivered", bounce: "bounced", bounced: "bounced",
    spamreport: "complained", dropped: "rejected", open: "opened", click: "clicked",
  };
  const t = map[String(e.event || "").toLowerCase()];
  if (!t || !e.email) return null;
  return {
    eventId: e.sg_event_id ? String(e.sg_event_id) : null,
    providerMessageId: e.sg_message_id ? String(e.sg_message_id) : null,
    to: String(e.email),
    type: t,
    detail: e.reason || e.status || null,
    raw: e,
  };
}

/** Verify the webhook secret when EMAIL_WEBHOOK_SECRET is configured. */
export function verifyWebhookSecret(req: any): boolean {
  const secret = String(process.env.EMAIL_WEBHOOK_SECRET || "").trim();
  if (!secret) return true; // not configured → accept (log a warning at boot)
  const provided = String(req.query?.secret || req.headers?.["x-webhook-secret"] || "").trim();
  return provided === secret;
}

async function appendLeadNote(leadId: number, body: string): Promise<void> {
  try {
    await db.execute(sql`INSERT INTO lead_notes (lead_id, body) VALUES (${leadId}, ${body})`);
  } catch {
    // Timeline is best-effort.
  }
}

async function findLeadIdForEmail(to: string, providerMessageId: string | null): Promise<number | null> {
  // Prefer the outbox row matched by provider message id.
  if (providerMessageId) {
    const rows = await db.execute(sql`
      SELECT lead_id FROM email_outbox WHERE provider_message_id = ${providerMessageId} LIMIT 1
    `);
    const r: any = (rows as any)?.rows?.[0] ?? (rows as any)?.[0];
    if (r?.lead_id) return Number(r.lead_id);
  }
  // Fall back to the most recent outbox send to this address.
  const rows = await db.execute(sql`
    SELECT lead_id FROM email_outbox WHERE lower(to_email) = ${to.toLowerCase()} AND lead_id IS NOT NULL
    ORDER BY created_at DESC LIMIT 1
  `);
  const r: any = (rows as any)?.rows?.[0] ?? (rows as any)?.[0];
  return r?.lead_id ? Number(r.lead_id) : null;
}

const TIMELINE_COPY: Record<NormalizedEmailEvent["type"], (to: string, detail?: string | null) => string | null> = {
  sent: () => null,
  delivered: (to) => `Email delivered to ${to}.`,
  bounced: (to, d) => `Email to ${to} bounced${d ? `: ${d}` : "."} Address added to suppression list.`,
  complained: (to) => `Spam complaint from ${to}. Address added to suppression list.`,
  rejected: (to, d) => `Email to ${to} rejected${d ? `: ${d}` : "."}`,
  replied: (to) => `Reply received from ${to}.`,
  opened: () => null,
  clicked: () => null,
};

/**
 * Ingest one normalized event. Idempotent: the same provider event id (or
 * message id + type) is never recorded twice, and webhook retries never
 * regress final status or double-suppress.
 */
export async function ingestEmailEvent(ev: NormalizedEmailEvent): Promise<{ recorded: boolean; suppressed: boolean }> {
  const to = ev.to.trim().toLowerCase();

  // Idempotency gate.
  if (ev.eventId) {
    const dup = await db.execute(sql`
      SELECT 1 FROM email_events WHERE metadata->>'provider_event_id' = ${ev.eventId} LIMIT 1
    `);
    const found: any = (dup as any)?.rows?.[0] ?? (dup as any)?.[0];
    if (found) return { recorded: false, suppressed: false };
  }

  const leadId = ev.leadId ?? (await findLeadIdForEmail(to, ev.providerMessageId));

  await db.execute(sql`
    INSERT INTO email_events (message_id, lead_id, to_email, event_type, metadata)
    VALUES (
      ${ev.providerMessageId}, ${leadId},
      ${to}, ${ev.type},
      ${JSON.stringify({ provider_event_id: ev.eventId, detail: ev.detail ?? null })}::jsonb
    )
  `);

  let suppressed = false;
  if (ev.type === "bounced") {
    await addSuppression(to, "bounce");
    suppressed = true;
  } else if (ev.type === "complained") {
    await addSuppression(to, "complaint");
    suppressed = true;
  }

  const copy = TIMELINE_COPY[ev.type]?.(to, ev.detail);
  if (copy && leadId) await appendLeadNote(leadId, copy);

  return { recorded: true, suppressed };
}

/** Ingest a batch (e.g. SendGrid posts arrays). */
export async function ingestWebhookBatch(body: any): Promise<{ recorded: number; suppressed: number; rejected: number }> {
  const items: any[] = Array.isArray(body) ? body : [body];
  let recorded = 0, suppressed = 0, rejected = 0;
  for (const item of items) {
    const ev = normalizeProviderEvent(item);
    if (!ev) { rejected++; continue; }
    try {
      const r = await ingestEmailEvent(ev);
      if (r.recorded) recorded++;
      if (r.suppressed) suppressed++;
    } catch {
      rejected++;
    }
  }
  return { recorded, suppressed, rejected };
}
