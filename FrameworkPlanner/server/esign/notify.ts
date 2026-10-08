/**
 * server/esign/notify.ts — Signer notification delivery for self-built e-sign (v2).
 *
 * Sends signer invitations and completion notices via the CRM's real
 * provider abstractions:
 *   - Email: server/services/messaging/email-router.ts (Telnyx Email → Resend fallback)
 *   - SMS:   server/services/telecom/telnyx-client.ts (Telnyx SMS)
 *
 * These functions NEVER throw: notification failure must not break the signing
 * flow. They return a result object the caller persists for audit purposes.
 *
 * ATTORNEY REVIEW REQUIRED BEFORE PRODUCTION USE. Not legal advice.
 */
export interface NotifyResult {
  channel: "email" | "sms";
  to: string;
  sent: boolean;
  provider: string;
  messageId: string | null;
  error: string | null;
  loggedAt: string;
}

function logNotify(result: NotifyResult, context: Record<string, unknown>) {
  console.log(
    JSON.stringify({
      ts: new Date().toISOString(),
      event: "esign_notify",
      ...context,
      result,
    })
  );
}

function escapeHtml(s: string): string {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function invitationEmailHtml(args: {
  signerName: string;
  documentTitle: string;
  signerUrl: string;
  expiresAt: Date;
}): string {
  const exp = args.expiresAt.toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
  return `<!doctype html><html><body style="font-family: Georgia, serif; color: #111; line-height: 1.6; max-width: 600px; margin: 0 auto; padding: 20px;">
<div style="text-align: center; margin-bottom: 24px;">
  <div style="font-size: 11px; letter-spacing: 3px; color: #8a6d2b;">OCEAN LUXE</div>
</div>
<p>Hi ${escapeHtml(args.signerName)},</p>
<p>You've been asked to review and sign <strong>${escapeHtml(args.documentTitle)}</strong>.</p>
<p style="text-align: center; margin: 28px 0;">
  <a href="${escapeHtml(args.signerUrl)}" style="display: inline-block; background: #8a6d2b; color: #fff; padding: 14px 32px; text-decoration: none; border-radius: 4px; font-size: 16px;">Review &amp; Sign Document</a>
</p>
<p style="font-size: 13px; color: #666;">This signing link expires on ${escapeHtml(exp)}. The link is single-use and tied to your identity.</p>
<p style="font-size: 13px; color: #666;">If you didn't expect this, you can safely ignore this email.</p>
</body></html>`;
}

async function sendEmailNotification(args: {
  to: string;
  subject: string;
  html: string;
  text: string;
}): Promise<{ sent: boolean; provider: string; messageId: string | null; error: string | null }> {
  try {
    const { sendEmail } = await import("../services/messaging/email-router.js");
    const sent = await sendEmail({
      to: args.to,
      subject: args.subject,
      html: args.html,
      text: args.text,
    });
    return { sent: true, provider: sent.provider, messageId: sent.id, error: null };
  } catch (e: any) {
    return {
      sent: false,
      provider: "none",
      messageId: null,
      error: e?.message || "Email send failed",
    };
  }
}

async function sendSmsNotification(args: {
  to: string;
  body: string;
}): Promise<{ sent: boolean; provider: string; messageId: string | null; error: string | null }> {
  try {
    const { telnyx } = await import("../services/telecom/telnyx-client.js");
    const result = await telnyx.sendSms({ to: args.to, body: args.body });
    return { sent: true, provider: "telnyx", messageId: result.messageId, error: null };
  } catch (e: any) {
    return {
      sent: false,
      provider: "none",
      messageId: null,
      error: e?.message || "SMS send failed",
    };
  }
}

export async function sendSignerInvitation(args: {
  envelopeId: number;
  signerName: string;
  signerEmail: string | null;
  signerPhone: string | null;
  signerUrl: string;
  documentTitle: string;
  expiresAt: Date;
}): Promise<{ email: NotifyResult; sms: NotifyResult | null }> {
  const at = new Date().toISOString();
  const subject = `Signature requested: ${args.documentTitle}`;

  let email: NotifyResult;
  if (args.signerEmail) {
    const r = await sendEmailNotification({
      to: args.signerEmail,
      subject,
      html: invitationEmailHtml({
        signerName: args.signerName,
        documentTitle: args.documentTitle,
        signerUrl: args.signerUrl,
        expiresAt: args.expiresAt,
      }),
      text: `Hi ${args.signerName},\n\nYou've been asked to sign "${args.documentTitle}".\n\nSign here: ${args.signerUrl}\n\nThis link expires on ${args.expiresAt.toLocaleDateString()}.`,
    });
    email = {
      channel: "email",
      to: args.signerEmail,
      sent: r.sent,
      provider: r.provider,
      messageId: r.messageId,
      error: r.error,
      loggedAt: at,
    };
  } else {
    email = {
      channel: "email",
      to: "(none)",
      sent: false,
      provider: "none",
      messageId: null,
      error: "no signer email on file",
      loggedAt: at,
    };
  }
  logNotify(email, { kind: "invitation", envelopeId: args.envelopeId });

  let sms: NotifyResult | null = null;
  if (args.signerPhone) {
    const r = await sendSmsNotification({
      to: args.signerPhone,
      body: `Ocean Luxe: ${args.signerName}, please sign "${args.documentTitle}": ${args.signerUrl}`,
    });
    sms = {
      channel: "sms",
      to: args.signerPhone,
      sent: r.sent,
      provider: r.provider,
      messageId: r.messageId,
      error: r.error,
      loggedAt: at,
    };
    logNotify(sms, { kind: "invitation", envelopeId: args.envelopeId });
  }

  return { email, sms };
}

export async function sendCompletionNotice(args: {
  envelopeId: number;
  signerName: string;
  signerEmail: string | null;
  documentTitle: string;
}): Promise<NotifyResult> {
  const at = new Date().toISOString();
  let result: NotifyResult;

  if (args.signerEmail) {
    const r = await sendEmailNotification({
      to: args.signerEmail,
      subject: `Signed: ${args.documentTitle}`,
      html: `<!doctype html><html><body style="font-family: Georgia, serif; color: #111; line-height: 1.6; max-width: 600px; margin: 0 auto; padding: 20px;">
<div style="text-align: center; margin-bottom: 24px;"><div style="font-size: 11px; letter-spacing: 3px; color: #8a6d2b;">OCEAN LUXE</div></div>
<p>Hi ${escapeHtml(args.signerName)},</p>
<p>All parties have signed <strong>${escapeHtml(args.documentTitle)}</strong>. The signed document and certificate of completion are available in your records.</p>
<p style="font-size: 13px; color: #666;">Thank you.</p></body></html>`,
      text: `Hi ${args.signerName},\n\nAll parties have signed "${args.documentTitle}".\n\nThank you.`,
    });
    result = {
      channel: "email",
      to: args.signerEmail,
      sent: r.sent,
      provider: r.provider,
      messageId: r.messageId,
      error: r.error,
      loggedAt: at,
    };
  } else {
    result = {
      channel: "email",
      to: "(none)",
      sent: false,
      provider: "none",
      messageId: null,
      error: "no signer email on file",
      loggedAt: at,
    };
  }
  logNotify(result, { kind: "completion", envelopeId: args.envelopeId });
  return result;
}

export async function sendDeclinedNotice(args: {
  envelopeId: number;
  signerName: string;
  signerEmail: string | null;
  documentTitle: string;
  reason?: string | null;
}): Promise<NotifyResult> {
  const at = new Date().toISOString();
  let result: NotifyResult;

  if (args.signerEmail) {
    const r = await sendEmailNotification({
      to: args.signerEmail,
      subject: `Declined: ${args.documentTitle}`,
      html: `<!doctype html><html><body style="font-family: Georgia, serif; color: #111; line-height: 1.6; max-width: 600px; margin: 0 auto; padding: 20px;">
<div style="text-align: center; margin-bottom: 24px;"><div style="font-size: 11px; letter-spacing: 3px; color: #8a6d2b;">OCEAN LUXE</div></div>
<p>Hi ${escapeHtml(args.signerName)},</p>
<p>The document <strong>${escapeHtml(args.documentTitle)}</strong> was declined${args.reason ? ` with reason: ${escapeHtml(args.reason)}` : ""}.</p>
<p style="font-size: 13px; color: #666;">Please contact the sender if you have questions.</p></body></html>`,
      text: `Hi ${args.signerName},\n\nThe document "${args.documentTitle}" was declined${args.reason ? ` (${args.reason})` : ""}.`,
    });
    result = {
      channel: "email",
      to: args.signerEmail,
      sent: r.sent,
      provider: r.provider,
      messageId: r.messageId,
      error: r.error,
      loggedAt: at,
    };
  } else {
    result = {
      channel: "email",
      to: "(none)",
      sent: false,
      provider: "none",
      messageId: null,
      error: "no signer email on file",
      loggedAt: at,
    };
  }
  logNotify(result, { kind: "declined", envelopeId: args.envelopeId });
  return result;
}
