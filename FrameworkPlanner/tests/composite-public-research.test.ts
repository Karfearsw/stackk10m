import { describe, it, expect, vi, afterEach } from "vitest";

/**
 * Tests for the composite free-lane public-research runner:
 *   - merges free-web + courtlistener evidence when both are enabled
 *   - runs free-web alone when no CourtListener token is configured
 *   - reports disabled when nothing is enabled
 *   - keeps the orchestrator's phones/emails evidence convention
 */

vi.mock("../server/services/skipTrace/freeWeb.js", () => {
  return {
    FreeWebPublicResearchRunner: class {
      name = "free-web";
      enabled = String(process.env.SKIP_TRACE_PUBLIC_RESEARCH_ENABLED || "").trim().toLowerCase() === "true";
      async run() {
        return {
          status: "success",
          evidence: [
            {
              sourceType: "assessor",
              sourceUrl: null,
              extracted: { phones: ["+13215550142"], emails: [] },
              confidence: { source: "assessor" },
              notes: "free-web hit",
              screenshotRef: null,
            },
          ],
          message: "free-web ok",
          raw: { runner: "free-web" },
        };
      }
    },
  };
});

vi.mock("../server/services/skipTrace/courtListener.js", () => {
  return {
    CourtListenerSkipTraceProvider: class {
      name = "courtlistener";
      async skipTrace() {
        return {
          status: "success",
          phones: ["+13215559999"],
          emails: ["x@example.com"],
          costCents: 0,
          evidence: [
            {
              sourceType: "bankruptcy_petition",
              sourceUrl: "https://www.courtlistener.com/docket/x",
              extracted: { phones: ["+13215559999"], emails: ["x@example.com"] },
              confidence: { pro_se: true },
              notes: "courtlistener hit",
            },
          ],
          raw: { runner: "courtlistener" },
        };
      }
    },
  };
});

afterEach(() => {
  delete process.env.SKIP_TRACE_PUBLIC_RESEARCH_ENABLED;
  delete process.env.COURTLISTENER_API_TOKEN;
});

const baseInput = {
  entityType: "lead" as const,
  entityId: 1,
  address: "123 Main St",
  city: "Orlando",
  state: "FL",
  zipCode: "32801",
  ownerName: "Jane Doe",
};

describe("CompositePublicResearchRunner", () => {
  it("merges free-web + courtlistener evidence when both enabled", async () => {
    process.env.SKIP_TRACE_PUBLIC_RESEARCH_ENABLED = "true";
    process.env.COURTLISTENER_API_TOKEN = "tok";
    vi.resetModules();
    const { CompositePublicResearchRunner } = await import("../server/services/skipTrace/publicResearch/composite.js");
    const out = await new CompositePublicResearchRunner().run(baseInput);
    expect(out.status).toBe("success");
    const types = out.evidence.map((e) => e.sourceType).sort();
    expect(types).toEqual(["assessor", "bankruptcy_petition"]);
    // Orchestrator's extraction convention still works:
    const phones = new Set<string>();
    for (const ev of out.evidence) {
      const arr = (ev.extracted as any)?.phones;
      if (Array.isArray(arr)) for (const p of arr) phones.add(String(p));
    }
    expect(phones).toEqual(new Set(["+13215550142", "+13215559999"]));
    expect(out.message || "").toMatch(/free-web \+ courtlistener/);
    expect((out.raw as any)?.sources).toEqual(["free-web", "courtlistener"]);
  });

  it("runs free-web alone when no CourtListener token is configured", async () => {
    process.env.SKIP_TRACE_PUBLIC_RESEARCH_ENABLED = "true";
    vi.resetModules();
    const { CompositePublicResearchRunner } = await import("../server/services/skipTrace/publicResearch/composite.js");
    const out = await new CompositePublicResearchRunner().run(baseInput);
    expect(out.status).toBe("success");
    expect(out.evidence.map((e) => e.sourceType)).toEqual(["assessor"]);
    expect(out.message || "").toMatch(/free-web/);
    expect(out.message || "").not.toMatch(/courtlistener/);
  });

  it("reports disabled when nothing is enabled", async () => {
    vi.resetModules();
    const { CompositePublicResearchRunner } = await import("../server/services/skipTrace/publicResearch/composite.js");
    const out = await new CompositePublicResearchRunner().run(baseInput);
    expect(out.status).toBe("disabled");
    expect(out.evidence).toEqual([]);
  });

  it("getPublicResearchRunner returns the composite", async () => {
    vi.resetModules();
    const { getPublicResearchRunner } = await import("../server/services/skipTrace/publicResearch/runner.js");
    expect(getPublicResearchRunner().name).toBe("composite-free");
  });
});
