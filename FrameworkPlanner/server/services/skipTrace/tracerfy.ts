import type { SkipTraceInput, SkipTraceOutput, SkipTraceProvider, SkipTraceProviderEvidence } from "./provider.js";

/**
 * Tracerfy skip-trace provider — cheapest paid path in the hub.
 *
 * Uses the synchronous instant-lookup endpoint:
 *   POST {base}/trace/lookup/   (default base: https://tracerfy.com/v1/api)
 * Docs: https://www.tracerfy.com/skip-tracing-api-documentation/
 * Sandbox (deterministic fake data, zero billing): https://mock.tracerfy.com/v1/api
 *
 * Pricing: 5 credits per hit on the instant endpoint (1 credit = $0.02,
 * so $0.10/hit); misses are free. The response echoes `credits_deducted`,
 * which is treated as the source of truth for costCents.
 *
 * NOTE on cost: Tracerfy's *batch* endpoint (POST /v1/api/trace/) is cheaper
 * (1 credit = $0.02/hit) but async (queue + poll/webhook). This provider
 * implements the sync instant endpoint to fit the hub's SkipTraceProvider
 * contract. If volume justifies it, add a batch provider later.
 *
 * Env:
 *   TRACERFY_API_KEY            required — Bearer token from the Tracerfy dashboard
 *   TRACERFY_API_BASE_URL       optional — default https://tracerfy.com/v1/api
 *                             (use https://mock.tracerfy.com/v1/api for sandbox)
 *   TRACERFY_COST_CENTS_PER_HIT optional — fallback cost when the response does
 *                             not echo credits_deducted (default 10 = $0.10)
 *   TRACERFY_TIMEOUT_MS         optional — request timeout (default 30000)
 *
 * Select with SKIP_TRACE_PROVIDER=tracerfy.
 */

// ── Pure helpers (exported for unit tests) ─────────────────────────────────

const ENTITY_KEYWORDS = /\b(llc|inc|ltd|lp|llp|plc|corp|corporation|trust|holdings|properties|partners|ventures|capital|management|realty|investment|church|ministry)\b/i;

/** True when the "owner name" looks like a company/trust rather than a person. */
export function looksLikeEntity(name: string): boolean {
  return ENTITY_KEYWORDS.test(String(name || "").trim());
}

export function splitName(full: string): { firstName: string; middleName: string; lastName: string } {
  const parts = String(full || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (parts.length === 0) return { firstName: "", middleName: "", lastName: "" };
  if (parts.length === 1) return { firstName: parts[0] || "", middleName: "", lastName: "" };
  if (parts.length === 2) return { firstName: parts[0] || "", middleName: "", lastName: parts[1] || "" };
  return { firstName: parts[0] || "", middleName: parts.slice(1, -1).join(" "), lastName: parts[parts.length - 1] || "" };
}

export function normalizePhone(raw: string): string | null {
  const s = String(raw || "").trim();
  if (!s) return null;
  if (s.startsWith("+")) {
    const digits = "+" + s.slice(1).replace(/\D/g, "");
    return digits.length >= 11 ? digits : null;
  }
  const digits = s.replace(/\D/g, "");
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  if (digits.length >= 12 && digits.length <= 15) return `+${digits}`;
  return null;
}

export type TraceLookupBody = {
  address: string;
  city: string;
  state: string;
  zip?: string;
  find_owner: boolean;
  first_name?: string;
  last_name?: string;
};

/**
 * Build the POST /trace/lookup/ body.
 * When we know a *person* owner name, target them specifically
 * (find_owner=false). Otherwise let Tracerfy find the owner from the address.
 */
export function buildTraceLookupBody(input: SkipTraceInput): TraceLookupBody {
  const ownerName = String(input.ownerName || "").trim();
  const body: TraceLookupBody = {
    address: String(input.address || "").trim(),
    city: String(input.city || "").trim(),
    state: String(input.state || "").trim(),
    find_owner: true,
  };
  const zip = String(input.zipCode || "").trim();
  if (zip) body.zip = zip;
  if (ownerName && !looksLikeEntity(ownerName)) {
    const { firstName, lastName } = splitName(ownerName);
    if (firstName && lastName) {
      body.find_owner = false;
      body.first_name = firstName;
      body.last_name = lastName;
    }
  }
  return body;
}

export type ExtractedPerson = {
  fullName: string;
  deceased: boolean;
  litigator: boolean;
  propertyOwner: boolean;
  mailingAddress: string | null;
  phones: Array<{ number: string; type: string | null; dnc: boolean | null; tcpa: boolean | null; carrier: string | null; rank: number | null }>;
  emails: Array<{ email: string; rank: number | null }>;
};

export function extractPersons(data: any): ExtractedPerson[] {
  const persons = Array.isArray(data?.persons) ? data.persons : [];
  return persons.map((p: any) => {
    const ma = p?.mailing_address;
    return {
      fullName: String(p?.full_name || [p?.first_name, p?.last_name].filter(Boolean).join(" ") || "").trim(),
      deceased: p?.deceased === true,
      litigator: p?.litigator === true,
      propertyOwner: p?.property_owner === true,
      mailingAddress:
        ma && (ma.street || ma.city)
          ? [ma.street, ma.city, ma.state, ma.zip].filter(Boolean).join(", ")
          : null,
      phones: (Array.isArray(p?.phones) ? p.phones : [])
        .map((ph: any) => ({
          number: normalizePhone(String(ph?.number ?? "")),
          type: typeof ph?.type === "string" ? ph.type : null,
          dnc: typeof ph?.dnc === "boolean" ? ph.dnc : null,
          tcpa: typeof ph?.tcpa === "boolean" ? ph.tcpa : null,
          carrier: typeof ph?.carrier === "string" ? ph.carrier : null,
          rank: typeof ph?.rank === "number" ? ph.rank : null,
        }))
        .filter((ph: any) => !!ph.number),
      emails: (Array.isArray(p?.emails) ? p.emails : [])
        .map((e: any) => ({
          email: String(e?.email ?? "").trim().toLowerCase(),
          rank: typeof e?.rank === "number" ? e.rank : null,
        }))
        .filter((e: any) => e.email.includes("@")),
    };
  });
}

function uniqStrings(values: Array<string | null>): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const v of values) {
    const s = String(v || "").trim();
    if (!s || seen.has(s)) continue;
    seen.add(s);
    out.push(s);
  }
  return out;
}

function byRank<T extends { rank: number | null }>(items: T[]): T[] {
  return [...items].sort((a, b) => (a.rank ?? 999) - (b.rank ?? 999));
}

function parseCostCentsPerHit(): number {
  const raw = process.env.TRACERFY_COST_CENTS_PER_HIT;
  const n = raw === undefined ? NaN : Number(raw);
  if (!Number.isFinite(n) || n < 0) return 10; // 5 credits × $0.02
  return Math.floor(n);
}

function parseTimeoutMs(): number {
  const raw = process.env.TRACERFY_TIMEOUT_MS;
  const n = raw === undefined ? NaN : Number(raw);
  if (!Number.isFinite(n) || n <= 0) return 30_000;
  return Math.floor(n);
}

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v || !String(v).trim()) throw new Error(`${name} is not configured`);
  return String(v).trim();
}

function baseUrl(): string {
  return String(process.env.TRACERFY_API_BASE_URL || "https://tracerfy.com/v1/api")
    .trim()
    .replace(/\/+$/, "");
}

function buildEvidence(data: any, persons: ExtractedPerson[]): SkipTraceProviderEvidence[] {
  const evidence: SkipTraceProviderEvidence[] = [];
  const meta = data?.meta || {};
  evidence.push({
    sourceType: "tracerfy_trace_lookup",
    extracted: {
      hit: data?.hit === true,
      persons_count: typeof data?.persons_count === "number" ? data.persons_count : persons.length,
      credits_deducted: typeof data?.credits_deducted === "number" ? data.credits_deducted : null,
    },
    confidence: { request_id: typeof meta.request_id === "string" ? meta.request_id : null },
    notes: "Tracerfy instant lookup (POST /trace/lookup/). Misses are free; hits deduct credits.",
  });
  for (const p of persons.slice(0, 5)) {
    evidence.push({
      sourceType: "tracerfy_person",
      extracted: {
        full_name: p.fullName || null,
        deceased: p.deceased,
        litigator: p.litigator,
        property_owner: p.propertyOwner,
        mailing_address: p.mailingAddress,
        phones: p.phones.map((ph) => ({
          number: ph.number,
          type: ph.type,
          dnc: ph.dnc,
          tcpa: ph.tcpa,
          carrier: ph.carrier,
        })),
        emails: p.emails.map((e) => e.email),
      },
      confidence: { source: "tracerfy", rank_ordered: true },
      notes:
        p.deceased === true
          ? "Tracerfy flags this person as deceased — suppress from dialer, route to heir workflow."
          : p.litigator === true
            ? "Tracerfy flags this person as a litigator — elevated TCPA risk, review before dialing."
            : null,
    });
  }
  return evidence;
}

// ── Provider ────────────────────────────────────────────────────────────────

export class TracerfySkipTraceProvider implements SkipTraceProvider {
  name = "tracerfy";

  async skipTrace(input: SkipTraceInput): Promise<SkipTraceOutput> {
    const apiKey = requireEnv("TRACERFY_API_KEY");
    const url = `${baseUrl()}/trace/lookup/`;
    const body = buildTraceLookupBody(input);
    const timeoutMs = parseTimeoutMs();

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    let res: Response;
    let data: any = {};
    try {
      res = await fetch(url, {
        method: "POST",
        headers: {
          accept: "application/json",
          "content-type": "application/json",
          authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      data = await res.json().catch(() => ({}));
    } catch (e: any) {
      clearTimeout(timer);
      const aborted = e?.name === "AbortError";
      return {
        status: "fail",
        phones: [],
        emails: [],
        costCents: 0,
        raw: { error: String(e?.message || e) },
        errorMessage: aborted ? `Tracerfy request timed out after ${timeoutMs}ms` : `Tracerfy request failed: ${String(e?.message || e)}`,
      };
    }
    clearTimeout(timer);

    // 402 = out of credits — surface distinctly so ops can alert on balance.
    if (res.status === 402) {
      return {
        status: "fail",
        phones: [],
        emails: [],
        costCents: 0,
        raw: data,
        errorMessage: "insufficient_credits: Tracerfy balance is empty — top up credits in the Tracerfy dashboard.",
      };
    }
    if (res.status === 429) {
      const retryAfter = (data as any)?.retry_after_seconds;
      return {
        status: "fail",
        phones: [],
        emails: [],
        costCents: 0,
        raw: data,
        errorMessage: `rate_limited: Tracerfy rate limit hit${retryAfter ? ` (retry after ${retryAfter}s)` : ""}.`,
      };
    }
    if (!res.ok) {
      const msg = typeof (data as any)?.message === "string" ? (data as any).message : `Tracerfy request failed (HTTP ${res.status})`;
      return { status: "fail", phones: [], emails: [], costCents: 0, raw: data, errorMessage: msg };
    }

    // Misses are free — never report cost on a miss.
    if (data?.hit !== true) {
      return {
        status: "fail",
        phones: [],
        emails: [],
        costCents: 0,
        raw: data,
        errorMessage: "No hits found",
        evidence: buildEvidence(data, []),
      };
    }

    const persons = extractPersons(data);
    const phones = uniqStrings(persons.flatMap((p) => byRank(p.phones).map((ph) => ph.number))).slice(0, 10);
    const emails = uniqStrings(persons.flatMap((p) => byRank(p.emails).map((e) => e.email))).slice(0, 10);

    // credits_deducted echoed in the response is the source of truth for cost.
    const credits = typeof data?.credits_deducted === "number" ? data.credits_deducted : null;
    const costCents = credits !== null ? Math.round(credits * 2) : parseCostCentsPerHit();

    if (!phones.length && !emails.length) {
      return {
        status: "fail",
        phones: [],
        emails: [],
        costCents,
        raw: data,
        errorMessage: "Tracerfy returned a hit but no usable phones or emails",
        evidence: buildEvidence(data, persons),
      };
    }

    return {
      status: "success",
      phones,
      emails,
      costCents,
      raw: data,
      evidence: buildEvidence(data, persons),
    };
  }
}
