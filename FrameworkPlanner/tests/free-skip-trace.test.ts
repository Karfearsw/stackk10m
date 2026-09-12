import { describe, it, expect, beforeAll, afterEach, vi } from "vitest";

/**
 * Tests for the free skip-trace stack:
 *  - extraction helpers (owner anchoring, phones, emails)
 *  - search-result parsers (DuckDuckGo HTML, Mojeek)
 *  - the full free-web research pipeline with mocked network
 *  - admin/super-admin feature bypass
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

beforeAll(async () => {
  process.env.SKIP_TRACE_PUBLIC_RESEARCH_ENABLED = "true";
});

afterEach(() => {
  (globalThis as any).fetch = realFetch;
  vi.restoreAllMocks();
});

describe("contact extraction", () => {
  it("extracts valid NANP phone numbers in common formats", async () => {
    const { extractPhones } = await import("../server/services/skipTrace/freeWeb.js");
    const text = "Call (321) 555-0142 or 321-555-9831. Office: +1 407 555 1234. Fax: 0000000000.";
    expect(extractPhones(text)).toEqual(["+13215550142", "+13215559831", "+14075551234"]);
  });

  it("rejects invalid phone numbers (N11, short, repeated digits)", async () => {
    const { extractPhones } = await import("../server/services/skipTrace/freeWeb.js");
    expect(extractPhones("Call 911, 321-911-0142, or 555-5555, or 1111111111")).toEqual([]);
  });

  it("extracts emails and filters junk domains", async () => {
    const { extractEmails } = await import("../server/services/skipTrace/freeWeb.js");
    const text = "Email jane.doe@gmail.com or sales@wixpress.com or real one again jane.doe@gmail.com";
    expect(extractEmails(text)).toEqual(["jane.doe@gmail.com"]);
  });

  it("requires owner anchoring before accepting contacts", async () => {
    const mod = await import("../server/services/skipTrace/freeWeb.js");
    const page = "John Smith can be reached at (321) 555-0142";
    expect(mod.isOwnerMention(page, "John Smith", "123 Main St")).toBe(true);
    // A page that never mentions the owner or address is not a contact source
    expect(mod.isOwnerMention("Some unrelated page about plumbing", "John Smith", "123 Main St")).toBe(false);
  });

  it("anchors on surname hits, and refuses address-only or single-given-name pages", async () => {
    const mod = await import("../server/services/skipTrace/freeWeb.js");
    expect(mod.isOwnerMention("Mr. Smith owns this property", "John Smith", "123 Main St")).toBe(true);
    // Address-only pages (e.g. a for-sale listing with agent phone) are NOT owner-anchored:
    // they are recorded as evidence with ownerMention:false but never adopted as contacts.
    expect(mod.isOwnerMention("Property records for 123 Main St, Tampa FL", "John Smith", "123 Main St")).toBe(false);
    expect(mod.isOwnerMention("Contact John about nothing here", "John Smith", "123 Main St")).toBe(false);
  });

  it("normalizes address keys across abbreviations", async () => {
    const { normalizeAddressKey } = await import("../server/services/skipTrace/freeWeb.js");
    expect(normalizeAddressKey("123 Main Street, Orlando, FL")).toBe(normalizeAddressKey("123 main st orlando fl"));
  });
});

describe("search result parsers", () => {
  it("parses DuckDuckGo HTML results and decodes uddg redirect urls", async () => {
    const { parseDuckDuckGoHtml } = await import("../server/services/skipTrace/freeWeb.js");
    const html = `
      <a rel="nofollow" class="result__a" href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fexample-directory.com%2Fjohn-smith&rut=abc">John Smith — Directory</a>
      <a class="result__snippet" href="#">John Smith lives in Orlando FL contact info…</a>
      <a class="result__a" href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fexample-directory.com%2Fjohn-smith&rut=def">Duplicate</a>
    `;
    const hits = parseDuckDuckGoHtml(html);
    expect(hits).toHaveLength(1);
    expect(hits[0].url).toBe("https://example-directory.com/john-smith");
    expect(hits[0].title).toContain("John Smith");
  });

  it("parses Mojeek organic results", async () => {
    const { parseMojeekHtml } = await import("../server/services/skipTrace/freeWeb.js");
    const html = `<a href="https://public-records.example.org/john-smith-orlando">John Smith in Orlando — Public Records</a>`;
    const hits = parseMojeekHtml(html);
    expect(hits).toHaveLength(1);
    expect(hits[0].url).toContain("public-records.example.org");
  });

  it("blocks social/login-walled domains from page fetches", async () => {
    const { isScrapableUrl } = await import("../server/services/skipTrace/freeWeb.js");
    expect(isScrapableUrl("https://www.facebook.com/john.smith")).toBe(false);
    expect(isScrapableUrl("https://linkedin.com/in/john-smith")).toBe(false);
    expect(isScrapableUrl("https://directory.example.org/john-smith")).toBe(true);
    expect(isScrapableUrl("javascript:void(0)")).toBe(false);
  });

  it("builds owner/address-anchored queries", async () => {
    const { buildSearchQueries } = await import("../server/services/skipTrace/freeWeb.js");
    const queries = buildSearchQueries({
      ownerName: "John Smith",
      address: "123 Main St",
      city: "Orlando",
      state: "FL",
      zipCode: "32801",
    });
    expect(queries[0]).toContain('"John Smith"');
    expect(queries[0]).toContain("123 Main St");
    expect(queries.some((q) => q.includes("Orlando"))).toBe(true);
  });
});

describe("free-web research pipeline (mocked network)", () => {
  it("returns success with anchored contacts and evidence", async () => {
    const html = `
      <a rel="nofollow" class="result__a" href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fwhitepages-mirror.example.org%2Fjohn-smith-fl&rut=x">John Smith — Orlando FL public records</a>
      <a class="result__snippet" href="#">John Smith, 123 Main St, Orlando FL 32801 — phone and email listings.</a>
    `;
    (globalThis as any).fetch = fetchRouter([
      {
        match: (u) => u.startsWith("https://html.duckduckgo.com/html/"),
        respond: () => ({ body: html }),
      },
      {
        match: (u) => u.startsWith("https://geocoding.services.census.gov/"),
        respond: () => ({
          body: JSON.stringify({
            result: {
              addressMatches: [
                {
                  matchedAddress: "123 MAIN ST, ORLANDO, FL 32801",
                  coordinates: { x: -81.37, y: 28.54 },
                  geographies: { Counties: [{ GEOID: "12095", NAME: "Orange County" }], "Census Tracts": [{ GEOID: "12095008300" }] },
                },
              ],
            },
          }),
        }),
      },
      {
        match: (u) => u.startsWith("https://whitepages-mirror.example.org/"),
        respond: () => ({
          body: "<html><body><p>John Smith | 123 Main St, Orlando, FL 32801 | (321) 555-0142 | john.smith@gmail.com</p></body></html>",
        }),
      },
    ]);

    vi.resetModules();
    const { runFreeWebResearch } = await import("../server/services/skipTrace/freeWeb.js");
    const out = await runFreeWebResearch({
      ownerName: "John Smith",
      address: "123 Main St",
      city: "Orlando",
      state: "FL",
      zipCode: "32801",
    });

    expect(out.status).toBe("success");
    expect(out.phones).toContain("+13215550142");
    expect(out.emails).toContain("john.smith@gmail.com");
    const types = out.evidence.map((e) => e.sourceType);
    expect(types).toContain("census_geocoder");
    expect(types).toContain("web_research");
    expect(types).toContain("web_search");
    const meta: any = out.meta;
    expect(meta.provider).toBe("free-web");
    expect(meta.addressValidated).toBe(true);
  });

  it("returns fail without contacts when nothing is anchored (no fabrication)", async () => {
    (globalThis as any).fetch = fetchRouter([
      {
        match: (u) => u.startsWith("https://html.duckduckgo.com/html/"),
        respond: () => ({ body: '<a class="result__a" href="https://unrelated.example.com/x">Plumbing tips</a>' }),
      },
      {
        match: (u) => u.startsWith("https://unrelated.example.com/"),
        respond: () => ({ body: "<html><body><p>Great plumbing deals, call (321) 555-0142 today</p></body></html>" }),
      },
      {
        match: (u) => u.startsWith("https://geocoding.services.census.gov/"),
        respond: () => ({ body: JSON.stringify({ result: { addressMatches: [] } }) }),
      },
    ]);

    vi.resetModules();
    const { runFreeWebResearch } = await import("../server/services/skipTrace/freeWeb.js");
    const out = await runFreeWebResearch({
      ownerName: "Jane Doe",
      address: "99 Nowhere Rd",
      city: "Tampa",
      state: "FL",
      zipCode: "33601",
    });

    expect(out.status).toBe("fail");
    expect(out.phones).toEqual([]);
    expect(out.emails).toEqual([]);
    // The page DID contain a phone, but no owner mention: it must not be adopted
    expect(out.evidence.some((e) => e.sourceType === "web_research" && (e.extracted as any)?.ownerMention === false)).toBe(true);
  });

  it("adapts to the SkipTraceProvider contract with costCents 0", async () => {
    (globalThis as any).fetch = fetchRouter([
      { match: () => true, respond: () => ({ body: "" }) },
    ]);
    vi.resetModules();
    const { FreeWebSkipTraceProvider } = await import("../server/services/skipTrace/freeWeb.js");
    const provider = new FreeWebSkipTraceProvider();
    expect(provider.name).toBe("free-web");
    const out = await provider.skipTrace({
      ownerName: "Nobody Real",
      address: "1 Test St",
      city: "Miami",
      state: "FL",
      zipCode: "33101",
    });
    expect(out.status).toBe("fail");
    expect(out.costCents).toBe(0);
    expect(out.errorMessage).toBeTruthy();
  });

  it("provider factory returns free-web when configured", async () => {
    vi.resetModules();
    process.env.SKIP_TRACE_PROVIDER = "free-web";
    const { getSkipTraceProvider } = await import("../server/services/skipTrace/provider.js");
    expect(getSkipTraceProvider().name).toBe("free-web");
    delete process.env.SKIP_TRACE_PROVIDER;
  });

  it("public research runner returns disabled when env opt-out is set", async () => {
    vi.resetModules();
    process.env.SKIP_TRACE_PUBLIC_RESEARCH_ENABLED = "false";
    const { FreeWebPublicResearchRunner } = await import("../server/services/skipTrace/freeWeb.js");
    const runner = new FreeWebPublicResearchRunner();
    const out = await runner.run({
      entityType: "lead",
      entityId: 1,
      address: "1 Test St",
      city: "Miami",
      state: "FL",
      zipCode: "33101",
      ownerName: "Nobody",
    });
    expect(out.status).toBe("disabled");
    delete process.env.SKIP_TRACE_PUBLIC_RESEARCH_ENABLED;
  });
});

describe("feature flag admin bypass", () => {
  it("admins, managers, owners and super admins bypass disabled features", async () => {
    const { isFeatureBypassUser, createIsFeatureEnabled } = await import("../server/featureFlags.js");
    expect(isFeatureBypassUser({ id: 1, isSuperAdmin: true })).toBe(true);
    expect(isFeatureBypassUser({ id: 1, role: "admin" })).toBe(true);
    expect(isFeatureBypassUser({ id: 1, role: "manager" })).toBe(true);
    expect(isFeatureBypassUser({ id: 1, role: "owner" })).toBe(true);
    expect(isFeatureBypassUser({ id: 1, role: "member" })).toBe(false);
    expect(isFeatureBypassUser({ id: 1, role: null, isSuperAdmin: false })).toBe(false);
    expect(isFeatureBypassUser(null)).toBe(false);

    const isEnabled = createIsFeatureEnabled(async () => ({ enabled: false }));
    await expect(isEnabled(1, "skip_trace", true)).resolves.toBe(true);
    await expect(isEnabled(1, "skip_trace", false)).resolves.toBe(false);
  });
});
