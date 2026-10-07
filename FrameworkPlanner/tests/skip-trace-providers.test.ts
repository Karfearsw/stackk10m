import { beforeEach, describe, expect, it } from "vitest";
import {
  DEFAULT_SKIP_TRACE_PROVIDER_SLUG,
  getSkipTraceProvider,
  getSkipTraceProviderChainSlugs,
  getSkipTraceProviderDescriptor,
  getSkipTraceProviderStatuses,
  isKnownSkipTraceProvider,
  isSyntheticProviderName,
  listSkipTraceProviderDescriptors,
  registerSkipTraceProvider,
  resolvePrimarySkipTraceProviderDescriptor,
  resolveSkipTraceProviderChain,
  type SkipTraceProviderDescriptor,
} from "../server/services/skipTrace/provider";

const ENV_KEYS = [
  "SKIP_TRACE_PROVIDER",
  "SKIP_TRACE_PROVIDER_FALLBACKS",
  "ENFORMION_AP_NAME",
  "ENFORMION_AP_PASSWORD",
];

function clearEnv() {
  for (const key of ENV_KEYS) delete process.env[key];
}

beforeEach(() => {
  clearEnv();
});

describe("skip trace provider registry", () => {
  it("registers the two real providers with env requirements", () => {
    const slugs = listSkipTraceProviderDescriptors().map((d) => d.slug);
    expect(slugs).toContain("free-web");
    expect(slugs).toContain("enformiongo");

    const freeWeb = getSkipTraceProviderDescriptor("free-web");
    expect(freeWeb?.isConfigured()).toBe(true);
    expect(freeWeb?.blocker()).toBeNull();
    expect(freeWeb?.requiresEnv).toEqual([]);

    const commercial = getSkipTraceProviderDescriptor("enformiongo");
    expect(commercial?.requiresEnv).toEqual(["ENFORMION_AP_NAME", "ENFORMION_AP_PASSWORD"]);
    expect(commercial?.isConfigured()).toBe(false);
    expect(commercial?.blocker()).toMatch(/ENFORMION_AP_NAME/);
  });

  it("resolves aliases but not unknown names", () => {
    expect(getSkipTraceProviderDescriptor("enformion")?.slug).toBe("enformiongo");
    expect(getSkipTraceProviderDescriptor("FREE_WEB")?.slug).toBe("free-web");
    expect(getSkipTraceProviderDescriptor("clearbit")).toBeNull();
    expect(isKnownSkipTraceProvider("free-web")).toBe(true);
    expect(isKnownSkipTraceProvider("clearbit")).toBe(false);
  });

  it("defaults to free public-web research", () => {
    expect(resolvePrimarySkipTraceProviderDescriptor().slug).toBe(DEFAULT_SKIP_TRACE_PROVIDER_SLUG);
    expect(getSkipTraceProvider().name).toBe("free-web");
  });

  it("still refuses synthetic and unknown provider names", () => {
    for (const name of ["mock", "demo", "test", "fake"]) {
      process.env.SKIP_TRACE_PROVIDER = name;
      expect(() => resolvePrimarySkipTraceProviderDescriptor()).toThrow(/mock\/demo data is disabled/);
    }
    process.env.SKIP_TRACE_PROVIDER = "clearbit";
    expect(() => resolvePrimarySkipTraceProviderDescriptor()).toThrow(/Unknown SKIP_TRACE_PROVIDER/);
  });

  it("recognizes synthetic provider names for cache decisions", () => {
    expect(isSyntheticProviderName("mock")).toBe(true);
    expect(isSyntheticProviderName("MOCK")).toBe(true);
    expect(isSyntheticProviderName("free-web")).toBe(false);
    expect(isSyntheticProviderName(null)).toBe(false);
  });
});

describe("skip trace provider chain", () => {
  it("runs the selected provider alone when nothing else is configured", () => {
    expect(getSkipTraceProviderChainSlugs()).toEqual(["free-web"]);
  });

  it("falls back to the free provider when the selected paid provider is unconfigured", () => {
    process.env.SKIP_TRACE_PROVIDER = "enformiongo";
    expect(getSkipTraceProviderChainSlugs()).toEqual(["free-web"]);
    expect(getSkipTraceProviderStatuses().find((s) => s.slug === "enformiongo")?.blocker).toBeTruthy();
  });

  it("falls back to free-web when the commercial provider is selected and configured", () => {
    process.env.SKIP_TRACE_PROVIDER = "enformiongo";
    process.env.ENFORMION_AP_NAME = "acct";
    process.env.ENFORMION_AP_PASSWORD = "secret";
    expect(getSkipTraceProviderChainSlugs()).toEqual(["enformiongo", "free-web"]);
  });

  it("honors an explicit fallback order", () => {
    process.env.SKIP_TRACE_PROVIDER = "free-web";
    process.env.SKIP_TRACE_PROVIDER_FALLBACKS = "enformiongo, free-web";
    process.env.ENFORMION_AP_NAME = "acct";
    process.env.ENFORMION_AP_PASSWORD = "secret";
    expect(getSkipTraceProviderChainSlugs()).toEqual(["free-web", "enformiongo"]);
  });

  it("rejects an unknown fallback instead of silently skipping it", () => {
    process.env.SKIP_TRACE_PROVIDER_FALLBACKS = "clearbit";
    expect(() => resolveSkipTraceProviderChain()).toThrow(/Unknown SKIP_TRACE_PROVIDER/);
  });

  it("builds provider instances for each chain entry", () => {
    const chain = resolveSkipTraceProviderChain();
    expect(chain.map((d) => d.create().name)).toEqual(chain.map((d) => d.slug));
  });
});

describe("skip trace provider statuses", () => {
  it("reports selection, configuration, and missing credentials", () => {
    const statuses = getSkipTraceProviderStatuses();
    const freeWeb = statuses.find((s) => s.slug === "free-web");
    const commercial = statuses.find((s) => s.slug === "enformiongo");

    expect(freeWeb?.selected).toBe(true);
    expect(freeWeb?.configured).toBe(true);
    expect(freeWeb?.chainIndex).toBe(0);
    expect(commercial?.selected).toBe(false);
    expect(commercial?.configured).toBe(false);
    expect(commercial?.missingEnv).toEqual(["ENFORMION_AP_NAME", "ENFORMION_AP_PASSWORD"]);
    expect(commercial?.chainIndex).toBeNull();
    expect(commercial?.blocker).toBeTruthy();
  });

  it("marks the commercial provider as the second chain entry once configured", () => {
    process.env.SKIP_TRACE_PROVIDER = "enformiongo";
    process.env.ENFORMION_AP_NAME = "acct";
    process.env.ENFORMION_AP_PASSWORD = "secret";
    const statuses = getSkipTraceProviderStatuses();
    expect(statuses.find((s) => s.slug === "enformiongo")).toMatchObject({ selected: true, chainIndex: 0, configured: true, missingEnv: [] });
    expect(statuses.find((s) => s.slug === "free-web")).toMatchObject({ selected: false, chainIndex: 1, configured: true });
  });
});

describe("registering a custom provider", () => {
  const custom = (slug: string): SkipTraceProviderDescriptor => ({
    slug,
    label: "Acme People Data",
    kind: "commercial",
    description: "Test-only provider registered by the unit test.",
    costPerLookupCents: 12,
    requiresEnv: ["ACME_API_KEY"],
    isConfigured: () => true,
    blocker: () => null,
    create: () => ({
      name: slug,
      skipTrace: async () => ({ status: "fail" as const, phones: [], emails: [], costCents: 0, raw: null, errorMessage: "not implemented" }),
    }),
  });

  it("adds, selects, and reports a newly registered provider", () => {
    registerSkipTraceProvider(custom("acme-test"));
    expect(isKnownSkipTraceProvider("acme-test")).toBe(true);

    process.env.SKIP_TRACE_PROVIDER = "acme-test";
    expect(getSkipTraceProvider().name).toBe("acme-test");
    expect(getSkipTraceProviderChainSlugs()[0]).toBe("acme-test");
    expect(getSkipTraceProviderStatuses().find((s) => s.slug === "acme-test")?.selected).toBe(true);

    clearEnv();
    // Unselected custom providers still appear, but never hijack the chain:
    // only the primary and auto-fallback providers run by default.
    expect(getSkipTraceProviderChainSlugs()).toEqual(["free-web"]);
    expect(getSkipTraceProviderStatuses().map((s) => s.slug)).toContain("acme-test");
    expect(getSkipTraceProviderStatuses().find((s) => s.slug === "acme-test")?.chainIndex).toBeNull();
  });

  it("refuses duplicate slugs unless replace is requested", () => {
    expect(() => registerSkipTraceProvider(custom("acme-test"))).toThrow(/already registered/);
    expect(() => registerSkipTraceProvider({ ...custom("acme-test"), label: "Acme v2" }, { replace: true })).not.toThrow();
    expect(getSkipTraceProviderDescriptor("acme-test")?.label).toBe("Acme v2");
  });

  it("validates the descriptor shape", () => {
    expect(() => registerSkipTraceProvider({ ...custom(""), slug: "" })).toThrow(/non-empty slug/);
    expect(() => registerSkipTraceProvider({ ...custom("bad"), label: "" })).toThrow(/label and description/);
    expect(() => registerSkipTraceProvider({ ...custom("bad2"), create: undefined as any })).toThrow(/create\(\) and isConfigured\(\)/);
    expect(() => registerSkipTraceProvider({ ...custom("bad3"), aliases: ["  "] })).toThrow(/empty alias/);
  });
});
