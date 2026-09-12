export function parseLikelyNumber(input: string): number | null {
  const cleaned = input.replace(/[^\d.]/g, "");
  const n = parseFloat(cleaned);
  return Number.isFinite(n) ? n : null;
}

export function extractCompFromClipboardText(text: string): {
  soldPrice?: number | null;
  beds?: number | null;
  baths?: number | null;
  sqft?: number | null;
} {
  const t = String(text || "");
  const priceMatch = t.match(/\$\s*([\d,]+(?:\.\d{1,2})?)/);
  const bedsMatch = t.match(/\b(\d+(?:\.\d+)?)\s*bd\b/i);
  const bathsMatch = t.match(/\b(\d+(?:\.\d+)?)\s*ba\b/i);
  const sqftMatch = t.match(/\b([\d,]+)\s*(?:sq\s*ft|sqft)\b/i);
  return {
    soldPrice: priceMatch ? parseLikelyNumber(priceMatch[1]) : null,
    beds: bedsMatch ? parseLikelyNumber(bedsMatch[1]) : null,
    baths: bathsMatch ? parseLikelyNumber(bathsMatch[1]) : null,
    sqft: sqftMatch ? parseLikelyNumber(sqftMatch[1]) : null,
  };
}
