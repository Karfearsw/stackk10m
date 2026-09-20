// Telnyx Email API provider — POST /v2/email_messages (GA).
// Docs: https://developers.telnyx.com/docs/messaging/email/quickstart
//  - from must be an address on a VERIFIED domain (custom domain), or
//    onboarding@<shared-domain> for the zero-setup shared domain.
//  - Shared-domain sends are restricted: recipient must equal the account
//    owner's verified email address. Enforced here so the CRM never fakes a
//    successful send to an arbitrary lead when Telnyx will 403 it.
//  - Success = 202 Accepted { data: { id, status: "queued" } }.
//  - Idempotency-Key header makes retries safe (Telnyx replays the original
//    response with Idempotent-Replayed: true).

export type TelnyxEmailInput = {
  to: string | string[];
  subject: string;
  text?: string | null;
  html?: string | null;
  from?: string | null;
  /** Stable key for safe retries (UUID recommended). Auto-generated when omitted. */
  idempotencyKey?: string | null;
};

export type TelnyxEmailSendResult = {
  id: string;
  status: string;
  /** True when Telnyx answered with the same idempotent response for a retry. */
  replayed?: boolean;
};

export type TelnyxEmailBlocker = {
  code:
    | "MISSING_API_KEY"
    | "MISSING_FROM"
    | "SHARED_DOMAIN_RECIPIENT_BLOCKED"
    | "DOMAIN_NOT_VERIFIED"
    | "PROVIDER_ERROR";
  message: string;
  /** Extra truth for the readiness UI / logs (never includes secrets). */
  detail?: string;
};

export class TelnyxEmailError extends Error {
  blocker: TelnyxEmailBlocker;
  constructor(blocker: TelnyxEmailBlocker) {
    super(blocker.message);
    this.name = "TelnyxEmailError";
    this.blocker = blocker;
  }
}

const BASE = "https://api.telnyx.com/v2";
const SHARED_DOMAIN_SUFFIXES = ["msgtelnyx.com", "mail.telnyx.com"];

function apiKey(): string {
  const key = String(process.env.TELNYX_API_KEY || "").trim();
  if (!key) {
    throw new TelnyxEmailError({
      code: "MISSING_API_KEY",
      message: "TELNYX_API_KEY is not configured",
    });
  }
  return key;
}

/** Default sender: EMAIL_FROM_ADDRESS if set, else the shared-domain onboarding address. */
export function defaultEmailFrom(): string {
  return String(process.env.EMAIL_FROM_ADDRESS || "").trim()
    || `onboarding@${sharedDomainFromEnv()}`;
}

function sharedDomainFromEnv(): string {
  return process.env.TELNYX_EMAIL_SHARED_DOMAIN?.trim() || "msgtelnyx.com";
}

function isSharedDomain(from: string): boolean {
  const domain = from.split("@")[1]?.toLowerCase().trim() || "";
  return SHARED_DOMAIN_SUFFIXES.includes(domain);
}

export function isTelnyxEmailConfigured(): boolean {
  return Boolean(String(process.env.TELNYX_API_KEY || "").trim());
}

function randomKey(): string {
  return globalThis.crypto?.randomUUID?.() || `crm-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

/**
 * Send an email via the Telnyx Email API. Throws TelnyxEmailError with a
 * structured blocker on any failure — callers surface it truthfully.
 */
export async function sendTelnyxEmail(input: TelnyxEmailInput): Promise<TelnyxEmailSendResult> {
  const key = apiKey();
  const from = String(input.from || defaultEmailFrom()).trim();
  if (!from || !from.includes("@")) {
    throw new TelnyxEmailError({ code: "MISSING_FROM", message: "Email from address is missing or invalid" });
  }

  const to = Array.isArray(input.to)
    ? input.to.map((t) => String(t).trim()).filter(Boolean)
    : [String(input.to || "").trim()].filter(Boolean);
  if (!to.length) {
    throw new TelnyxEmailError({ code: "MISSING_FROM", message: "Missing email recipient" });
  }

  const subject = String(input.subject || "").trim();
  if (!subject) {
    throw new TelnyxEmailError({ code: "MISSING_FROM", message: "Missing email subject" });
  }

  // Shared-domain restriction: recipient must match the account owner's
  // verified email. Fail loudly BEFORE the API call — the client UI can then
  // show the real configuration blocker instead of a fake "Sent".
  if (isSharedDomain(from)) {
    const owner = String(process.env.TELNYX_ACCOUNT_EMAIL || "").trim().toLowerCase();
    const blocked = to.filter((t) => t.toLowerCase() !== owner);
    if (blocked.length) {
      throw new TelnyxEmailError({
        code: "SHARED_DOMAIN_RECIPIENT_BLOCKED",
        message:
          "Telnyx shared-domain mode can only send to the account owner's verified email. " +
          "Add and verify a custom sending domain (oceanluxe.org) to email leads.",
        detail: `Blocked recipients: ${blocked.length} of ${to.length}. Set EMAIL_FROM_ADDRESS on a verified custom domain once DNS is done.`,
      });
    }
  }

  const body: Record<string, unknown> = {
    from,
    to,
    subject,
  };
  if (input.text) body.text_body = String(input.text);
  if (input.html) body.html_body = String(input.html);

  const headers: Record<string, string> = {
    Authorization: `Bearer ${key}`,
    "Content-Type": "application/json",
  };
  headers["Idempotency-Key"] = input.idempotencyKey || randomKey();

  let res: Response;
  try {
    res = await fetch(`${BASE}/email_messages`, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15000),
    });
  } catch (e: any) {
    throw new TelnyxEmailError({
      code: "PROVIDER_ERROR",
      message: `Telnyx email request failed: ${String(e?.message || e)}`,
    });
  }

  const data: any = await res.json().catch(() => ({}));

  if (!res.ok) {
    const title = data?.errors?.[0]?.title || data?.title || data?.message || `Telnyx email send failed (${res.status})`;
    const detail = data?.errors?.[0]?.detail || data?.detail || null;
    const code = String(data?.errors?.[0]?.code || data?.code || "");
    // 403 code 10007 = trial/unverified-domain recipient restriction.
    if (res.status === 403 || code === "10007") {
      throw new TelnyxEmailError({
        code: "SHARED_DOMAIN_RECIPIENT_BLOCKED",
        message: "Telnyx rejected the recipient (trial/unverified-domain restriction 10007). Verify a custom sending domain or upgrade the account.",
        detail: detail || undefined,
      });
    }
    throw new TelnyxEmailError({
      code: "PROVIDER_ERROR",
      message: title,
      detail: detail || undefined,
    });
  }

  const id = String(data?.data?.id || "").trim();
  if (!id) {
    throw new TelnyxEmailError({ code: "PROVIDER_ERROR", message: "Telnyx email response missing message id" });
  }
  return {
    id,
    status: String(data?.data?.status || "queued"),
    replayed: res.headers.get("idempotent-replayed") === "true" || undefined,
  };
}

/** Fetch one email message's current status (queued/sent/delivered/...). */
export async function getTelnyxEmailStatus(
  id: string,
): Promise<{ status: string | null; events: { status: string; at: string | null }[] }> {
  const key = apiKey();
  const headers = { Authorization: `Bearer ${key}` };
  const safeId = encodeURIComponent(String(id || ""));
  try {
    const [msgRes, evtRes] = await Promise.all([
      fetch(`${BASE}/email_messages/${safeId}`, { headers, signal: AbortSignal.timeout(10000) }),
      fetch(`${BASE}/email_messages/${safeId}/events`, { headers, signal: AbortSignal.timeout(10000) }).catch(() => null),
    ]);
    const msg = await msgRes.json().catch(() => ({}));
    const status = String(msg?.data?.status || "") || null;
    const events: { status: string; at: string | null }[] = [];
    if (evtRes && evtRes.ok) {
      const evtJson: any = await evtRes.json().catch(() => ({}));
      for (const e of Array.isArray(evtJson?.data) ? evtJson.data : []) {
        events.push({ status: String(e?.status || ""), at: e?.created_at ?? null });
      }
    }
    return { status, events };
  } catch {
    return { status: null, events: [] };
  }
}

/**
 * Live readiness probe: does this account have email capability, and is its
 * sending domain verified? Never throws.
 */
export async function telnyxEmailReadiness(): Promise<{
  capability: boolean;
  domains: { domain: string; status: string; type: string }[];
  customVerified: boolean;
  sharedDomain: string | null;
  ownerEmailConfigured: boolean;
}> {
  const domains: { domain: string; status: string; type: string }[] = [];
  if (!isTelnyxEmailConfigured()) {
    return { capability: false, domains, customVerified: false, sharedDomain: null, ownerEmailConfigured: Boolean(String(process.env.TELNYX_ACCOUNT_EMAIL || "").trim()) };
  }
  try {
    const res = await fetch(`${BASE}/email_domains`, {
      headers: { Authorization: `Bearer ${apiKey()}` },
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) return { capability: false, domains, customVerified: false, sharedDomain: null, ownerEmailConfigured: Boolean(String(process.env.TELNYX_ACCOUNT_EMAIL || "").trim()) };
    const json: any = await res.json().catch(() => ({}));
    for (const d of Array.isArray(json?.data) ? json.data : []) {
      domains.push({
        domain: String(d?.domain || ""),
        status: String(d?.status || ""),
        type: String(d?.type || ""),
      });
    }
  } catch {
    return { capability: false, domains, customVerified: false, sharedDomain: null, ownerEmailConfigured: Boolean(String(process.env.TELNYX_ACCOUNT_EMAIL || "").trim()) };
  }
  const shared = domains.find((d) => d.type === "shared" && d.status === "verified") || null;
  return {
    capability: domains.length > 0,
    domains,
    customVerified: domains.some((d) => d.type !== "shared" && d.status === "verified"),
    sharedDomain: shared?.domain || null,
    ownerEmailConfigured: Boolean(String(process.env.TELNYX_ACCOUNT_EMAIL || "").trim()),
  };
}
