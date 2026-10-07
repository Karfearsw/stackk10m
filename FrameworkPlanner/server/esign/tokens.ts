/**
 * server/esign/tokens.ts — HMAC-signed, single-use signer tokens.
 *
 * Token format (URL-safe, opaque to the signer):
 *   esign_v1.<envelopeId>.<signerId>.<expiresAtEpoch>.<nonce>.<hmac>
 * where hmac = HMAC-SHA256(secret, "esign_v1.<envelopeId>.<signerId>.<expiresAtEpoch>.<nonce>")
 *
 * Verification is stateless (HMAC + expiry), but SINGLE-USE is enforced
 * statefully: the token's nonce is stored on contract_signers.token_nonce, and
 * the first successful signing sets token_used_at. Any later attempt with the
 * same token is rejected even though the HMAC still verifies.
 */
import crypto from "node:crypto";

const TOKEN_PREFIX = "esign_v1";

function b64urlEncode(input: string | Buffer): string {
  const b = typeof input === "string" ? Buffer.from(input, "utf8") : input;
  return b.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function b64urlDecode(input: string): string {
  let s = input.replace(/-/g, "+").replace(/_/g, "/");
  const pad = s.length % 4;
  if (pad) s += "=".repeat(4 - pad);
  return Buffer.from(s, "base64").toString("utf8");
}

/** Resolve the HMAC secret. Requires ESIGN_HMAC_SECRET in production; falls
 *  back to a key derived from SESSION_SECRET in dev with a loud warning. */
export function getHmacSecret(): { secret: string; fallback: boolean } {
  const explicit = process.env.ESIGN_HMAC_SECRET;
  if (explicit && explicit.trim().length >= 32) {
    return { secret: explicit.trim(), fallback: false };
  }
  const session = process.env.SESSION_SECRET;
  if (session && session.trim()) {
    console.warn(
      JSON.stringify({
        ts: new Date().toISOString(),
        event: "esign",
        kind: "hmac_secret_fallback",
        message: "ESIGN_HMAC_SECRET not set — deriving signer-token key from SESSION_SECRET. Set a dedicated 32+ char ESIGN_HMAC_SECRET before production.",
      })
    );
    return {
      secret: crypto.createHmac("sha256", session.trim()).update("oceanluxe-esign-v1").digest("hex"),
      fallback: true,
    };
  }
  throw new Error("ESIGN_HMAC_SECRET (or SESSION_SECRET) must be configured to issue signer tokens.");
}

export interface SignerTokenClaims {
  version: string;
  envelopeId: number;
  signerId: number;
  expiresAt: number; // epoch seconds
  nonce: string;
}

function signPayload(payload: string, secret: string): string {
  return b64urlEncode(crypto.createHmac("sha256", secret).update(payload).digest());
}

/** Issue a new signer token. Returns { token, nonce, expiresAt }. */
export function issueSignerToken(args: {
  envelopeId: number;
  signerId: number;
  expiresAt: Date;
  secret?: string;
}): { token: string; nonce: string; expiresAt: number } {
  const secret = args.secret ?? getHmacSecret().secret;
  const nonce = b64urlEncode(crypto.randomBytes(16));
  const exp = Math.floor(args.expiresAt.getTime() / 1000);
  const payload = [TOKEN_PREFIX, String(args.envelopeId), String(args.signerId), String(exp), nonce].join(".");
  const token = `${payload}.${signPayload(payload, secret)}`;
  return { token, nonce, expiresAt: exp };
}

export type TokenVerifyResult =
  | { ok: true; claims: SignerTokenClaims }
  | { ok: false; reason: "malformed" | "bad_signature" | "expired" };

/** Stateless verification: structure + HMAC + expiry. Does NOT check
 *  single-use — the caller must enforce that against the DB row. */
export function verifySignerToken(token: string, secret?: string): TokenVerifyResult {
  const parts = String(token || "").split(".");
  if (parts.length !== 6 || parts[0] !== TOKEN_PREFIX) return { ok: false, reason: "malformed" };
  const [, envStr, signerStr, expStr, nonce, sig] = parts;
  const envelopeId = Number(envStr);
  const signerId = Number(signerStr);
  const exp = Number(expStr);
  if (!Number.isInteger(envelopeId) || !Number.isInteger(signerId) || !Number.isInteger(exp) || !nonce) {
    return { ok: false, reason: "malformed" };
  }
  const key = secret ?? getHmacSecret().secret;
  const payload = parts.slice(0, 5).join(".");
  const expected = signPayload(payload, key);
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    return { ok: false, reason: "bad_signature" };
  }
  if (exp * 1000 < Date.now()) return { ok: false, reason: "expired" };
  return { ok: true, claims: { version: TOKEN_PREFIX, envelopeId, signerId, expiresAt: exp, nonce } };
}

/** SHA-256 of the raw token, for constant-time comparison of the stored nonce. */
export function hashTokenNonce(nonce: string): string {
  return crypto.createHash("sha256").update(String(nonce)).digest("hex");
}

export { b64urlDecode };
