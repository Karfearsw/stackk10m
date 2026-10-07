/**
 * server/tests/esign-ceremony.test.ts — Signing-ceremony guards.
 *
 * Proves the gate end-to-end at the rule level:
 *   expired link rejected · single-use enforced · out-of-order rejected ·
 *   tampered token rejected · signed -> completed transition.
 */
import { describe, it, expect } from "vitest";
import {
  canSignerSign,
  canAccessSignerLink,
  statusAfterSign,
  type SignerRowLike,
  type EnvelopeRowLike,
} from "../esign/ceremony.js";
import { issueSignerToken, verifySignerToken } from "../esign/tokens.js";

const SECRET = "test-hmac-secret-0123456789abcdef";
const FUTURE = new Date(Date.now() + 3_600_000);
const PAST = new Date(Date.now() - 3_600_000);

function env(over: Partial<EnvelopeRowLike> = {}): EnvelopeRowLike {
  return { id: 1, status: "sent", signingMode: "sequential", expiresAt: FUTURE, ...over };
}
function signer(over: Partial<SignerRowLike> = {}): SignerRowLike {
  return {
    id: 11, envelopeId: 1, status: "sent", signingOrder: 0,
    tokenNonce: "n1", tokenUsedAt: null, expiresAt: FUTURE, ...over,
  };
}
function claimsFor(signerId = 11, nonce = "n1", envelopeId = 1) {
  const { token } = issueSignerToken({ envelopeId, signerId, expiresAt: FUTURE, secret: SECRET });
  // swap in a deterministic nonce for the fixture by re-issuing parts is not
  // possible; instead verify the real token and override the nonce claim.
  const v = verifySignerToken(token, SECRET);
  if (!v.ok) throw new Error("fixture token failed");
  return { ...v.claims, nonce };
}

describe("esign ceremony guards", () => {
  it("allows a fresh sequential signing", () => {
    const s1 = signer({ id: 11, signingOrder: 0 });
    const r = canSignerSign(env(), s1, [s1], claimsFor(11));
    expect(r.ok).toBe(true);
  });

  it("rejects an expired link", () => {
    const s1 = signer({ expiresAt: PAST });
    const r = canSignerSign(env({ expiresAt: PAST }), s1, [s1], claimsFor(11));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("link_expired");
  });

  it("rejects a reused (single-use) token", () => {
    const s1 = signer({ tokenUsedAt: new Date() });
    const r = canSignerSign(env(), s1, [s1], claimsFor(11));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("token_reused");
  });

  it("rejects a token whose nonce does not match the stored nonce", () => {
    const s1 = signer({ tokenNonce: "stored-nonce" });
    const r = canSignerSign(env(), s1, [s1], claimsFor(11, "attacker-nonce"));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("token_nonce_mismatch");
  });

  it("rejects out-of-order signing in sequential mode", () => {
    const s1 = signer({ id: 11, signingOrder: 0, status: "sent" });
    const s2 = signer({ id: 12, signingOrder: 1, status: "sent", tokenNonce: "n2" });
    const r = canSignerSign(env(), s2, [s1, s2], claimsFor(12, "n2"));
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.code).toBe("out_of_order");
      expect((r as any).waitingOn).toContain(11);
    }
  });

  it("allows the second signer after the first signed", () => {
    const s1 = signer({ id: 11, signingOrder: 0, status: "signed" });
    const s2 = signer({ id: 12, signingOrder: 1, status: "sent", tokenNonce: "n2" });
    const r = canSignerSign(env(), s2, [s1, s2], claimsFor(12, "n2"));
    expect(r.ok).toBe(true);
  });

  it("allows any order in parallel mode", () => {
    const s1 = signer({ id: 11, signingOrder: 0, status: "sent" });
    const s2 = signer({ id: 12, signingOrder: 1, status: "sent", tokenNonce: "n2" });
    const r = canSignerSign(env({ signingMode: "parallel" }), s2, [s1, s2], claimsFor(12, "n2"));
    expect(r.ok).toBe(true);
  });

  it("rejects signing on a completed envelope", () => {
    const s1 = signer();
    const r = canSignerSign(env({ status: "completed" }), s1, [s1], claimsFor(11));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("envelope_not_signable");
  });

  it("rejects an already-signed signer", () => {
    const s1 = signer({ status: "signed" });
    const r = canSignerSign(env(), s1, [s1], claimsFor(11));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("signer_not_signable");
  });

  it("blocks link access after envelope completion", () => {
    const r = canAccessSignerLink(env({ status: "completed" }), signer(), claimsFor(11));
    expect(r.ok).toBe(false);
  });

  it("statusAfterSign: partial -> signed, all done -> completed", () => {
    expect(statusAfterSign(["signed", "sent"])).toBe("signed");
    expect(statusAfterSign(["signed", "signed"])).toBe("completed");
    expect(statusAfterSign(["signed", "declined"])).toBe("completed");
  });
});
