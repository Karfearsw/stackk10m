import type { SkipTraceInput, SkipTraceOutput, SkipTraceProvider } from "./provider.js";
import {
  looksLikeEntity,
  normalizePhone,
  splitName,
  buildEvidence,
  type ExtractedPerson,
} from "./tracerfy.js";

/**
 * Tracerfy BATCH skip-trace provider — cheaper paid path than instant.
 *
 * Async flow (docs: https://www.tracerfy.com/skip-tracing-api-documentation/):
 *   POST {base}/v1/api/trace/            → { queue_id, estimated_wait_seconds }
 *   GET  {base}/v1/api/queue/{id}        → records for rows that produced a match
 *                                         (one record per matched input row;
 *                                         rows with no match do not appear)
 *
 * Single-lead batches: one row per job. trace_type is chosen per lead:
 *   - owner name is a person → 'normal'  (1 credit/hit = $0.02)
 *   - owner is an entity/unknown       → 'advanced' (2 credits/hit = $0.04,
 *                                         owner discovery from the address)
 * Misses are free. 402 → insufficient_credits (same convention as instant).
 *
 * Env:
 *   TRACERFY_API_KEY                    required — Bearer token
 *   TRACERFY_API_BASE_URL               optional — default https://tracerfy.com/v1/api
 *                                       (sandbox: https://mock.tracerfy.com/v1/api)
 *   TRACERFY_BATCH_POLL_MS              optional — poll interval (default 10000)
 *   TRACERFY_BATCH_TIMEOUT_MS           optional — overall timeout (default 300000)
 *   TRACERFY_BATCH_COST_CENTS_PER_HIT   optional — fallback normal cost (default 2)
 *   TRACERFY_BATCH_COST_CENTS_PER_HIT_ADVANCED optional — fallback advanced cost (default 4)
 *
 * Select with SKIP_TRACE_PROVIDER=tracerfy-batch (or per-job providerName).
 */

// ── Pure helpers (exported for unit tests) ─────────────────────────────────

export type BatchTraceType = "normal" | "advanced";

/** Choose the trace type: target a known person (normal) or discover the owner (advanced). */
export function chooseBatchTraceType(input: SkipTraceInput): BatchTraceType {
  const ownerName = String(input.ownerName || "").trim();
  if (ownerName && !looksLikeEntity(ownerName)) {
    const { firstName, lastName } = splitName(ownerName);
    if (firstName && lastName) return "normal";
  }
  return "advanced";
}

export type BatchSubmitBody = {
  /** Form/JSON fields for POST /v1/api/trace/ */
  fields: Record<string, string>;
  /** The single-row json_data payload */
  rows: Array<Record<string, string>>;
};

/**
 * Build the batch submit payload. Column names are fixed and mapped through
 * the *_column fields, with exactly one row in json_data.
 */
export function buildBatchSubmitBody(input: SkipTraceInput): BatchSubmitBody {
  const traceType = chooseBatchTraceType(input);
  const fields: Record<string, string> = {
    address_column: "address",
    city_column: "city",
    state_column: "state",
    zip_column: "zip",
    trace_type: traceType,
  };
  const row: Record<string, string> = {
    address: String(input.address || "").trim(),
    city: String(input.city || "").trim(),
    state: String(input.state || "").trim(),
    zip: String(input.zipCode || "").trim(),
  };
  if (traceType === "normal") {
    const { firstName, lastName } = splitName(String(input.ownerName || "").trim());
    fields.first_name_column = "first_name";
    fields.last_name_column = "last_name";
    row.first_name = firstName;
    row.last_name = lastName;
  }
  return { fields, rows: [row] };
}

/** Extract the queue id from a batch submit response. */
export function extractQueueId(data: any): string | null {
  if (!data || typeof data !== "object") return null;
  for (const key of ["queue_id", "queueId", "id", "job_id", "jobId"]) {
    const v = (data as any)[key];
    if (v !== null && v !== undefined && String(v).trim()) return String(v).trim();
  }
  return null;
}

function coerceStringArray(v: unknown): string[] {
  if (Array.isArray(v)) return v.map((x) => String(x ?? "").trim()).filter(Boolean);
  if (typeof v === "string" && v.trim()) return [v.trim()];
  return [];
}

function coercePhoneObjects(v: unknown): Array<{ number: string }> {
  if (!Array.isArray(v)) return coerceStringArray(v).map((s) => ({ number: s }));
  return v
    .map((ph) => {
      if (typeof ph === "string") return { number: ph };
      if (ph && typeof ph === "object") return { number: String((ph as any).number ?? (ph as any).phone ?? "") };
      return { number: "" };
    })
    .filter((ph) => ph.number.trim());
}

/**
 * Map queue result rows to ExtractedPerson entries.
 * Batch rows carry basic contact data; person details are sparse, so the
 * input owner name is used as the fallback display name.
 */
export function mapBatchRowsToPersons(rows: unknown, fallbackOwnerName: string): ExtractedPerson[] {
  const list = Array.isArray(rows) ? rows : [];
  const persons: ExtractedPerson[] = [];
  for (const row of list) {
    if (!row || typeof row !== "object") continue;
    const r = row as any;
    const phoneObjs = coercePhoneObjects(r.phones ?? r.phone_numbers ?? r.phoneNumbers ?? r.contact_phones);
    const phones = phoneObjs
      .map((ph) => ({
        number: normalizePhone(ph.number),
        type: typeof r.phone_type === "string" ? r.phone_type : null,
        dnc: typeof r.dnc === "boolean" ? r.dnc : null,
        tcpa: typeof r.tcpa === "boolean" ? r.tcpa : null,
        carrier: typeof r.carrier === "string" ? r.carrier : null,
        rank: null as number | null,
      }))
      .filter((ph) => !!ph.number) as ExtractedPerson["phones"];
    const emails = coerceStringArray(r.emails ?? r.email_addresses ?? r.emailAddresses)
      .map((e) => e.toLowerCase())
      .filter((e) => e.includes("@"))
      .map((email) => ({ email, rank: null as number | null }));
    const fullName = String(r.full_name ?? r.fullName ?? [r.first_name, r.last_name].filter(Boolean).join(" ") ?? "").trim() || String(fallbackOwnerName || "").trim();
    if (!phones.length && !emails.length) continue;
    persons.push({
      fullName,
      deceased: r.deceased === true,
      litigator: r.litigator === true,
      propertyOwner: r.property_owner === true,
      mailingAddress: null,
      phones,
      emails,
    });
  }
  return persons;
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

/** Fallback cost when the response does not echo credits_deducted. */
export function parseBatchCostCentsPerHit(traceType: BatchTraceType): number {
  const envName = traceType === "advanced" ? "TRACERFY_BATCH_COST_CENTS_PER_HIT_ADVANCED" : "TRACERFY_BATCH_COST_CENTS_PER_HIT";
  const raw = String(process.env[envName] || "").trim();
  const n = raw ? Number(raw) : NaN;
  if (!Number.isFinite(n) || n < 0) return traceType === "advanced" ? 4 : 2;
  return Math.floor(n);
}

function parsePollMs(): number {
  const raw = process.env.TRACERFY_BATCH_POLL_MS;
  const n = raw === undefined ? NaN : Number(raw);
  if (!Number.isFinite(n) || n < 2000) return 10_000;
  return Math.floor(n);
}

function parseTimeoutMs(): number {
  const raw = process.env.TRACERFY_BATCH_TIMEOUT_MS;
  const n = raw === undefined ? NaN : Number(raw);
  if (!Number.isFinite(n) || n < 30_000) return 300_000;
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

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function postJson(url: string, apiKey: string, payload: Record<string, unknown>, timeoutMs: number): Promise<{ res: Response; data: any }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        accept: "application/json",
        "content-type": "application/json",
        authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    const data = await res.json().catch(() => ({}));
    return { res, data };
  } finally {
    clearTimeout(timer);
  }
}

async function getJson(url: string, apiKey: string, timeoutMs: number): Promise<{ res: Response; data: any }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      method: "GET",
      headers: { accept: "application/json", authorization: `Bearer ${apiKey}` },
      signal: controller.signal,
    });
    const data = await res.json().catch(() => ({}));
    return { res, data };
  } finally {
    clearTimeout(timer);
  }
}

function failOut(message: string, raw: unknown, costCents = 0): SkipTraceOutput {
  return { status: "fail", phones: [], emails: [], costCents, raw, errorMessage: message };
}

// ── Provider ────────────────────────────────────────────────────────────────

export class TracerfyBatchSkipTraceProvider implements SkipTraceProvider {
  name = "tracerfy-batch";

  async skipTrace(input: SkipTraceInput): Promise<SkipTraceOutput> {
    const apiKey = requireEnv("TRACERFY_API_KEY");
    const base = baseUrl();
    const requestTimeoutMs = 30_000;
    const submit = buildBatchSubmitBody(input);
    const traceType = submit.fields.trace_type as BatchTraceType;
    const payload = { ...submit.fields, json_data: submit.rows };

    // 1) Submit the single-row batch.
    let queueId: string | null = null;
    let estimatedWaitSeconds: number | null = null;
    try {
      const { res, data } = await postJson(`${base}/trace/`, apiKey, payload, requestTimeoutMs);
      if (res.status === 402) {
        return failOut("insufficient_credits: Tracerfy balance is empty — top up credits in the Tracerfy dashboard.", data);
      }
      if (res.status === 429) {
        return failOut("rate_limited: Tracerfy batch submission limit reached (10 per 5 minutes).", data);
      }
      if (res.status === 503) {
        return failOut("Tracerfy enhanced/batch trace temporarily unavailable (HTTP 503).", data);
      }
      if (!res.ok) {
        const msg = typeof (data as any)?.error === "string" ? (data as any).error : `Tracerfy batch submit failed (HTTP ${res.status})`;
        return failOut(msg, data);
      }
      queueId = extractQueueId(data);
      const est = Number((data as any)?.estimated_wait_seconds);
      estimatedWaitSeconds = Number.isFinite(est) && est > 0 ? est : null;
      if (!queueId) return failOut("Tracerfy batch submit did not return a queue id.", data);
    } catch (e: any) {
      const aborted = e?.name === "AbortError";
      return failOut(aborted ? "Tracerfy batch submit timed out" : `Tracerfy batch submit failed: ${String(e?.message || e)}`, { error: String(e?.message || e) });
    }

    // 2) Poll the queue until rows appear (misses never appear → timeout = miss-or-slow).
    const pollMs = parsePollMs();
    const timeoutMs = parseTimeoutMs();
    const startedAt = Date.now();
    const requestId = queueId;
    while (Date.now() - startedAt < timeoutMs) {
      await sleep(pollMs);
      try {
        const { res, data } = await getJson(`${base}/queue/${encodeURIComponent(requestId)}`, apiKey, requestTimeoutMs);
        if (res.status === 404) return failOut(`Tracerfy batch queue not found (id ${requestId}).`, data);
        if (res.status === 403) return failOut(`Tracerfy batch queue belongs to another account (id ${requestId}).`, data);
        if (res.status === 402) return failOut("insufficient_credits: Tracerfy balance is empty — top up credits in the Tracerfy dashboard.", data);
        if (!res.ok) continue; // transient — keep polling
        const rows = Array.isArray(data) ? data : Array.isArray((data as any)?.rows) ? (data as any).rows : [];
        if (rows.length) {
          const persons = mapBatchRowsToPersons(rows, String(input.ownerName || "").trim());
          if (!persons.length) {
            return {
              ...failOut("Tracerfy batch returned rows but no usable phones or emails", data),
              evidence: buildEvidence({ hit: true, batch: true, trace_type: traceType, queue_id: queueId }, []),
            };
          }
          const phones = uniqStrings(persons.flatMap((p) => p.phones.map((ph) => ph.number))).slice(0, 10);
          const emails = uniqStrings(persons.flatMap((p) => p.emails.map((e) => e.email))).slice(0, 10);
          const credits = typeof (data as any)?.credits_deducted === "number" ? (data as any).credits_deducted : null;
          const costCents = credits !== null ? Math.round(credits * 2) : parseBatchCostCentsPerHit(traceType);
          return {
            status: "success",
            phones,
            emails,
            costCents,
            raw: data,
            evidence: buildEvidence({ hit: true, batch: true, trace_type: traceType, queue_id: queueId, credits_deducted: credits }, persons),
          };
        }
        // Empty so far — could still be processing; keep polling.
      } catch {
        // Transient network error — keep polling.
      }
    }

    const elapsedSec = Math.round((Date.now() - startedAt) / 1000);
    return failOut(
      `Tracerfy batch trace timed out after ${elapsedSec}s with no result rows (queue ${requestId}). The address may be a miss — check the Tracerfy dashboard.`,
      { queue_id: queueId, estimated_wait_seconds: estimatedWaitSeconds, elapsed_seconds: elapsedSec },
    );
  }
}

