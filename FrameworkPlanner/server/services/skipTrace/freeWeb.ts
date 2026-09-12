import type { SkipTraceInput, SkipTraceOutput, SkipTraceProvider, SkipTraceProviderEvidence } from "./provider.js";
import type { PublicResearchInput, PublicResearchOutput, PublicResearchRunner } from "./publicResearch/runner.js";

/**
 * Free "agentic researcher" skip trace — no API keys, no per-lookup cost.
 *
 * Pipeline per lookup:
 *  1. Validate the address with the U.S. Census Bureau Geocoder (free, public domain)
 *     and record county/tract context as evidence.
 *  2. Run several owner/address-anchored queries against free search engines
 *     (DuckDuckGo HTML endpoint, with Mojeek as a fallback).
 *  3. Fetch the most promising public pages and extract phone numbers / emails,
 *     but ONLY when the page also mentions the owner name (or the address) —
 *     a page that never mentions the owner is never treated as a contact source.
 *  4. Persist every consulted source as evidence. Nothing is ever fabricated:
 *     a "no-hit" result means exactly that no public contact was found.
 *
 * Politeness: small in-memory result cache, per-request timeouts, capped page
 * fetches, and a hard blocklist of login-walled social domains.
 */

// ── Pure helpers (exported for unit tests) ─────────────────────────────────

const SOCIAL_BLOCKLIST = [
  "facebook.com",
  "instagram.com",
  "tiktok.com",
  "linkedin.com",
  "x.com",
  "twitter.com",
  "snapchat.com",
  "reddit.com",
  "pinterest.com",
  "youtube.com",
];

const JUNK_EMAIL_DOMAINS =
  /(example\.(com|org|net)|domain\.com|email\.com|yourdomain\.com|sentry\.io|wixpress\.com|googleapis\.com|gstatic\.com|schema\.org|w3\.org|cloudflare\.com|wp\.com|w\.org|squarespace\.com|godaddy\.com)/;

const SURNAMES = new Set([
  "smith", "johnson", "williams", "brown", "jones", "garcia", "miller", "davis", "rodriguez", "martinez",
  "hernandez", "lopez", "gonzalez", "wilson", "anderson", "thomas", "taylor", "moore", "jackson", "martin",
  "lee", "perez", "thompson", "white", "harris", "sanchez", "clark", "ramirez", "lewis", "robinson",
  "walker", "young", "allen", "king", "wright", "scott", "torres", "nguyen", "hill", "flores",
  "green", "adams", "nelson", "baker", "hall", "rivera", "campbell", "mitchell", "carter", "roberts",
  "gomez", "phillips", "evans", "turner", "diaz", "parker", "cruz", "collins", "edwards", "stewart",
  "morris", "morales", "murphy", "cook", "rogers", "gutierrez", "ortiz", "morgan", "cooper", "peterson",
  "bailey", "reed", "kelly", "howard", "ramos", "kim", "cox", "ward", "richardson", "watson",
  "brooks", "chavez", "wood", "james", "bennett", "gray", "mendoza", "ruiz", "hughes", "price",
  "alvarez", "castillo", "sanders", "patel", "myers", "long", "ross", "foster", "jimenez", "powell",
]);

const STOP_TOKENS = new Set([
  "llc", "inc", "ltd", "lp", "plc", "trust", "trustee", "revocable", "living", "family", "holdings",
  "properties", "property", "group", "partners", "estate", "rental", "investments", "invest", "homes",
  "realty", "real", "the", "and", "for", "usa", "company", "ventures", "capital", "management",
]);

const STREET_SUFFIX: Record<string, string> = {
  street: "st", st: "st", road: "rd", rd: "rd", avenue: "ave", ave: "ave", drive: "dr", dr: "dr",
  lane: "ln", ln: "ln", court: "ct", ct: "ct", boulevard: "blvd", blvd: "blvd", place: "pl", pl: "pl",
  circle: "cir", cir: "cir", terrace: "ter", ter: "ter", parkway: "pkwy", pkwy: "pkwy",
  highway: "hwy", hwy: "hwy", way: "way", trail: "trl", trl: "trl",
};

const DIRECTIONS: Record<string, string> = {
  north: "n", south: "s", east: "e", west: "w", northeast: "ne", northwest: "nw", southeast: "se", southwest: "sw",
};

export function normalizeAddressKey(v: string): string {
  const s = String(v || "")
    .toLowerCase()
    .replace(/[#,.]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!s) return "";
  return s
    .split(" ")
    .map((w) => STREET_SUFFIX[w] ?? DIRECTIONS[w] ?? w)
    .join(" ");
}

export function nameTokens(ownerName: string): string[] {
  return String(ownerName || "")
    .toLowerCase()
    .replace(/[^a-z\s]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length >= 3 && !STOP_TOKENS.has(t));
}

export function extractNameMatches(text: string, ownerName: string): string[] {
  const hay = String(text || "").toLowerCase();
  return nameTokens(ownerName).filter((t) => hay.includes(t));
}

export function isOwnerMention(text: string, ownerName: string, address: string): boolean {
  const tokens = nameTokens(ownerName);
  const matched = extractNameMatches(text, ownerName);
  const surnameHit = matched.some((t) => SURNAMES.has(t));
  const addrKey = normalizeAddressKey(address);
  const addrHit = addrKey.length >= 8 && normalizeAddressKey(text).includes(addrKey);
  if (addrHit && matched.length >= 1) return true;
  if (matched.length >= 2) return true;
  if (matched.length === 1 && (surnameHit || tokens.length === 1)) return true;
  return false;
}

export function extractPhones(text: string): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  const re = /(?:\+?1[\s.\-]?)?(?:\(\d{3}\)|\d{3})[\s.\-]?\d{3}[\s.\-]?\d{4}/g;
  for (const m of String(text || "").matchAll(re)) {
    const digits = m[0].replace(/\D/g, "");
    const national = digits.length === 11 && digits.startsWith("1") ? digits.slice(1) : digits;
    if (national.length !== 10) continue;
    if (/^(\d)\1{9}$/.test(national)) continue; // 0000000000-style junk
    const npa = Number(national[0]);
    const nxx = Number(national[3]);
    if (npa < 2 || npa > 9 || nxx < 2 || nxx > 9) continue; // NANP validity
    if (national.slice(1, 3) === "11") continue; // reserved N11 area codes (211/411/911…)
    if (national.slice(4, 6) === "11") continue; // reserved N11 exchanges
    const e164 = `+1${national}`;
    if (seen.has(e164)) continue;
    seen.add(e164);
    out.push(e164);
    if (out.length >= 10) break;
  }
  return out;
}

export function extractEmails(text: string): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  const re = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
  for (const m of String(text || "").matchAll(re)) {
    const email = m[0].toLowerCase();
    const at = email.lastIndexOf("@");
    const local = email.slice(0, at);
    const domain = email.slice(at + 1);
    if (!local || !domain) continue;
    if (JUNK_EMAIL_DOMAINS.test(domain)) continue;
    if (/[0-9a-f]{16,}/.test(local)) continue; // asset/version hash lookalikes
    if (seen.has(email)) continue;
    seen.add(email);
    out.push(email);
    if (out.length >= 10) break;
  }
  return out;
}

export function stripTags(html: string): string {
  return String(html || "")
    .replace(/<script\b[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#x27;|&#39;|&apos;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&#\d+;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export type WebHit = { url: string; title: string; snippet: string };

export function parseDuckDuckGoHtml(html: string): WebHit[] {
  const hits: WebHit[] = [];
  const seen = new Set<string>();
  const tagRe = /<a\b([^>]*)>([\s\S]*?)<\/a>/g;
  for (const m of String(html || "").matchAll(tagRe)) {
    const attrs = m[1] || "";
    if (!/class="[^"]*result__a/.test(attrs)) continue;
    const rawHref = attrs.match(/href="([^"]+)"/)?.[1] || "";
    let url = rawHref;
    try {
      if (url.startsWith("//")) url = `https:${url}`;
      const uddg = url.match(/[?&]uddg=([^&]+)/);
      if (uddg) url = decodeURIComponent(uddg[1]);
    } catch {
      continue;
    }
    if (!/^https?:\/\//i.test(url)) continue;
    const key = url.replace(/[#?].*$/, "");
    if (seen.has(key)) continue;
    const title = stripTags(m[2]);
    if (!title) continue;
    seen.add(key);
    hits.push({ url, title, snippet: "" });
  }
  return hits.slice(0, 10);
}

export function parseDuckDuckGoSnippets(html: string): string[] {
  const out: string[] = [];
  const tagRe = /<a\b([^>]*)>([\s\S]*?)<\/a>/g;
  for (const m of String(html || "").matchAll(tagRe)) {
    if (!/class="[^"]*result__snippet/.test(m[1] || "")) continue;
    out.push(stripTags(m[2]));
  }
  return out;
}

export function parseMojeekHtml(html: string): WebHit[] {
  const hits: WebHit[] = [];
  const seen = new Set<string>();
  const tagRe = /<a\b([^>]*)>([\s\S]*?)<\/a>/g;
  for (const m of String(html || "").matchAll(tagRe)) {
    const attrs = m[1] || "";
    const href = attrs.match(/href="(https?:\/\/[^"]+)"/)?.[1];
    if (!href || /mojeek\.com/i.test(href)) continue;
    const key = href.replace(/[#?].*$/, "");
    if (seen.has(key)) continue;
    const title = stripTags(m[2]);
    if (!title || title.length < 3) continue;
    seen.add(key);
    hits.push({ url: href, title, snippet: "" });
  }
  return hits.slice(0, 10);
}

export function parseMojeekSnippets(html: string): string[] {
  const out: string[] = [];
  const re = /<p\b[^>]*class="s"[^>]*>([\s\S]*?)<\/p>/g;
  for (const m of String(html || "").matchAll(re)) out.push(stripTags(m[1]));
  return out;
}

export function buildSearchQueries(input: SkipTraceInput): string[] {
  const name = String(input.ownerName || "").replace(/\s+/g, " ").trim();
  const street = String(input.address || "").replace(/\s+/g, " ").trim();
  const region = [input.city, input.state].filter(Boolean).join(" ").trim();
  const fullAddr = [street, region, input.zipCode].filter(Boolean).join(", ");
  return [
    `"${name}" "${street}" ${input.state}`.trim(),
    `"${name}" contact ${region}`.trim(),
    `"${fullAddr}" owner`.trim(),
    `"${name}" phone OR email ${region}`.trim(),
  ].filter((q) => q.replace(/["]/g, "").trim().length > 4);
}

export function isScrapableUrl(url: string): boolean {
  try {
    const u = new URL(url);
    if (u.protocol !== "http:" && u.protocol !== "https:") return false;
    const host = u.hostname.toLowerCase();
    if (SOCIAL_BLOCKLIST.some((d) => host === d || host.endsWith(`.${d}`))) return false;
    return true;
  } catch {
    return false;
  }
}

export async function fetchText(
  url: string,
  opts?: { timeoutMs?: number; headers?: Record<string, string> },
): Promise<{ ok: boolean; status: number; text: string } | null> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), opts?.timeoutMs ?? 8000);
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      redirect: "follow",
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; LuxeRM-CRM/1.0; research)",
        "Accept-Language": "en-US,en;q=0.9",
        ...(opts?.headers || {}),
      },
    });
    const text = await res.text();
    return { ok: res.ok, status: res.status, text: text.slice(0, 400_000) };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

// ── Core research pipeline ─────────────────────────────────────────────────

export type FreeWebResearchResult = {
  status: "success" | "fail";
  phones: string[];
  emails: string[];
  evidence: SkipTraceProviderEvidence[];
  meta: Record<string, unknown>;
};

async function searchDuckDuckGo(query: string): Promise<WebHit[]> {
  const res = await fetchText(`https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`, { timeoutMs: 9000 });
  if (!res || !res.ok || !res.text) return [];
  const hits = parseDuckDuckGoHtml(res.text);
  const snippets = parseDuckDuckGoSnippets(res.text);
  hits.forEach((h, i) => {
    if (snippets[i]) h.snippet = snippets[i];
  });
  return hits;
}

async function searchMojeek(query: string): Promise<WebHit[]> {
  const res = await fetchText(`https://www.mojeek.com/search?q=${encodeURIComponent(query)}`, { timeoutMs: 9000 });
  if (!res || !res.ok || !res.text) return [];
  const hits = parseMojeekHtml(res.text);
  const snippets = parseMojeekSnippets(res.text);
  hits.forEach((h, i) => {
    if (snippets[i]) h.snippet = snippets[i];
  });
  return hits;
}

async function fetchCensusEvidence(input: SkipTraceInput): Promise<SkipTraceProviderEvidence | null> {
  const addr = [input.address, input.city, input.state, input.zipCode].filter(Boolean).join(", ");
  if (!addr.trim()) return null;
  const url =
    `https://geocoding.services.census.gov/geocoder/geographies/onelineaddress` +
    `?address=${encodeURIComponent(addr)}&benchmark=Public_AR_Current&vintage=Census2020_Current&format=json`;
  const res = await fetchText(url, { timeoutMs: 7000, headers: { Accept: "application/json" } });
  if (!res || !res.ok || !res.text) return null;
  try {
    const json = JSON.parse(res.text) as any;
    const match = json?.result?.addressMatches?.[0];
    if (!match) return null;
    const geos = match.geographies && typeof match.geographies === "object" ? match.geographies : {};
    const county = Array.isArray(geos["Counties"]) ? geos["Counties"][0] : null;
    const tract = Array.isArray(geos["Census Tracts"]) ? geos["Census Tracts"][0] : null;
    return {
      sourceType: "census_geocoder",
      sourceUrl: "https://geocoding.services.census.gov/geocoder/",
      extracted: {
        matchedAddress: match.matchedAddress ?? null,
        coordinates: match.coordinates ?? null,
        countyFips: county?.GEOID ?? null,
        countyName: county?.NAME ?? null,
        tractFips: tract?.GEOID ?? null,
      },
      confidence: { validated: true, source: "U.S. Census Bureau Geocoder (public domain)" },
      notes: "Address validated against the U.S. Census Geocoder; county and census-tract context recorded.",
    };
  } catch {
    return null;
  }
}

const researchCache = new Map<string, { at: number; result: FreeWebResearchResult }>();
const CACHE_TTL_MS = 10 * 60_000;
const MAX_HITS = 12;
const MAX_PAGE_FETCHES = 8;
const TOTAL_BUDGET_MS = 45_000;

export async function runFreeWebResearch(input: SkipTraceInput): Promise<FreeWebResearchResult> {
  const cacheKey = [input.ownerName, input.address, input.city, input.state, input.zipCode]
    .map((v) => String(v || "").trim().toLowerCase())
    .join("|");
  const cached = researchCache.get(cacheKey);
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) return cached.result;

  const startedAt = Date.now();
  const phones = new Set<string>();
  const emails = new Set<string>();
  const evidence: SkipTraceProviderEvidence[] = [];

  // 1) Free address validation + county/tract context (never gates the result)
  const census = await fetchCensusEvidence(input);
  if (census) evidence.push(census);

  // 2) Agentic-ish multi-query search across free engines
  const queries = buildSearchQueries(input);
  const hits: WebHit[] = [];
  const seenUrls = new Set<string>();
  let engineUsed: "duckduckgo" | "mojeek" | null = null;
  for (const q of queries) {
    if (Date.now() - startedAt > TOTAL_BUDGET_MS / 2) break;
    let found = await searchDuckDuckGo(q);
    if (found.length) engineUsed = engineUsed ?? "duckduckgo";
    if (!found.length) {
      found = await searchMojeek(q);
      if (found.length) engineUsed = engineUsed ?? "mojeek";
    }
    for (const h of found) {
      const key = h.url.replace(/[#?].*$/, "");
      if (seenUrls.has(key)) continue;
      seenUrls.add(key);
      hits.push(h);
    }
    if (hits.length >= MAX_HITS) break;
  }

  // 3) Read the most promising public pages; anchor every contact to the owner
  let pagesFetched = 0;
  for (const hit of hits.slice(0, MAX_PAGE_FETCHES)) {
    if (Date.now() - startedAt > TOTAL_BUDGET_MS) break;
    if (!isScrapableUrl(hit.url)) continue;
    const page = await fetchText(hit.url, { timeoutMs: 6000, headers: { Accept: "text/html" } });
    if (!page || !page.ok || !page.text) continue;
    pagesFetched += 1;
    const pageText = stripTags(page.text).slice(0, 200_000);
    const mention = isOwnerMention(pageText, input.ownerName, input.address);
    const pagePhones = mention ? extractPhones(pageText) : [];
    const pageEmails = mention ? extractEmails(pageText) : [];
    let added = false;
    for (const p of pagePhones) {
      if (phones.size >= 10) break;
      if (!phones.has(p)) {
        phones.add(p);
        added = true;
      }
    }
    for (const e of pageEmails) {
      if (emails.size >= 10) break;
      if (!emails.has(e)) {
        emails.add(e);
        added = true;
      }
    }
    evidence.push({
      sourceType: "web_research",
      sourceUrl: hit.url,
      extracted: {
        title: hit.title,
        ownerMention: mention,
        phones: pagePhones.slice(0, 5),
        emails: pageEmails.slice(0, 5),
      },
      confidence: { ownerMention: mention, nameTokensMatched: extractNameMatches(pageText, input.ownerName) },
      notes: hit.snippet ? `Search match: ${hit.snippet.slice(0, 180)}` : null,
    });
    if (added) continue;
  }

  // 4) Always record the searches consulted, even on a miss (auditable no-hit)
  if (hits.length) {
    evidence.push({
      sourceType: "web_search",
      sourceUrl: null,
      extracted: {
        queries,
        engine: engineUsed,
        resultCount: hits.length,
        topResults: hits.slice(0, 5).map((h) => ({ title: h.title, url: h.url })),
      },
      confidence: { engine: engineUsed ?? "none" },
      notes: `Consulted ${hits.length} public search result(s); ${pagesFetched} page(s) fetched.`,
    });
  }

  const status: FreeWebResearchResult["status"] = phones.size || emails.size ? "success" : "fail";
  const result: FreeWebResearchResult = {
    status,
    phones: [...phones].slice(0, 10),
    emails: [...emails].slice(0, 10),
    evidence: evidence.slice(0, 15),
    meta: {
      provider: "free-web",
      engine: engineUsed ?? "none",
      queries,
      searchedAt: new Date().toISOString(),
      addressValidated: !!census,
      resultCount: hits.length,
      pagesFetched,
      durationMs: Date.now() - startedAt,
    },
  };

  if (researchCache.size >= 100) researchCache.clear();
  researchCache.set(cacheKey, { at: Date.now(), result });
  return result;
}

// ── Provider + public-research runner adapters ─────────────────────────────

export class FreeWebSkipTraceProvider implements SkipTraceProvider {
  name = "free-web";

  async skipTrace(input: SkipTraceInput): Promise<SkipTraceOutput> {
    const out = await runFreeWebResearch(input);
    const raw = {
      provider: this.name,
      ...out.meta,
      evidenceCount: out.evidence.length,
    };
    if (out.status === "success") {
      return {
        status: "success",
        phones: out.phones,
        emails: out.emails,
        costCents: 0,
        raw,
        evidence: out.evidence,
      };
    }
    return {
      status: "fail",
      phones: out.phones,
      emails: out.emails,
      costCents: 0,
      raw,
      evidence: out.evidence,
      errorMessage: "No public contact information found for this owner/address",
    };
  }
}

export class FreeWebPublicResearchRunner implements PublicResearchRunner {
  name = "free-web";
  enabled = String(process.env.SKIP_TRACE_PUBLIC_RESEARCH_ENABLED || "").trim().toLowerCase() === "true";

  async run(input: PublicResearchInput): Promise<PublicResearchOutput> {
    if (!this.enabled) {
      return {
        status: "disabled",
        evidence: [],
        message: "Public research is disabled",
        raw: { env: "SKIP_TRACE_PUBLIC_RESEARCH_ENABLED" },
      };
    }
    const researchInput: SkipTraceInput = {
      ownerName: String(input.ownerName || "").trim(),
      address: String(input.address || "").trim(),
      city: String(input.city || "").trim(),
      state: String(input.state || "").trim(),
      zipCode: String(input.zipCode || "").trim(),
    };
    const out = await runFreeWebResearch(researchInput);
    return {
      status: out.status,
      evidence: out.evidence,
      message:
        out.status === "success"
          ? `Free public research found ${out.phones.length} phone(s) and ${out.emails.length} email(s)`
          : "Free public research completed with no public contact hits",
      raw: out.meta,
    };
  }
}
