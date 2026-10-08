/**
 * Email provider abstraction (Ticket 10).
 *
 * Defines the provider contract and reads configuration from environment
 * variables — never hardcoded credentials. Supported providers:
 *
 *   - "smtp"    — any SMTP relay (SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS,
 *                 SMTP_SECURE, SMTP_FROM). Sent via nodemailer.
 *   - "resend"  — Resend API (RESEND_API_KEY, RESEND_FROM). Uses the existing
 *                 messaging/email-router.ts send path.
 *   - "telnyx"  — Telnyx Email API (TELNYX_API_KEY). Uses the existing
 *                 messaging/email-router.ts send path.
 *
 * Selection: EMAIL_PROVIDER env var wins when set ("smtp" | "resend" |
 * "telnyx"); otherwise falls back to the existing router's automatic
 * selection (Telnyx custom domain → Telnyx shared domain → Resend).
 *
 * Dev recipient guard: when NODE_ENV !== "production", sends are only
 * delivered to addresses in EMAIL_DEV_ALLOWLIST (comma-separated). Anything
 * else is blocked with a structured error — never silently sent.
 */

export type EmailProviderName = "smtp" | "resend" | "telnyx";

export type EmailProviderConfig = {
  provider: EmailProviderName;
  /** Resolved default from-address for this provider. */
  from: string;
  smtp?: {
    host: string;
    port: number;
    secure: boolean;
    user: string;
    /** Present as boolean only — the secret itself is never exposed. */
    hasPassword: boolean;
  };
};

export type EmailSendInput = {
  to: string;
  subject: string;
  text?: string | null;
  html?: string | null;
  from?: string | null;
  /** Client-supplied idempotency key; generated when omitted. */
  idempotencyKey?: string | null;
};

export type EmailSendResult = {
  provider: EmailProviderName;
  providerMessageId: string;
  status: string;
  replayed?: boolean;
};

export class EmailProviderError extends Error {
  code: string;
  provider: EmailProviderName | "none";
  constructor(code: string, message: string, provider: EmailProviderName | "none" = "none") {
    super(message);
    this.name = "EmailProviderError";
    this.code = code;
    this.provider = provider;
  }
}

function env(name: string): string {
  return String(process.env[name] || "").trim();
}

function flag(name: string, fallback: boolean): boolean {
  const v = env(name).toLowerCase();
  if (!v) return fallback;
  return ["1", "true", "yes", "on"].includes(v);
}

/** True when running anywhere other than production. */
export function isDevEnvironment(): boolean {
  return String(process.env.NODE_ENV || "").toLowerCase() !== "production";
}

/**
 * Dev recipient guard: in non-production, only allowlisted addresses may
 * receive real sends. Returns null when the recipient is allowed, or a
 * human-readable block reason.
 */
export function devRecipientGuard(to: string): string | null {
  if (!isDevEnvironment()) return null;
  const allow = env("EMAIL_DEV_ALLOWLIST")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  if (allow.length === 0) {
    return "Refused: EMAIL_DEV_ALLOWLIST is empty in non-production. Set it to a comma-separated list of test recipients.";
  }
  if (!allow.includes(to.trim().toLowerCase())) {
    return `Refused: ${to} is not in EMAIL_DEV_ALLOWLIST (non-production guard).`;
  }
  return null;
}

/** Read the configured provider without performing any network I/O. */
export function getEmailProviderConfig(): EmailProviderConfig | { blocked: { code: string; message: string } } {
  const explicit = env("EMAIL_PROVIDER").toLowerCase();

  if (explicit === "smtp" || (!explicit && env("SMTP_HOST"))) {
    const host = env("SMTP_HOST");
    const port = parseInt(env("SMTP_PORT") || "587", 10);
    const user = env("SMTP_USER");
    const pass = env("SMTP_PASS");
    const from = env("SMTP_FROM") || env("EMAIL_FROM_ADDRESS");
    if (!host || !user || !pass || !from) {
      return {
        blocked: {
          code: "SMTP_INCOMPLETE",
          message: "SMTP selected but SMTP_HOST, SMTP_USER, SMTP_PASS, and SMTP_FROM (or EMAIL_FROM_ADDRESS) must all be set.",
        },
      };
    }
    return {
      provider: "smtp",
      from,
      smtp: { host, port: Number.isFinite(port) ? port : 587, secure: flag("SMTP_SECURE", false), user, hasPassword: true },
    };
  }

  if (explicit === "resend" || (!explicit && env("RESEND_API_KEY"))) {
    const from = env("RESEND_FROM") || env("EMAIL_FROM_ADDRESS");
    if (!env("RESEND_API_KEY") || !from) {
      return { blocked: { code: "RESEND_INCOMPLETE", message: "Resend selected but RESEND_API_KEY and RESEND_FROM (or EMAIL_FROM_ADDRESS) must be set." } };
    }
    return { provider: "resend", from };
  }

  if (explicit === "telnyx" || (!explicit && env("TELNYX_API_KEY"))) {
    const from = env("EMAIL_FROM_ADDRESS");
    if (!env("TELNYX_API_KEY")) {
      return { blocked: { code: "TELNYX_INCOMPLETE", message: "Telnyx selected but TELNYX_API_KEY must be set." } };
    }
    return { provider: "telnyx", from: from || "" };
  }

  return {
    blocked: {
      code: "NO_EMAIL_PROVIDER",
      message: "No email provider configured. Set EMAIL_PROVIDER=smtp with SMTP_* vars, or RESEND_API_KEY + RESEND_FROM, or TELNYX_API_KEY.",
    },
  };
}

/**
 * Readiness surface for Settings → Email. Zero network cost.
 */
export function emailProviderReadiness(): {
  configured: boolean;
  provider: EmailProviderName | null;
  from: string | null;
  devGuard: boolean;
  blocker: { code: string; message: string } | null;
} {
  const cfg = getEmailProviderConfig();
  if ("blocked" in cfg) {
    return { configured: false, provider: null, from: null, devGuard: isDevEnvironment(), blocker: cfg.blocked };
  }
  return { configured: true, provider: cfg.provider, from: cfg.from || null, devGuard: isDevEnvironment(), blocker: null };
}
