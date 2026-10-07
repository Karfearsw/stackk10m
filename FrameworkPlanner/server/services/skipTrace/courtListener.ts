import type { SkipTraceInput, SkipTraceOutput, SkipTraceProvider, SkipTraceProviderEvidence } from "./provider.js";

/**
 * CourtListener / RECAP bankruptcy enrichment — FREE, no per-hit cost.
 *
 * Play: given an owner name (+ state), search RECAP bankruptcy dockets for a
 * case where they are the debtor, then pull the Voluntary Petition
 * (Official Form 101). Pro se petitions list the debtor's phone / cell /
 * email on the contact page — the only bulk-queryable free source of actual
 * phone numbers found in research.
 *
 * Docs: https://www.courtlistener.com/help/api/rest/
 * Rate limits (free token): 5/min, 50/hr, 125/day — roughly 30–60 leads/day.
 * Design accordingly: triage high-score leads first, cache docket_ids forever
 * (the hub's result cache already prevents re-querying the same owner+address).
 *
 * Env:
 *   COURTLISTENER_API_TOKEN   required — from https://www.courtlistener.com/sign-up/
 *                             (profile page, "See Your Token")
 *   COURTLISTENER_TIMEOUT_MS  optional — per-request timeout (default 20000)
 *
 * Select with SKIP_TRACE_PROVIDER=courtlistener (or =recap).
 *
 * Honest limits: phones appear mostly for pro se filers and only when the
 * RECAP copy wasn't redacted. PDF text extraction is best-effort — many
 * petitions are text-based and parse fine; scanned-image petitions do not.
 * Either way the case + petition URL are recorded as evidence so a human can
 * open the PDF in one click (see the VA SOP's court-check step).
 */

const API_BASE = "https://www.courtlistener.com/api/rest/v4";
const STORAGE_BASE = "https://storage.courtlistener.com";

const BANKRUPTCY_COURTS_BY_STATE: Record<string, string[]> = {
  MA: ["mab"],
  RI: ["rib"],
  FL: ["flmb", "flnb", "flsb"],
  MI: ["mieb", "miwb"],
};

// ── Pure helpers (exported for unit tests) ─────────────────────────────────

/** Bankruptcy court IDs to search for a lead's state. Empty = unsupported state. */
export function courtsForState(state: string): string[] {
  return BANKRUPTCY_COURTS_BY_STATE[String(state || "").trim().toUpperCase()] || [];
}

/** Normalize a name for comparison: lowercase, strip punctuation/suffixes. */
export function normalizeNameForMatch(name: string): string {
  return String(name || "")
    .toLowerCase()
    .replace(/\b(jr|sr|ii|iii|iv|v|esq|phd|md)\b\.?/g, "")
    .replace(/[^a-z\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * True when the search hit looks like OUR owner as the debtor (not a trustee,
 * attorney, or creditor also named in party[]). Requires every token of the
 * owner name to appear in the case name or the matched party entry, and
 * rejects adversary ("X v. Y") style case names.
 */
export function isDebtorMatch(hit: any, ownerName: string): boolean {
  const owner = normalizeNameForMatch(ownerName);
  if (!owner) return false;
  const tokens = owner.split(" ").filter((t) => t.length > 1);
  if (!tokens.length) return false;
  const caseName = String(hit?.caseName || "");
  if (/\sv\.\s/i.test(caseName)) return false; // adversary proceeding, not the debtor's case
  const haystack = normalizeNameForMatch(caseName + " " + (Array.isArray(hit?.party) ? hit.party.join(" ") : ""));
  return tokens.every((t) => haystack.includes(t));
}

/** Pro se ≈ no attorney listed → debtor filled the form themselves → phone most likely present. */
export function isProSe(hit: any): boolean {
  const attorneys = Array.isArray(hit?.attorney) ? hit.attorney : [];
  return attorneys.filter((a: any) => String(a || "").trim()).length === 0;
}

export type PetitionDoc = {
  id: number;
  description: string;
  documentNumber: number | null;
  filepathLocal: string | null;
  isAvailable: boolean;
};

/**
 * Find the Voluntary Petition among the (up to 3) nested recap_documents.
 * Prefers the amended version (highest document number) when several match.
 */
export function findPetitionDocument(hit: any): PetitionDoc | null {
  const docs = Array.isArray(hit?.recap_documents) ? hit.recap_documents : [];
  const petitions = docs
    .map((d: any) => ({
      id: typeof d?.id === "number" ? d.id : 0,
      description: String(d?.description || d?.short_description || ""),
      documentNumber: typeof d?.document_number === "number" ? d.document_number : null,
      filepathLocal: typeof d?.filepath_local === "string" ? d.filepath_local : null,
      isAvailable: d?.is_available === true,
    }))
    .filter((d: PetitionDoc) => /voluntary petition/i.test(d.description) && d.isAvailable && d.filepathLocal);
  if (!petitions.length) return null;
  petitions.sort((a: PetitionDoc, b: PetitionDoc) => (b.documentNumber ?? 0) - (a.documentNumber ?? 0));
  return petitions[0];
}

const EMAIL_RE = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
const PHONE_RE = /(?:\+?1[\s.\-]?)?\(?([2-9]\d{2})\)?[\s.\-]?([2-9]\d{2})[\s.\-]?(\d{4})/g;

function normalizePhone(digits: string): string | null {
  const d = digits.replace(/\D/g, "");
  if (d.length === 10) return `+1${d}`;
  if (d.length === 11 && d.startsWith("1")) return `+${d}`;
  return null;
}

/** Extract candidate phones/emails from text (e.g., a petition's contact page). */
export function extractContactsFromText(text: string): { phones: string[]; emails: string[] } {
  const src = String(text || "");
  const emails = Array.from(new Set((src.match(EMAIL_RE) || []).map((e) => e.toLowerCase()))).slice(0, 10);
  const phones: string[] = [];
  const seen = new Set<string>();
  let m: RegExpExecArray | null;
  PHONE_RE.lastIndex = 0;
  while ((m = PHONE_RE.exec(src)) !== null) {
    const n = normalizePhone(m[0]);
    // skip obvious non-numbers (all same digit, 555 fictional range)
    if (n && !seen.has(n) && !/^(\d)\1+$/.test(n.replace(/\D/g, "")) && !n.includes("555")) {
      seen.add(n);
      phones.push(n);
    }
    if (phones.length >= 10) break;
  }
  return { phones, emails };
}

/**
 * Best-effort text extraction from a PDF buffer (text-based PDFs only).
 * Walks BT/ET content blocks and decodes Tj / TJ string operands
 * (literal (...) and hex <...>), which covers the common case of
 * RECAP petitions generated from word processors. Scanned-image PDFs
 * yield nothing — callers must treat empty output as "unknown", not "clean".
 */
export function extractTextFromPdf(buffer: Uint8Array): string {
  let raw: string;
  try {
    raw = Buffer.from(buffer).toString("latin1");
  } catch {
    return "";
  }
  const out: string[] = [];
  const blocks = raw.match(/BT[\s\S]*?ET/g) || [];
  const decodeLiteral = (s: string) =>
    s
      .replace(/\\([nrtbf\\()])/g, (_m, c: string) => ({ n: "\n", r: "\r", t: "\t", b: "\b", f: "\f", "\\": "\\", "(": "(", ")": ")" }[c] || c))
      .replace(/\\(\d{1,3})/g, (_m, oct: string) => String.fromCharCode(parseInt(oct, 8)));
  const decodeHex = (s: string) => {
    const hex = s.replace(/\s/g, "");
    let r = "";
    for (let i = 0; i + 1 < hex.length; i += 2) r += String.fromCharCode(parseInt(hex.slice(i, i + 2), 16));
    return r;
  };
  for (const block of blocks) {
    // Literal strings: (text) Tj
    const literalRe = /\((?:\\.|[^\\()])*\)\s*Tj/g;
    let m: RegExpExecArray | null;
    while ((m = literalRe.exec(block)) !== null) {
      out.push(decodeLiteral(m[0].slice(1, m[0].lastIndexOf(")"))));
    }
    // Kerned arrays: [(text) 120 (more)] TJ  and  [<hex> 120 <hex>] TJ
    const arrayRe = /\[([\s\S]*?)\]\s*TJ/g;
    while ((m = arrayRe.exec(block)) !== null) {
      const inner = m[1];
      const parts: string[] = [];
      const lit2 = /\((?:\\.|[^\\()])*\)/g;
      let m2: RegExpExecArray | null;
      while ((m2 = lit2.exec(inner)) !== null) parts.push(decodeLiteral(m2[0].slice(1, -1)));
      const hex2 = /<([0-9a-fA-F\s]+)>/g;
      while ((m2 = hex2.exec(inner)) !== null) parts.push(decodeHex(m2[1]));
      if (parts.length) out.push(parts.join(""));
    }
  }
  return out.join(" ").replace(/\s+/g, " ").trim();
}

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v || !String(v).trim()) throw new Error(`${name} is not configured`);
  return String(v).trim();
}

function timeoutMs(): number {
  const n = Number(process.env.COURTLISTENER_TIMEOUT_MS);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 20_000;
}

async function apiGet(path: string, token: string, params: Record<string, string> = {}): Promise<{ ok: boolean; status: number; data: any }> {
  const qs = new URLSearchParams(params).toString();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs());
  try {
    const res = await fetch(`${API_BASE}${path}${qs ? `?${qs}` : ""}`, {
      headers: { accept: "application/json", authorization: `Token ${token}` },
      signal: controller.signal,
    });
    const data = await res.json().catch(() => ({}));
    return { ok: res.ok, status: res.status, data };
  } catch (e: any) {
    return { ok: false, status: 0, data: { error: String(e?.message || e) } };
  } finally {
    clearTimeout(timer);
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function buildEvidence(args: {
  query: string;
  courts: string[];
  hitsTotal: number;
  match: any | null;
  petition: PetitionDoc | null;
  proSe: boolean;
  phonesFound: number;
}): SkipTraceProviderEvidence[] {
  const evidence: SkipTraceProviderEvidence[] = [
    {
      sourceType: "courtlistener_search",
      extracted: { query: args.query, courts: args.courts, hits_total: args.hitsTotal },
      notes: "CourtListener RECAP search (type=r) for the owner as bankruptcy debtor. Free API.",
    },
  ];
  if (args.match) {
    const m = args.match;
    evidence.push({
      sourceType: "courtlistener_case",
      sourceUrl: m.docket_absolute_url ? `https://www.courtlistener.com${m.docket_absolute_url}` : null,
      extracted: {
        case_name: m.caseName || null,
        docket_number: m.docketNumber || null,
        court: m.court || null,
        date_filed: m.dateFiled || null,
        chapter: (m as any).chapter || null,
        pro_se: args.proSe,
      },
      confidence: { debtor_match: "name tokens matched party/case name" },
      notes: args.proSe
        ? "Pro se filer — debtor completed Form 101 themselves; contact phone most likely present."
        : "Attorney-filed — debtor phone may be omitted; lower hit expectation.",
    });
  }
  if (args.petition) {
    evidence.push({
      sourceType: "courtlistener_petition",
      sourceUrl: args.petition.filepathLocal ? `${STORAGE_BASE}/${args.petition.filepathLocal}` : null,
      extracted: {
        description: args.petition.description,
        document_number: args.petition.documentNumber,
        phones_found: args.phonesFound,
      },
      notes: "Voluntary Petition (Form 101). Contact page usually pp. 8–9. Open the PDF directly from the URL above.",
    });
  }
  return evidence;
}

// ── Provider ────────────────────────────────────────────────────────────────

export class CourtListenerSkipTraceProvider implements SkipTraceProvider {
  name = "courtlistener";

  async skipTrace(input: SkipTraceInput): Promise<SkipTraceOutput> {
    const token = requireEnv("COURTLISTENER_API_TOKEN");
    const ownerName = String(input.ownerName || "").trim();
    const state = String(input.state || "").trim().toUpperCase();
    const courts = courtsForState(state);

    if (!ownerName) {
      return { status: "fail", phones: [], emails: [], costCents: 0, raw: {}, errorMessage: "ownerName is required for CourtListener debtor search" };
    }
    if (!courts.length) {
      return { status: "fail", phones: [], emails: [], costCents: 0, raw: {}, errorMessage: `No bankruptcy courts mapped for state "${state}"` };
    }

    const query = `party:"${ownerName}"`;
    let best: { hit: any; court: string } | null = null;
    let hitsTotal = 0;

    // Search courts in order; stop at the first confident debtor match to
    // conserve the 125/day free quota.
    for (const court of courts) {
      const res = await apiGet("/search/", token, { type: "r", court, q: query });
      if (!res.ok) {
        if (res.status === 429) {
          return { status: "fail", phones: [], emails: [], costCents: 0, raw: res.data, errorMessage: "rate_limited: CourtListener free quota exhausted (5/min, 50/hr, 125/day)" };
        }
        continue; // try next court; a single court failing shouldn't kill the lookup
      }
      const results = Array.isArray(res.data?.results) ? res.data.results : [];
      hitsTotal += typeof res.data?.count === "number" ? res.data.count : results.length;
      const sorted = [...results].sort((a, b) => String(b?.dateFiled || "").localeCompare(String(a?.dateFiled || "")));
      const match = sorted.find((h) => isDebtorMatch(h, ownerName));
      if (match) {
        best = { hit: match, court };
        break;
      }
      await sleep(400); // politeness: stay well under 5/min
    }

    if (!best) {
      return {
        status: "fail",
        phones: [],
        emails: [],
        costCents: 0,
        raw: { query, courts },
        errorMessage: "No bankruptcy case found for this owner",
        evidence: buildEvidence({ query, courts, hitsTotal, match: null, petition: null, proSe: false, phonesFound: 0 }),
      };
    }

    const proSe = isProSe(best.hit);
    const petition = findPetitionDocument(best.hit);

    if (!petition?.filepathLocal) {
      // Case found but no downloadable petition — still valuable evidence.
      return {
        status: "fail",
        phones: [],
        emails: [],
        costCents: 0,
        raw: { query, docket_id: best.hit?.docket_id },
        errorMessage: "Bankruptcy case found but no downloadable Voluntary Petition in RECAP",
        evidence: buildEvidence({ query, courts, hitsTotal, match: best.hit, petition: null, proSe, phonesFound: 0 }),
      };
    }

    // PDF download does NOT consume API quota (different host, public file).
    let pdfText = "";
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs());
      const pdfRes = await fetch(`${STORAGE_BASE}/${petition.filepathLocal}`, { signal: controller.signal });
      clearTimeout(timer);
      if (pdfRes.ok) {
        const buf = new Uint8Array(await pdfRes.arrayBuffer());
        pdfText = extractTextFromPdf(buf);
      }
    } catch {
      pdfText = "";
    }

    const { phones, emails } = extractContactsFromText(pdfText);
    const evidence = buildEvidence({ query, courts, hitsTotal, match: best.hit, petition, proSe, phonesFound: phones.length });

    if (!phones.length && !emails.length) {
      return {
        status: "fail",
        phones: [],
        emails: [],
        costCents: 0,
        raw: { query, docket_id: best.hit?.docket_id, petition_id: petition.id, text_chars: pdfText.length },
        errorMessage: pdfText
          ? "Petition parsed but no phone/email found on the contact page"
          : "Petition PDF had no extractable text (possibly scanned) — open the evidence URL manually",
        evidence,
      };
    }

    return { status: "success", phones: phones.slice(0, 10), emails: emails.slice(0, 10), costCents: 0, raw: { query, docket_id: best.hit?.docket_id }, evidence };
  }
}
