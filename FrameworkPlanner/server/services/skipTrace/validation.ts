import type { SkipTraceProviderEvidence } from "./provider.js";

/**
 * Free-tier phone validation waterfall ("poor man's waterfall").
 *
 * VALIDATES numbers the hub already has — it never discovers new ones.
 * Runs cheapest-first; the first configured layer that answers wins per number.
 *
 * Layers:
 *   0. Local E.164 normalization (always, offline, unlimited, $0).
 *   1. Veriphone      — 1,000/mo free, no card. Carrier + line type.
 *   2. IPQualityScore — 1,000/mo free (35/day cap). Adds fraud_score,
 *                       active status, do_not_call + tcpa_blacklist flags.
 *   3. Numverify      — 100/mo free. Backup carrier + line type.
 *
 * Env (all optional):
 *   SKIP_TRACE_VALIDATION_ENABLED  "true" | "false" | unset (default: enabled
 *                                  automatically when any key below is set)
 *   VERIPHONE_API_KEY
 *   IPQS_API_KEY
 *   NUMVERIFY_API_KEY
 *
 * Validation informs — it never vetoes, except for numbers that fail basic
 * format checks (useless to the dialer). High fraud scores and DNC/TCPA flags
 * are recorded as evidence for routing decisions, not silent drops.
 */

export type ValidatedPhone = {
  phone: string; // E.164
  layer: "veriphone" | "ipqs" | "numverify" | "format-only";
  valid: boolean | null;
  carrier: string | null;
  lineType: string | null;
  fraudScore: number | null;
  active: boolean | null;
  doNotCall: boolean | null;
  tcpaBlacklist: boolean | null;
};

export function normalizePhone(raw: string): string | null {
  const s = String(raw || "").trim();
  if (!s) return null;
  if (s.startsWith("+")) {
    const digits = "+" + s.slice(1).replace(/\D/g, "");
    return digits.length >= 11 && digits.length <= 16 ? digits : null;
  }
  const digits = s.replace(/\D/g, "");
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  return null;
}

export function validationConfig(): {
  enabled: boolean;
  veriphoneKey: string | null;
  ipqsKey: string | null;
  numverifyKey: string | null;
} {
  const veriphoneKey = strOrNull(process.env.VERIPHONE_API_KEY);
  const ipqsKey = strOrNull(process.env.IPQS_API_KEY);
  const numverifyKey = strOrNull(process.env.NUMVERIFY_API_KEY);
  const flag = String(process.env.SKIP_TRACE_VALIDATION_ENABLED || "").trim().toLowerCase();
  const anyKey = !!(veriphoneKey || ipqsKey || numverifyKey);
  const enabled = flag === "false" ? false : flag === "true" ? true : anyKey;
  return { enabled, veriphoneKey, ipqsKey, numverifyKey };
}

export function isValidationEnabled(): boolean {
  return validationConfig().enabled;
}

function strOrNull(v: unknown): string | null {
  const s = String(v || "").trim();
  return s ? s : null;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function fetchJson(url: string, timeoutMs = 15_000): Promise<{ ok: boolean; data: any }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { headers: { accept: "application/json" }, signal: controller.signal });
    const data = await res.json().catch(() => ({}));
    return { ok: res.ok, data };
  } catch {
    return { ok: false, data: {} };
  } finally {
    clearTimeout(timer);
  }
}

async function veriphoneLookup(phone: string, key: string): Promise<ValidatedPhone | null> {
  const url = `https://api.veriphone.io/v3/verify?phone=${encodeURIComponent(phone)}&key=${encodeURIComponent(key)}`;
  const { ok, data } = await fetchJson(url);
  if (!ok) return null;
  return {
    phone,
    layer: "veriphone",
    valid: typeof data?.phone_valid === "boolean" ? data.phone_valid : null,
    carrier: typeof data?.carrier === "string" ? data.carrier : null,
    lineType: typeof data?.phone_type === "string" ? data.phone_type : null,
    fraudScore: null,
    active: null,
    doNotCall: null,
    tcpaBlacklist: null,
  };
}

async function ipqsLookup(phone: string, key: string): Promise<ValidatedPhone | null> {
  const url = `https://www.ipqualityscore.com/api/json/phone/${encodeURIComponent(key)}/${encodeURIComponent(phone)}?strictness=1`;
  const { ok, data } = await fetchJson(url);
  if (!ok || data?.success === false) return null;
  return {
    phone,
    layer: "ipqs",
    valid: typeof data?.valid === "boolean" ? data.valid : null,
    carrier: typeof data?.carrier === "string" ? data.carrier : null,
    lineType: typeof data?.line_type === "string" ? data.line_type : null,
    fraudScore: typeof data?.fraud_score === "number" ? data.fraud_score : null,
    active: typeof data?.active === "boolean" ? data.active : null,
    doNotCall: typeof data?.do_not_call === "boolean" ? data.do_not_call : null,
    tcpaBlacklist: typeof data?.tcpa_blacklist === "boolean" ? data.tcpa_blacklist : null,
  };
}

async function numverifyLookup(phone: string, key: string): Promise<ValidatedPhone | null> {
  const url = `https://apilayer.net/api/validate?access_key=${encodeURIComponent(key)}&number=${encodeURIComponent(phone.replace(/^\+/, ""))}&country_code=US`;
  const { ok, data } = await fetchJson(url);
  if (!ok || data?.valid !== true) return data?.valid === false ? { ...emptyResult(phone, "numverify"), valid: false } : null;
  return {
    phone,
    layer: "numverify",
    valid: true,
    carrier: typeof data?.carrier === "string" ? data.carrier : null,
    lineType: typeof data?.line_type === "string" ? data.line_type : null,
    fraudScore: null,
    active: null,
    doNotCall: null,
    tcpaBlacklist: null,
  };
}

function emptyResult(phone: string, layer: ValidatedPhone["layer"]): ValidatedPhone {
  return { phone, layer, valid: null, carrier: null, lineType: null, fraudScore: null, active: null, doNotCall: null, tcpaBlacklist: null };
}

function toEvidence(v: ValidatedPhone): SkipTraceProviderEvidence {
  const flags: string[] = [];
  if (v.doNotCall === true) flags.push("do_not_call");
  if (v.tcpaBlacklist === true) flags.push("tcpa_blacklist");
  if (typeof v.fraudScore === "number" && v.fraudScore >= 85) flags.push("high_fraud_score");
  if (v.active === false) flags.push("inactive_line");
  return {
    sourceType: "phone_validation",
    extracted: {
      phone: v.phone,
      layer: v.layer,
      valid: v.valid,
      carrier: v.carrier,
      line_type: v.lineType,
      fraud_score: v.fraudScore,
      active: v.active,
      do_not_call: v.doNotCall,
      tcpa_blacklist: v.tcpaBlacklist,
    },
    confidence: { layer: v.layer },
    notes: flags.length
      ? `Validation flags: ${flags.join(", ")} — route carefully, do not auto-dial.`
      : `Validated via ${v.layer}.`,
  };
}

/**
 * Run the waterfall over a phone list. Returns the cleaned list (format-valid
 * E.164, deduped, original order preserved) plus per-number evidence.
 * Never throws — validation must never block enrichment.
 */
export async function validatePhones(phones: string[]): Promise<{ phones: string[]; evidence: SkipTraceProviderEvidence[] }> {
  const cfg = validationConfig();
  const cleaned: string[] = [];
  const seen = new Set<string>();
  for (const p of phones || []) {
    const n = normalizePhone(p);
    if (n && !seen.has(n)) {
      seen.add(n);
      cleaned.push(n);
    }
  }
  const evidence: SkipTraceProviderEvidence[] = [];
  if (!cfg.enabled || !cleaned.length) return { phones: cleaned, evidence };

  for (const phone of cleaned) {
    let result: ValidatedPhone | null = null;
    try {
      if (cfg.veriphoneKey) result = await veriphoneLookup(phone, cfg.veriphoneKey);
      if (!result && cfg.ipqsKey) result = await ipqsLookup(phone, cfg.ipqsKey);
      if (!result && cfg.numverifyKey) result = await numverifyLookup(phone, cfg.numverifyKey);
    } catch {
      result = null;
    }
    evidence.push(toEvidence(result || emptyResult(phone, "format-only")));
    await sleep(250); // politeness across free tiers
  }
  return { phones: cleaned, evidence };
}
