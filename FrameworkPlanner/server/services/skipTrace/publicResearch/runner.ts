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

function parseEnvBool(v: unknown): boolean | null {
  if (v === undefined || v === null) return null;
  const s = String(v).trim().toLowerCase();
  if (!s) return null;
  if (s === "1" || s === "true" || s === "yes" || s === "on") return true;
  if (s === "0" || s === "false" || s === "no" || s === "off") return false;
  return null;
}

export class DefaultPublicResearchRunner implements PublicResearchRunner {
  name = "default";
  enabled = parseEnvBool(process.env.SKIP_TRACE_PUBLIC_RESEARCH_ENABLED) ?? false;

  async run(_input: PublicResearchInput): Promise<PublicResearchOutput> {
    if (!this.enabled) {
      return {
        status: "disabled",
        evidence: [],
        message: "Public research is disabled",
        raw: { env: "SKIP_TRACE_PUBLIC_RESEARCH_ENABLED" },
      };
    }

    return {
      status: "success",
      evidence: [
        {
          sourceType: "other",
          sourceUrl: null,
          extracted: {},
          confidence: {},
          notes: "Public research runner is enabled but no sources are configured",
          screenshotRef: null,
        },
      ],
      message: "Public research runner produced placeholder evidence",
      raw: { runner: "default" },
    };
  }
}

export function getPublicResearchRunner(): PublicResearchRunner {
  return new DefaultPublicResearchRunner();
}

