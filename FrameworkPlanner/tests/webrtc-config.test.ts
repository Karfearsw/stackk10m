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
  // Reset require/module cache to pick up fresh env per test.
  for (const key of Object.keys((await import("module")).default._cache)) {
    if (key.includes("webrtc-config")) delete (await import("module")).default._cache[key];
  }
  return await import("../server/services/telecom/webrtc-config.js");
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

    const cfg = mod.getWebRtcClientConfig();
    expect(cfg.login).toBe("gencred123");
    expect(cfg.password).toBe("secret");
    expect(cfg.loginToken).toBeUndefined();
  });

  it("prefers login_token mode over credentials", async () => {
    resetEnv({
      TELNYX_WEBRTC_ENABLED: "true",
      TELNYX_WEBRTC_LOGIN_TOKEN: "jwt-abc",
      TELNYX_WEBRTC_SIP_USER: "u",
      TELNYX_WEBRTC_SIP_PASSWORD: "p",
    });
    const mod = await loadModule();
    const r = mod.getWebRtcReadiness();
    expect(r.mode).toBe("login_token");
    const cfg = mod.getWebRtcClientConfig();
    expect(cfg.loginToken).toBe("jwt-abc");
    expect(cfg.login).toBeUndefined();
  });

  it("flags missing password as a blocker", async () => {
    resetEnv({ TELNYX_WEBRTC_ENABLED: "true", TELNYX_WEBRTC_SIP_USER: "u", TELNYX_WEBRTC_SIP_PASSWORD: "" });
    const mod = await loadModule();
    const r = mod.getWebRtcReadiness();
    expect(r.enabled).toBe(false);
    expect(r.blocker).toContain("TELNYX_WEBRTC_SIP_PASSWORD");
  });

  it("never exposes TELNYX_API_KEY", async () => {
    resetEnv({
      TELNYX_API_KEY: "KEY_TOP_SECRET_123",
      TELNYX_WEBRTC_ENABLED: "true",
      TELNYX_WEBRTC_SIP_USER: "gencred123",
      TELNYX_WEBRTC_SIP_PASSWORD: "password1",
    });
    const mod = await loadModule();
    const cfg = JSON.stringify(mod.getWebRtcClientConfig());
    expect(cfg).not.toContain("KEY_TOP_SECRET_123");
  });
});
