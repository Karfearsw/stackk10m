/**
 * Spend caps + kill switch for paid skip-trace lookups.
 *
 * Env:
 *   SKIP_TRACE_DAILY_SPEND_CENTS_CAP    optional — 0/unset = unlimited
 *   SKIP_TRACE_MONTHLY_SPEND_CENTS_CAP  optional — 0/unset = unlimited
 *   SKIP_TRACE_KILL_SWITCH              optional — "true" blocks ALL paid lookups
 *
 * The DB-backed kill_switch setting (skip_trace_settings) overrides the env.
 * All amounts are integer cents.
 */

// ── Pure helpers (exported for unit tests) ─────────────────────────────────

export type SpendCaps = {
  dailyCapCents: number;
  monthlyCapCents: number;
};

export function parseSpendCaps(env: Record<string, string | undefined>): SpendCaps {
  const toInt = (v: string | undefined): number => {
    const n = v === undefined ? NaN : Number(String(v).trim());
    if (!Number.isFinite(n) || n < 0) return 0;
    return Math.floor(n);
  };
  return {
    dailyCapCents: toInt(env.SKIP_TRACE_DAILY_SPEND_CENTS_CAP),
    monthlyCapCents: toInt(env.SKIP_TRACE_MONTHLY_SPEND_CENTS_CAP),
  };
}

export function parseKillSwitchEnv(env: Record<string, string | undefined>): boolean {
  return String(env.SKIP_TRACE_KILL_SWITCH || "").trim().toLowerCase() === "true";
}

export type SpendCheckInput = {
  /** Effective kill-switch state (env or DB setting). */
  killSwitch: boolean;
  caps: SpendCaps;
  /** Spend in the current calendar day, cents. */
  dailySpendCents: number;
  /** Spend in the current calendar month, cents. */
  monthlySpendCents: number;
  /** Estimated cost of the lookup about to run, cents. 0 = free. */
  estimatedCostCents: number;
};

export type SpendCheckResult =
  | { blocked: true; reason: "kill_switch" | "daily_cap" | "monthly_cap" }
  | { blocked: false; reason: null };

/**
 * Decide whether a paid lookup may run. A lookup is blocked when it would
 * push daily or monthly spend over the cap (caps of 0 = unlimited).
 */
export function checkSpendAllowed(input: SpendCheckInput): SpendCheckResult {
  if (input.killSwitch) return { blocked: true, reason: "kill_switch" };
  const est = Math.max(0, Math.floor(input.estimatedCostCents || 0));
  if (input.caps.dailyCapCents > 0 && input.dailySpendCents + est > input.caps.dailyCapCents) {
    return { blocked: true, reason: "daily_cap" };
  }
  if (input.caps.monthlyCapCents > 0 && input.monthlySpendCents + est > input.caps.monthlyCapCents) {
    return { blocked: true, reason: "monthly_cap" };
  }
  return { blocked: false, reason: null };
}

/** Conservative per-hit cost estimates (cents) used when no fresher quote exists. */
export const PAID_PROVIDER_ESTIMATED_COST_CENTS: Record<string, number> = {
  tracerfy: 10,
  "tracerfy-batch": 2,
  enformiongo: 25,
};

export function estimatePaidLookupCostCents(providerName: string): number {
  const v = String(providerName || "").trim().toLowerCase();
  return PAID_PROVIDER_ESTIMATED_COST_CENTS[v] ?? 10;
}

/** Start of the current day / month in UTC (ledger uses created_at timestamptz). */
export function startOfUtcDay(now: Date = new Date()): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

export function startOfUtcMonth(now: Date = new Date()): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}
