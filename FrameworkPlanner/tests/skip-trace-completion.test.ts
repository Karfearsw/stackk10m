import { describe, it, expect, afterEach, vi } from "vitest";

/**
 * Tests for the skip-trace completion build (0108):
 *  - Tracerfy batch provider: submit-body building, queue-id extraction,
 *    row mapping, cost parsing, 402 handling
 *  - spend caps + kill switch math
 *  - per-job provider-name validation
 *  - daily free-lane enrichment cache-key logic
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

afterEach(() => {
  globalThis.fetch = realFetch;
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe("tracerfy batch provider — pure helpers", () => {
  it("builds a normal-trace submit body for a person owner", async () => {
    const { buildBatchSubmitBody } = await import("../server/services/skipTrace/tracerfyBatch.js");
    const out = buildBatchSubmitBody({ ownerName: "Jane Mary Doe", address: "1 Main St", city: "Orlando", state: "FL", zipCode: "32801" });
    expect(out.fields.trace_type).toBe("normal");
    expect(out.fields.address_column).toBe("address");
    expect(out.fields.first_name_column).toBe("first_name");
    expect(out.fields.last_name_column).toBe("last_name");
    expect(out.rows).toHaveLength(1);
    expect(out.rows[0]).toMatchObject({ address: "1 Main St", city: "Orlando", state: "FL", zip: "32801", first_name: "Jane", last_name: "Doe" });
  });

  it("builds an advanced-trace submit body for an entity owner", async () => {
    const { buildBatchSubmitBody, chooseBatchTraceType } = await import("../server/services/skipTrace/tracerfyBatch.js");
    const input = { ownerName: "Acme Holdings LLC", address: "1 Main St", city: "Orlando", state: "FL", zipCode: "32801" };
    expect(chooseBatchTraceType(input)).toBe("advanced");
    const out = buildBatchSubmitBody(input);
    expect(out.fields.trace_type).toBe("advanced");
    expect(out.fields.first_name_column).toBeUndefined();
    expect(out.rows[0].first_name).toBeUndefined();
  });

  it("extracts queue ids from varied submit response shapes", async () => {
    const { extractQueueId } = await import("../server/services/skipTrace/tracerfyBatch.js");
    expect(extractQueueId({ queue_id: "q1" })).toBe("q1");
    expect(extractQueueId({ queueId: 42 })).toBe("42");
    expect(extractQueueId({ id: "abc" })).toBe("abc");
    expect(extractQueueId({})).toBeNull();
    expect(extractQueueId(null)).toBeNull();
  });

  it("maps batch rows (object phones) to persons", async () => {
    const { mapBatchRowsToPersons } = await import("../server/services/skipTrace/tracerfyBatch.js");
    const persons = mapBatchRowsToPersons(
      [{ full_name: "Jane Doe", phones: [{ number: "(407) 555-0100" }], emails: ["JANE@Example.com"] }],
      "Fallback Name",
    );
    expect(persons).toHaveLength(1);
    expect(persons[0].phones[0].number).toBe("+14075550100");
    expect(persons[0].emails[0].email).toBe("jane@example.com");
    expect(persons[0].fullName).toBe("Jane Doe");
  });

  it("maps batch rows with string phone/email arrays and falls back to owner name", async () => {
    const { mapBatchRowsToPersons } = await import("../server/services/skipTrace/tracerfyBatch.js");
    const persons = mapBatchRowsToPersons([{ phones: ["4075550100"], emails: ["x@y.com"] }], "Fallback Name");
    expect(persons).toHaveLength(1);
    expect(persons[0].fullName).toBe("Fallback Name");
  });

  it("skips rows with no usable contacts", async () => {
    const { mapBatchRowsToPersons } = await import("../server/services/skipTrace/tracerfyBatch.js");
    expect(mapBatchRowsToPersons([{ full_name: "Nobody" }], "X")).toHaveLength(0);
    expect(mapBatchRowsToPersons("nope", "X")).toHaveLength(0);
  });

  it("parses batch cost with env fallback", async () => {
    vi.stubEnv("TRACERFY_BATCH_COST_CENTS_PER_HIT", "");
    const { parseBatchCostCentsPerHit } = await import("../server/services/skipTrace/tracerfyBatch.js");
    expect(parseBatchCostCentsPerHit("normal")).toBe(2);
    expect(parseBatchCostCentsPerHit("advanced")).toBe(4);
    vi.stubEnv("TRACERFY_BATCH_COST_CENTS_PER_HIT", "7");
    vi.resetModules();
    const mod2 = await import("../server/services/skipTrace/tracerfyBatch.js");
    expect(mod2.parseBatchCostCentsPerHit("normal")).toBe(7);
  });
});

describe("tracerfy batch provider — contract", () => {
  it("submits, polls, and maps a hit", async () => {
    vi.stubEnv("TRACERFY_API_KEY", "test-key");
    vi.stubEnv("TRACERFY_BATCH_POLL_MS", "2000");
    vi.stubEnv("TRACERFY_BATCH_TIMEOUT_MS", "30000");
    const { TracerfyBatchSkipTraceProvider } = await import("../server/services/skipTrace/tracerfyBatch.js");
    const p = new TracerfyBatchSkipTraceProvider();
    expect(p.name).toBe("tracerfy-batch");

    let polls = 0;
    globalThis.fetch = fetchRouter([
      {
        match: (u) => u.endsWith("/trace/"),
        respond: () => ({ body: JSON.stringify({ queue_id: "q-1", estimated_wait_seconds: 20 }) }),
      },
      {
        match: (u) => u.includes("/queue/q-1"),
        respond: () => {
          polls++;
          if (polls < 2) return { body: JSON.stringify([]) };
          return {
            body: JSON.stringify([
              { full_name: "Jane Doe", phones: [{ number: "4075550100" }], emails: ["jane@example.com"], credits_deducted: 1 },
            ]),
          };
        },
      },
    ]);

    const out = await p.skipTrace({ ownerName: "Jane Doe", address: "1 Main St", city: "Orlando", state: "FL", zipCode: "32801" });
    expect(out.status).toBe("success");
    if (out.status === "success") {
      expect(out.phones).toEqual(["+14075550100"]);
      expect(out.emails).toEqual(["jane@example.com"]);
      expect(out.costCents).toBe(2); // 1 credit × $0.02
      expect(out.evidence && out.evidence.length).toBeGreaterThan(0);
    }
    expect(polls).toBeGreaterThanOrEqual(2);
  });

  it("returns insufficient_credits on 402 submit", async () => {
    vi.stubEnv("TRACERFY_API_KEY", "test-key");
    const { TracerfyBatchSkipTraceProvider } = await import("../server/services/skipTrace/tracerfyBatch.js");
    globalThis.fetch = fetchRouter([
      {
        match: () => true,
        respond: () => ({ status: 402, body: JSON.stringify({ error: "Insufficient credits." }) }),
      },
    ]);
    const out = await new TracerfyBatchSkipTraceProvider().skipTrace({ ownerName: "Jane Doe", address: "1 Main St", city: "Orlando", state: "FL", zipCode: "32801" });
    expect(out.status).toBe("fail");
    if (out.status === "fail") expect(out.errorMessage).toMatch(/^insufficient_credits/);
  });

  it("fails cleanly when the API key is missing", async () => {
    vi.stubEnv("TRACERFY_API_KEY", "");
    const { TracerfyBatchSkipTraceProvider } = await import("../server/services/skipTrace/tracerfyBatch.js");
    await expect(
      new TracerfyBatchSkipTraceProvider().skipTrace({ ownerName: "Jane Doe", address: "1 Main St", city: "Orlando", state: "FL", zipCode: "32801" }),
    ).rejects.toThrow("TRACERFY_API_KEY is not configured");
  });
});

describe("spend caps + kill switch", () => {
  it("parses caps from env, 0/unset = unlimited", async () => {
    const { parseSpendCaps, parseKillSwitchEnv } = await import("../server/services/skipTrace/spend.js");
    expect(parseSpendCaps({})).toEqual({ dailyCapCents: 0, monthlyCapCents: 0 });
    expect(parseSpendCaps({ SKIP_TRACE_DAILY_SPEND_CENTS_CAP: "500", SKIP_TRACE_MONTHLY_SPEND_CENTS_CAP: "10000" })).toEqual({
      dailyCapCents: 500,
      monthlyCapCents: 10000,
    });
    expect(parseSpendCaps({ SKIP_TRACE_DAILY_SPEND_CENTS_CAP: "-5" }).dailyCapCents).toBe(0);
    expect(parseKillSwitchEnv({ SKIP_TRACE_KILL_SWITCH: "true" })).toBe(true);
    expect(parseKillSwitchEnv({ SKIP_TRACE_KILL_SWITCH: "TRUE" })).toBe(true);
    expect(parseKillSwitchEnv({})).toBe(false);
  });

  it("blocks on kill switch regardless of caps", async () => {
    const { checkSpendAllowed } = await import("../server/services/skipTrace/spend.js");
    const r = checkSpendAllowed({ killSwitch: true, caps: { dailyCapCents: 0, monthlyCapCents: 0 }, dailySpendCents: 0, monthlySpendCents: 0, estimatedCostCents: 2 });
    expect(r).toEqual({ blocked: true, reason: "kill_switch" });
  });

  it("blocks when a lookup would exceed the daily cap", async () => {
    const { checkSpendAllowed } = await import("../server/services/skipTrace/spend.js");
    const blocked = checkSpendAllowed({ killSwitch: false, caps: { dailyCapCents: 100, monthlyCapCents: 0 }, dailySpendCents: 99, monthlySpendCents: 0, estimatedCostCents: 2 });
    expect(blocked).toEqual({ blocked: true, reason: "daily_cap" });
    const allowed = checkSpendAllowed({ killSwitch: false, caps: { dailyCapCents: 100, monthlyCapCents: 0 }, dailySpendCents: 98, monthlySpendCents: 0, estimatedCostCents: 2 });
    expect(allowed).toEqual({ blocked: false, reason: null });
  });

  it("blocks on the monthly cap and allows under both", async () => {
    const { checkSpendAllowed } = await import("../server/services/skipTrace/spend.js");
    const blocked = checkSpendAllowed({ killSwitch: false, caps: { dailyCapCents: 10000, monthlyCapCents: 500 }, dailySpendCents: 10, monthlySpendCents: 499, estimatedCostCents: 2 });
    expect(blocked).toEqual({ blocked: true, reason: "monthly_cap" });
  });

  it("estimates per-provider lookup costs", async () => {
    const { estimatePaidLookupCostCents } = await import("../server/services/skipTrace/spend.js");
    expect(estimatePaidLookupCostCents("tracerfy")).toBe(10);
    expect(estimatePaidLookupCostCents("tracerfy-batch")).toBe(2);
    expect(estimatePaidLookupCostCents("free-web")).toBe(10); // fallback
  });
});

describe("provider-name validation", () => {
  it("normalizes selectable provider names", async () => {
    const { normalizeProviderName } = await import("../server/services/skipTrace/provider.js");
    expect(normalizeProviderName("auto")).toBe("auto");
    expect(normalizeProviderName("tracerfy-batch")).toBe("tracerfy-batch");
    expect(normalizeProviderName("TRACERFY")).toBe("tracerfy");
    expect(normalizeProviderName(" free-web ")).toBe("free-web");
    expect(normalizeProviderName("mock")).toBeNull();
    expect(normalizeProviderName("nope")).toBeNull();
    expect(normalizeProviderName(null)).toBeNull();
  });

  it("resolves per-job providers, auto → null", async () => {
    const { resolveJobSkipTraceProvider, isPaidSkipTraceProvider } = await import("../server/services/skipTrace/provider.js");
    expect(resolveJobSkipTraceProvider("auto")).toBeNull();
    expect(resolveJobSkipTraceProvider(null)).toBeNull();
    expect(resolveJobSkipTraceProvider("tracerfy-batch")?.name).toBe("tracerfy-batch");
    expect(resolveJobSkipTraceProvider("courtlistener")?.name).toBe("courtlistener");
    expect(isPaidSkipTraceProvider("tracerfy-batch")).toBe(true);
    expect(isPaidSkipTraceProvider("tracerfy")).toBe(true);
    expect(isPaidSkipTraceProvider("enformiongo")).toBe(true);
    expect(isPaidSkipTraceProvider("free-web")).toBe(false);
    expect(isPaidSkipTraceProvider("courtlistener")).toBe(false);
  });

  it("factory selects the batch provider from env", async () => {
    vi.stubEnv("SKIP_TRACE_PROVIDER", "tracerfy-batch");
    const { getSkipTraceProvider } = await import("../server/services/skipTrace/provider.js");
    expect(getSkipTraceProvider().name).toBe("tracerfy-batch");
  });
});

describe("daily free-lane enrichment", () => {
  it("builds cache keys identically to the orchestrator", async () => {
    const { skipTraceCacheKey } = await import("../server/cron/skip-trace-daily-enrichment.js");
    // Matches the orchestrator's key exactly (joined + trim + lowercase;
    // inner whitespace is preserved by design).
    expect(skipTraceCacheKey({ ownerName: " Jane Doe ", address: "1 Main St", city: "Orlando", state: "FL", zipCode: "32801" })).toBe(
      "jane doe |1 main st|orlando|fl|32801",
    );
  });

  it("returns disabled state when the routine is off", async () => {
    vi.stubEnv("SKIP_TRACE_DAILY_ENABLED", "false");
    const { runDailyFreeLaneEnrichment } = await import("../server/cron/skip-trace-daily-enrichment.js");
    const out = await runDailyFreeLaneEnrichment();
    expect(out.enabled).toBe(false);
    expect(out.queued).toBe(0);
  });
});
