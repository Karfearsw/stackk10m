import { EnformionGOSkipTraceProvider } from "./enformiongo.js";
import { FreeWebSkipTraceProvider } from "./freeWeb.js";

export type SkipTraceInput = {
  ownerName: string;
  address: string;
  city: string;
  state: string;
  zipCode: string;
};

export type SkipTraceOutput =
  | {
      status: "success";
      phones: string[];
      emails: string[];
      costCents: number;
      raw: unknown;
      evidence?: SkipTraceProviderEvidence[];
    }
  | {
      status: "fail";
      phones: string[];
      emails: string[];
      costCents: number;
      raw: unknown;
      errorMessage: string;
      evidence?: SkipTraceProviderEvidence[];
    };

export interface SkipTraceProvider {
  name: string;
  skipTrace(input: SkipTraceInput): Promise<SkipTraceOutput>;
}

/** Evidence collected during a lookup (sources consulted, extracted facts, confidence). */
export type SkipTraceProviderEvidence = {
  sourceType: string;
  sourceUrl?: string | null;
  extracted?: Record<string, unknown> | null;
  confidence?: Record<string, unknown> | null;
  notes?: string | null;
  screenshotRef?: string | null;
};

/**
 * Ticket 05 — provider-agnostic skip tracing.
 *
 * The CRM must not be written against one vendor. Providers register a
 * descriptor here (slug, env requirements, configuration state, factory) and the
 * orchestrator walks a resolved *chain* of providers, falling back to the next
 * one when a provider fails to return contacts. Adding a vendor therefore means
 * registering a descriptor — no orchestrator changes.
 *
 * The former "mock" provider (fabricated phones, @example.com emails, fake 99¢
 * charges) stays deleted: production must only ever produce real,
 * evidence-backed contact data.
 */

export type SkipTraceProviderKind = "commercial" | "web_research" | "custom";

export interface SkipTraceProviderDescriptor {
  /** Stable id stored on skip_trace_results.provider_name. */
  slug: string;
  label: string;
  kind: SkipTraceProviderKind;
  description: string;
  /** Typical cost of one lookup in cents (0 = free / cost varies). */
  costPerLookupCents: number;
  /** Env keys that must all be present for this provider to run. */
  requiresEnv: string[];
  /** Accepted alternate spellings of `slug` for SKIP_TRACE_PROVIDER. */
  aliases?: string[];
  /**
   * Whether this provider may be appended as an automatic last resort when the
   * selected provider cannot serve a lookup. Only cost-free providers set this:
   * a paid vendor must never be billed without an explicit opt-in.
   */
  autoFallback?: boolean;
  /** Whether the provider is ready to run with the current environment. */
  isConfigured(): boolean;
  /** Human-readable reason why it cannot run (null when configured). */
  blocker(): string | null;
  create(): SkipTraceProvider;
}

function envValue(key: string): string | null {
  const v = process.env[key];
  if (!v || String(v).trim() === "") return null;
  return String(v).trim();
}

function hasEnv(keys: string[]): boolean {
  return keys.every((key) => envValue(key) !== null);
}

function missingEnv(keys: string[]): string[] {
  return keys.filter((key) => envValue(key) === null);
}

/** Names that must never be selectable: they fabricate contact data. */
const SYNTHETIC_PROVIDER_NAMES = ["mock", "demo", "test", "fake", "sample"];

export function isSyntheticProviderName(name: unknown): boolean {
  return SYNTHETIC_PROVIDER_NAMES.includes(String(name ?? "").trim().toLowerCase());
}

const FREE_WEB_DESCRIPTOR: SkipTraceProviderDescriptor = {
  slug: "free-web",
  label: "Free public-web research",
  kind: "web_research",
  description:
    "Agentic public-records research (US Census geocoder + public search engines). No API keys; every hit is backed by recorded evidence and misses stay misses.",
  costPerLookupCents: 0,
  requiresEnv: [],
  aliases: ["free_web", "freeweb", "free", "web"],
  autoFallback: true,
  isConfigured: () => true,
  blocker: () => null,
  create: () => new FreeWebSkipTraceProvider(),
};

const ENFORMION_DESCRIPTOR: SkipTraceProviderDescriptor = {
  slug: "enformiongo",
  label: "EnformionGO (commercial)",
  kind: "commercial",
  description: "Paid commercial people-data provider with higher contact coverage; requires EnformionGO credentials.",
  costPerLookupCents: 0, // Actual cost comes from ENFORMION_COST_CENTS on each result.
  requiresEnv: ["ENFORMION_AP_NAME", "ENFORMION_AP_PASSWORD"],
  aliases: ["enformion"],
  isConfigured: () => hasEnv(ENFORMION_DESCRIPTOR.requiresEnv),
  blocker: () => {
    const missing = missingEnv(ENFORMION_DESCRIPTOR.requiresEnv);
    return missing.length ? `Missing: ${missing.join(", ")}. Add the EnformionGO credentials or use free-web.` : null;
  },
  create: () => new EnformionGOSkipTraceProvider(),
};

const REGISTRY: SkipTraceProviderDescriptor[] = [FREE_WEB_DESCRIPTOR, ENFORMION_DESCRIPTOR];

export const DEFAULT_SKIP_TRACE_PROVIDER_SLUG = FREE_WEB_DESCRIPTOR.slug;

/**
 * Register an additional provider. Idempotent for identical slugs only when
 * `replace` is set — otherwise a duplicate slug is a programming error.
 */
export function registerSkipTraceProvider(descriptor: SkipTraceProviderDescriptor, opts: { replace?: boolean } = {}): void {
  const slug = String(descriptor?.slug ?? "").trim().toLowerCase();
  if (!slug) throw new Error("Skip trace provider descriptor requires a non-empty slug.");
  if (typeof descriptor.create !== "function" || typeof descriptor.isConfigured !== "function") {
    throw new Error(`Skip trace provider "${slug}" requires create() and isConfigured().`);
  }
  if (!descriptor.label || !descriptor.description) {
    throw new Error(`Skip trace provider "${slug}" requires a label and description.`);
  }
  for (const alias of descriptor.aliases ?? []) {
    if (!String(alias).trim()) throw new Error(`Skip trace provider "${slug}" has an empty alias.`);
  }
  const normalized: SkipTraceProviderDescriptor = { ...descriptor, slug };
  const index = REGISTRY.findIndex((d) => d.slug === slug);
  if (index >= 0) {
    if (!opts.replace) throw new Error(`Skip trace provider "${slug}" is already registered.`);
    REGISTRY[index] = normalized;
    return;
  }
  REGISTRY.push(normalized);
}

export function listSkipTraceProviderDescriptors(): SkipTraceProviderDescriptor[] {
  return [...REGISTRY];
}

export function isKnownSkipTraceProvider(name: unknown): boolean {
  return getSkipTraceProviderDescriptor(name) !== null;
}

export function getSkipTraceProviderDescriptor(name: unknown): SkipTraceProviderDescriptor | null {
  const needle = String(name ?? "").trim().toLowerCase();
  if (!needle) return null;
  return (
    REGISTRY.find((d) => d.slug === needle) ??
    REGISTRY.find((d) => (d.aliases ?? []).some((a) => String(a).trim().toLowerCase() === needle)) ??
    null
  );
}

function syntheticProviderError(raw: string): Error {
  return new Error(
    `SKIP_TRACE_PROVIDER="${raw}" is no longer supported: mock/demo data is disabled. Set SKIP_TRACE_PROVIDER=free-web (no API keys) or =enformiongo (requires EnformionGO credentials).`,
  );
}

function unknownProviderError(raw: string): Error {
  const slugs = REGISTRY.map((d) => d.slug).join(", ");
  return new Error(
    `Unknown SKIP_TRACE_PROVIDER "${raw}". Supported values: free-web (default, no API keys) or enformiongo (requires ENFORMION_AP_NAME + ENFORMION_AP_PASSWORD). Registered providers: ${slugs}.`,
  );
}

/** The provider named by the env/argument, without considering fallbacks. */
export function resolvePrimarySkipTraceProviderDescriptor(nameOverride?: string | null): SkipTraceProviderDescriptor {
  const raw = String(nameOverride ?? envValue("SKIP_TRACE_PROVIDER") ?? DEFAULT_SKIP_TRACE_PROVIDER_SLUG).trim();
  if (!raw) return FREE_WEB_DESCRIPTOR;
  if (isSyntheticProviderName(raw)) throw syntheticProviderError(raw);
  const descriptor = getSkipTraceProviderDescriptor(raw);
  if (!descriptor) throw unknownProviderError(raw);
  return descriptor;
}

/**
 * Ordered provider chain: the selected provider first, then the requested
 * fallbacks (SKIP_TRACE_PROVIDER_FALLBACKS), then any registered provider that
 * opted into `autoFallback` (cost-free only — a paid vendor is never billed
 * without an explicit opt-in).
 *
 * Unconfigured providers are skipped so a missing credential never blocks a
 * lookup that another provider can serve; if nothing in the chain is configured
 * the primary is returned alone so the caller surfaces its specific blocker.
 */
export function resolveSkipTraceProviderChain(input?: { primary?: string | null; fallbacks?: string | null }): SkipTraceProviderDescriptor[] {
  const primary = resolvePrimarySkipTraceProviderDescriptor(input?.primary);
  const rawFallbacks = input?.fallbacks ?? envValue("SKIP_TRACE_PROVIDER_FALLBACKS") ?? "";
  const requested = String(rawFallbacks)
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  const chain: SkipTraceProviderDescriptor[] = [];
  const push = (candidate: SkipTraceProviderDescriptor) => {
    if (chain.some((d) => d.slug === candidate.slug)) return;
    chain.push(candidate);
  };
  push(primary);
  for (const requestedSlug of requested) push(resolvePrimarySkipTraceProviderDescriptor(requestedSlug));
  for (const descriptor of REGISTRY) if (descriptor.autoFallback) push(descriptor);

  const configured = chain.filter((d) => d.isConfigured());
  return configured.length ? configured : [primary];
}

export function resolveSkipTraceProviderChainInstances(input?: { primary?: string | null; fallbacks?: string | null }): SkipTraceProvider[] {
  return resolveSkipTraceProviderChain(input).map((d) => d.create());
}

export interface SkipTraceProviderStatus {
  slug: string;
  label: string;
  kind: SkipTraceProviderKind;
  description: string;
  configured: boolean;
  selected: boolean;
  /** Position in the resolved chain, or null when not in it. */
  chainIndex: number | null;
  requiresEnv: string[];
  missingEnv: string[];
  costPerLookupCents: number;
  blocker: string | null;
}

/** Snapshot of every registered provider for readiness/UI reporting. */
export function getSkipTraceProviderStatuses(nameOverride?: string | null): SkipTraceProviderStatus[] {
  const primary = resolvePrimarySkipTraceProviderDescriptor(nameOverride);
  const chain = resolveSkipTraceProviderChain({ primary: primary.slug, fallbacks: "" });
  return REGISTRY.map((descriptor) => {
    const index = chain.findIndex((d) => d.slug === descriptor.slug);
    return {
      slug: descriptor.slug,
      label: descriptor.label,
      kind: descriptor.kind,
      description: descriptor.description,
      configured: descriptor.isConfigured(),
      selected: descriptor.slug === primary.slug,
      chainIndex: index >= 0 ? index : null,
      requiresEnv: [...descriptor.requiresEnv],
      missingEnv: missingEnv(descriptor.requiresEnv),
      costPerLookupCents: descriptor.costPerLookupCents,
      blocker: descriptor.isConfigured() ? null : descriptor.blocker(),
    };
  });
}

/** Order the chain would run in, as slugs (for logs, UI, and job events). */
export function getSkipTraceProviderChainSlugs(input?: { primary?: string | null; fallbacks?: string | null }): string[] {
  return resolveSkipTraceProviderChain(input).map((d) => d.slug);
}

/**
 * Backwards-compatible single-provider accessor.
 * Throws for synthetic/unknown names instead of silently returning a default.
 */
export function getSkipTraceProvider(nameOrSlug?: string | null): SkipTraceProvider {
  return resolvePrimarySkipTraceProviderDescriptor(nameOrSlug).create();
}
