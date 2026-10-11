import { storage } from "../../storage.js";
import { parseSpendCaps, parseKillSwitchEnv, startOfUtcDay, startOfUtcMonth, type SpendCaps } from "./spend.js";

/**
 * Runtime skip-trace settings. Env vars are the base; DB overrides in the
 * skip_trace_settings table (manager-editable via PUT /api/skip-trace/config)
 * win when present.
 *
 * Keys:
 *   default_provider — "auto" | free-web | courtlistener | tracerfy | tracerfy-batch | enformiongo
 *   default_mode     — provider | public_research | both
 *   kill_switch      — "true" | "false"
 */

export type SkipTraceRuntimeSettings = {
  defaultProvider: string;
  defaultMode: "provider" | "public_research" | "both";
  killSwitch: boolean;
  caps: SpendCaps;
  killSwitchSource: "db" | "env";
};

const VALID_MODES = ["provider", "public_research", "both"] as const;

function normalizeMode(v: string | null | undefined): SkipTraceRuntimeSettings["defaultMode"] {
  const m = String(v || "").trim().toLowerCase();
  if ((VALID_MODES as readonly string[]).includes(m)) return m as SkipTraceRuntimeSettings["defaultMode"];
  return "both";
}

export async function getSkipTraceSetting(key: string): Promise<string | null> {
  try {
    const row = await (storage as any).getSkipTraceSetting?.(String(key));
    const v = row ? String((row as any).value ?? "") : "";
    return v ? v : null;
  } catch {
    return null;
  }
}

export async function getSkipTraceRuntimeSettings(): Promise<SkipTraceRuntimeSettings> {
  const [dbProvider, dbMode, dbKill] = await Promise.all([
    getSkipTraceSetting("default_provider"),
    getSkipTraceSetting("default_mode"),
    getSkipTraceSetting("kill_switch"),
  ]);

  let killSwitch = parseKillSwitchEnv(process.env as Record<string, string | undefined>);
  let killSwitchSource: "db" | "env" = "env";
  if (dbKill !== null) {
    killSwitch = dbKill.trim().toLowerCase() === "true";
    killSwitchSource = "db";
  }

  return {
    defaultProvider: dbProvider ? dbProvider.trim().toLowerCase() : "auto",
    defaultMode: dbMode ? normalizeMode(dbMode) : "both",
    killSwitch,
    caps: parseSpendCaps(process.env as Record<string, string | undefined>),
    killSwitchSource,
  };
}

/** Today's + this month's paid spend (cents) from the ledger. */
export async function getSpendSummary(now: Date = new Date()): Promise<{ todaySpendCents: number; monthSpendCents: number }> {
  try {
    const [today, month] = await Promise.all([
      (storage as any).getSkipTraceSpendSince?.(startOfUtcDay(now)) ?? 0,
      (storage as any).getSkipTraceSpendSince?.(startOfUtcMonth(now)) ?? 0,
    ]);
    return { todaySpendCents: Number(today) || 0, monthSpendCents: Number(month) || 0 };
  } catch {
    return { todaySpendCents: 0, monthSpendCents: 0 };
  }
}

/** Key-status booleans for the config endpoint — never values. */
export function getKeyStatus(): { tracerfyConfigured: boolean; courtlistenerConfigured: boolean; validationKeysConfigured: boolean } {
  const has = (name: string) => Boolean(String((process.env as any)[name] || "").trim());
  return {
    tracerfyConfigured: has("TRACERFY_API_KEY"),
    courtlistenerConfigured: has("COURTLISTENER_API_TOKEN"),
    validationKeysConfigured: has("VERIPHONE_API_KEY") || has("IPQS_API_KEY") || has("NUMVERIFY_API_KEY"),
  };
}

export const SKIP_TRACE_QUOTA_GUIDANCE = {
  freeWeb: "Free web research: no API keys, respect source rate limits, every hit backed by evidence.",
  courtlistener: "CourtListener/RECAP: free token, ~5 requests/min, 50/hour, 125/day.",
  tracerfy: "Tracerfy instant: $0.10/hit (5 credits), misses free, 500 lookups/min.",
  tracerfyBatch: "Tracerfy batch: $0.02/hit normal / $0.04 advanced, misses free, 10 submissions per 5 min.",
} as const;
