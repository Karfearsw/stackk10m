import { describe, it, expect, afterEach, vi } from "vitest";

/**
 * Tests for the CourtListener / RECAP bankruptcy enrichment provider:
 *  - pure helpers (court mapping, debtor matching, petition picking,
 *    contact extraction, minimal PDF text extraction)
 *  - the provider contract against a mocked CourtListener API
 *  - factory wiring (SKIP_TRACE_PROVIDER=courtlistener)
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

function searchHit(overrides: any = {}) {
  return {
    caseName: "John Michael Smith",
    court: "United States Bankruptcy Court, D. Massachusetts",
    court_id: "mab",
    docket_id: 16021654,
    docketNumber: "19-30628",
    docket_absolute_url: "/docket/16021654/john-michael-smith/",
    dateFiled: "2019-08-06",
    chapter: "7",
    party: ["John Michael Smith"],
    attorney: [],
    recap_documents: [
      {
        id: 101931494,
        description: "Amended Voluntary Petition",
        short_description: "Amended Voluntary Petition",
        document_number: 7,
        filepath_local: "recap/gov.uscourts.mab.494593/gov.uscourts.mab.494593.7.0_1.pdf",
        is_available: true,
      },
    ],
    ...overrides,
  };
}

function searchResponse(hits: any[]) {
  return JSON.stringify({ count: hits.length, results: hits });
}

// Minimal text-based PDF with the debtor's contact info in Tj operators.
const PETITION_PDF = `%PDF-1.4
1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj
2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj
3 0 obj << /Type /Page /Parent 2 0 R /Contents 4 0 R >> endobj
4 0 obj << /Length 200 >> stream
BT /F1 12 Tf 72 720 Td (Official Form 101 Voluntary Petition) Tj ET
BT /F1 12 Tf 72 700 Td (Contact phone: 321-444-0142) Tj ET
BT /F1 12 Tf 72 680 Td (Cell phone: 407-444-9917) Tj ET
BT /F1 12 Tf 72 660 Td (Email: john.smith@gmail.com) Tj ET
endstream
endobj
trailer << /Root 1 0 R >>
`;

afterEach(() => {
  (globalThis as any).fetch = realFetch;
  vi.restoreAllMocks();
  delete process.env.COURTLISTENER_API_TOKEN;
  delete process.env.SKIP_TRACE_PROVIDER;
});

describe("courtlistener helpers", () => {
  it("maps states to bankruptcy courts", async () => {
    const { courtsForState } = await import("../server/services/skipTrace/courtListener.js");
    expect(courtsForState("MA")).toEqual(["mab"]);
    expect(courtsForState("RI")).toEqual(["rib"]);
    expect(courtsForState("FL")).toEqual(["flmb", "flnb", "flsb"]);
    expect(courtsForState("MI")).toEqual(["mieb", "miwb"]);
    expect(courtsForState("CA")).toEqual([]);
    expect(courtsForState("fl")).toEqual(["flmb", "flnb", "flsb"]);
  });

  it("matches debtors and rejects adversary cases", async () => {
    const { isDebtorMatch } = await import("../server/services/skipTrace/courtListener.js");
    expect(isDebtorMatch(searchHit(), "John Smith")).toBe(true);
    expect(isDebtorMatch(searchHit(), "John Michael Smith")).toBe(true);
    expect(isDebtorMatch(searchHit(), "Jane Doe")).toBe(false);
    expect(isDebtorMatch(searchHit({ caseName: "Bank v. John Smith" }), "John Smith")).toBe(false);
    expect(isDebtorMatch(searchHit(), "")).toBe(false);
  });

  it("detects pro se filers", async () => {
    const { isProSe } = await import("../server/services/skipTrace/courtListener.js");
    expect(isProSe(searchHit())).toBe(true);
    expect(isProSe(searchHit({ attorney: ["Some Lawyer"] }))).toBe(false);
  });

  it("picks the amended voluntary petition with an available PDF", async () => {
    const { findPetitionDocument } = await import("../server/services/skipTrace/courtListener.js");
    const hit = searchHit({
      recap_documents: [
        { id: 1, description: "Voluntary Petition", document_number: 1, filepath_local: "a.pdf", is_available: true },
        { id: 2, description: "Amended Voluntary Petition", document_number: 7, filepath_local: "b.pdf", is_available: true },
        { id: 3, description: "Certificate of Service", document_number: 8, filepath_local: "c.pdf", is_available: true },
        { id: 4, description: "Voluntary Petition", document_number: 2, filepath_local: null, is_available: false },
      ],
    });
    const doc = findPetitionDocument(hit);
    expect(doc?.id).toBe(2); // amended wins (highest document number)
    expect(findPetitionDocument(searchHit({ recap_documents: [] }))).toBe(null);
  });

  it("extracts phones and emails from text", async () => {
    const { extractContactsFromText } = await import("../server/services/skipTrace/courtListener.js");
    const out = extractContactsFromText("Contact phone: 321-444-0142, email JOHN.SMITH@GMAIL.COM, fax 1111111111");
    expect(out.phones).toEqual(["+13214440142"]);
    expect(out.emails).toEqual(["john.smith@gmail.com"]);
  });

  it("extracts text from a minimal text-based PDF", async () => {
    const { extractTextFromPdf } = await import("../server/services/skipTrace/courtListener.js");
    const text = extractTextFromPdf(new TextEncoder().encode(PETITION_PDF));
    expect(text).toContain("Official Form 101");
    expect(text).toContain("321-444-0142");
  });
});

describe("courtlistener provider (mocked API)", () => {
  it("returns success with phones from the petition contact page", async () => {
    process.env.COURTLISTENER_API_TOKEN = "test-token";
    (globalThis as any).fetch = fetchRouter([
      {
        match: (u) => u.includes("/api/rest/v4/search/"),
        respond: () => ({ body: searchResponse([searchHit()]) }),
      },
      {
        match: (u) => u.startsWith("https://storage.courtlistener.com/"),
        respond: () => ({ body: PETITION_PDF }),
      },
    ]);
    vi.resetModules();
    const { CourtListenerSkipTraceProvider } = await import("../server/services/skipTrace/courtListener.js");
    const out = await new CourtListenerSkipTraceProvider().skipTrace({
      ownerName: "John Smith",
      address: "123 Main St",
      city: "Boston",
      state: "MA",
      zipCode: "02101",
    });
    expect(out.status).toBe("success");
    expect(out.phones).toContain("+13214440142");
    expect(out.phones).toContain("+14074449917");
    expect(out.emails).toContain("john.smith@gmail.com");
    expect(out.costCents).toBe(0);
    const types = (out.evidence || []).map((e) => e.sourceType);
    expect(types).toContain("courtlistener_search");
    expect(types).toContain("courtlistener_case");
    expect(types).toContain("courtlistener_petition");
  });

  it("fails cleanly when no bankruptcy case exists", async () => {
    process.env.COURTLISTENER_API_TOKEN = "test-token";
    (globalThis as any).fetch = fetchRouter([
      {
        match: (u) => u.includes("/api/rest/v4/search/"),
        respond: () => ({ body: searchResponse([]) }),
      },
    ]);
    vi.resetModules();
    const { CourtListenerSkipTraceProvider } = await import("../server/services/skipTrace/courtListener.js");
    const out = await new CourtListenerSkipTraceProvider().skipTrace({
      ownerName: "Nobody Real",
      address: "1 Nowhere St",
      city: "Boston",
      state: "MA",
      zipCode: "02101",
    });
    expect(out.status).toBe("fail");
    expect(out.costCents).toBe(0);
    expect(out.errorMessage).toMatch(/no bankruptcy case/i);
  });

  it("surfaces rate limiting distinctly", async () => {
    process.env.COURTLISTENER_API_TOKEN = "test-token";
    (globalThis as any).fetch = fetchRouter([
      {
        match: (u) => u.includes("/api/rest/v4/search/"),
        respond: () => ({ status: 429, body: "{}" }),
      },
    ]);
    vi.resetModules();
    const { CourtListenerSkipTraceProvider } = await import("../server/services/skipTrace/courtListener.js");
    const out = await new CourtListenerSkipTraceProvider().skipTrace({
      ownerName: "John Smith",
      address: "1 Main St",
      city: "Boston",
      state: "MA",
      zipCode: "02101",
    });
    expect(out.status).toBe("fail");
    expect(out.errorMessage || "").toMatch(/^rate_limited/);
  });

  it("throws a clear error when the token is missing", async () => {
    vi.resetModules();
    const { CourtListenerSkipTraceProvider } = await import("../server/services/skipTrace/courtListener.js");
    await expect(
      new CourtListenerSkipTraceProvider().skipTrace({ ownerName: "John Smith", address: "1 Main St", city: "Boston", state: "MA", zipCode: "02101" }),
    ).rejects.toThrow("COURTLISTENER_API_TOKEN is not configured");
  });

  it("provider factory returns courtlistener when configured", async () => {
    vi.resetModules();
    process.env.SKIP_TRACE_PROVIDER = "courtlistener";
    const { getSkipTraceProvider } = await import("../server/services/skipTrace/provider.js");
    expect(getSkipTraceProvider().name).toBe("courtlistener");
    delete process.env.SKIP_TRACE_PROVIDER;
  });
});
