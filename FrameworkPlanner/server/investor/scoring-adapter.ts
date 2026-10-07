/**
 * Adapter between the investor portal and the buyer-match scoring engine.
 *
 * CONTRACT (for the parallel workstream extending the engine):
 * - This module imports computeBuyerMatchScore READ-ONLY from
 *   server/services/buyerMatch/scoring.ts. It never mutates the engine.
 * - If the engine gains new inputs (strategies, spread, ...), they should be
 *   added as OPTIONAL fields on the engine's input object. This adapter will
 *   start passing them in `buildScorerInput` without any change to the
 *   engine's scoring semantics.
 * - Stored scores in deal_buyer_matches are on a 0-1000 scale; the engine
 *   returns 0-100. `normalizeStoredScore` converts stored -> 0-100.
 */
import { computeBuyerMatchScore } from "../services/buyerMatch/scoring.js";

/** Deal fields the feed needs for scoring + cards. */
export interface FeedDeal {
  id: number;
  address: string;
  city: string | null;
  state: string | null;
  zipCode: string | null;
  price: number | null; // asking/disposition price
  beds: number | null;
  baths: number | null;
  sqft: number | null;
  propertyType: string | null;
  images: string[];
  arv: number | null;
  repairCost: number | null;
  visibility: string | null;
}

/** Investor buy-box as read from buyer_profiles + buyers. */
export interface InvestorBuyBox {
  targetStates: string[];
  targetZips: string[];
  strategies: string[];
  minSpread: number | null;
  minYield: number | null;
  propertyTypes: string[];
  priceMin: number | null;
  priceMax: number | null;
  minBeds: number | null;
  maxBeds: number | null;
  buyerTags: string[];
  notifyMode: "instant" | "digest" | "off";
}

export const EMPTY_BUY_BOX: InvestorBuyBox = {
  targetStates: [],
  targetZips: [],
  strategies: [],
  minSpread: null,
  minYield: null,
  propertyTypes: [],
  priceMin: null,
  priceMax: null,
  minBeds: null,
  maxBeds: null,
  buyerTags: [],
  notifyMode: "digest",
};

export function toNum(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function money(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(n % 1_000_000 === 0 ? 0 : 2)}M`;
  if (n >= 1_000) return `$${Math.round(n / 1_000)}k`;
  return `$${Math.round(n)}`;
}

/**
 * Map a buy box + deal into the engine's input shape.
 * When the engine adds optional inputs (e.g. buyerStrategies, dealSpread),
 * extend this function — not the engine.
 */
export function buildScorerInput(
  buyBox: InvestorBuyBox,
  deal: FeedDeal,
): Parameters<typeof computeBuyerMatchScore>[0] {
  return {
    dealZipCode: deal.zipCode,
    dealCity: deal.city,
    dealState: deal.state,
    dealPrice: deal.price,
    dealBeds: deal.beds,
    dealBaths: deal.baths,
    dealPropertyType: deal.propertyType,
    buyerZipCodes: buyBox.targetZips,
    buyerPreferredAreas: buyBox.targetStates,
    buyerMinPrice: buyBox.priceMin,
    buyerMaxPrice: buyBox.priceMax,
    buyerMinBeds: buyBox.minBeds,
    buyerMaxBeds: buyBox.maxBeds,
    buyerPropertyTypes: buyBox.propertyTypes,
    buyerTags: buyBox.buyerTags,
    dealTags: [],
  };
}

export interface ScoredDeal {
  deal: FeedDeal;
  /** 0-100 */
  score: number;
  reasons: string[];
  spread: number | null;
  fromStored: boolean;
}

/**
 * Build human-readable reasons from a buy box + deal (used when no stored
 * match row exists yet).
 */
export function buildReasons(buyBox: InvestorBuyBox, deal: FeedDeal): string[] {
  const reasons: string[] = [];
  const zip = String(deal.zipCode || "").replace(/\D/g, "").slice(0, 5);
  if (zip && buyBox.targetZips.map((z) => String(z).replace(/\D/g, "").slice(0, 5)).includes(zip)) {
    reasons.push(`In their zip ${zip}`);
  }
  const state = String(deal.state || "").trim();
  if (state && buyBox.targetStates.map((s) => String(s).trim().toLowerCase()).includes(state.toLowerCase())) {
    const city = String(deal.city || "").trim();
    reasons.push(city ? `In their market: ${city}, ${state}` : `In their market: ${state}`);
  }
  if (deal.price !== null && (buyBox.priceMin !== null || buyBox.priceMax !== null)) {
    const lo = buyBox.priceMin !== null ? money(buyBox.priceMin) : "$0";
    const hi = buyBox.priceMax !== null ? money(buyBox.priceMax) : "∞";
    reasons.push(`Within ${lo}–${hi} band`);
  }
  if (deal.beds !== null && buyBox.minBeds !== null && deal.beds >= buyBox.minBeds) {
    reasons.push(`${deal.beds} beds as requested`);
  }
  if (deal.propertyType) {
    const types = buyBox.propertyTypes.map((t) => t.toLowerCase());
    if (types.includes(deal.propertyType.toLowerCase())) {
      const strat = buyBox.strategies[0];
      reasons.push(strat ? `Buys ${deal.propertyType} ${strat}` : `Buys ${deal.propertyType}`);
    }
  }
  return reasons.slice(0, 3);
}

/** Stored scores are 0-1000 in deal_buyer_matches; normalize to 0-100. */
export function normalizeStoredScore(stored: unknown): number {
  const n = toNum(stored);
  if (n === null) return 0;
  return Math.max(0, Math.min(100, Math.round(n / 10)));
}

export function computeDealSpread(deal: FeedDeal): number | null {
  if (deal.arv !== null && deal.price !== null) {
    return deal.arv - deal.price - (deal.repairCost ?? 0);
  }
  return null;
}

/**
 * Score one deal for an investor. Prefers a precomputed stored match row
 * (written by the dispo recompute / nightly job); falls back to a live
 * engine call. Never rewrites the engine.
 */
export function scoreDeal(
  buyBox: InvestorBuyBox,
  deal: FeedDeal,
  stored?: { score: unknown; reasons: unknown } | null,
): ScoredDeal {
  const spread = computeDealSpread(deal);
  if (stored && toNum(stored.score) !== null && Number(stored.score) > 0) {
    const reasons = Array.isArray(stored.reasons)
      ? (stored.reasons as unknown[]).map(String).filter(Boolean).slice(0, 3)
      : buildReasons(buyBox, deal);
    return { deal, score: normalizeStoredScore(stored.score), reasons, spread, fromStored: true };
  }
  const input = buildScorerInput(buyBox, deal);
  const score = computeBuyerMatchScore(input);
  return { deal, score, reasons: buildReasons(buyBox, deal), spread, fromStored: false };
}
