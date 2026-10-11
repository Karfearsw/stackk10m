import { EnformionGOSkipTraceProvider } from "./enformiongo.js";
import { FreeWebSkipTraceProvider } from "./freeWeb.js";
import { TracerfySkipTraceProvider } from "./tracerfy.js";
import { TracerfyBatchSkipTraceProvider } from "./tracerfyBatch.js";
import { CourtListenerSkipTraceProvider } from "./courtListener.js";

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

/** All selectable provider names (per-job selection + env default). */
export const SKIP_TRACE_PROVIDERS = ["free-web", "courtlistener", "tracerfy", "tracerfy-batch", "enformiongo"] as const;
export type SkipTraceProviderName = (typeof SKIP_TRACE_PROVIDERS)[number];

/** Providers that cost money per hit. */
export const SKIP_TRACE_PAID_PROVIDERS: ReadonlySet<string> = new Set(["tracerfy", "tracerfy-batch", "enformiongo"]);

/** True when the provider bills per hit. */
export function isPaidSkipTraceProvider(name: string): boolean {
  return SKIP_TRACE_PAID_PROVIDERS.has(String(name || "").trim().toLowerCase());
}

function providerFor(value: string): SkipTraceProvider {
  const v = String(value || "").trim().toLowerCase();
  if (v === "free-web" || v === "free_web" || v === "freeweb" || v === "free" || v === "web") return new FreeWebSkipTraceProvider();
  if (v === "tracerfy") return new TracerfySkipTraceProvider();
  if (v === "tracerfy-batch" || v === "tracerfy_batch" || v === "tracerfybatch") return new TracerfyBatchSkipTraceProvider();
  if (v === "courtlistener" || v === "recap") return new CourtListenerSkipTraceProvider();
  if (v === "enformiongo" || v === "enformion") return new EnformionGOSkipTraceProvider();
  if (v === "mock" || v === "demo" || v === "test") {
    throw new Error(
      `SKIP_TRACE_PROVIDER="${v}" is no longer supported: mock/demo data is disabled. Use free-web (no API keys), tracerfy or tracerfy-batch (require TRACERFY_API_KEY), courtlistener (requires COURTLISTENER_API_TOKEN), or enformiongo (requires ENFORMION_API_KEY).`,
    );
  }
  throw new Error(
    `Unknown skip-trace provider "${v}". Supported values: free-web (default, no API keys), courtlistener (requires COURTLISTENER_API_TOKEN), tracerfy (requires TRACERFY_API_KEY), tracerfy-batch (requires TRACERFY_API_KEY, $0.02/hit async), or enformiongo (requires ENFORMION_API_KEY).`,
  );
}

// The former "mock" provider (fabricated phone numbers, @example.com emails,
// and a fake 99¢ charge) has been deleted: production must only ever produce
// real, evidence-backed contact data. Providers:
//  - free-web: agentic public-records research (Census geocoder + public web),
//    no API keys, every hit backed by recorded evidence, misses stay misses.
//  - courtlistener: FREE bankruptcy-petition enrichment (COURTLISTENER_API_TOKEN
//    required). Searches RECAP for the owner as debtor; pro se Form 101
//    petitions often list phone/cell/email. ~125 API calls/day free quota.
//  - tracerfy: pay-as-you-go commercial skip trace (TRACERFY_API_KEY required).
//    Instant lookup, 5 credits ($0.10) per hit, misses free.
//  - tracerfy-batch: async batch trace (TRACERFY_API_KEY required).
//    1 credit ($0.02) per hit on normal, 2 credits ($0.04) on advanced,
//    misses free. Polls the queue every ~10s (timeout ~5 min).
//  - enformiongo: paid commercial data provider (ENFORMION_API_KEY required).
export function getSkipTraceProvider(): SkipTraceProvider {
  return providerFor(process.env.SKIP_TRACE_PROVIDER || "free-web");
}

/**
 * Resolve the provider for one job. `name` comes from the job's providerName
 * ("auto" = fall back to the env default). Returns null for "auto"/empty so
 * the caller can apply the configured default.
 */
export function resolveJobSkipTraceProvider(name: string | null | undefined): SkipTraceProvider | null {
  const v = String(name || "").trim().toLowerCase();
  if (!v || v === "auto") return null;
  return providerFor(v);
}

/**
 * Validate a per-job providerName from the API. Accepts the selectable names
 * plus "auto". Returns the normalized value or null when invalid.
 */
export function normalizeProviderName(name: unknown): string | null {
  const v = String(name || "").trim().toLowerCase();
  if (!v) return null;
  if (v === "auto") return "auto";
  const hit = (SKIP_TRACE_PROVIDERS as readonly string[]).find((p) => p === v);
  return hit ?? null;
}
