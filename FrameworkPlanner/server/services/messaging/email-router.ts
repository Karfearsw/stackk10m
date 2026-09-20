// Email provider router — the single entry point for every CRM email send.
//
// Selection order (first configured-and-usable provider wins):
//   1. Telnyx Email API on a verified CUSTOM domain  → arbitrary recipients,
//      branded from-address, delivery events.
//   2. Telnyx Email API on the shared domain         → only the account
//      owner's verified email; enforces the restriction up front.
//   3. Resend                                         → unchanged legacy path.
//
// TELNYX_EMAIL_ENABLED=false forces Resend even when Telnyx is available.
// Never fakes a send: every failure throws with a structured blocker.

import {
  sendTelnyxEmail,
  TelnyxEmailError,
  isTelnyxEmailConfigured,
  defaultEmailFrom,
  telnyxEmailReadiness,
} from "./telnyx-email.js";
import { sendResendEmail } from "./resend.js";

export type SendEmailInput = {
  to: string | string[];
  subject: string;
  text?: string | null;
  html?: string | null;
  /** Optional override; provider default is used when omitted. */
  from?: string | null;
  idempotencyKey?: string | null;
};

export type SentEmail = {
  id: string;
  provider: "telnyx" | "resend";
  status: string;
  replayed?: boolean;
};

export type EmailRouterBlocker = {
  provider: "telnyx" | "resend" | "none";
  code: string;
  message: string;
  detail?: string;
};

export class EmailRouterError extends Error {
  blocker: EmailRouterBlocker;
  constructor(blocker: EmailRouterBlocker) {
    super(blocker.message);
    this.name = "EmailRouterError";
    this.blocker = blocker;
  }
}

function flagEnabled(name: string, fallback: boolean): boolean {
  const v = String(process.env[name] || "").trim().toLowerCase();
  if (v === "") return fallback;
  return ["1", "true", "yes", "on"].includes(v);
}

export type EmailPlan = {
  provider: "telnyx" | "resend";
  mode: "telnyx_custom_domain" | "telnyx_shared_domain" | "resend";
  from: string;
};

/**
 * Decide which provider/mode a send would use right now, without sending.
 * Also the readiness surface for Settings → System.
 */
export async function planEmailSend(from?: string | null): Promise<EmailPlan | { blocked: EmailRouterBlocker }> {
  const telnyxEnabled = flagEnabled("TELNYX_EMAIL_ENABLED", true);
  const resendAvailable = Boolean(
    String(process.env.RESEND_API_KEY || "").trim()
    && String(process.env.RESEND_FROM || process.env.EMAIL_FROM_ADDRESS || "").trim(),
  );

  if (telnyxEnabled && isTelnyxEmailConfigured()) {
    const rd = await telnyxEmailReadiness();
    if (rd.capability) {
      if (rd.customVerified) {
        const fromAddr = String(from || process.env.EMAIL_FROM_ADDRESS || "").trim();
        if (fromAddr) return { provider: "telnyx", mode: "telnyx_custom_domain", from: fromAddr };
        return {
          blocked: {
            provider: "telnyx",
            code: "FROM_ADDRESS_REQUIRED",
            message: "Custom sending domain is verified but EMAIL_FROM_ADDRESS is not set (e.g. notifications@oceanluxe.org).",
          },
        };
      }
      if (rd.sharedDomain) {
        return {
          provider: "telnyx",
          mode: "telnyx_shared_domain",
          from: `onboarding@${rd.sharedDomain}`,
        };
      }
      return {
        blocked: {
          provider: "telnyx",
          code: "NO_VERIFIED_DOMAIN",
          message: "Telnyx Email API has no verified sending domain. Verify a custom domain (DNS: DKIM + ownership) to email leads.",
        },
      };
    }
    if (resendAvailable) {
      return {
        provider: "resend",
        mode: "resend",
        from: String(process.env.RESEND_FROM || process.env.EMAIL_FROM_ADDRESS || "").trim(),
      };
    }
    return {
      blocked: {
        provider: "telnyx",
        code: "EMAIL_CAPABILITY_UNAVAILABLE",
        message: "Telnyx Email API is not available on this account and Resend is not configured.",
      },
    };
  }

  if (resendAvailable) {
    return {
      provider: "resend",
      mode: "resend",
      from: String(process.env.RESEND_FROM || process.env.EMAIL_FROM_ADDRESS || "").trim(),
    };
  }

  if (telnyxEnabled && isTelnyxConfiguredOnly()) {
    return {
      blocked: {
        provider: "telnyx",
        code: "EMAIL_CAPABILITY_UNAVAILABLE",
        message: "Telnyx Email API is not available on this account and Resend is not configured.",
      },
    };
  }

  return {
    blocked: {
      provider: "none",
      code: "NO_EMAIL_PROVIDER",
      message: "No email provider configured. Set TELNYX_API_KEY (Telnyx Email API) or RESEND_API_KEY + RESEND_FROM.",
    },
  };
}

function isTelnyxConfiguredOnly(): boolean {
  return isTelnyxEmailConfigured();
}

/**
 * Send an email through the best available provider. Throws EmailRouterError
 * with a structured blocker on failure — CRM surfaces show the real reason.
 */
export async function sendEmail(input: SendEmailInput): Promise<SentEmail> {
  const plan = await planEmailSend(input.from);
  if ("blocked" in plan) throw new EmailRouterError(plan.blocked);

  if (plan.provider === "telnyx") {
    try {
      const out = await sendTelnyxEmail({
        to: input.to,
        subject: input.subject,
        text: input.text ?? null,
        html: input.html ?? null,
        from: plan.from,
        idempotencyKey: input.idempotencyKey ?? null,
      });
      return { id: out.id, provider: "telnyx", status: out.status, replayed: out.replayed };
    } catch (e) {
      if (e instanceof TelnyxEmailError) {
        // Truthful failure — do NOT silently fall back to Resend: the caller
        // (and the admin) need to see the real Telnyx configuration blocker.
        throw new EmailRouterError({
          provider: "telnyx",
          code: e.blocker.code,
          message: e.blocker.message,
          detail: e.blocker.detail,
        });
      }
      throw e;
    }
  }

  // Resend path (one recipient per send — loop for arrays).
  const from = input.from || plan.from;
  const tos = Array.isArray(input.to) ? input.to : [input.to];
  let last: { id: string } | null = null;
  for (const to of tos) {
    last = await sendResendEmail({
      to: String(to),
      subject: input.subject,
      text: input.text ?? null,
      html: input.html ?? null,
      from,
    });
  }
  return { id: last?.id || "", provider: "resend", status: "sent" };
}

/**
 * Structured blockers for the readiness UI. Zero network cost when email is
 * fully unconfigured; one cheap API call when Telnyx is configured.
 */
export async function emailRouterReadiness(): Promise<{
  configured: boolean;
  plan: EmailPlan | null;
  blocker: EmailRouterBlocker | null;
}> {
  const plan = await planEmailSend();
  if ("blocked" in plan) {
    return { configured: false, plan: null, blocker: plan.blocked };
  }
  return { configured: true, plan, blocker: null };
}
