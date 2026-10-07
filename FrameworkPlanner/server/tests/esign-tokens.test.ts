/**
 * server/tests/esign-tokens.test.ts — HMAC signer-token sign/verify.
 * Pure unit tests (no DB, no browser).
 */
import { describe, it, expect } from "vitest";
import {
  issueSignerToken,
  verifySignerToken,
  hashTokenNonce,
} from "../esign/tokens.js";

const SECRET = "test-hmac-secret-0123456789abcdef";

function issued(overrides: Partial<{ envelopeId: number; signerId: number; expiresAt: Date }> = {}) {
  return issueSignerToken({
    envelopeId: 42,
    signerId: 7,
    expiresAt: new Date(Date.now() + 60_000),
    secret: SECRET,
    ...overrides,
  });
}

describe("esign signer tokens", () => {
  it("issues a token that verifies", () => {
    const { token, nonce } = issued();
    expect(nonce.length).toBeGreaterThan(10);
    const v = verifySignerToken(token, SECRET);
    expect(v.ok).toBe(true);
    if (v.ok) {
      expect(v.claims.envelopeId).toBe(42);
      expect(v.claims.signerId).toBe(7);
      expect(v.claims.nonce).toBe(nonce);
    }
  });

  it("rejects a tampered payload (envelope id swapped)", () => {
    const { token } = issued();
    const parts = token.split(".");
    parts[1] = "9999"; // envelopeId
    const v = verifySignerToken(parts.join("."), SECRET);
    expect(v.ok).toBe(false);
    if (!v.ok) expect(v.reason).toBe("bad_signature");
  });

  it("rejects a tampered signature", () => {
    const { token } = issued();
    const v = verifySignerToken(token.slice(0, -2) + "ab", SECRET);
    expect(v.ok).toBe(false);
    if (!v.ok) expect(v.reason).toBe("bad_signature");
  });

  it("rejects verification with the wrong secret", () => {
    const { token } = issued();
    const v = verifySignerToken(token, "wrong-secret-0123456789abcdef");
    expect(v.ok).toBe(false);
  });

  it("rejects an expired token", () => {
    const { token } = issued({ expiresAt: new Date(Date.now() - 1_000) });
    const v = verifySignerToken(token, SECRET);
    expect(v.ok).toBe(false);
    if (!v.ok) expect(v.reason).toBe("expired");
  });

  it("rejects malformed tokens", () => {
    for (const bad of ["", "abc", "esign_v1.1.2", "v2.1.2.3.4.5"]) {
      const v = verifySignerToken(bad, SECRET);
      expect(v.ok).toBe(false);
    }
  });

  it("issues unique nonces per token (replay differentiation)", () => {
    const a = issued();
    const b = issued();
    expect(a.nonce).not.toBe(b.nonce);
    expect(a.token).not.toBe(b.token);
    expect(hashTokenNonce(a.nonce)).toHaveLength(64);
  });
});
