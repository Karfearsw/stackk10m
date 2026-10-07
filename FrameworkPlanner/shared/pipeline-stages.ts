/**
 * Ticket 7 — Canonical pipeline stage taxonomy (single source of truth).
 *
 * Before this module three competing vocabularies could disagree about the same
 * deal:
 *   1. Lead statuses on the leads board (new, contacted, qualified, …)
 *   2. Opportunity stages in the deal room (lead, contacted, negotiating, …)
 *   3. An ad-hoc {lead, negotiation, contract, closed} summary bar on the
 *      dashboard that matched neither and counted the wrong field, hiding
 *      stalled opportunities.
 *
 * The Express server and the React client both import from here, so a stage has
 * exactly one id and one label everywhere. Owner sign-off on this taxonomy is
 * tracked in docs/pipeline-taxonomy.md.
 *
 * This module is intentionally dependency-free and free of side effects so it
 * can be bundled into both the browser and the Node server.
 */

export const PIPELINE_ENTITY_TYPES = ["lead", "opportunity"] as const;
export type PipelineEntityType = (typeof PIPELINE_ENTITY_TYPES)[number];

export interface PipelineColumn {
  value: string;
  label: string;
}

// ---------------------------------------------------------------------------
// Lead pipeline (leads.status)
// ---------------------------------------------------------------------------

export const LEAD_STAGES = [
  "new",
  "contacted",
  "qualified",
  "negotiation",
  "under_contract",
  "closed",
  "lost",
] as const;
export type LeadStage = (typeof LEAD_STAGES)[number];

export const LEAD_STAGE_LABELS: Record<LeadStage, string> = {
  new: "New",
  contacted: "Contacted",
  qualified: "Qualified",
  negotiation: "Negotiation",
  under_contract: "Under Contract",
  closed: "Closed",
  lost: "Lost",
};

// ---------------------------------------------------------------------------
// Opportunity pipeline (properties.stage)
// ---------------------------------------------------------------------------

export const OPPORTUNITY_STAGES = [
  "lead",
  "contacted",
  "negotiating",
  "under_contract",
  "in_disposition",
  "reserved",
  "sold",
  "closed",
  "dead",
  "voided",
] as const;
export type OpportunityStage = (typeof OPPORTUNITY_STAGES)[number];

export const OPPORTUNITY_STAGE_CONFIG: Record<
  OpportunityStage,
  { label: string; expects: string[] }
> = {
  lead: { label: "Lead", expects: ["Contact seller", "Initial outreach", "Qualify property"] },
  contacted: { label: "Contacted", expects: ["Schedule showing", "Send CMA", "Gather seller details"] },
  negotiating: { label: "Negotiating", expects: ["Review offer terms", "Counter offer", "Finalize contract terms"] },
  under_contract: { label: "Under Contract", expects: ["EMD deposit", "Inspection deadline", "Due diligence", "Secure financing"] },
  in_disposition: { label: "In Disposition", expects: ["Build buyer list", "Create public listing", "Schedule tours"] },
  reserved: { label: "Reserved", expects: ["Confirm buyer commitment", "Coordinate closing", "Assign contract"] },
  sold: { label: "Sold", expects: ["Close deal", "Receive assignment fee", "Disburse funds"] },
  closed: { label: "Closed", expects: ["Post-close wrap-up", "Archive documents"] },
  dead: { label: "Dead", expects: ["Document reasons", "Attempt re-engagement"] },
  voided: { label: "Voided", expects: ["Reason recorded", "Cancel related tasks", "Archive"] },
};

export const OPPORTUNITY_STAGE_LABELS = Object.fromEntries(
  OPPORTUNITY_STAGES.map((s) => [s, OPPORTUNITY_STAGE_CONFIG[s].label]),
) as Record<OpportunityStage, string>;

// ---------------------------------------------------------------------------
// Default pipeline columns + canonical membership
// ---------------------------------------------------------------------------

export const LEAD_PIPELINE_COLUMNS: PipelineColumn[] = LEAD_STAGES.map((value) => ({
  value,
  label: LEAD_STAGE_LABELS[value],
}));

export const OPPORTUNITY_PIPELINE_COLUMNS: PipelineColumn[] = OPPORTUNITY_STAGES.map((value) => ({
  value,
  label: OPPORTUNITY_STAGE_CONFIG[value].label,
}));

/**
 * The safe default pipeline configuration the API returns when a user has not
 * configured one (and the fallback when a stored config is empty/invalid).
 */
export const DEFAULT_PIPELINE_COLUMNS: Record<PipelineEntityType, PipelineColumn[]> = {
  lead: LEAD_PIPELINE_COLUMNS,
  opportunity: OPPORTUNITY_PIPELINE_COLUMNS,
};

export const CANONICAL_STAGES: Record<PipelineEntityType, readonly string[]> = {
  lead: LEAD_STAGES,
  opportunity: OPPORTUNITY_STAGES,
};

// ---------------------------------------------------------------------------
// Legacy → canonical mapping (drives the non-destructive migration)
// ---------------------------------------------------------------------------

/**
 * Values that predate the canonical taxonomy, mapped to their canonical stage.
 * Anything not present here and not already canonical is an unknown stage and
 * is surfaced to the caller (never silently dropped).
 */
export const LEGACY_STAGE_MAP: Record<PipelineEntityType, Record<string, string>> = {
  lead: {
    active: "new",
    pending: "contacted",
    negotiating: "negotiation",
    in_disposition: "negotiation",
    reserved: "under_contract",
    sold: "closed",
    dead: "lost",
    void: "lost",
    voided: "lost",
    cancelled: "lost",
    canceled: "lost",
  },
  opportunity: {
    active: "lead",
    pending: "in_disposition",
    negotiation: "negotiating",
    prospect: "lead",
    withdrawn: "dead",
    cancelled: "voided",
    canceled: "voided",
    lost: "dead",
  },
};

// ---------------------------------------------------------------------------
// Validation helpers
// ---------------------------------------------------------------------------

export function isPipelineEntityType(value: unknown): value is PipelineEntityType {
  return PIPELINE_ENTITY_TYPES.includes(value as PipelineEntityType);
}

export function isCanonicalStage(entityType: PipelineEntityType, value: string): boolean {
  return CANONICAL_STAGES[entityType].includes(String(value));
}

export function isValidStage(stage: string): stage is OpportunityStage {
  return (OPPORTUNITY_STAGES as readonly string[]).includes(stage);
}

/**
 * Map a raw stage value to its canonical id. Returns the canonical value when
 * already canonical, the mapped value when a known legacy alias, and the
 * trimmed original when it cannot be resolved (so callers can report it).
 */
export function normalizeStage(entityType: PipelineEntityType, value: string): string {
  const v = String(value ?? "").trim();
  if (!v) return v;
  if (isCanonicalStage(entityType, v)) return v;
  const mapped = LEGACY_STAGE_MAP[entityType][v];
  return mapped ?? v;
}

/**
 * Validate a caller-supplied pipeline config: normalize known legacy values,
 * drop malformed rows, and report any stage that is neither canonical nor a
 * known legacy alias. The returned `columns` are safe to persist.
 */
export function validatePipelineColumns(
  entityType: PipelineEntityType,
  columns: unknown,
): { columns: PipelineColumn[]; rejected: PipelineColumn[] } {
  if (!Array.isArray(columns)) return { columns: [], rejected: [] };
  const seen = new Set<string>();
  const normalized: PipelineColumn[] = [];
  const rejected: PipelineColumn[] = [];
  for (const raw of columns) {
    const value = normalizeStage(entityType, String((raw as any)?.value ?? ""));
    const label = String((raw as any)?.label ?? "").trim();
    if (!value || !label || seen.has(value)) continue;
    if (!isCanonicalStage(entityType, value)) {
      rejected.push({ value, label });
      continue;
    }
    seen.add(value);
    normalized.push({ value, label });
  }
  return { columns: normalized, rejected };
}

/**
 * dead/voided are terminal: an opportunity may leave them only via a new
 * record, not a stage edit. Every other transition is allowed (closed↔sold
 * stays reversible — the audit caught a real close that needed to move
 * closed→sold).
 */
export function canTransitionOpportunityStage(
  from: OpportunityStage,
  to: OpportunityStage,
): boolean {
  if (from === to) return true;
  const terminal = new Set<OpportunityStage>(["dead", "voided"]);
  if (terminal.has(from) && !terminal.has(to)) return false;
  return true;
}

/** Backwards-compatible alias used across the codebase. */
export const canTransitionStage = canTransitionOpportunityStage;

// ---------------------------------------------------------------------------
// Summary grouping for the dashboard pipeline bar
// ---------------------------------------------------------------------------

/**
 * Groups canonical opportunity stages into the summary buckets shown on the
 * dashboard. Every canonical stage belongs to exactly one group, so a stalled
 * deal can never be dropped from the summary.
 */
export const OPPORTUNITY_STAGE_GROUPS: ReadonlyArray<{
  id: string;
  label: string;
  stages: readonly OpportunityStage[];
}> = [
  { id: "lead", label: "Lead", stages: ["lead", "contacted"] },
  { id: "negotiating", label: "Negotiating", stages: ["negotiating"] },
  { id: "under_contract", label: "Under Contract", stages: ["under_contract", "in_disposition", "reserved"] },
  { id: "closed", label: "Closed", stages: ["sold", "closed"] },
  { id: "inactive", label: "Dead / Voided", stages: ["dead", "voided"] },
];

/** Lead stages whose movement should sync to the linked property's status. */
export const LEAD_STAGES_SYNCING_PROPERTY = ["negotiation", "under_contract"] as const;
