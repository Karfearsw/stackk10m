/**
 * Email sender (Ticket 10).
 *
 * Single entry point for CRM email sends. Guarantees:
 *   - Suppression check first: suppressed addresses are never sent to.
 *   - Dev recipient guard: non-production only sends to allowlisted addresses.
 *   - Idempotency: the same idempotency_key never produces two sends — a
 *     retry returns the original result instead of re-sending.
 *   - Outbox tracking: every logical send is recorded in email_outbox with
 *     status pending → sent | failed | suppressed.
 *   - Lead timeline: successful sends append a note to the lead's timeline.
 *
 * Provider routing: SMTP sends go direct via nodemailer; resend/telnyx go
 * through the existing messaging/email-router.ts (no duplicated logic).
 */
import { db } from "../../db.js";
import { sql } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import {
  getEmailProviderConfig,
  devRecipientGuard,
  EmailProviderError,
  type EmailSendResult,
} from "./provider.js";
import { isSuppressed } from "./suppression.js";
import { sendEmail as routerSendEmail } from "../services/messaging/email-router.js";

export type CrmEmailInput = {
  to: string;
  subject: string;
  text?: string | null;
  html?: string | null;
  from?: string | null;
  leadId?: number | null;
  userId?: number | null;
  idempotencyKey?: string | null;
};

export type CrmEmailOutcome =
  | { ok: true; outboxId: number; replayed: boolean; provider: string; providerMessageId: string }
  | { ok: false; outboxId: number; code: string; message: string };

type OutboxRow = {
  id: number;
  status: string;
  provider: string | null;
  provider_message_id: string | null;
};

async function getOutboxRow(id: number): Promise<OutboxRow | null> {
  const rows = await db.execute(sql`SELECT id, status, provider, provider_message_id FROM email_outbox WHERE id = ${id}`);
  const r: any = (rows as any)?.rows?.[0] ?? (rows as any)?.[0];
  return r ? { id: r.id, status: r.status, provider: r.provider, provider_message_id: r.provider_message_id } : null;
}

async function findByIdempotencyKey(key: string): Promise<OutboxRow | null> {
  const rows = await db.execute(sql`SELECT id, status, provider, provider_message_id FROM email_outbox WHERE idempotency_key = ${key}`);
  const r: any = (rows as any)?.rows?.[0] ?? (rows as any)?.[0];
  return r ? { id: r.id, status: r.status, provider: r.provider, provider_message_id: r.provider_message_id } : null;
}

async function appendLeadNote(leadId: number, body: string, userId?: number | null): Promise<void> {
  try {
    await db.execute(sql`
      INSERT INTO lead_notes (lead_id, created_by, body)
      VALUES (${leadId}, ${userId ?? null}, ${body})
    `);
  } catch {
    // Timeline is best-effort: never fail the send because the note failed.
  }
}

async function sendViaSmtp(input: { to: string; subject: string; text?: string | null; html?: string | null; from: string }): Promise<EmailSendResult> {
  const host = String(process.env.SMTP_HOST || "").trim();
  const port = parseInt(String(process.env.SMTP_PORT || "587"), 10);
  const user = String(process.env.SMTP_USER || "").trim();
  const pass = String(process.env.SMTP_PASS || "").trim();
  const secure = ["1", "true", "yes", "on"].includes(String(process.env.SMTP_SECURE || "").trim().toLowerCase());
  // Dynamic import so the module loads even when nodemailer isn't installed
  // (e.g. API-only deployments). A clear blocker is thrown instead.
  let nodemailer: any;
  try {
    nodemailer = await import("nodemailer");
  } catch {
    throw new EmailProviderError("SMTP_DRIVER_MISSING", "SMTP selected but nodemailer is not installed. Run npm install nodemailer.", "smtp");
  }
  const transporter = (nodemailer.default || nodemailer).createTransport({
    host,
    port: Number.isFinite(port) ? port : 587,
    secure,
    auth: { user, pass },
  });
  const info = await transporter.sendMail({
    from: input.from,
    to: input.to,
    subject: input.subject,
    text: input.text ?? undefined,
    html: input.html ?? undefined,
  });
  return { provider: "smtp", providerMessageId: String(info?.messageId || ""), status: "sent" };
}

/**
 * Send a CRM email. Never throws for business-rule blocks (suppression, dev
 * guard, missing provider) — those return { ok: false } with a code. Throws
 * only on unexpected infrastructure failures.
 */
export async function sendCrmEmail(input: CrmEmailInput): Promise<CrmEmailOutcome> {
  const to = String(input.to || "").trim().toLowerCase();
  const subject = String(input.subject || "").trim();
  if (!to || !subject) {
    return { ok: false, outboxId: 0, code: "INVALID_INPUT", message: "Recipient and subject are required." };
  }

  const idempotencyKey = String(input.idempotencyKey || "").trim() || randomUUID();

  // Idempotency: a retry with the same key returns the original outcome.
  const existing = await findByIdempotencyKey(idempotencyKey);
  if (existing) {
    if (existing.status === "sent") {
      return { ok: true, outboxId: existing.id, replayed: true, provider: existing.provider || "unknown", providerMessageId: existing.provider_message_id || "" };
    }
    // A previous failed/suppressed attempt with the same key: report it
    // rather than silently re-sending.
    return { ok: false, outboxId: existing.id, code: "ALREADY_" + existing.status.toUpperCase(), message: `This send was already recorded as ${existing.status}.` };
  }

  // Insert the outbox row first so concurrent retries serialize on the
  // unique idempotency_key.
  const inserted = await db.execute(sql`
    INSERT INTO email_outbox (to_email, subject, body_html, body_text, lead_id, user_id, status, idempotency_key)
    VALUES (${to}, ${subject}, ${input.html ?? null}, ${input.text ?? null}, ${input.leadId ?? null}, ${input.userId ?? null}, 'pending', ${idempotencyKey})
    ON CONFLICT (idempotency_key) DO NOTHING
    RETURNING id
  `);
  const row: any = (inserted as any)?.rows?.[0] ?? (inserted as any)?.[0];
  const outboxId: number | null = row?.id ?? (await findByIdempotencyKey(idempotencyKey))?.id ?? null;
  if (!outboxId) {
    return { ok: false, outboxId: 0, code: "OUTBOX_WRITE_FAILED", message: "Could not record the send. Please retry." };
  }

  const fail = async (code: string, message: string): Promise<CrmEmailOutcome> => {
    await db.execute(sql`UPDATE email_outbox SET status = 'failed', error = ${message} WHERE id = ${outboxId}`);
    return { ok: false, outboxId, code, message };
  };

  // 1. Suppression check — suppressed addresses are never sent to.
  const suppressed = await isSuppressed(to);
  if (suppressed) {
    await db.execute(sql`UPDATE email_outbox SET status = 'suppressed', error = ${"Suppressed: " + suppressed.reason} WHERE id = ${outboxId}`);
    return { ok: false, outboxId, code: "SUPPRESSED", message: `Suppressed: this address is on the ${suppressed.reason} list.` };
  }

  // 2. Dev recipient guard.
  const guardBlock = devRecipientGuard(to);
  if (guardBlock) return fail("DEV_GUARD", guardBlock);

  // 3. Provider config.
  const cfg = getEmailProviderConfig();
  if ("blocked" in cfg) return fail(cfg.blocked.code, cfg.blocked.message);
  const from = String(input.from || "").trim() || cfg.from;

  // 4. Send.
  let result: EmailSendResult;
  try {
    if (cfg.provider === "smtp") {
      result = await sendViaSmtp({ to, subject, text: input.text ?? null, html: input.html ?? null, from });
    } else {
      const r = await routerSendEmail({ to, subject, text: input.text ?? null, html: input.html ?? null, from, idempotencyKey });
      result = { provider: r.provider, providerMessageId: r.id, status: r.status, replayed: r.replayed };
    }
  } catch (e: any) {
    const message = String(e?.message || e || "Send failed");
    const code = String(e?.code || e?.blocker?.code || "PROVIDER_ERROR");
    return fail(code, message);
  }

  await db.execute(sql`
    UPDATE email_outbox
    SET status = 'sent', provider = ${result.provider}, provider_message_id = ${result.providerMessageId}, sent_at = now()
    WHERE id = ${outboxId}
  `);
  await db.execute(sql`
    INSERT INTO email_events (message_id, lead_id, to_email, event_type, metadata)
    VALUES (${result.providerMessageId || null}, ${input.leadId ?? null}, ${to}, 'sent', ${JSON.stringify({ provider: result.provider, subject })}::jsonb)
  `);

  if (input.leadId) {
    await appendLeadNote(input.leadId, `Email sent to ${to}: "${subject}" (via ${result.provider})`, input.userId ?? null);
  }

  return { ok: true, outboxId, replayed: false, provider: result.provider, providerMessageId: result.providerMessageId };
}

/** Delivery stats for the Settings → Email dashboard. */
export async function emailDeliveryStats(): Promise<{
  sent: number; failed: number; suppressed: number;
  delivered: number; bounced: number; complained: number; replied: number;
  suppressionCount: number;
}> {
  const q = async (text: string) => {
    const rows = await db.execute(sql.raw(text));
    return Number((rows as any)?.rows?.[0]?.c ?? (rows as any)?.[0]?.c ?? 0);
  };
  const [sent, failed, suppressed, delivered, bounced, complained, replied, suppressionCount] = await Promise.all([
    q(`SELECT COUNT(*)::int AS c FROM email_outbox WHERE status = 'sent'`),
    q(`SELECT COUNT(*)::int AS c FROM email_outbox WHERE status = 'failed'`),
    q(`SELECT COUNT(*)::int AS c FROM email_outbox WHERE status = 'suppressed'`),
    q(`SELECT COUNT(*)::int AS c FROM email_events WHERE event_type = 'delivered'`),
    q(`SELECT COUNT(*)::int AS c FROM email_events WHERE event_type = 'bounced'`),
    q(`SELECT COUNT(*)::int AS c FROM email_events WHERE event_type = 'complained'`),
    q(`SELECT COUNT(*)::int AS c FROM email_events WHERE event_type = 'replied'`),
    q(`SELECT COUNT(*)::int AS c FROM email_suppressions`),
  ]);
  return { sent, failed, suppressed, delivered, bounced, complained, replied, suppressionCount };
}
