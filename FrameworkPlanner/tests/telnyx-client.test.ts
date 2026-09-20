import { describe, it, expect, afterEach, vi } from "vitest";
import { TelnyxClient, TelnyxConfigError } from "../server/services/telecom/telnyx-client";

function makeClient(overrides: Partial<Record<"apiKey" | "connectionId" | "messagingProfileId" | "defaultFrom", string>> = {}) {
  return new TelnyxClient({
    apiKey: overrides.apiKey ?? "test-api-key",
    connectionId: overrides.connectionId ?? "test-connection-id",
    messagingProfileId: overrides.messagingProfileId ?? "test-profile-id",
    defaultFrom: overrides.defaultFrom ?? "+15550001234",
  });
}

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("TelnyxClient health state mapping", () => {
  it("reports unconfigured without hitting the network when env keys are missing", async () => {
    for (const k of ["TELNYX_API_KEY", "TELNYX_CONNECTION_ID", "TELNYX_MESSAGING_PROFILE_ID", "TELNYX_DEFAULT_FROM_NUMBER"]) {
      vi.stubEnv(k, "");
    }
    const client = makeClient({ apiKey: "", connectionId: "", messagingProfileId: "", defaultFrom: "" });
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);

    const health = await client.healthCheck();
    expect(health.status).toBe("unconfigured");
    expect(health.code).toBe("MISSING_CONFIG");
    expect(health.missingEnv).toContain("TELNYX_API_KEY");
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("throws a typed TelnyxConfigError from dial when config is missing", async () => {
    for (const k of ["TELNYX_API_KEY", "TELNYX_CONNECTION_ID", "TELNYX_MESSAGING_PROFILE_ID", "TELNYX_DEFAULT_FROM_NUMBER"]) {
      vi.stubEnv(k, "");
    }
    const client = makeClient({ apiKey: "", connectionId: "", messagingProfileId: "", defaultFrom: "" });
    await expect(client.dial({ to: "+15551110000" })).rejects.toBeInstanceOf(TelnyxConfigError);
    await expect(client.sendSms({ to: "+15551110000", body: "hi" })).rejects.toBeInstanceOf(TelnyxConfigError);
    await expect(client.hangup("call-123")).rejects.toBeInstanceOf(TelnyxConfigError);
  });

  it("maps 401 to INVALID_API_KEY", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse(401, { errors: [{ title: "Unauthorized" }] })));
    const health = await makeClient().healthCheck();
    expect(health.status).toBe("unreachable");
    expect(health.code).toBe("INVALID_API_KEY");
  });

  it("maps a missing connection to CONNECTION_NOT_FOUND", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse(200, { data: [] })));
    const health = await makeClient().healthCheck();
    expect(health.status).toBe("unreachable");
    expect(health.code).toBe("CONNECTION_NOT_FOUND");
    expect(health.connectionFound).toBe(false);
  });

  it("reports reachable when the configured connection is active", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        jsonResponse(200, { data: [{ id: "test-connection-id", state: "active" }] }),
      ),
    );
    const health = await makeClient().healthCheck();
    expect(health.status).toBe("reachable");
    expect(health.code).toBe("OK");
    expect(health.connectionActive).toBe(true);
  });

  it("maps rate limiting to RATE_LIMITED", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse(429, { errors: [{ title: "Rate limited" }] })));
    const health = await makeClient().healthCheck();
    expect(health.status).toBe("degraded");
    expect(health.code).toBe("RATE_LIMITED");
  });
});


describe("TelnyxClient dial params + sendDtmf", () => {
  function captureFetch() {
    const calls: { url: string; init: any }[] = [];
    vi.stubGlobal("fetch", vi.fn(async (url: string, init: any) => {
      calls.push({ url, init });
      return jsonResponse(200, { data: { id: "cc-1", call_session_id: "cs-1", result: "ok" } });
    }));
    return calls;
  }

  it("sends timeout_secs and time_limit_secs when provided", async () => {
    const calls = captureFetch();
    await makeClient().dial({ to: "+15551110000", timeoutSecs: 45, timeLimitSecs: 10800 });
    const body = JSON.parse(calls[0].init.body);
    expect(body.timeout_secs).toBe(45);
    expect(body.time_limit_secs).toBe(10800);
  });

  it("omits timeout/time_limit when not provided", async () => {
    const calls = captureFetch();
    await makeClient().dial({ to: "+15551110000" });
    const body = JSON.parse(calls[0].init.body);
    expect(body.timeout_secs).toBeUndefined();
    expect(body.time_limit_secs).toBeUndefined();
  });

  it("sends bridge_on_answer + link_to only when auto-bridging", async () => {
    const calls = captureFetch();
    await makeClient().dial({ to: "+15551110000", bridgeOnAnswer: true, linkTo: "cs-abc" });
    const body = JSON.parse(calls[0].init.body);
    expect(body.bridge_on_answer).toBe(true);
    expect(body.link_to).toBe("cs-abc");
  });

  it("returns callSessionId from the dial response", async () => {
    captureFetch();
    const res = await makeClient().dial({ to: "+15551110000" });
    expect(res.callControlId).toBe("cc-1");
    expect(res.callSessionId).toBe("cs-1");
  });

  it("sendDtmf posts digits to the send_dtmf action", async () => {
    const calls = captureFetch();
    await makeClient().sendDtmf("cc-1", "w201#", { durationMillis: 300 });
    expect(calls[0].url).toContain("/calls/cc-1/actions/send_dtmf");
    const body = JSON.parse(calls[0].init.body);
    expect(body.digits).toBe("w201#");
    expect(body.duration_millis).toBe(300);
  });

  it("sendDtmf maps a 4xx failure to a thrown error", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse(400, { errors: [{ title: "Invalid digits" }] })));
    await expect(makeClient().sendDtmf("cc-1", "999")).rejects.toThrow("Invalid digits");
  });
});
