export function computeBuyerMatchScore(input: {
  dealZipCode?: string | null;
  dealCity?: string | null;
  dealState?: string | null;
  dealPrice?: number | null;
  dealBeds?: number | null;
  dealBaths?: number | null;
  dealPropertyType?: string | null;
  buyerZipCodes?: string[] | null;
  buyerPreferredAreas?: string[] | null;
  buyerMinPrice?: number | null;
  buyerMaxPrice?: number | null;
  buyerMinBeds?: number | null;
  buyerMaxBeds?: number | null;
  buyerPropertyTypes?: string[] | null;
  buyerTags?: string[] | null;
  dealTags?: string[] | null;
}) {
  let score = 0;

  const dealZip = String(input.dealZipCode || "").replace(/\D/g, "").slice(0, 5);
  const buyerZips = (input.buyerZipCodes || []).map((z) => String(z || "").replace(/\D/g, "").slice(0, 5)).filter(Boolean);
  const dealCity = String(input.dealCity || "").trim().toLowerCase();
  const dealState = String(input.dealState || "").trim().toLowerCase();
  const buyerAreas = (input.buyerPreferredAreas || []).map((a) => String(a || "").trim().toLowerCase()).filter(Boolean);

  if (buyerZips.length) {
    if (!dealZip) return 0;
    if (!buyerZips.includes(dealZip)) return 0;
    score += 35;
  } else if (buyerAreas.length) {
    const dealCityState = dealCity && dealState ? `${dealCity}, ${dealState}` : "";
    const matched = buyerAreas.some((a) => (dealCity && a.includes(dealCity)) || (dealState && a.includes(dealState)) || (dealCityState && a.includes(dealCityState)));
    if (!matched) return 0;
    score += 25;
  } else {
    score += 10;
  }

  const price = typeof input.dealPrice === "number" && Number.isFinite(input.dealPrice) ? input.dealPrice : null;
  const minP = typeof input.buyerMinPrice === "number" && Number.isFinite(input.buyerMinPrice) ? input.buyerMinPrice : null;
  const maxP = typeof input.buyerMaxPrice === "number" && Number.isFinite(input.buyerMaxPrice) ? input.buyerMaxPrice : null;
  if (price !== null && (minP !== null || maxP !== null)) {
    if (minP !== null && price < minP) return 0;
    if (maxP !== null && price > maxP) return 0;
    score += 30;
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
  }

  const dealType = String(input.dealPropertyType || "").trim().toLowerCase();
  const buyerTypes = (input.buyerPropertyTypes || []).map((t) => String(t || "").trim().toLowerCase()).filter(Boolean);
  if (buyerTypes.length) {
    if (dealType && buyerTypes.includes(dealType)) score += 15;
    else if (dealType) score -= 5;
  } else {
    score += 5;
  }

  const dealTags = (input.dealTags || []).map((t) => String(t || "").trim().toLowerCase()).filter(Boolean);
  const buyerTags = (input.buyerTags || []).map((t) => String(t || "").trim().toLowerCase()).filter(Boolean);
  if (dealTags.length && buyerTags.length) {
    const set = new Set(buyerTags);
    const overlap = dealTags.filter((t) => set.has(t));
    score += Math.min(15, overlap.length * 5);
  }

  if (score < 0) score = 0;
  if (score > 100) score = 100;
  return Math.round(score);
}
