/**
 * server/esign/notify.ts — Signer notification hooks (LOG-ONLY STUBS).
 *
 * TODO (before production):
 *   - Wire these to the CRM's provider abstraction (server/services/messaging/email-router.ts
 *     already exists; SMS path via Telnyx). No email/SMS provider is configured
 *     for e-sign yet — that is a known gap.
 *   - Add opt-out handling + quiet-hours (8am–9pm recipient TZ) per the
 *     disposition broadcast compliance rules.
 *   - Register each send attempt in the envelope's notification_log column
 *     (JSON array) — the envelope service already appends entries there; these
 *     stubs record the log-only outcome.
 *
 * These functions NEVER throw: notification failure must not break the signing
 * flow. They return a result object the caller persists for audit purposes.
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

function logStub(result: NotifyResult, context: Record<string, unknown>) {
  console.log(
    JSON.stringify({
      ts: new Date().toISOString(),
      event: "esign_notify_stub",
      level: "warn",
      provider: "none",
      ...context,
      result,
    })
  );
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
  const email: NotifyResult = {
    channel: "email",
    to: args.signerEmail || "(none)",
    sent: false,
    provider: "none",
    messageId: null,
    error: args.signerEmail
      ? "no email provider configured — TODO: wire email-router.ts"
      : "no signer email on file",
    loggedAt: at,
  };
  logStub(email, {
    kind: "invitation",
    envelopeId: args.envelopeId,
    subject: `Signature requested: ${args.documentTitle}`,
    signerUrl: args.signerUrl,
    expiresAt: args.expiresAt.toISOString(),
  });

  let sms: NotifyResult | null = null;
  if (args.signerPhone) {
    sms = {
      channel: "sms",
      to: args.signerPhone,
      sent: false,
      provider: "none",
      messageId: null,
      error: "no SMS provider configured for e-sign — TODO: wire Telnyx path",
      loggedAt: at,
    };
    logStub(sms, { kind: "invitation", envelopeId: args.envelopeId, signerUrl: args.signerUrl });
  }
  return { email, sms };
}

export async function sendCompletionNotice(args: {
  envelopeId: number;
  signerName: string;
  signerEmail: string | null;
  documentTitle: string;
}): Promise<NotifyResult> {
  const result: NotifyResult = {
    channel: "email",
    to: args.signerEmail || "(none)",
    sent: false,
    provider: "none",
    messageId: null,
    error: args.signerEmail
      ? "no email provider configured — TODO: wire email-router.ts"
      : "no signer email on file",
    loggedAt: new Date().toISOString(),
  };
  logStub(result, { kind: "completion", envelopeId: args.envelopeId, documentTitle: args.documentTitle });
  return result;
}
