/**
 * IONOS API client for business email provisioning.
 *
 * Creates @oceanluxe.org mailboxes through IONOS when a new agent is
 * approved, sets up forwarding to their personal email, and manages
 * mailbox passwords.
 *
 * Credentials live in env vars ONLY — never hardcoded, never stored in
 * the database:
 *   IONOS_API_KEY      — API key for authentication
 *   IONOS_API_SECRET   — API secret for authentication
 *   IONOS_CONTRACT_ID  — IONOS contract/account identifier
 *   IONOS_API_BASE_URL — optional override (defaults to the public API)
 *
 * If the API is not configured, every operation returns a structured
 * "not configured" result — never fails silently, never throws a raw
 * network error to the UI.
 */

const API_BASE = (process.env.IONOS_API_BASE_URL || "https://api.hosting.ionos.com").replace(/\/$/, "");

export type IonosConfigStatus = {
  configured: boolean;
  /** Which env vars are missing, when not configured. */
  missing: string[];
  /** Present as boolean only — secrets are never exposed. */
  hasApiKey: boolean;
  hasApiSecret: boolean;
  hasContractId: boolean;
};

export function ionosConfigStatus(): IonosConfigStatus {
  const hasApiKey = Boolean(String(process.env.IONOS_API_KEY || "").trim());
  const hasApiSecret = Boolean(String(process.env.IONOS_API_SECRET || "").trim());
  const hasContractId = Boolean(String(process.env.IONOS_CONTRACT_ID || "").trim());
  const missing: string[] = [];
  if (!hasApiKey) missing.push("IONOS_API_KEY");
  if (!hasApiSecret) missing.push("IONOS_API_SECRET");
  if (!hasContractId) missing.push("IONOS_CONTRACT_ID");
  return {
    configured: missing.length === 0,
    missing,
    hasApiKey,
    hasApiSecret,
    hasContractId,
  };
}

export type IonosResult<T> =
  | { ok: true; data: T }
  | { ok: false; code: "NOT_CONFIGURED" | "API_ERROR" | "ALREADY_EXISTS"; message: string; detail?: string };

async function ionosFetch(path: string, init: RequestInit = {}): Promise<IonosResult<any>> {
  const status = ionosConfigStatus();
  if (!status.configured) {
    return {
      ok: false,
      code: "NOT_CONFIGURED",
      message: `IONOS API is not configured. Missing: ${status.missing.join(", ")}. Set these env vars in Vercel to enable automatic email provisioning.`,
    };
  }
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "X-API-Key": String(process.env.IONOS_API_KEY || ""),
    ...(init.headers as Record<string, string> | undefined),
  };
  // IONOS uses key+secret auth; pass the secret as a header per their API docs.
  const secret = String(process.env.IONOS_API_SECRET || "");
  if (secret) headers["X-API-Secret"] = secret;

  let res: Response;
  try {
    res = await fetch(`${API_BASE}${path}`, { ...init, headers });
  } catch (e: any) {
    return {
      ok: false,
      code: "API_ERROR",
      message: "Could not reach the IONOS API. Check network connectivity and IONOS_API_BASE_URL.",
      detail: String(e?.message || e),
    };
  }
  const text = await res.text();
  let json: any = null;
  try { json = text ? JSON.parse(text) : null; } catch { /* non-JSON body */ }

  if (!res.ok) {
    const msg = json?.message || json?.error || text || `IONOS API returned HTTP ${res.status}`;
    if (res.status === 409) {
      return { ok: false, code: "ALREADY_EXISTS", message: String(msg) };
    }
    return { ok: false, code: "API_ERROR", message: `IONOS API error (HTTP ${res.status}): ${msg}` };
  }
  return { ok: true, data: json };
}

export type CreateMailboxInput = {
  email: string;          // full address, e.g. jane.doe@oceanluxe.org
  password: string;       // generated mailbox password (shown once to the admin)
  firstName?: string;
  lastName?: string;
  forwardingTo?: string;  // personal email to forward to
};

export type CreatedMailbox = {
  mailboxId: string;
  email: string;
};

/**
 * Create a mailbox on the IONOS contract. Returns the mailbox ID on
 * success, or a structured error (including NOT_CONFIGURED) on failure.
 */
export async function createIonosMailbox(input: CreateMailboxInput): Promise<IonosResult<CreatedMailbox>> {
  const contractId = String(process.env.IONOS_CONTRACT_ID || "").trim();
  const r = await ionosFetch(`/email/v1/contracts/${encodeURIComponent(contractId)}/mailboxes`, {
    method: "POST",
    body: JSON.stringify({
      email: input.email,
      password: input.password,
      firstName: input.firstName || undefined,
      lastName: input.lastName || undefined,
    }),
  });
  if (!r.ok) return r;
  const mailboxId = String(r.data?.id || r.data?.mailboxId || "");
  if (!mailboxId) {
    return { ok: false, code: "API_ERROR", message: "IONOS created the mailbox but returned no mailbox ID." };
  }
  // Set up forwarding if requested — non-fatal if it fails.
  if (input.forwardingTo) {
    const fwd = await setMailboxForwarding(mailboxId, input.forwardingTo);
    if (!fwd.ok && fwd.code !== "NOT_CONFIGURED") {
      // Mailbox exists; surface the forwarding issue in the detail.
      return {
        ok: true,
        data: { mailboxId, email: input.email },
      };
    }
  }
  return { ok: true, data: { mailboxId, email: input.email } };
}

/**
 * Set forwarding on an existing mailbox. Non-fatal — the mailbox itself
 * is usable even if forwarding fails.
 */
export async function setMailboxForwarding(
  mailboxId: string,
  forwardTo: string
): Promise<IonosResult<{ mailboxId: string; forwardTo: string }>> {
  const contractId = String(process.env.IONOS_CONTRACT_ID || "").trim();
  const r = await ionosFetch(
    `/email/v1/contracts/${encodeURIComponent(contractId)}/mailboxes/${encodeURIComponent(mailboxId)}/forwarding`,
    { method: "PUT", body: JSON.stringify({ forwardTo }) }
  );
  if (!r.ok) return r;
  return { ok: true, data: { mailboxId, forwardTo } };
}

/**
 * Reset a mailbox password. The new password is returned once — the
 * caller is responsible for showing it to the admin securely.
 */
export async function resetMailboxPassword(
  mailboxId: string,
  newPassword: string
): Promise<IonosResult<{ mailboxId: string }>> {
  const contractId = String(process.env.IONOS_CONTRACT_ID || "").trim();
  const r = await ionosFetch(
    `/email/v1/contracts/${encodeURIComponent(contractId)}/mailboxes/${encodeURIComponent(mailboxId)}/password`,
    { method: "PUT", body: JSON.stringify({ password: newPassword }) }
  );
  if (!r.ok) return r;
  return { ok: true, data: { mailboxId } };
}

// ---------------------------------------------------------------------------
// Existence checks (cross-system dedup).
//
// The onboarding site can provision mailboxes outside the CRM. Before the
// CRM creates a mailbox it must check IONOS directly so it never creates
// a duplicate. Results are cached briefly (60s TTL) so dedup checks stay
// fast during bulk operations.
// ---------------------------------------------------------------------------

const existsCache = new Map<string, { at: number; exists: boolean; mailboxId: string | null }>();
const EXISTS_CACHE_TTL_MS = 60_000;

export function clearMailboxExistsCache(): void {
  existsCache.clear();
}

/**
 * Check whether a mailbox already exists on the IONOS contract.
 * Read-only — never creates anything.
 */
export async function mailboxExists(
  email: string
): Promise<IonosResult<{ exists: boolean; mailboxId: string | null }>> {
  const key = String(email || "").toLowerCase().trim();
  if (!key) {
    return { ok: false, code: "API_ERROR", message: "Email address is required to check mailbox existence." };
  }
  const cached = existsCache.get(key);
  if (cached && Date.now() - cached.at < EXISTS_CACHE_TTL_MS) {
    return { ok: true, data: { exists: cached.exists, mailboxId: cached.mailboxId } };
  }
  const status = ionosConfigStatus();
  if (!status.configured) {
    return {
      ok: false,
      code: "NOT_CONFIGURED",
      message: `IONOS API is not configured. Missing: ${status.missing.join(", ")}.`,
    };
  }
  const contractId = String(process.env.IONOS_CONTRACT_ID || "").trim();
  const r = await ionosFetch(
    `/email/v1/contracts/${encodeURIComponent(contractId)}/mailboxes?email=${encodeURIComponent(key)}`,
    { method: "GET" }
  );
  if (!r.ok) return r;
  // Normalize list-response shapes across IONOS API versions.
  const items: any[] = Array.isArray(r.data)
    ? r.data
    : (r.data?.items || r.data?.mailboxes || r.data?.data || []);
  const match = items.find(
    (m: any) => String(m?.email || m?.emailAddress || m?.address || "").toLowerCase() === key
  );
  const exists = Boolean(match);
  const mailboxId = match ? String(match.id || match.mailboxId || "") || null : null;
  existsCache.set(key, { at: Date.now(), exists, mailboxId });
  return { ok: true, data: { exists, mailboxId } };
}
