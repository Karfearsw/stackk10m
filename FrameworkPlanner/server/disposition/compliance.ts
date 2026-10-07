/**
 * Disposition broadcast compliance gates (Phase 1).
 *
 * These are SERVER-SIDE, pure, and unit-tested. The blast endpoint applies
 * them to every recipient — never trust the client to pre-filter.
 *
 * Gates, in order:
 *   1. doNotCall → hard suppress on every channel (non-negotiable).
 *   2. Channel consent → smsConsent for SMS, emailConsent for email.
 *   3. Reachability → phone number for SMS, email address for email.
 *   4. Quiet hours → 8:00 AM–9:00 PM in the RECIPIENT's timezone, derived
 *      from the deal's property state (buyers carry no timezone field).
 *
 * Every blast attempt — sent, failed, or suppressed — is logged by the
 * route handler so compliance decisions are auditable.
 */

export const QUIET_HOURS_START = 8; // 8:00 AM, inclusive
export const QUIET_HOURS_END = 21; // 9:00 PM, exclusive

export type BlastChannel = "sms" | "email";

/** Minimal buyer shape the gates need. Extra fields are ignored. */
export interface BlastBuyer {
  id: number;
  name?: string | null;
  phone?: string | null;
  email?: string | null;
  smsConsent?: boolean | null;
  emailConsent?: boolean | null;
  doNotCall?: boolean | null;
}

const STATE_TIMEZONES: Record<string, string> = {
  AL: "America/Chicago",
  AK: "America/Anchorage",
  AZ: "America/Phoenix",
  AR: "America/Chicago",
  CA: "America/Los_Angeles",
  CO: "America/Denver",
  CT: "America/New_York",
  DE: "America/New_York",
  DC: "America/New_York",
  FL: "America/New_York",
  GA: "America/New_York",
  HI: "Pacific/Honolulu",
  ID: "America/Boise",
  IL: "America/Chicago",
  IN: "America/Indiana/Indianapolis",
  IA: "America/Chicago",
  KS: "America/Chicago",
  KY: "America/New_York",
  LA: "America/Chicago",
  ME: "America/New_York",
  MD: "America/New_York",
  MA: "America/New_York",
  MI: "America/Detroit",
  MN: "America/Chicago",
  MS: "America/Chicago",
  MO: "America/Chicago",
  MT: "America/Denver",
  NE: "America/Chicago",
  NV: "America/Los_Angeles",
  NH: "America/New_York",
  NJ: "America/New_York",
  NM: "America/Denver",
  NY: "America/New_York",
  NC: "America/New_York",
  ND: "America/Chicago",
  OH: "America/New_York",
  OK: "America/Chicago",
  OR: "America/Los_Angeles",
  PA: "America/New_York",
  RI: "America/New_York",
  SC: "America/New_York",
  SD: "America/Chicago",
  TN: "America/Chicago",
  TX: "America/Chicago",
  UT: "America/Denver",
  VT: "America/New_York",
  VA: "America/New_York",
  WA: "America/Los_Angeles",
  WV: "America/New_York",
  WI: "America/Chicago",
  WY: "America/Denver",
};

/** Recipient timezone for a US state code; falls back to Eastern. */
export function timeZoneForState(state: unknown): string {
  const code = String(state ?? "").trim().toUpperCase();
  return STATE_TIMEZONES[code] ?? "America/New_York";
}

function hourInTimeZone(at: Date, timeZone: string): number {
  const raw = new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    hour12: false,
    timeZone,
  }).format(at);
  const hour = Number(raw);
  // Some environments render midnight as "24" with hour12:false.
  return hour === 24 ? 0 : hour;
}

/**
 * True when `at` falls inside the 8am–9pm calling window in `timeZone`.
 * Outside this window the blast endpoint suppresses the recipient.
 */
export function isWithinQuietHours(at: Date, timeZone: string): boolean {
  let tz = timeZone;
  try {
    hourInTimeZone(at, tz);
  } catch {
    tz = "America/New_York"; // invalid tz input → safe fallback
  }
  const hour = hourInTimeZone(at, tz);
  return hour >= QUIET_HOURS_START && hour < QUIET_HOURS_END;
}

export interface EligibilityResult {
  eligible: boolean;
  /** Machine-readable reasons, e.g. "do_not_call", "no_sms_consent". */
  reasons: string[];
}

/**
 * Per-buyer, per-channel eligibility. Order matters: DNC is checked first
 * and short-circuits everything else.
 */
export function buyerChannelEligibility(
  buyer: BlastBuyer,
  channel: BlastChannel,
): EligibilityResult {
  const reasons: string[] = [];

  if (buyer.doNotCall) {
    return { eligible: false, reasons: ["do_not_call"] };
  }

  if (channel === "sms") {
    if (buyer.smsConsent !== true) reasons.push("no_sms_consent");
    if (!buyer.phone || !String(buyer.phone).trim()) reasons.push("no_phone");
  } else {
    if (buyer.emailConsent !== true) reasons.push("no_email_consent");
    if (!buyer.email || !String(buyer.email).trim()) reasons.push("no_email");
  }

  return { eligible: reasons.length === 0, reasons };
}

export interface PlannedRecipient {
  buyer: BlastBuyer;
  /** 0–100 match score (already normalized by the caller). */
  score: number;
}

export interface SuppressedRecipient {
  buyer: BlastBuyer;
  score: number;
  reasons: string[];
}

export interface BlastPlan {
  eligible: PlannedRecipient[];
  suppressed: SuppressedRecipient[];
  timeZone: string;
  withinQuietHours: boolean;
}

/**
 * Apply every gate to a candidate recipient list. Returns the sendable set
 * plus the suppressed set with reasons — the caller logs both.
 */
export function planBlastRecipients(
  candidates: PlannedRecipient[],
  opts: {
    channel: BlastChannel;
    minScore: number;
    now: Date;
    timeZone: string;
    maxRecipients?: number;
  },
): BlastPlan {
  const withinQuietHours = isWithinQuietHours(opts.now, opts.timeZone);
  const eligible: PlannedRecipient[] = [];
  const suppressed: SuppressedRecipient[] = [];

  for (const candidate of candidates) {
    const reasons: string[] = [];
    if (candidate.score < opts.minScore) reasons.push("below_score_threshold");

    const gate = buyerChannelEligibility(candidate.buyer, opts.channel);
    if (!gate.eligible) reasons.push(...gate.reasons);

    if (!withinQuietHours) reasons.push("quiet_hours");

    if (reasons.length === 0) eligible.push(candidate);
    else suppressed.push({ ...candidate, reasons });
  }

  // Highest score first; cap the sendable set as a blast-radius guard.
  eligible.sort((a, b) => b.score - a.score);
  const max = opts.maxRecipients ?? 100;
  const overflow = eligible.splice(max);
  for (const o of overflow) {
    suppressed.push({ ...o, reasons: ["over_recipient_cap"] });
  }

  return { eligible, suppressed, timeZone: opts.timeZone, withinQuietHours };
}

/**
 * Replace {tokens} in a blast template. Unknown tokens are left as-is so a
 * typo is visible instead of silently sending a blank.
 */
export function personalizeBlastMessage(
  template: string,
  vars: Record<string, string | number | null | undefined>,
): string {
  return String(template).replace(/\{(\w+)\}/g, (match, key: string) => {
    const value = vars[key];
    if (value === null || value === undefined || value === "") return match;
    return String(value);
  });
}
