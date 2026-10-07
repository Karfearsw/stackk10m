import { describe, it, expect, afterEach, vi } from "vitest";

/**
 * Tests for the Tracerfy skip-trace provider:
 *  - pure helpers (entity detection, name splitting, phone normalization,
 *    request-body building, response extraction)
 *  - the provider contract against a mocked Tracerfy API
 *  - factory wiring (SKIP_TRACE_PROVIDER=tracerfy)
 */

const realFetch = globalThis.fetch;

function fetchRouter(routes: Array<{ match: (url: string, init?: any) => boolean; respond: (url: string, init?: any) => { status?: number; body: string } }>) {
  return (async (url: any, init?: any) => {
    const u = String(url);
    for (const r of routes) {
      if (r.match(u, init)) {
        const out = r.respond(u, init);
        return new Response(out.body, { status: out.status ?? 200 });
      }
    }
    return new Response("not found", { status: 404 });
  }) as typeof fetch;
}

function hitResponse() {
  return JSON.stringify({
    address: "123 Main St",
    city: "Orlando",
    state: "FL",
    zip: "32801",
    find_owner: false,
    hit: true,
    persons_count: 2,
    credits_deducted: 5,
    persons: [
      {
        first_name: "John",
        last_name: "Smith",
        full_name: "John Smith",
        dob: "1958-12",
        age: 67,
        deceased: false,
        property_owner: true,
        litigator: false,
        mailing_address: { street: "123 Main St", city: "Orlando", state: "FL", zip: "32801" },
        phones: [
          { number: "3215550142", type: "Mobile", dnc: false, tcpa: false, carrier: "T-Mobile", rank: 1 },
          { number: "(321) 555-9831", type: "Landline", dnc: false, tcpa: false, carrier: "AT&T", rank: 2 },
        ],
        emails: [{ email: "John.Smith@Gmail.com", rank: 1 }],
      },
      {
        first_name: "Jane",
        last_name: "Smith",
        full_name: "Jane Smith",
        deceased: false,
        litigator: true,
        property_owner: false,
        phones: [{ number: "3215550142", type: "Mobile", dnc: true, tcpa: false, carrier: "T-Mobile", rank: 1 }],
        emails: [],
      },
    ],
    meta: { request_id: "req_abc123", timestamp: "2026-10-07T00:00:00Z", api_version: "v1" },
  });
}

afterEach(() => {
  (globalThis as any).fetch = realFetch;
  vi.restoreAllMocks();
  delete process.env.TRACERFY_API_KEY;
  delete process.env.TRACERFY_API_BASE_URL;
  delete process.env.SKIP_TRACE_PROVIDER;
});

describe("tracerfy helpers", () => {
  it("detects entity (non-person) owner names", async () => {
    const { looksLikeEntity } = await import("../server/services/skipTrace/tracerfy.js");
    expect(looksLikeEntity("ABC Holdings LLC")).toBe(true);
    expect(looksLikeEntity("Smith Family Trust")).toBe(true);
    expect(looksLikeEntity("John Smith")).toBe(false);
    expect(looksLikeEntity("Maria Delgado")).toBe(false);
  });

  it("splits names into first/middle/last", async () => {
    const { splitName } = await import("../server/services/skipTrace/tracerfy.js");
    expect(splitName("John Smith")).toEqual({ firstName: "John", middleName: "", lastName: "Smith" });
    expect(splitName("Mary Jane Watson")).toEqual({ firstName: "Mary", middleName: "Jane", lastName: "Watson" });
    expect(splitName("Madonna")).toEqual({ firstName: "Madonna", middleName: "", lastName: "" });
  });

  it("normalizes phones to E.164", async () => {
    const { normalizePhone } = await import("../server/services/skipTrace/tracerfy.js");
    expect(normalizePhone("3215550142")).toBe("+13215550142");
    expect(normalizePhone("(321) 555-0142")).toBe("+13215550142");
    expect(normalizePhone("+1 321-555-0142")).toBe("+13215550142");
    expect(normalizePhone("911")).toBe(null);
    expect(normalizePhone("")).toBe(null);
  });

  it("targets a known person owner (find_owner=false) and skips entities", async () => {
    const { buildTraceLookupBody } = await import("../server/services/skipTrace/tracerfy.js");
    const person = buildTraceLookupBody({ ownerName: "John Smith", address: "123 Main St", city: "Orlando", state: "FL", zipCode: "32801" });
    expect(person.find_owner).toBe(false);
    expect(person.first_name).toBe("John");
    expect(person.last_name).toBe("Smith");

    const entity = buildTraceLookupBody({ ownerName: "ABC Holdings LLC", address: "123 Main St", city: "Orlando", state: "FL", zipCode: "32801" });
    expect(entity.find_owner).toBe(true);
    expect(entity.first_name).toBeUndefined();

    const unknown = buildTraceLookupBody({ ownerName: "", address: "123 Main St", city: "Orlando", state: "FL", zipCode: "32801" });
    expect(unknown.find_owner).toBe(true);
  });
});

describe("tracerfy provider (mocked API)", () => {
  it("returns success with rank-ordered, deduped phones and compliance evidence", async () => {
    process.env.TRACERFY_API_KEY = "test-key";
    let seenBody: any = null;
    (globalThis as any).fetch = fetchRouter([
      {
        match: (u) => u.includes("/trace/lookup/"),
        respond: (_u, init) => {
          seenBody = JSON.parse(String(init?.body || "{}"));
          return { body: hitResponse() };
        },
      },
    ]);
    vi.resetModules();
    const { TracerfySkipTraceProvider } = await import("../server/services/skipTrace/tracerfy.js");
    const out = await new TracerfySkipTraceProvider().skipTrace({
      ownerName: "John Smith",
      address: "123 Main St",
      city: "Orlando",
      state: "FL",
      zipCode: "32801",
    });

    expect(seenBody.find_owner).toBe(false);
    expect(seenBody.first_name).toBe("John");
    expect(out.status).toBe("success");
    // rank 1 first, duplicate across persons deduped
    expect(out.phones).toEqual(["+13215550142", "+13215559831"]);
    expect(out.emails).toEqual(["john.smith@gmail.com"]);
    // credits_deducted (5) × $0.02 = $0.10
    expect(out.costCents).toBe(10);
    // compliance flags persisted as evidence
    const personEvidence = (out.evidence || []).filter((e) => e.sourceType === "tracerfy_person");
    expect(personEvidence).toHaveLength(2);
    expect((personEvidence[1].extracted as any)?.litigator).toBe(true);
    expect((personEvidence[1].notes || "")).toMatch(/litigator/i);
  });

  it("reports a miss as fail with zero cost", async () => {
    process.env.TRACERFY_API_KEY = "test-key";
    (globalThis as any).fetch = fetchRouter([
      {
        match: (u) => u.includes("/trace/lookup/"),
        respond: () => ({ body: JSON.stringify({ hit: false, persons_count: 0, credits_deducted: 0, persons: [] }) }),
      },
    ]);
    vi.resetModules();
    const { TracerfySkipTraceProvider } = await import("../server/services/skipTrace/tracerfy.js");
    const out = await new TracerfySkipTraceProvider().skipTrace({
      ownerName: "Nobody Real",
      address: "1 Nowhere St",
      city: "Miami",
      state: "FL",
      zipCode: "33101",
    });
    expect(out.status).toBe("fail");
    expect(out.costCents).toBe(0);
    expect(out.errorMessage).toBe("No hits found");
  });

  it("surfaces 402 insufficient credits distinctly", async () => {
    process.env.TRACERFY_API_KEY = "test-key";
    (globalThis as any).fetch = fetchRouter([
      {
        match: (u) => u.includes("/trace/lookup/"),
        respond: () => ({ status: 402, body: JSON.stringify({ message: "Insufficient credits" }) }),
      },
    ]);
    vi.resetModules();
    const { TracerfySkipTraceProvider } = await import("../server/services/skipTrace/tracerfy.js");
    const out = await new TracerfySkipTraceProvider().skipTrace({
      ownerName: "John Smith",
      address: "123 Main St",
      city: "Orlando",
      state: "FL",
      zipCode: "32801",
    });
    expect(out.status).toBe("fail");
    expect(out.costCents).toBe(0);
    expect(out.errorMessage || "").toMatch(/^insufficient_credits/);
  });

  it("throws a clear error when the API key is missing", async () => {
    vi.resetModules();
    const { TracerfySkipTraceProvider } = await import("../server/services/skipTrace/tracerfy.js");
    await expect(
      new TracerfySkipTraceProvider().skipTrace({ ownerName: "John Smith", address: "1 Main St", city: "Miami", state: "FL", zipCode: "33101" }),
    ).rejects.toThrow("TRACERFY_API_KEY is not configured");
  });

  it("provider factory returns tracerfy when configured", async () => {
    vi.resetModules();
    process.env.SKIP_TRACE_PROVIDER = "tracerfy";
    const { getSkipTraceProvider } = await import("../server/services/skipTrace/provider.js");
    expect(getSkipTraceProvider().name).toBe("tracerfy");
    delete process.env.SKIP_TRACE_PROVIDER;
  });
});
