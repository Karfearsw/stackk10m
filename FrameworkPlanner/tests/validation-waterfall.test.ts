import { describe, it, expect, afterEach, vi } from "vitest";

/**
 * Tests for the free-tier phone validation waterfall:
 *  - config gating (auto-enable on keys, explicit opt-out)
 *  - layer order (veriphone → ipqs → numverify) with mocked network
 *  - format-only fallback when no keys are configured
 *  - evidence flags (fraud score, DNC/TCPA)
 */

const realFetch = globalThis.fetch;

function fetchRouter(routes: Array<{ match: (url: string) => boolean; respond: () => { status?: number; body: string } }>) {
  return (async (url: any) => {
    const u = String(url);
    for (const r of routes) {
      if (r.match(u)) {
        const out = r.respond();
        return new Response(out.body, { status: out.status ?? 200 });
      }
    }
    return new Response("not found", { status: 404 });
  }) as typeof fetch;
}

afterEach(() => {
  (globalThis as any).fetch = realFetch;
  vi.restoreAllMocks();
  delete process.env.SKIP_TRACE_VALIDATION_ENABLED;
  delete process.env.VERIPHONE_API_KEY;
  delete process.env.IPQS_API_KEY;
  delete process.env.NUMVERIFY_API_KEY;
});

describe("validation config", () => {
  it("auto-enables when a key is present, stays off with no keys", async () => {
    vi.resetModules();
    let mod = await import("../server/services/skipTrace/validation.js");
    expect(mod.isValidationEnabled()).toBe(false);

    vi.resetModules();
    process.env.VERIPHONE_API_KEY = "k";
    mod = await import("../server/services/skipTrace/validation.js");
    expect(mod.isValidationEnabled()).toBe(true);
  });

  it("explicit false disables even with keys", async () => {
    vi.resetModules();
    process.env.VERIPHONE_API_KEY = "k";
    process.env.SKIP_TRACE_VALIDATION_ENABLED = "false";
    const mod = await import("../server/services/skipTrace/validation.js");
    expect(mod.isValidationEnabled()).toBe(false);
  });
});

describe("validatePhones", () => {
  it("cleans to E.164 and validates via veriphone first", async () => {
    process.env.VERIPHONE_API_KEY = "vk";
    let veriphoneCalls = 0;
    (globalThis as any).fetch = fetchRouter([
      {
        match: (u) => u.includes("api.veriphone.io"),
        respond: () => {
          veriphoneCalls++;
          return { body: JSON.stringify({ phone_valid: true, carrier: "T-Mobile", phone_type: "mobile" }) };
        },
      },
    ]);
    vi.resetModules();
    const { validatePhones } = await import("../server/services/skipTrace/validation.js");
    const out = await validatePhones(["(321) 555-0142", "not-a-number", "+13215550142"]);
    expect(out.phones).toEqual(["+13215550142"]); // deduped, invalid dropped
    expect(veriphoneCalls).toBe(1);
    const ev: any = out.evidence[0];
    expect(ev.sourceType).toBe("phone_validation");
    expect(ev.extracted.layer).toBe("veriphone");
    expect(ev.extracted.carrier).toBe("T-Mobile");
    expect(ev.extracted.line_type).toBe("mobile");
  });

  it("falls through to ipqs when veriphone fails", async () => {
    process.env.VERIPHONE_API_KEY = "vk";
    process.env.IPQS_API_KEY = "ik";
    (globalThis as any).fetch = fetchRouter([
      { match: (u) => u.includes("api.veriphone.io"), respond: () => ({ status: 500, body: "{}" }) },
      {
        match: (u) => u.includes("ipqualityscore.com"),
        respond: () => ({
          body: JSON.stringify({ success: true, valid: true, fraud_score: 92, active: true, carrier: "Verizon", line_type: "mobile", do_not_call: true, tcpa_blacklist: false }),
        }),
      },
    ]);
    vi.resetModules();
    const { validatePhones } = await import("../server/services/skipTrace/validation.js");
    const out = await validatePhones(["3215550142"]);
    const ev: any = out.evidence[0];
    expect(ev.extracted.layer).toBe("ipqs");
    expect(ev.extracted.fraud_score).toBe(92);
    expect(ev.extracted.do_not_call).toBe(true);
    expect(ev.notes || "").toMatch(/high_fraud_score/);
    expect(ev.notes || "").toMatch(/do_not_call/);
  });

  it("runs format-only with no keys and never calls the network", async () => {
    let calls = 0;
    (globalThis as any).fetch = fetchRouter([{ match: () => true, respond: () => { calls++; return { body: "{}" }; } }]);
    vi.resetModules();
    const { validatePhones } = await import("../server/services/skipTrace/validation.js");
    const out = await validatePhones(["321-555-0142", "bad"]);
    expect(out.phones).toEqual(["+13215550142"]);
    expect(calls).toBe(0);
    expect(out.evidence).toEqual([]);
  });

  it("never throws on network errors", async () => {
    process.env.IPQS_API_KEY = "ik";
    (globalThis as any).fetch = async () => { throw new Error("boom"); };
    vi.resetModules();
    const { validatePhones } = await import("../server/services/skipTrace/validation.js");
    const out = await validatePhones(["3215550142"]);
    expect(out.phones).toEqual(["+13215550142"]);
    expect(out.evidence[0].extracted.layer).toBe("format-only");
  });
});
