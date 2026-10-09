/**
 * Explainable buyer/deal match engine (Phase 12).
 *
 * Wraps the concepts of server/services/buyerMatch/scoring.ts without
 * changing it: scoring.ts remains the canonical numeric scorer used by the
 * dispo tab. This module adds a per-dimension breakdown so the investor
 * discovery feed can show WHY a deal scored what it did.
 *
 * Rules this engine enforces:
 * - A deal violating a hard rule (geography outside the buy box's required
 *   zips/areas, price outside the buy box's price band) is labeled a
 *   hard-rule failure and scores 0 overall — never a misleading high score.
 * - Every percentage shown is paired with its explanation. ARV and spread
 *   are always labeled as estimates, never guaranteed returns.
 * - Dimensions that cannot be evaluated for lack of data are reported as
 *   "missing" with a note about what is missing — never silently scored 0.
 */

export type DimensionStatus = "strong" | "moderate" | "weak" | "missing" | "hard_fail";

export interface MatchDimension {
  /** Stable key, e.g. "geography". */
  key: string;
  /** Display label, e.g. "Geographic fit". */
  label: string;
  status: DimensionStatus;
  /** 0-100 fit for this dimension (0 when missing or hard_fail). */
  score: number;
  /** Relative weight in the overall score. */
  weight: number;
  /** One-sentence plain-English explanation of this dimension's result. */
  detail: string;
  /** True when the detail involves an estimate (ARV, spread, yield). */
  estimate?: boolean;
}

export interface HardRuleFailure {
  rule: string;
  message: string;
}

export interface MatchExplanation {
  /** 0-100 overall fit score. 0 when any hard rule fails. */
  score: number;
  /** True when at least one hard rule failed. */
  hardFail: boolean;
  dimensions: MatchDimension[];
  strongMatches: string[];
  weakMatches: string[];
  hardRuleFailures: HardRuleFailure[];
  missingInformation: string[];
  dataSources: string[];
  /** ISO timestamp of when this explanation was calculated. */
  calculatedAt: string;
}

/** Buy-box fields the explainable engine consumes. */
export interface ExplainBuyBoxInput {
  targetZips: string[];
  targetStates: string[];
  propertyTypes: string[];
  priceMin: number | null;
  priceMax: number | null;
  strategies: string[];
  minSpread: number | null;
  minYield: number | null;
  minBeds: number | null;
  maxBeds: number | null;
  occupancyPreferences: string[];
  maxRepairBudget: number | null;
  closingTimelineDays: number | null;
  financingPreferences: string[];
  /** Past purchases, ONLY when verified (settlement statement or recorded deed on file). */
  verifiedPastPurchases: VerifiedPurchase[];
}

/** A verified past purchase, used only for similarity — never fabricated. */
export interface VerifiedPurchase {
  propertyType: string | null;
  state: string | null;
  price: number | null;
}

/** Deal fields the explainable engine consumes. */
export interface ExplainDealInput {
  zipCode: string | null;
  city: string | null;
  state: string | null;
  price: number | null;
  propertyType: string | null;
  beds: number | null;
  arv: number | null;
  repairCost: number | null;
  strategies: string[];
  occupancy: string | null;
  condition: string | null;
  /** Contract/offer deadline, when the listing carries one. */
  closingDate: string | null;
  rentPerMonth: number | null;
  financingAccepted: string[];
}

function normList(items: Array<string | null | undefined>): string[] {
  return (items || [])
    .map((t) => String(t || "").trim().toLowerCase())
    .filter(Boolean);
}

function normZip(z: string | null | undefined): string {
  return String(z || "").replace(/\D/g, "").slice(0, 5);
}

function fmtMoney(n: number): string {
  return "$" + Math.round(n).toLocaleString("en-US");
}

function prettyTag(t: string): string {
  return t.replace(/-/g, " ");
}

type DimBuilder = (b: ExplainBuyBoxInput, d: ExplainDealInput, ctx: Ctx) => MatchDimension;

interface Ctx {
  hardFailures: HardRuleFailure[];
  strong: string[];
  weak: string[];
  missing: string[];
  sources: Set<string>;
}

const buyBoxSource = "Buy box (investor profile)";
const listingSource = "Property listing (Ocean Luxe CRM)";

const builders: DimBuilder[] = [
  // 1. Geographic fit — hard rule when the buy box names required zips/areas.
  (b, d, ctx) => {
    const dealZip = normZip(d.zipCode);
    const zips = normList(b.targetZips);
    const areas = normList(b.targetStates);
    ctx.sources.add(buyBoxSource);
    ctx.sources.add(listingSource);
    if (zips.length) {
      if (!dealZip) {
        return hardDim("geography", "Geographic fit", 26, "Deal has no zip code, but your buy box requires one of " + zips.join(", ") + ".");
      }
      if (!zips.includes(dealZip)) {
        return hardDim("geography", "Geographic fit", 26, `Deal zip ${dealZip} is outside your required zip list.`);
      }
      ctx.strong.push(`In your target zip ${dealZip}`);
      return dim("geography", "Geographic fit", "strong", 100, 26, `Matches your required zip ${dealZip}.`);
    }
    if (areas.length) {
      const city = String(d.city || "").trim().toLowerCase();
      const state = String(d.state || "").trim().toLowerCase();
      const matched = areas.some(
        (a) =>
          (city && a.includes(city)) ||
          (state && a.includes(state)) ||
          (city && state && a.includes(`${city}, ${state}`)),
      );
      if (!matched) {
        return hardDim("geography", "Geographic fit", 26, "Deal is outside your target markets.");
      }
      ctx.strong.push(`In your target market${city ? ` (${city})` : ""}`);
      return dim("geography", "Geographic fit", "strong", 100, 26, `Inside your target market${city ? ` (${city})` : ""}.`);
    }
    return dim("geography", "Geographic fit", "moderate", 55, 26, "No location rules in your buy box — treated as open to any market.");
  },

  // 2. Price-range fit — hard rule when the buy box names a price band.
  (b, d, ctx) => {
    const price = d.price;
    const minP = b.priceMin;
    const maxP = b.priceMax;
    ctx.sources.add(buyBoxSource);
    if (price === null) {
      ctx.missing.push("Asking price is not listed for this deal");
      return missingDim("price_range", "Price-range fit", 18, "Asking price not listed — cannot check against your price band.");
    }
    if (minP !== null && price < minP) {
      return hardDim("price_range", "Price-range fit", 18, `Asking ${fmtMoney(price)} is below your ${fmtMoney(minP)} minimum.`);
    }
    if (maxP !== null && price > maxP) {
      return hardDim("price_range", "Price-range fit", 18, `Asking ${fmtMoney(price)} is above your ${fmtMoney(maxP)} maximum.`);
    }
    if (minP !== null || maxP !== null) {
      const band = minP !== null && maxP !== null ? `${fmtMoney(minP)}–${fmtMoney(maxP)}` : minP !== null ? `${fmtMoney(minP)}+` : `up to ${fmtMoney(maxP as number)}`;
      ctx.strong.push(`Within your ${band} band`);
      return dim("price_range", "Price-range fit", "strong", 100, 18, `Asking ${fmtMoney(price)} sits inside your ${band} band.`);
    }
    return dim("price_range", "Price-range fit", "moderate", 55, 18, "No price band in your buy box — price does not move the score.");
  },

  // 3. Property-type fit.
  (b, d, ctx) => {
    const want = normList(b.propertyTypes);
    const dealType = String(d.propertyType || "").trim().toLowerCase();
    if (!want.length) {
      return dim("property_type", "Property-type fit", "moderate", 55, 10, "No property-type preference in your buy box.");
    }
    if (dealType && want.includes(dealType)) {
      ctx.strong.push(`You buy ${prettyTag(dealType)} properties`);
      return dim("property_type", "Property-type fit", "strong", 100, 10, `Matches your preferred type: ${prettyTag(dealType)}.`);
    }
    if (!dealType) {
      ctx.missing.push("Property type is not listed for this deal");
      return missingDim("property_type", "Property-type fit", 10, "Property type not listed — cannot check your preference.");
    }
    ctx.weak.push(`You usually buy ${want.map(prettyTag).join(", ")}`);
    return dim("property_type", "Property-type fit", "weak", 35, 10, `Deal is ${prettyTag(dealType)}; your buy box prefers ${want.map(prettyTag).join(", ")}.`);
  },

  // 4. Strategy fit.
  (b, d, ctx) => {
    const want = normList(b.strategies);
    const dealStrat = normList(d.strategies);
    if (!want.length) {
      return dim("strategy", "Strategy fit", "moderate", 55, 8, "No strategies set in your buy box.");
    }
    if (!dealStrat.length) {
      ctx.missing.push("Deal strategy is not tagged yet");
      return missingDim("strategy", "Strategy fit", 8, "This deal has no strategy tags yet — ask the dispo team.");
    }
    const set = new Set(want);
    const overlap = dealStrat.filter((t) => set.has(t));
    if (overlap.length) {
      const pretty = overlap.map(prettyTag).join(", ");
      ctx.strong.push(`Strategy fit: ${pretty}`);
      return dim("strategy", "Strategy fit", "strong", 100, 8, `Deal supports ${pretty} — one of your strategies.`);
    }
    ctx.weak.push(`Deal is positioned for ${dealStrat.map(prettyTag).join(", ")}`);
    return dim("strategy", "Strategy fit", "weak", 35, 8, `Deal is positioned for ${dealStrat.map(prettyTag).join(", ")}; your strategies are ${want.map(prettyTag).join(", ")}.`);
  },

  // 5. Margin / yield fit — spread and yield are estimates, labeled as such.
  (b, d, ctx) => {
    const parts: string[] = [];
    let total = 0;
    let count = 0;
    if (d.arv !== null && d.price !== null && d.repairCost !== null) {
      const spread = d.arv - d.price - d.repairCost;
      const minSpread = b.minSpread;
      if (minSpread !== null) {
        if (spread >= minSpread) {
          total += 100;
          ctx.strong.push(`Est. spread ${fmtMoney(spread)} meets your ${fmtMoney(minSpread)} minimum`);
        } else {
          total += 40;
          ctx.weak.push(`Est. spread ${fmtMoney(spread)} is under your ${fmtMoney(minSpread)} minimum`);
        }
        parts.push(`est. spread ${fmtMoney(spread)} vs your ${fmtMoney(minSpread)} minimum`);
      } else {
        total += 60;
        parts.push(`est. spread ${fmtMoney(spread)} (no minimum set)`);
      }
      count += 1;
    }
    if (d.rentPerMonth !== null && d.price !== null && d.price > 0) {
      const yieldPct = (d.rentPerMonth * 12) / d.price;
      const minYield = b.minYield;
      if (minYield !== null) {
        if (yieldPct >= minYield) {
          total += 100;
          ctx.strong.push(`Est. gross yield ${(yieldPct * 100).toFixed(1)}% meets your ${(minYield * 100).toFixed(1)}% minimum`);
        } else {
          total += 40;
          ctx.weak.push(`Est. gross yield ${(yieldPct * 100).toFixed(1)}% is under your ${(minYield * 100).toFixed(1)}% minimum`);
        }
        parts.push(`est. gross yield ${(yieldPct * 100).toFixed(1)}% vs your ${(minYield * 100).toFixed(1)}% minimum`);
      } else {
        total += 60;
        parts.push(`est. gross yield ${(yieldPct * 100).toFixed(1)}% (no minimum set)`);
      }
      count += 1;
    }
    if (!count) {
      ctx.missing.push("Spread cannot be estimated — ARV, price, or repair cost is missing");
      return missingDim("margin_yield", "Margin / yield fit", 10, "Cannot estimate spread or yield — ARV, price, or repairs missing.", true);
    }
    const score = Math.round(total / count);
    return dim("margin_yield", "Margin / yield fit", statusOf(score), score, 10, parts.join("; ") + ". Estimates only — not guaranteed returns.", true);
  },

  // 6. ARV fit — estimate, labeled as such.
  (b, d, ctx) => {
    if (d.arv === null || d.price === null || d.price <= 0) {
      ctx.missing.push("ARV is not estimated for this deal yet");
      return missingDim("arv", "ARV fit", 7, "No ARV estimate on file — value gap cannot be checked.", true);
    }
    const ratio = d.arv / d.price;
    const detail = `Est. ARV ${fmtMoney(d.arv)} is ${(ratio * 100).toFixed(0)}% of the ${fmtMoney(d.price)} asking.`;
    if (ratio >= 1.35) {
      ctx.strong.push(`Healthy value gap: est. ARV ${fmtMoney(d.arv)}`);
      return dim("arv", "ARV fit", "strong", 100, 7, detail + " Healthy estimated value gap.", true);
    }
    if (ratio >= 1.15) {
      return dim("arv", "ARV fit", "moderate", 70, 7, detail + " Modest estimated value gap.", true);
    }
    if (ratio >= 1.0) {
      ctx.weak.push(`Thin estimated margin vs ARV ${fmtMoney(d.arv)}`);
      return dim("arv", "ARV fit", "weak", 40, 7, detail + " Thin estimated margin.", true);
    }
    ctx.weak.push(`Est. ARV ${fmtMoney(d.arv)} is below asking`);
    return dim("arv", "ARV fit", "weak", 15, 7, detail + " ARV estimate is below the asking price.", true);
  },

  // 7. Repair-budget fit.
  (b, d, ctx) => {
    if (d.repairCost === null) {
      ctx.missing.push("Repair cost is not estimated for this deal yet");
      return missingDim("repair_budget", "Repair-budget fit", 4, "No repair estimate on file.");
    }
    if (b.maxRepairBudget === null) {
      ctx.missing.push("No repair budget set in your buy box");
      return missingDim("repair_budget", "Repair-budget fit", 4, `Est. repairs ${fmtMoney(d.repairCost)}, but your buy box sets no repair budget.`);
    }
    if (d.repairCost <= b.maxRepairBudget) {
      ctx.strong.push(`Est. repairs ${fmtMoney(d.repairCost)} within your budget`);
      return dim("repair_budget", "Repair-budget fit", "strong", 100, 4, `Est. repairs ${fmtMoney(d.repairCost)} are within your ${fmtMoney(b.maxRepairBudget)} budget.`, true);
    }
    ctx.weak.push(`Est. repairs ${fmtMoney(d.repairCost)} exceed your budget`);
    return dim("repair_budget", "Repair-budget fit", "weak", 30, 4, `Est. repairs ${fmtMoney(d.repairCost)} exceed your ${fmtMoney(b.maxRepairBudget)} budget.`, true);
  },

  // 8. Condition fit.
  (b, d, ctx) => {
    const cond = String(d.condition || "").trim().toLowerCase();
    if (!cond) {
      ctx.missing.push("Property condition is not recorded");
      return missingDim("condition", "Condition fit", 4, "Condition not recorded on this listing.");
    }
    if (["excellent", "good", "turnkey", "renovated"].includes(cond)) {
      return dim("condition", "Condition fit", "strong", 85, 4, `Listed condition: ${cond}. Lower rehab risk.`);
    }
    if (["fair", "average", "cosmetic"].includes(cond)) {
      return dim("condition", "Condition fit", "moderate", 60, 4, `Listed condition: ${cond}. Expect light rehab.`);
    }
    ctx.weak.push(`Heavy-rehab condition (${cond})`);
    return dim("condition", "Condition fit", "weak", 35, 4, `Listed condition: ${cond} — likely a heavier rehab.`);
  },

  // 9. Occupancy fit.
  (b, d, ctx) => {
    const prefs = normList(b.occupancyPreferences);
    const occ = String(d.occupancy || "").trim().toLowerCase();
    if (!occ) {
      ctx.missing.push("Occupancy status is not recorded");
      return missingDim("occupancy", "Occupancy fit", 3, "Occupancy not recorded on this listing.");
    }
    if (!prefs.length) {
      return dim("occupancy", "Occupancy fit", "moderate", 55, 3, `Occupancy: ${occ}. No occupancy preference in your buy box.`);
    }
    if (prefs.includes(occ)) {
      ctx.strong.push(`Occupancy (${occ}) matches your preference`);
      return dim("occupancy", "Occupancy fit", "strong", 100, 3, `Occupancy: ${occ} — matches your preference.`);
    }
    ctx.weak.push(`Occupancy is ${occ}`);
    return dim("occupancy", "Occupancy fit", "weak", 35, 3, `Occupancy: ${occ}; you prefer ${prefs.join(", ")}.`);
  },

  // 10. Closing-timeline fit — deadlines are genuine risk, surfaced plainly.
  (b, d, ctx) => {
    if (!d.closingDate) {
      ctx.missing.push("No contract deadline is recorded for this deal");
      return missingDim("closing_timeline", "Closing-timeline fit", 4, "No contract deadline on file — confirm timing with the dispo team.");
    }
    const deadline = new Date(d.closingDate);
    if (Number.isNaN(deadline.getTime())) {
      ctx.missing.push("Contract deadline is recorded but unreadable");
      return missingDim("closing_timeline", "Closing-timeline fit", 4, "Deadline on file could not be read.");
    }
    const daysLeft = Math.ceil((deadline.getTime() - Date.now()) / 86_400_000);
    if (daysLeft < 0) {
      ctx.weak.push(`Contract deadline passed (${deadline.toLocaleDateString("en-US")})`);
      return dim("closing_timeline", "Closing-timeline fit", "weak", 15, 4, `Contract deadline ${deadline.toLocaleDateString("en-US")} has passed — confirm the deal is still live before acting.`);
    }
    const want = b.closingTimelineDays;
    if (want === null) {
      return dim("closing_timeline", "Closing-timeline fit", "moderate", 60, 4, `Contract deadline in ${daysLeft} days. No timeline set in your buy box.`);
    }
    if (daysLeft >= want) {
      ctx.strong.push(`Deadline in ${daysLeft} days fits your timeline`);
      return dim("closing_timeline", "Closing-timeline fit", "strong", 100, 4, `Contract deadline in ${daysLeft} days fits your ${want}-day timeline.`);
    }
    ctx.weak.push(`Only ${daysLeft} days to the deadline`);
    return dim("closing_timeline", "Closing-timeline fit", "weak", 35, 4, `Only ${daysLeft} days to the ${deadline.toLocaleDateString("en-US")} deadline — tighter than your ${want}-day timeline.`);
  },

  // 11. Financing compatibility.
  (b, d, ctx) => {
    const accepted = normList(d.financingAccepted);
    const prefs = normList(b.financingPreferences);
    if (!accepted.length) {
      ctx.missing.push("Accepted financing is not listed for this deal");
      return missingDim("financing", "Financing compatibility", 3, "Deal does not list accepted financing.");
    }
    if (!prefs.length) {
      return dim("financing", "Financing compatibility", "moderate", 55, 3, `Deal accepts ${accepted.join(", ")}. No financing preference in your buy box.`);
    }
    const set = new Set(prefs);
    const overlap = accepted.filter((t) => set.has(t));
    if (overlap.length) {
      ctx.strong.push(`Your financing (${overlap.join(", ")}) is accepted`);
      return dim("financing", "Financing compatibility", "strong", 100, 3, `Deal accepts ${overlap.join(", ")} — matches how you fund deals.`);
    }
    ctx.weak.push(`Deal accepts ${accepted.join(", ")} only`);
    return dim("financing", "Financing compatibility", "weak", 35, 3, `Deal accepts ${accepted.join(", ")}; your buy box lists ${prefs.join(", ")}.`);
  },

  // 12. Past-purchase similarity — only from verified purchases.
  (b, d, ctx) => {
    const past = b.verifiedPastPurchases || [];
    if (!past.length) {
      ctx.missing.push("No verified purchase history on file for you");
      return missingDim("past_purchase", "Past-purchase similarity", 3, "Similarity needs verified past purchases — none are on file, so it does not move the score.");
    }
    ctx.sources.add("Verified purchase history");
    const dealType = String(d.propertyType || "").trim().toLowerCase();
    const dealState = String(d.state || "").trim().toLowerCase();
    let hits = 0;
    for (const p of past) {
      if (dealType && String(p.propertyType || "").trim().toLowerCase() === dealType) hits += 1;
      if (dealState && String(p.state || "").trim().toLowerCase() === dealState) hits += 1;
    }
    if (hits >= 2) {
      ctx.strong.push("Similar to deals you have closed before");
      return dim("past_purchase", "Past-purchase similarity", "strong", 90, 3, "Resembles verified deals you have closed before.");
    }
    if (hits === 1) {
      return dim("past_purchase", "Past-purchase similarity", "moderate", 60, 3, "Partially resembles a verified past purchase.");
    }
    return dim("past_purchase", "Past-purchase similarity", "weak", 30, 3, "Does not closely resemble your verified past purchases.");
  },
];

function dim(
  key: string,
  label: string,
  status: DimensionStatus,
  score: number,
  weight: number,
  detail: string,
  estimate = false,
): MatchDimension {
  return { key, label, status, score: Math.max(0, Math.min(100, Math.round(score))), weight, detail, estimate };
}

function missingDim(key: string, label: string, weight: number, detail: string, estimate = false): MatchDimension {
  return dim(key, label, "missing", 0, weight, detail, estimate);
}

function hardDim(key: string, label: string, weight: number, detail: string): MatchDimension {
  return dim(key, label, "hard_fail", 0, weight, detail);
}

function statusOf(score: number): DimensionStatus {
  if (score >= 70) return "strong";
  if (score >= 40) return "moderate";
  return "weak";
}

export function explainBuyerMatch(buyBox: ExplainBuyBoxInput, deal: ExplainDealInput): MatchExplanation {
  const ctx: Ctx = { hardFailures: [], strong: [], weak: [], missing: [], sources: new Set<string>() };

  const dimensions = builders.map((build) => build(buyBox, deal, ctx));
  for (const d of dimensions) {
    if (d.status === "hard_fail") {
      ctx.hardFailures.push({ rule: d.label, message: d.detail });
      ctx.weak.push(`Hard rule: ${d.detail}`);
    }
  }

  let score: number;
  const hardFail = ctx.hardFailures.length > 0;
  if (hardFail) {
    score = 0;
  } else {
    const usable = dimensions.filter((d) => d.status !== "missing");
    const weightSum = usable.reduce((s, d) => s + d.weight, 0);
    score = weightSum > 0 ? Math.round(usable.reduce((s, d) => s + d.score * d.weight, 0) / weightSum) : 0;
  }

  return {
    score,
    hardFail,
    dimensions,
    strongMatches: ctx.strong,
    weakMatches: ctx.weak,
    hardRuleFailures: ctx.hardFailures,
    missingInformation: ctx.missing,
    dataSources: Array.from(ctx.sources),
    calculatedAt: new Date().toISOString(),
  };
}

/** Convenience: an empty buy-box input with every preference unset. */
export function emptyExplainBuyBox(): ExplainBuyBoxInput {
  return {
    targetZips: [],
    targetStates: [],
    propertyTypes: [],
    priceMin: null,
    priceMax: null,
    strategies: [],
    minSpread: null,
    minYield: null,
    minBeds: null,
    maxBeds: null,
    occupancyPreferences: [],
    maxRepairBudget: null,
    closingTimelineDays: null,
    financingPreferences: [],
    verifiedPastPurchases: [],
  };
}
