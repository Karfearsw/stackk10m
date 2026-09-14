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

// The former "mock" provider (fabricated phone numbers, @example.com emails,
// and a fake 99¢ charge) has been deleted: production must only ever produce
// real, evidence-backed contact data. Two real providers remain:
//  - free-web: agentic public-records research (Census geocoder + public web),
//    no API keys, every hit backed by recorded evidence, misses stay misses.
//  - enformiongo: paid commercial data provider (ENFORMION_API_KEY required).
export function getSkipTraceProvider(): SkipTraceProvider {
  const v = String(process.env.SKIP_TRACE_PROVIDER || "free-web").trim().toLowerCase();
  if (v === "free-web" || v === "free_web" || v === "freeweb" || v === "free" || v === "web") return new FreeWebSkipTraceProvider();
  if (v === "enformiongo" || v === "enformion") return new EnformionGOSkipTraceProvider();
  if (v === "mock" || v === "demo" || v === "test") {
    throw new Error(
      `SKIP_TRACE_PROVIDER="${v}" is no longer supported: mock/demo data is disabled. Set SKIP_TRACE_PROVIDER=free-web (no API keys) or =enformiongo (requires ENFORMION_API_KEY).`,
    );
  }
  throw new Error(
    `Unknown SKIP_TRACE_PROVIDER "${v}". Supported values: free-web (default, no API keys) or enformiongo (requires ENFORMION_API_KEY).`,
  );
}
