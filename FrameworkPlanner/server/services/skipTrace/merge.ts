import type { Lead, Property, SkipTraceEvidence, SkipTraceResult, LeadScoreSnapshot } from "../../shared-schema.js";

function parseJsonArrayText(v: unknown): string[] {
  if (!v) return [];
  if (Array.isArray(v)) return v.map((x) => String(x)).filter(Boolean);
  try {
    const parsed = JSON.parse(String(v));
    if (Array.isArray(parsed)) return parsed.map((x) => String(x)).filter(Boolean);
    return [];
  } catch {
    return [];
  }
}

function uniq(values: string[]) {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const v of values.map((s) => String(s || "").trim()).filter(Boolean)) {
    if (seen.has(v)) continue;
    seen.add(v);
    out.push(v);
  }
  return out;
}

export type MergedSkipTraceResult = {
  entityType: "lead" | "opportunity";
  entityId: number;
  ownerName: string | null;
  address: { address: string | null; city: string | null; state: string | null; zipCode: string | null };
  contacts: { phones: string[]; emails: string[] };
  provider: { providerName: string | null; status: string | null } | null;
  scoreSnapshot: LeadScoreSnapshot | null;
  evidenceCount: number;
};

export function mergeSkipTraceResult(input: {
  entityType: "lead" | "opportunity";
  entityId: number;
  lead: Lead | null;
  property: Property | null;
  providerResult: SkipTraceResult | null;
  evidence: SkipTraceEvidence[];
  scoreSnapshot: LeadScoreSnapshot | null;
}): MergedSkipTraceResult {
  const ownerName = input.entityType === "lead" ? (String((input.lead as any)?.ownerName || "").trim() || null) : null;
  const address =
    input.entityType === "lead"
      ? {
          address: String((input.lead as any)?.address || "").trim() || null,
          city: String((input.lead as any)?.city || "").trim() || null,
          state: String((input.lead as any)?.state || "").trim() || null,
          zipCode: String((input.lead as any)?.zipCode || "").trim() || null,
        }
      : {
          address: String((input.property as any)?.address || "").trim() || null,
          city: String((input.property as any)?.city || "").trim() || null,
          state: String((input.property as any)?.state || "").trim() || null,
          zipCode: String((input.property as any)?.zipCode || "").trim() || null,
        };

  const leadPhones = input.entityType === "lead" ? [String((input.lead as any)?.ownerPhone || "").trim()].filter(Boolean) : [];
  const leadEmails = input.entityType === "lead" ? [String((input.lead as any)?.ownerEmail || "").trim()].filter(Boolean) : [];

  const providerPhones = input.providerResult ? parseJsonArrayText((input.providerResult as any).phonesJson) : [];
  const providerEmails = input.providerResult ? parseJsonArrayText((input.providerResult as any).emailsJson) : [];

  const phones = uniq([...leadPhones, ...providerPhones]);
  const emails = uniq([...leadEmails, ...providerEmails]);

  return {
    entityType: input.entityType,
    entityId: input.entityId,
    ownerName,
    address,
    contacts: { phones, emails },
    provider: input.providerResult
      ? { providerName: String((input.providerResult as any).providerName || "") || null, status: String((input.providerResult as any).status || "") || null }
      : null,
    scoreSnapshot: input.scoreSnapshot,
    evidenceCount: input.evidence.length,
  };
}

export function hydrateSkipTraceResultForApi(row: SkipTraceResult) {
  return {
    ...row,
    phones: parseJsonArrayText((row as any).phonesJson),
    emails: parseJsonArrayText((row as any).emailsJson),
  };
}

