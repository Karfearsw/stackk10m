export type BuyerMatchInput = {
  dealZipCode?: string | null;
  dealCity?: string | null;
  dealState?: string | null;
  dealPrice?: number | null;
  dealBeds?: number | null;
  dealBaths?: number | null;
  dealPropertyType?: string | null;
  /** Strategy tags describing the deal, e.g. ["fix-and-flip", "buy-and-hold"]. */
  dealStrategies?: string[] | null;
  /** Estimated spread on the deal (ARV - price - repairs), when known. */
  dealSpread?: number | null;
  buyerZipCodes?: string[] | null;
  buyerPreferredAreas?: string[] | null;
  buyerMinPrice?: number | null;
  buyerMaxPrice?: number | null;
  buyerMinBeds?: number | null;
  buyerMaxBeds?: number | null;
  buyerPropertyTypes?: string[] | null;
  buyerTags?: string[] | null;
  dealTags?: string[] | null;
  /** Buyer's investment strategies, e.g. ["fix-and-flip", "brrrr"]. */
  buyerStrategies?: string[] | null;
  /** Buyer's minimum required spread, when set. */
  buyerMinSpread?: number | null;
};

export type BuyerMatchResult = {
  /** 0-100 match score. */
  score: number;
  /** Human-readable reasons, e.g. "In their zip 32801". Rendered in the Dispo tab. */
  reasons: string[];
};

function normZip(z: unknown): string {
  return String(z || "").replace(/\D/g, "").slice(0, 5);
}

function fmtMoney(n: number): string {
  return "$" + Math.round(n).toLocaleString("en-US");
}

/**
 * Score a buyer against a deal, returning the score plus human-readable reasons.
 * Hard fails (buyer explicitly excludes this deal: wrong zip, out of price band)
 * return score 0 with the failing reason included.
 */
export function scoreBuyerMatch(input: BuyerMatchInput): BuyerMatchResult {
  let score = 0;
  const reasons: string[] = [];
  const fail = (reason: string): BuyerMatchResult => ({ score: 0, reasons: [reason] });

  const dealZip = normZip(input.dealZipCode);
  const buyerZips = (input.buyerZipCodes || []).map(normZip).filter(Boolean);
  const dealCity = String(input.dealCity || "").trim().toLowerCase();
  const dealState = String(input.dealState || "").trim().toLowerCase();
  const buyerAreas = (input.buyerPreferredAreas || []).map((a) => String(a || "").trim().toLowerCase()).filter(Boolean);

  if (buyerZips.length) {
    if (!dealZip) return fail("Deal has no zip code");
    if (!buyerZips.includes(dealZip)) return fail(`Outside their zip list (${dealZip})`);
    score += 35;
    reasons.push(`In their zip ${dealZip}`);
  } else if (buyerAreas.length) {
    const dealCityState = dealCity && dealState ? `${dealCity}, ${dealState}` : "";
    const matched = buyerAreas.some(
      (a) =>
        (dealCity && a.includes(dealCity)) ||
        (dealState && a.includes(dealState)) ||
        (dealCityState && a.includes(dealCityState)),
    );
    if (!matched) return fail("Outside their target areas");
    score += 25;
    reasons.push(`In their target area${dealCity ? ` (${dealCity})` : ""}`);
  } else {
    score += 10;
  }

  const price = typeof input.dealPrice === "number" && Number.isFinite(input.dealPrice) ? input.dealPrice : null;
  const minP = typeof input.buyerMinPrice === "number" && Number.isFinite(input.buyerMinPrice) ? input.buyerMinPrice : null;
  const maxP = typeof input.buyerMaxPrice === "number" && Number.isFinite(input.buyerMaxPrice) ? input.buyerMaxPrice : null;
  if (price !== null && (minP !== null || maxP !== null)) {
    if (minP !== null && price < minP) return fail(`Below their ${fmtMoney(minP)} minimum`);
    if (maxP !== null && price > maxP) return fail(`Above their ${fmtMoney(maxP)} maximum`);
    score += 30;
    const band =
      minP !== null && maxP !== null
        ? `${fmtMoney(minP)}–${fmtMoney(maxP)}`
        : minP !== null
          ? `${fmtMoney(minP)}+`
          : `up to ${fmtMoney(maxP as number)}`;
    reasons.push(`Within their ${band} band`);
  } else if (price !== null) {
    score += 10;
  }

  const beds = typeof input.dealBeds === "number" && Number.isFinite(input.dealBeds) ? input.dealBeds : null;
  const minB = typeof input.buyerMinBeds === "number" && Number.isFinite(input.buyerMinBeds) ? input.buyerMinBeds : null;
  const maxB = typeof input.buyerMaxBeds === "number" && Number.isFinite(input.buyerMaxBeds) ? input.buyerMaxBeds : null;
  if (beds !== null && (minB !== null || maxB !== null)) {
    if (minB !== null && beds < minB) score -= 10;
    else score += 10;
    if (maxB !== null && beds > maxB) score -= 10;
    else score += 10;
    if (beds >= (minB ?? 0) && (maxB === null || beds <= maxB)) {
      reasons.push(`Meets their bed requirement (${beds} bd)`);
    }
  }

  const dealType = String(input.dealPropertyType || "").trim().toLowerCase();
  const buyerTypes = (input.buyerPropertyTypes || []).map((t) => String(t || "").trim().toLowerCase()).filter(Boolean);
  if (buyerTypes.length) {
    if (dealType && buyerTypes.includes(dealType)) {
      score += 15;
      reasons.push(`Buys ${dealType.toUpperCase()} properties`);
    } else if (dealType) {
      score -= 5;
    }
  } else {
    score += 5;
  }

  const dealTags = (input.dealTags || []).map((t) => String(t || "").trim().toLowerCase()).filter(Boolean);
  const buyerTags = (input.buyerTags || []).map((t) => String(t || "").trim().toLowerCase()).filter(Boolean);
  if (dealTags.length && buyerTags.length) {
    const set = new Set(buyerTags);
    const overlap = dealTags.filter((t) => set.has(t));
    if (overlap.length) {
      score += Math.min(15, overlap.length * 5);
      reasons.push(`Tag match: ${overlap.slice(0, 3).join(", ")}`);
    }
  }

  // Extended inputs: strategies + spread.
  const dealStrategies = (input.dealStrategies || []).map((t) => String(t || "").trim().toLowerCase()).filter(Boolean);
  const buyerStrategies = (input.buyerStrategies || []).map((t) => String(t || "").trim().toLowerCase()).filter(Boolean);
  if (dealStrategies.length && buyerStrategies.length) {
    const set = new Set(buyerStrategies);
    const overlap = dealStrategies.filter((t) => set.has(t));
    if (overlap.length) {
      score += 15;
      const pretty = overlap
        .slice(0, 3)
        .map((t) => t.replace(/-/g, " "))
        .join(", ");
      reasons.push(`Strategy fit: ${pretty}`);
    }
  }

  const spread = typeof input.dealSpread === "number" && Number.isFinite(input.dealSpread) ? input.dealSpread : null;
  const minSpread = typeof input.buyerMinSpread === "number" && Number.isFinite(input.buyerMinSpread) ? input.buyerMinSpread : null;
  if (spread !== null && minSpread !== null) {
    if (spread >= minSpread) {
      score += 15;
      reasons.push(`Meets their ${fmtMoney(minSpread)} minimum spread`);
    }
    // Below-minimum spread is not a hard fail here: spread estimates are rough
    // and the agent reviews the match. No bonus, no reason.
  }

  if (score < 0) score = 0;
  if (score > 100) score = 100;
  return { score: Math.round(score), reasons };
}

/**
 * Backward-compatible numeric scorer. Same inputs, same number as before —
 * new strategy/spread inputs only add bonuses when provided.
 */
export function computeBuyerMatchScore(input: BuyerMatchInput): number {
  return scoreBuyerMatch(input).score;
}
