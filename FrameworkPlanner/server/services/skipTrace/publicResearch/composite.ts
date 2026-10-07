import type { PublicResearchRunner, PublicResearchInput, PublicResearchOutput, PublicResearchEvidenceInput } from "./runner.js";
import { FreeWebPublicResearchRunner } from "../freeWeb.js";
import { CourtListenerSkipTraceProvider } from "../courtListener.js";
import type { SkipTraceInput } from "../provider.js";

/**
 * Composite free-lane runner for the public-research path
 * (mode = "public_research" or "both").
 *
 * Runs every enabled free source and merges their evidence, so the free lane
 * keeps improving without mode-switching:
 *   1. free-web — always-on agentic public-records research (no keys)
 *   2. courtlistener — bankruptcy-petition enrichment when COURTLISTENER_API_TOKEN is set
 *
 * Evidence convention (consumed by the orchestrator): each evidence entry's
 * `extracted` carries `phones: string[]` and `emails: string[]`.
 * Sources never fabricate contact data — a miss is evidence of a miss.
 */
export class CompositePublicResearchRunner implements PublicResearchRunner {
  name = "composite-free";

  private freeWeb = new FreeWebPublicResearchRunner();
  private courtListener = new CourtListenerSkipTraceProvider();

  private get courtListenerEnabled(): boolean {
    return !!String(process.env.COURTLISTENER_API_TOKEN || "").trim();
  }

  async run(input: PublicResearchInput): Promise<PublicResearchOutput> {
    const evidence: PublicResearchEvidenceInput[] = [];
    const raw: Record<string, unknown> = {};
    let anyRan = false;
    let anySuccess = false;
    let failNotes: string[] = [];

    if (this.freeWeb.enabled) {
      anyRan = true;
      try {
        const out = await this.freeWeb.run(input);
        evidence.push(...out.evidence);
        raw.freeWeb = out.raw;
        if (out.status === "success") anySuccess = true;
        else failNotes.push(`free-web: ${out.message || out.status}`);
      } catch (e: any) {
        failNotes.push(`free-web error: ${String(e?.message || e).slice(0, 120)}`);
      }
    }

    if (this.courtListenerEnabled) {
      anyRan = true;
      try {
        const clInput: SkipTraceInput = {
          ownerName: String(input.ownerName || "").trim(),
          address: String(input.address || "").trim(),
          city: String(input.city || "").trim(),
          state: String(input.state || "").trim(),
          zipCode: String(input.zipCode || "").trim(),
        };
        const out = await this.courtListener.skipTrace(clInput);
        evidence.push(
          ...(out.evidence || []).map((ev) => ({
            sourceType: ev.sourceType,
            sourceUrl: ev.sourceUrl ?? null,
            extracted: ev.extracted ?? {},
            confidence: ev.confidence ?? {},
            notes: ev.notes ?? null,
            screenshotRef: ev.screenshotRef ?? null,
          })) as PublicResearchEvidenceInput[]
        );
        raw.courtListener = out.raw;
        if (out.status === "success") anySuccess = true;
        else failNotes.push(`courtlistener: ${out.errorMessage}`);
      } catch (e: any) {
        failNotes.push(`courtlistener error: ${String(e?.message || e).slice(0, 120)}`);
      }
    }

    if (!anyRan) {
      return {
        status: "disabled",
        evidence: [],
        message: "No public-research sources configured (set SKIP_TRACE_PUBLIC_RESEARCH_ENABLED=true and/or COURTLISTENER_API_TOKEN)",
        raw: { runner: this.name },
      };
    }

    const phones = countContacts(evidence, "phones");
    const emails = countContacts(evidence, "emails");
    const sources = [this.freeWeb.enabled ? "free-web" : null, this.courtListenerEnabled ? "courtlistener" : null].filter(Boolean);
    return {
      status: anySuccess ? "success" : "fail",
      evidence,
      message:
        anySuccess
          ? `Composite public research (${sources.join(" + ")}) found ${phones} phone(s) and ${emails} email(s)`
          : `Composite public research (${sources.join(" + ")}) completed with no contact hits${failNotes.length ? " — " + failNotes.join("; ") : ""}`,
      raw: { ...raw, runner: this.name, sources },
    };
  }
}

function countContacts(evidence: PublicResearchEvidenceInput[], key: "phones" | "emails"): number {
  const seen = new Set<string>();
  for (const ev of evidence) {
    const arr = (ev.extracted as any)?.[key];
    if (Array.isArray(arr)) for (const v of arr) seen.add(String(v));
  }
  return seen.size;
}
