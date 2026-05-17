import { browserbaseFetch, browserbaseSearch } from "../../browserbase/client.js";
import { buildSearchPlans, extractJsonLdSignalsFromHtml, parseEnvBool, parseEnvInt } from "./sources.js";

export type PublicResearchEntityType = "lead" | "opportunity";

export type PublicResearchEvidenceInput = {
  sourceType: string;
  sourceUrl?: string | null;
  extracted?: Record<string, unknown> | null;
  confidence?: Record<string, unknown> | null;
  notes?: string | null;
  screenshotRef?: string | null;
};

export type PublicResearchInput = {
  entityType: PublicResearchEntityType;
  entityId: number;
  address: string;
  city: string;
  state: string;
  zipCode: string;
  ownerName?: string | null;
};

export type PublicResearchOutput =
  | {
      status: "disabled";
      evidence: PublicResearchEvidenceInput[];
      message: string;
      raw?: unknown;
    }
  | {
      status: "success";
      evidence: PublicResearchEvidenceInput[];
      message?: string;
      raw?: unknown;
    }
  | {
      status: "fail";
      evidence: PublicResearchEvidenceInput[];
      message: string;
      raw?: unknown;
    };

export interface PublicResearchRunner {
  name: string;
  run(input: PublicResearchInput): Promise<PublicResearchOutput>;
}

function hasEnv(name: string) {
  const v = process.env[name];
  return !!(v && String(v).trim());
}

export class BrowserbasePublicResearchRunner implements PublicResearchRunner {
  name = "browserbase";
  enabled = parseEnvBool(process.env.SKIP_TRACE_PUBLIC_RESEARCH_ENABLED) ?? false;
  maxResults = parseEnvInt(process.env.SKIP_TRACE_PUBLIC_RESEARCH_MAX_RESULTS_PER_SOURCE, 3);
  enableFetchExtract = parseEnvBool(process.env.SKIP_TRACE_PUBLIC_RESEARCH_ENABLE_FETCH_EXTRACT) ?? true;

  async run(input: PublicResearchInput): Promise<PublicResearchOutput> {
    if (!this.enabled) {
      return {
        status: "disabled",
        evidence: [],
        message: "Public research is disabled",
        raw: { env: "SKIP_TRACE_PUBLIC_RESEARCH_ENABLED" },
      };
    }

    if (!hasEnv("BROWSERBASE_API_KEY")) {
      return {
        status: "disabled",
        evidence: [],
        message: "BROWSERBASE_API_KEY is not configured",
        raw: { env: "BROWSERBASE_API_KEY" },
      };
    }

    const evidence: PublicResearchEvidenceInput[] = [];
    const plans = buildSearchPlans(input);

    try {
      for (const plan of plans) {
        let searchOut: any = null;
        try {
          searchOut = await browserbaseSearch({ query: plan.query, numResults: Math.max(1, Math.min(25, this.maxResults)), timeoutMs: 20_000 });
        } catch (e: any) {
          evidence.push({
            sourceType: plan.sourceType,
            sourceUrl: null,
            extracted: null,
            confidence: null,
            notes: `Search failed: ${String(e?.message || e)} (query: ${plan.query})`,
            screenshotRef: null,
          });
          continue;
        }

        const results = Array.isArray(searchOut?.results) ? searchOut.results : [];
        const top = results.slice(0, Math.max(0, this.maxResults));

        for (let i = 0; i < top.length; i++) {
          const r = top[i] || {};
          const url = typeof r?.url === "string" ? r.url : "";
          evidence.push({
            sourceType: plan.sourceType,
            sourceUrl: url || null,
            extracted: {
              id: typeof r?.id === "string" ? r.id : undefined,
              title: typeof r?.title === "string" ? r.title : undefined,
              url: url || undefined,
              author: typeof r?.author === "string" ? r.author : undefined,
              image: typeof r?.image === "string" ? r.image : undefined,
              favicon: typeof r?.favicon === "string" ? r.favicon : undefined,
              publishedDate: typeof r?.publishedDate === "string" ? r.publishedDate : undefined,
            },
            confidence: null,
            notes: `query=${plan.query} rank=${i + 1}/${top.length}`,
            screenshotRef: null,
          });
        }

        if (!this.enableFetchExtract) continue;
        if (plan.key !== "zillow" && plan.key !== "redfin" && plan.key !== "realtor") continue;
        const bestUrl = typeof top?.[0]?.url === "string" ? top[0].url : "";
        if (!bestUrl) continue;

        try {
          const fetched = await browserbaseFetch({ url: bestUrl, allowRedirects: true, proxies: true, timeoutMs: 25_000 });
          const signals = extractJsonLdSignalsFromHtml(String(fetched?.content || ""));
          if (signals) {
            evidence.push({
              sourceType: `${plan.key}_extract`,
              sourceUrl: bestUrl,
              extracted: { ...signals, statusCode: fetched?.statusCode, contentType: fetched?.contentType },
              confidence: null,
              notes: "Extracted from JSON-LD (best-effort)",
              screenshotRef: null,
            });
          }
        } catch (e: any) {
          evidence.push({
            sourceType: `${plan.key}_extract`,
            sourceUrl: bestUrl,
            extracted: null,
            confidence: null,
            notes: `Fetch/extract failed: ${String(e?.message || e)}`,
            screenshotRef: null,
          });
        }
      }

      return {
        status: "success",
        evidence,
        message: evidence.length ? "Public research completed" : "No evidence found",
        raw: { runner: this.name, enableFetchExtract: this.enableFetchExtract, maxResults: this.maxResults },
      };
    } catch (e: any) {
      return {
        status: "fail",
        evidence,
        message: String(e?.message || e) || "Public research failed",
        raw: { runner: this.name },
      };
    }
  }
}

export function getPublicResearchRunner(): PublicResearchRunner {
  return new BrowserbasePublicResearchRunner();
}
