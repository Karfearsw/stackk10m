/**
 * server/esign/ceremony.ts — Pure signing-ceremony rules (no DB, no I/O).
 *
 * These guards are the legal backbone's enforcement points; they are unit-
 * tested directly and reused by envelopes.ts so the HTTP layer cannot bypass
 * them.
 */
import type { SignerTokenClaims } from "./tokens.js";

export interface SignerRowLike {
  id: number;
  envelopeId: number | null;
  status: string;
  signingOrder: number | null;
  tokenNonce: string | null;
  tokenUsedAt: Date | null;
  expiresAt: Date | null;
}

export interface EnvelopeRowLike {
  id: number;
  status: string;
  signingMode: string | null;
  expiresAt: Date | null;
}

export type GuardFailure =
  | { ok: false; code: "envelope_not_signable"; status: string }
  | { ok: false; code: "signer_not_signable"; status: string }
  | { ok: false; code: "token_reused"; }
  | { ok: false; code: "token_nonce_mismatch" }
  | { ok: false; code: "link_expired" }
  | { ok: false; code: "out_of_order"; waitingOn: number[] };

export type GuardSuccess = { ok: true };

/** Envelope-level statuses that still allow a signing attempt. */
const SIGNABLE_ENVELOPE = new Set(["sent", "viewed", "signed"]);
/** Signer-level statuses that still allow a signing attempt. */
const SIGNABLE_SIGNER = new Set(["pending", "sent", "viewed"]);

function isExpired(expiresAt: Date | null, now: number): boolean {
  return !!expiresAt && new Date(expiresAt).getTime() < now;
}

export function isEnvelopeExpired(env: EnvelopeRowLike, now = Date.now()): boolean {
  return isExpired(env.expiresAt, now);
}

/**
 * Full pre-sign guard chain. Order of checks is deliberate:
 * expiry first (time-based, most common edge), then state, then token
 * single-use, then signing order.
 */
export function canSignerSign(
  env: EnvelopeRowLike,
  signer: SignerRowLike,
  allSigners: SignerRowLike[],
  claims: SignerTokenClaims,
  now = Date.now()
): GuardSuccess | GuardFailure {
  if (isEnvelopeExpired(env, now) || isExpired(signer.expiresAt, now)) {
    return { ok: false, code: "link_expired" };
  }
  if (!SIGNABLE_ENVELOPE.has(env.status)) {
    return { ok: false, code: "envelope_not_signable", status: env.status };
  }
  if (!SIGNABLE_SIGNER.has(signer.status)) {
    return { ok: false, code: "signer_not_signable", status: signer.status };
  }
  // Single-use: the token is consumed by a completed signing. Replays are
  // rejected even though the HMAC signature itself still verifies.
  if (signer.tokenUsedAt) return { ok: false, code: "token_reused" };
  if (!signer.tokenNonce || signer.tokenNonce !== claims.nonce) {
    return { ok: false, code: "token_nonce_mismatch" };
  }
  if (String(env.signingMode || "sequential") === "sequential") {
    const myOrder = signer.signingOrder ?? 0;
    const waitingOn = allSigners
      .filter((s) => s.id !== signer.id && (s.signingOrder ?? 0) < myOrder && s.status !== "signed")
      .map((s) => s.id);
    if (waitingOn.length) return { ok: false, code: "out_of_order", waitingOn };
  }
  return { ok: true };
}

/** A view/decline attempt is allowed while the link is live and un-consumed. */
export function canAccessSignerLink(
  env: EnvelopeRowLike,
  signer: SignerRowLike,
  claims: SignerTokenClaims,
  now = Date.now()
): GuardSuccess | { ok: false; code: "link_expired" | "token_nonce_mismatch" | "envelope_closed" } {
  if (isEnvelopeExpired(env, now) || isExpired(signer.expiresAt, now)) {
    return { ok: false, code: "link_expired" };
  }
  if (!signer.tokenNonce || signer.tokenNonce !== claims.nonce) {
    return { ok: false, code: "token_nonce_mismatch" };
  }
  if (["completed", "expired", "voided"].includes(env.status)) {
    return { ok: false, code: "envelope_closed" };
  }
  return { ok: true };
}

/**
 * Envelope status after a signer completes signing.
 * - more signers pending  -> "signed" (partially signed)
 * - all signers signed    -> "completed" (finalize + certificate)
 */
export function statusAfterSign(signerStatuses: string[]): "signed" | "completed" {
  const pending = signerStatuses.filter((s) => s !== "signed" && s !== "declined");
  return pending.length === 0 ? "completed" : "signed";
}
