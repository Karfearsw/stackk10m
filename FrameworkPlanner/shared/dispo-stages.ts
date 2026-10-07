/**
 * Disposition workspace taxonomy (Phase 1).
 *
 * The stage vocabulary is the canonical pipeline taxonomy
 * (./pipeline-stages.ts, Ticket 7 — single source of truth for opportunity
 * stages). This module defines the Disposition board's slice of that
 * pipeline (under_contract → in_disposition → reserved → sold / closed /
 * dead) plus the offer/LOI status lifecycle, and re-exports the canonical
 * validators so server, client, and tests share one import.
 *
 * This module is intentionally dependency-free so it can be bundled into
 * the browser, the Node server, and vitest alike.
 */

import {
  OPPORTUNITY_STAGE_LABELS,
  canTransitionOpportunityStage,
  isValidStage,
  type OpportunityStage,
} from "./pipeline-stages";

export {
  OPPORTUNITY_STAGE_LABELS,
  canTransitionOpportunityStage,
  isValidStage,
  type OpportunityStage,
};

/** Kanban columns on the Disposition board, left to right. */
export const DISPO_STAGES = [
  "under_contract",
  "in_disposition",
  "reserved",
  "sold",
  "closed",
  "dead",
] as const satisfies readonly OpportunityStage[];

export type DispoStage = (typeof DISPO_STAGES)[number];

export const DISPO_STAGE_LABELS: Record<DispoStage, string> = {
  under_contract: OPPORTUNITY_STAGE_LABELS.under_contract,
  in_disposition: OPPORTUNITY_STAGE_LABELS.in_disposition,
  reserved: OPPORTUNITY_STAGE_LABELS.reserved,
  sold: OPPORTUNITY_STAGE_LABELS.sold,
  closed: OPPORTUNITY_STAGE_LABELS.closed,
  dead: OPPORTUNITY_STAGE_LABELS.dead,
};

/** Stages that count as "active" deals for metrics. */
export const DISPO_ACTIVE_STAGES: DispoStage[] = [
  "under_contract",
  "in_disposition",
  "reserved",
];

export function isDispoStage(stage: unknown): stage is DispoStage {
  return (
    typeof stage === "string" &&
    isValidStage(stage) &&
    (DISPO_STAGES as readonly string[]).includes(stage)
  );
}

/**
 * Filter a deal list down to one kanban column. Deals whose stage is missing
 * or not a dispo stage are excluded (never silently dropped into a column).
 */
export function filterDealsByDispoStage<
  T extends { stage?: string | null },
>(deals: readonly T[], stage: DispoStage): T[] {
  return deals.filter((d) => d.stage === stage);
}

// ---------------------------------------------------------------------------
// Offer / LOI status lifecycle
// ---------------------------------------------------------------------------

/** Offer tracker lifecycle: verbal -> loi_sent -> accepted, dead any time. */
export const OFFER_STATUSES = [
  "verbal",
  "loi_sent",
  "accepted",
  "dead",
] as const;

export type OfferStatus = (typeof OFFER_STATUSES)[number];

export const OFFER_STATUS_LABELS: Record<OfferStatus, string> = {
  verbal: "Verbal",
  loi_sent: "LOI Sent",
  accepted: "Accepted",
  dead: "Dead",
};

const OFFER_TRANSITIONS: Record<OfferStatus, OfferStatus[]> = {
  verbal: ["loi_sent", "dead"],
  loi_sent: ["accepted", "dead"],
  accepted: ["dead"],
  dead: [],
};

export function isOfferStatus(status: unknown): status is OfferStatus {
  return (
    typeof status === "string" &&
    (OFFER_STATUSES as readonly string[]).includes(status)
  );
}

/**
 * Server-enforced offer status machine. `dead` is terminal; `accepted` can
 * only fall through to `dead` (deal fell apart post-acceptance).
 */
export function canTransitionOfferStatus(
  from: unknown,
  to: unknown,
): boolean {
  if (!isOfferStatus(from) || !isOfferStatus(to)) return false;
  if (from === to) return true; // idempotent no-op
  return OFFER_TRANSITIONS[from].includes(to);
}
