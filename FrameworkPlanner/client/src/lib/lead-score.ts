/**
 * Pure helpers for the explainable Skip Trace score + provider result UI.
 * Unit-testable in node (no DOM).
 */

export type ScoreFactor = {
  key: string;
  label: string;
  value: unknown;
  points: number;
  urgencyPoints: number;
};

export type ScoreFactorMeta = {
  key: string;
  label: string;
  category: "motivation" | "ownership" | "distress" | "contactability" | "timing";
  categoryLabel: string;
  why: string;
};

/** Canonical scoring factors produced by server/services/leadScoring/engine.ts. */
export const LEAD_SCORE_FACTOR_META: ScoreFactorMeta[] = [
  { key: "motivation_score", label: "Motivation score", category: "motivation", categoryLabel: "Motivation", why: "How motivated the owner appears to sell (0-100 input)." },
  { key: "absentee_owner", label: "Absentee owner", category: "ownership", categoryLabel: "Ownership", why: "Owner's address differs from the property - often more willing to sell." },
  { key: "years_owned", label: "Years owned", category: "ownership", categoryLabel: "Ownership", why: "Longer ownership can signal equity and flexibility on price." },
  { key: "probate", label: "Probate", category: "distress", categoryLabel: "Distress", why: "Property is in a probate/estate situation." },
  { key: "pre_foreclosure", label: "Pre-foreclosure", category: "distress", categoryLabel: "Distress", why: "Property shows foreclosure/distress signals." },
  { key: "tax_delinquent", label: "Tax delinquent", category: "distress", categoryLabel: "Distress", why: "Property has tax delinquency." },
  { key: "vacancy", label: "Vacancy", category: "distress", categoryLabel: "Distress", why: "Property appears vacant or abandoned." },
  { key: "has_phone", label: "Has phone", category: "contactability", categoryLabel: "Contactability", why: "A reachable phone number is on file." },
  { key: "has_email", label: "Has email", category: "contactability", categoryLabel: "Contactability", why: "A reachable email address is on file." },
  { key: "next_touch_at", label: "Next touch time", category: "timing", categoryLabel: "Timing", why: "An approaching or overdue follow-up raises urgency." },
];

export type ScoreEvidence = {
  sourceType: string;
  sourceUrl?: string | null;
  notes?: string | null;
  collectedAt?: string | null;
};

export type ScoreBreakdownRow =
  | {
      key: string;
      label: string;
      categoryLabel: string;
      why: string;
      state: "scored";
      points: number;
      valueText: string;
      evidence: ScoreEvidence[];
    }
  | {
      key: string;
      label: string;
      categoryLabel: string;
      why: string;
      state: "no_signal";
      points: number;
      valueText: string;
      evidence: ScoreEvidence[];
    }
  | {
      key: string;
      label: string;
      categoryLabel: string;
      why: string;
      state: "unavailable";
      points: number;
      valueText: string;
      evidence: ScoreEvidence[];
    };

function toStr(v: unknown): string {
  if (typeof v === "string") return v;
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  return "";
}

function toFinite(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const n = parseFloat(v);
    if (Number.isFinite(n)) return n;
  }
  return null;
}

function formatValue(f: ScoreFactor): string {
  if (typeof f.value === "boolean") return f.value ? "yes" : "no";
  if (typeof f.value === "number") return f.key === "motivation_score" ? `${f.value}/100` : String(f.value);
  if (f.key === "next_touch_at" && typeof f.value === "string") {
    const d = new Date(f.value);
    if (Number.isFinite(d.getTime())) return d.toLocaleString();
  }
  return toStr(f.value) || "---";
}

/** Map raw evidence rows (any shape) to the minimal shape the breakdown needs. */
export function normalizeEvidence(raw: unknown[]): ScoreEvidence[] {
  if (!Array.isArray(raw)) return [];
  const out: ScoreEvidence[] = [];
  for (const e of raw as any[]) {
    const sourceType = toStr(e?.sourceType || e?.type).trim();
    const notes = toStr(e?.notes).trim();
    const sourceUrl = toStr(e?.sourceUrl ?? e?.url).trim();
    if (!sourceType && !notes && !sourceUrl) continue;
    out.push({
      sourceType: sourceType || "source",
      sourceUrl: sourceUrl || null,
      notes: notes || null,
      collectedAt: e?.collectedAt ?? e?.collected_at ?? null,
    });
  }
  return out;
}

/** Keyword mapping from evidence sourceType/notes to a scoring factor key. */
export function evidenceMatchesFactor(evidence: ScoreEvidence[], factorKey: string): ScoreEvidence[] {
  if (!evidence.length) return [];
  const terms: Record<string, string[]> = {
    motivation_score: ["motivation", "score"],
    absentee_owner: ["absentee", "owner", "mailing"],
    years_owned: ["years", "title", "deed", "ownership", "grant"],
    probate: ["probate", "estate", "heir"],
    pre_foreclosure: ["foreclosure", "pre-foreclosure", "lis pendens", "notice of default"],
    tax_delinquent: ["tax", "delinquen"],
    vacancy: ["vacan", "abandon", "boarding"],
    has_phone: ["phone", "contact", "skip"],
    has_email: ["email", "contact", "skip"],
    next_touch_at: ["follow", "touch", "reminder"],
  };
  const list = terms[factorKey] || [];
  if (!list.length) return [];
  return evidence.filter((e) => {
    const text = `${e.sourceType} ${e.notes || ""}`.toLowerCase();
    return list.some((t) => text.includes(t));
  });
}

/**
 * Build the full 0-100 score explanation.
 * Every canonical factor is represented with an explicit state:
 *  - scored:      data on file, contributed points
 *  - no_signal:   data on file but explicitly negative (e.g. no phone/email)
 *  - unavailable: no data on file - never treated as positive evidence
 */
export function buildScoreBreakdown(input: {
  factorsJson?: unknown;
  evidence?: unknown[];
}): ScoreBreakdownRow[] {
  const factors = Array.isArray(input.factorsJson) ? (input.factorsJson as unknown[]) : [];
  const evidence = normalizeEvidence(input.evidence ?? []);
  const byKey = new Map<string, ScoreFactor>();
  for (const raw of factors) {
    const f = raw as any;
    const points = toFinite(f?.points) ?? 0;
    byKey.set(String(f?.key || ""), { key: String(f?.key || ""), label: toStr(f?.label), value: f?.value, points, urgencyPoints: toFinite(f?.urgencyPoints) ?? 0 });
  }

  return LEAD_SCORE_FACTOR_META.map((meta) => {
    const f = byKey.get(meta.key);
    const ev = evidenceMatchesFactor(evidence, meta.key);
    if (!f) {
      return {
        key: meta.key,
        label: meta.label,
        categoryLabel: meta.categoryLabel,
        why: meta.why,
        state: "unavailable" as const,
        points: 0,
        valueText: "no data on file",
        evidence: ev,
      };
    }
    if (f.points > 0) {
      return {
        key: meta.key,
        label: meta.label,
        categoryLabel: meta.categoryLabel,
        why: meta.why,
        state: "scored" as const,
        points: f.points,
        valueText: formatValue(f),
        evidence: ev,
      };
    }
    return {
      key: meta.key,
      label: meta.label,
      categoryLabel: meta.categoryLabel,
      why: meta.why,
      state: "no_signal" as const,
      points: 0,
      valueText: formatValue(f),
      evidence: ev,
    };
  });
}

export type ProviderState = "hit" | "partial" | "no_hit" | "rate_limited" | "failed" | "pending" | "none";

export type ProviderResultInfo = {
  state: ProviderState;
  label: string;
  detail: string;
  providerName: string | null;
  completedAt: string | null;
  costCents: number | null;
};

function phonesOf(r: any): string[] {
  try {
    if (Array.isArray(r?.phones)) return r.phones.map((x: any) => String(x)).filter(Boolean);
    const raw = r?.phonesJson;
    if (!raw) return [];
    const p = JSON.parse(String(raw));
    return Array.isArray(p) ? p.map((x: any) => String(x)).filter(Boolean) : [];
  } catch {
    return [];
  }
}

function emailsOf(r: any): string[] {
  try {
    if (Array.isArray(r?.emails)) return r.emails.map((x: any) => String(x)).filter(Boolean);
    const raw = r?.emailsJson;
    if (!raw) return [];
    const p = JSON.parse(String(raw));
    return Array.isArray(p) ? p.map((x: any) => String(x)).filter(Boolean) : [];
  } catch {
    return [];
  }
}

/** Classify a provider result row into a truthful, user-facing state. */
export function classifyProviderResult(result: any | null): ProviderResultInfo {
  if (!result) {
    return { state: "none", label: "Not run yet", detail: "Run a skip trace to look up owner contacts.", providerName: null, completedAt: null, costCents: null };
  }
  const status = toStr(result.status).toLowerCase();
  const providerName = toStr(result.providerName).trim() || null;
  const completedAt = result.completedAt ?? null;
  const costCents = toFinite(result.costCents);

  if (status === "pending") {
    return { state: "pending", label: "In progress", detail: "The provider lookup is running or queued.", providerName, completedAt, costCents };
  }
  if (status === "success") {
    const phones = phonesOf(result);
    const emails = emailsOf(result);
    if (phones.length && emails.length) {
      return { state: "hit", label: "Hit", detail: `Found ${phones.length} phone(s) and ${emails.length} email(s).`, providerName, completedAt, costCents };
    }
    if (phones.length || emails.length) {
      return { state: "partial", label: "Partial hit", detail: `Found ${phones.length ? phones.length + " phone(s)" : "no phones"} and ${emails.length ? emails.length + " email(s)" : "no emails"}.`, providerName, completedAt, costCents };
    }
    return { state: "no_hit", label: "No hit", detail: "Provider completed but returned no contact data for this owner/property.", providerName, completedAt, costCents };
  }
  const err = toStr(result.errorMessage || result.rawResponseJson || "").toLowerCase();
  const rawMsg = toStr(result.errorMessage || "").trim() || toStr(result.rawResponseJson).trim();
  if (/rate|quota|limit|throttl/.test(err)) {
    return { state: "rate_limited", label: "Rate limited", detail: rawMsg || "The provider rate limit or quota was reached. Wait and retry.", providerName, completedAt, costCents };
  }
  if (/no hit|no-hit|not found|no match|no record|no data/i.test(err)) {
    return { state: "no_hit", label: "No hit", detail: rawMsg || "Provider found no match for this owner/property.", providerName, completedAt, costCents };
  }
  return { state: "failed", label: "Failed", detail: rawMsg || "The provider returned an error. Check configuration and retry.", providerName, completedAt, costCents };
}

/** Rendered summary of the scored portion, e.g. "Vacancy (+10); Tax delinquent (+15)". */
export function summarizeScoreRows(rows: ScoreBreakdownRow[]): string {
  return rows
    .filter((r) => r.state === "scored" && r.points > 0)
    .map((r) => `${r.label} (+${r.points})`)
    .join("; ");
}
