import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

// Environment snapshot so tests don't clobber real runtime config.
const originalEnv = { ...process.env };

function resetEnv(overrides: Record<string, string | undefined>) {
  process.env = { ...originalEnv };
  for (const [k, v] of Object.entries(overrides)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
}

async function loadModule() {
  const mod = await import("module");
  for (const key of Object.keys(mod.default._cache)) {
    if (key.includes("webrtc-config")) delete mod.default._cache[key];
  }
  return await import("../server/services/telecom/webrtc-config.js");
}

// A fake JWT: header.payload.signature with an exp claim 24h in the future.
function fakeJwt() {
  const exp = Math.floor(Date.now() / 1000) + 24 * 3600;
  const payload = Buffer.from(JSON.stringify({ aud: "telnyx_telephony", exp, iat: Math.floor(Date.now() / 1000), iss: "telnyx_telephony", jti: "abc-123" })).toString("base64url");
  return "eyJhbGciOiJIUzUxMiIsInR5cCI6IkpXVCJ9." + payload + ".sig";
}

describe("webrtc-config", () => {
  beforeEach(() => {
    process.env = { ...originalEnv };
  });
  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it("reports disabled when TELNYX_WEBRTC_ENABLED is off", async () => {
    resetEnv({ TELNYX_WEBRTC_ENABLED: "false", TELNYX_WEBRTC_SIP_USER: "u", TELNYX_WEBRTC_SIP_PASSWORD: "p" });
    const mod = await loadModule();
    const r = mod.getWebRtcReadiness();
    expect(r.enabled).toBe(false);
    expect(r.mode).toBeNull();
    expect(r.blocker).toContain("TELNYX_WEBRTC_ENABLED");
  });

  it("reports credentials mode when user+password configured", async () => {
    resetEnv({
      TELNYX_WEBRTC_ENABLED: "true",
      TELNYX_WEBRTC_SIP_USER: "gencred123",
      TELNYX_WEBRTC_SIP_PASSWORD: "secret",
      TELNYX_DEFAULT_FROM_NUMBER: "+15550000000",
    });
    const mod = await loadModule();
    const r = mod.getWebRtcReadiness();
    expect(r.enabled).toBe(true);
    expect(r.mode).toBe("credentials");
    expect(r.defaultFromNumber).toBe("+15550000000");

    const cfg = await mod.getWebRtcClientConfig();
    expect(cfg.login).toBe("gencred123");
    expect(cfg.password).toBe("secret");
    expect(cfg.loginToken).toBeUndefined();
  });

  it("prefers static login_token over credentials", async () => {
    resetEnv({
      TELNYX_WEBRTC_ENABLED: "true",
      TELNYX_WEBRTC_LOGIN_TOKEN: "jwt-abc",
      TELNYX_WEBRTC_SIP_USER: "u",
      TELNYX_WEBRTC_SIP_PASSWORD: "p",
    });
    const mod = await loadModule();
    const r = mod.getWebRtcReadiness();
    expect(r.mode).toBe("login_token");
    const cfg = await mod.getWebRtcClientConfig();
    expect(cfg.loginToken).toBe("jwt-abc");
    expect(cfg.login).toBeUndefined();
  });

  it("mints a login_token from TELNYX_WEBRTC_CREDENTIAL_ID via the Telnyx API", async () => {
    resetEnv({
      TELNYX_WEBRTC_ENABLED: "true",
      TELNYX_WEBRTC_CREDENTIAL_ID: "81d109ca-3d51-4b3c-9ec6-34c7305695a8",
      TELNYX_API_KEY: "KEY_TEST_123",
    });
    const token = fakeJwt();
    const fetchMock = vi.fn(async () => ({ ok: true, status: 201, text: async () => token }) as any);
    vi.stubGlobal("fetch", fetchMock);

    const mod = await loadModule();
    const r = mod.getWebRtcReadiness();
    expect(r.mode).toBe("login_token");

    const cfg = await mod.getWebRtcClientConfig();
    expect(cfg.loginToken).toBe(token);
    expect(cfg.password).toBeUndefined();
    expect(cfg.login).toBeUndefined();
    // Assert it called the exact Telnyx mint endpoint with the API key, not exposed elsewhere.
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.telnyx.com/v2/telephony_credentials/81d109ca-3d51-4b3c-9ec6-34c7305695a8/token",
      expect.objectContaining({ method: "POST", headers: expect.objectContaining({ Authorization: "Bearer KEY_TEST_123" }) }),
    );
    vi.unstubAllGlobals();
  });

  it("never exposes TELNYX_API_KEY", async () => {
    resetEnv({
      TELNYX_API_KEY: "KEY_TOP_SECRET_123",
      TELNYX_WEBRTC_ENABLED: "true",
      TELNYX_WEBRTC_SIP_USER: "gencred123",
      TELNYX_WEBRTC_SIP_PASSWORD: "password1",
    });
    const mod = await loadModule();
    const cfg = JSON.stringify(await mod.getWebRtcClientConfig());
    expect(cfg).not.toContain("KEY_TOP_SECRET_123");
  });
});
