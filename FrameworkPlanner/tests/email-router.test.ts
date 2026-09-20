import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

// ── Module mocks ───────────────────────────────────────────────────────────
const m = vi.hoisted(() => ({
  fetch: vi.fn(),
}));

vi.stubGlobal("fetch", m.fetch);

function jsonResponse(status: number, body: unknown, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", ...headers } });
}

import {
  sendTelnyxEmail,
  TelnyxEmailError,
  isTelnyxEmailConfigured,
} from "../server/services/messaging/telnyx-email";
import {
  sendEmail,
  planEmailSend,
  EmailRouterError,
} from "../server/services/messaging/email-router";

beforeEach(() => {
  vi.clearAllMocks();
  process.env.TELNYX_API_KEY = "KEY-test";
  delete process.env.TELNYX_EMAIL_ENABLED;
  delete process.env.EMAIL_FROM_ADDRESS;
  delete process.env.TELNYX_ACCOUNT_EMAIL;
  delete process.env.RESEND_API_KEY;
  delete process.env.RESEND_FROM;
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("telnyx-email provider", () => {
  it("reports unconfigured without TELNYX_API_KEY", () => {
    delete process.env.TELNYX_API_KEY;
    expect(isTelnyxEmailConfigured()).toBe(false);
    expect(sendTelnyxEmail({ to: "a@b.com", subject: "s" })).rejects.toBeInstanceOf(TelnyxEmailError);
  });

  it("blocks shared-domain sends to non-owner recipients BEFORE calling the API", async () => {
    m.fetch.mockResolvedValue(jsonResponse(202, { data: { id: "x", status: "queued" } }));
    await expect(
      sendTelnyxEmail({ to: "lead@example.com", subject: "hi" }),
    ).rejects.toMatchObject({ blocker: { code: "SHARED_DOMAIN_RECIPIENT_BLOCKED" } });
    expect(m.fetch).not.toHaveBeenCalled();
  });

  it("sends from the shared-domain onboarding address to the owner email", async () => {
    process.env.TELNYX_ACCOUNT_EMAIL = "owner@oceanluxe.org";
    m.fetch.mockResolvedValue(jsonResponse(202, { data: { id: "em-1", status: "queued" } }));
    const res = await sendTelnyxEmail({ to: "OWNER@oceanluxe.org", subject: "hi", text: "body" });
    expect(res.id).toBe("em-1");
    expect(res.status).toBe("queued");
    const body = JSON.parse(m.fetch.mock.calls[0][1].body);
    expect(body.from).toBe("onboarding@msgtelnyx.com");
    expect(body.text_body).toBe("body");
    expect(m.fetch.mock.calls[0][1].headers["Idempotency-Key"]).toBeTruthy();
  });

  it("maps Telnyx 403 code 10007 to the recipient-restriction blocker", async () => {
    m.fetch.mockResolvedValue(jsonResponse(403, { errors: [{ code: "10007", title: "Forbidden", detail: "trial" }] }));
    await expect(
      sendTelnyxEmail({ to: "owner@oceanluxe.org", subject: "hi" }),
    ).rejects.toMatchObject({ blocker: { code: "SHARED_DOMAIN_RECIPIENT_BLOCKED" } });
  });

  it("includes html_body when html is provided", async () => {
    process.env.TELNYX_ACCOUNT_EMAIL = "owner@oceanluxe.org";
    m.fetch.mockResolvedValue(jsonResponse(202, { data: { id: "em-2", status: "queued" } }));
    await sendTelnyxEmail({ to: "owner@oceanluxe.org", subject: "hi", html: "<p>x</p>" });
    const body = JSON.parse(m.fetch.mock.calls[0][1].body);
    expect(body.html_body).toBe("<p>x</p>");
  });
});

describe("email-router provider selection", () => {
  it("returns a NO_EMAIL_PROVIDER blocker when nothing is configured", async () => {
    delete process.env.TELNYX_API_KEY;
    const plan = await planEmailSend();
    expect(plan).toMatchObject({ blocked: { provider: "none", code: "NO_EMAIL_PROVIDER" } });
    await expect(sendEmail({ to: "a@b.com", subject: "s" })).rejects.toBeInstanceOf(EmailRouterError);
  });

  it("prefers telnyx shared domain when no custom domain is verified and no resend", async () => {
    m.fetch.mockResolvedValue(jsonResponse(200, { data: [
      { domain: "msgtelnyx.com", status: "verified", type: "shared" },
    ] }));
    const plan = await planEmailSend();
    expect(plan).toMatchObject({ provider: "telnyx", mode: "telnyx_shared_domain", from: "onboarding@msgtelnyx.com" });
  });

  it("falls back to resend when telnyx capability is absent", async () => {
    process.env.RESEND_API_KEY = "re-1";
    process.env.RESEND_FROM = "crm@oceanluxe.org";
    m.fetch.mockResolvedValue(jsonResponse(200, { data: [] }));
    const plan = await planEmailSend();
    expect(plan).toMatchObject({ provider: "resend", from: "crm@oceanluxe.org" });
  });

  it("honours TELNYX_EMAIL_ENABLED=false and uses resend", async () => {
    process.env.RESEND_API_KEY = "re-1";
    process.env.RESEND_FROM = "crm@oceanluxe.org";
    process.env.TELNYX_EMAIL_ENABLED = "false";
    const plan = await planEmailSend();
    expect(plan).toMatchObject({ provider: "resend" });
    expect(m.fetch).not.toHaveBeenCalled();
  });

  it("requires EMAIL_FROM_ADDRESS when a custom domain is verified", async () => {
    m.fetch.mockResolvedValue(jsonResponse(200, { data: [
      { domain: "oceanluxe.org", status: "verified", type: "custom" },
      { domain: "msgtelnyx.com", status: "verified", type: "shared" },
    ] }));
    const plan = await planEmailSend();
    expect(plan).toMatchObject({ blocked: { code: "FROM_ADDRESS_REQUIRED" } });
    process.env.EMAIL_FROM_ADDRESS = "notifications@oceanluxe.org";
    m.fetch.mockResolvedValue(jsonResponse(200, { data: [
      { domain: "oceanluxe.org", status: "verified", type: "custom" },
    ] }));
    const plan2 = await planEmailSend();
    expect(plan2).toMatchObject({ provider: "telnyx", mode: "telnyx_custom_domain", from: "notifications@oceanluxe.org" });
  });

  it("sendEmail routes a custom-domain send through telnyx and returns the id", async () => {
    process.env.EMAIL_FROM_ADDRESS = "notifications@oceanluxe.org";
    m.fetch
      .mockResolvedValueOnce(jsonResponse(200, { data: [
        { domain: "oceanluxe.org", status: "verified", type: "custom" },
      ] }))
      .mockResolvedValueOnce(jsonResponse(202, { data: { id: "em-9", status: "queued" } }));
    const res = await sendEmail({ to: "lead@example.com", subject: "Contract", text: "please sign" });
    expect(res).toMatchObject({ id: "em-9", provider: "telnyx", status: "queued" });
    const sendBody = JSON.parse(m.fetch.mock.calls[1][1].body);
    expect(sendBody.from).toBe("notifications@oceanluxe.org");
    expect(sendBody.to).toEqual(["lead@example.com"]);
  });

  it("does NOT fall back to resend when telnyx rejects a send", async () => {
    process.env.RESEND_API_KEY = "re-1";
    process.env.RESEND_FROM = "crm@oceanluxe.org";
    process.env.TELNYX_ACCOUNT_EMAIL = "owner@oceanluxe.org";
    m.fetch
      .mockResolvedValueOnce(jsonResponse(200, { data: [
        { domain: "msgtelnyx.com", status: "verified", type: "shared" },
      ] }))
      .mockResolvedValueOnce(jsonResponse(403, { errors: [{ code: "10007", title: "Forbidden" }] }));
    await expect(sendEmail({ to: "lead@example.com", subject: "s" })).rejects.toMatchObject({
      blocker: { code: "SHARED_DOMAIN_RECIPIENT_BLOCKED" },
    });
    // Only the domains probe ran — the send was blocked pre-flight and
    // Resend was never attempted (no silent fallback).
    expect(m.fetch).toHaveBeenCalledTimes(1);
  });
});
