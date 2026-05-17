export type PublicResearchSourceKey = "zillow" | "redfin" | "realtor" | "tps" | "county";

export type PublicResearchSearchPlan = {
  key: PublicResearchSourceKey;
  sourceType: string;
  query: string;
};

function compactSpace(s: string) {
  return String(s || "")
    .trim()
    .replace(/\s+/g, " ");
}

export function buildSearchPlans(input: { address: string; city: string; state: string; zipCode: string; ownerName?: string | null }): PublicResearchSearchPlan[] {
  const address = compactSpace(input.address);
  const city = compactSpace(input.city);
  const state = compactSpace(input.state);
  const zip = compactSpace(input.zipCode);
  const ownerName = compactSpace(input.ownerName || "");
  const base = compactSpace([address, city, state, zip].filter(Boolean).join(" "));

  const plans: PublicResearchSearchPlan[] = [
    { key: "zillow", sourceType: "zillow_search", query: compactSpace(`${base} site:zillow.com`) },
    { key: "redfin", sourceType: "redfin_search", query: compactSpace(`${base} site:redfin.com`) },
    { key: "realtor", sourceType: "realtor_search", query: compactSpace(`${base} site:realtor.com`) },
    { key: "tps", sourceType: "tps_search", query: compactSpace(`${base} site:truepeoplesearch.com`) },
    { key: "county", sourceType: "county_search", query: compactSpace(`${base} ${ownerName ? ownerName + " " : ""}property appraiser`) },
  ];
  return plans.filter((p) => p.query);
}

function safeJsonParse(raw: string) {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function asArray<T>(v: T | T[] | null | undefined): T[] {
  if (!v) return [];
  return Array.isArray(v) ? v : [v];
}

function extractNumeric(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const cleaned = v.replace(/[^\d.]/g, "");
    const n = parseFloat(cleaned);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function get(obj: any, path: string[]) {
  let cur = obj;
  for (const key of path) {
    if (!cur || typeof cur !== "object") return undefined;
    cur = cur[key];
  }
  return cur;
}

function normalizeListingFromJsonLd(node: any): Record<string, unknown> | null {
  if (!node || typeof node !== "object") return null;

  const offers = get(node, ["offers"]);
  const offer = Array.isArray(offers) ? offers[0] : offers;
  const price = extractNumeric(offer?.price ?? offer?.lowPrice ?? offer?.highPrice ?? node?.price);

  const address = node?.address && typeof node.address === "object" ? node.address : null;
  const streetAddress = typeof address?.streetAddress === "string" ? address.streetAddress : null;
  const addressLocality = typeof address?.addressLocality === "string" ? address.addressLocality : null;
  const addressRegion = typeof address?.addressRegion === "string" ? address.addressRegion : null;
  const postalCode = typeof address?.postalCode === "string" ? address.postalCode : null;

  const floorSize = node?.floorSize && typeof node.floorSize === "object" ? node.floorSize : null;
  const sqft = extractNumeric(floorSize?.value ?? node?.floorSize ?? node?.size);

  const beds = extractNumeric(node?.numberOfBedrooms ?? node?.beds ?? node?.bedrooms);
  const baths = extractNumeric(node?.numberOfBathroomsTotal ?? node?.baths ?? node?.bathrooms);

  const out: Record<string, unknown> = {};
  if (price !== null) out.price = price;
  if (beds !== null) out.beds = beds;
  if (baths !== null) out.baths = baths;
  if (sqft !== null) out.sqft = sqft;

  const addrParts = [streetAddress, addressLocality, addressRegion, postalCode].filter(Boolean);
  if (addrParts.length) out.address = addrParts.join(", ");

  return Object.keys(out).length ? out : null;
}

export function extractJsonLdSignalsFromHtml(html: string): Record<string, unknown> | null {
  const h = String(html || "");
  if (!h) return null;
  const blocks = h.match(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi) || [];
  const parsed: any[] = [];
  for (const block of blocks) {
    const m = block.match(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/i);
    const jsonRaw = m?.[1] ? String(m[1]).trim() : "";
    if (!jsonRaw) continue;
    const obj = safeJsonParse(jsonRaw);
    if (!obj) continue;
    parsed.push(obj);
  }

  const candidates: any[] = [];
  for (const p of parsed) {
    if (Array.isArray(p)) candidates.push(...p);
    else candidates.push(p);
    const graph = p && typeof p === "object" ? p["@graph"] : null;
    if (Array.isArray(graph)) candidates.push(...graph);
  }

  for (const c of candidates) {
    const normalized = normalizeListingFromJsonLd(c);
    if (normalized) return normalized;
  }
  return null;
}

export function parseEnvBool(v: unknown): boolean | null {
  if (v === undefined || v === null) return null;
  const s = String(v).trim().toLowerCase();
  if (!s) return null;
  if (s === "1" || s === "true" || s === "yes" || s === "on") return true;
  if (s === "0" || s === "false" || s === "no" || s === "off") return false;
  return null;
}

export function parseEnvInt(v: unknown, fallback: number) {
  const s = String(v ?? "").trim();
  const n = s ? parseInt(s, 10) : NaN;
  return Number.isFinite(n) ? n : fallback;
}
