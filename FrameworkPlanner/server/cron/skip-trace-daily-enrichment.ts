import { db } from "../db.js";
import { sql } from "drizzle-orm";
import { storage } from "../storage.js";
import { createSkipTraceJob } from "../services/skipTrace/orchestrator.js";

/**
 * Daily free-lane enrichment routine.
 *
 * Selects up to N leads (SKIP_TRACE_DAILY_FREE_LIMIT, default 100) that have
 * no owner phone and no successful skip trace in the last 90 days (matched
 * by the skip-trace cache key), prioritized by lead score then recency, and
 * queues free public_research jobs for them.
 *
 * Jobs are attributed to no user (requestedByUserId = null) — the system
 * convention for automated work. The in-process skip-trace worker picks them
 * up; no paid provider is ever invoked by this routine.
 *
 * Env:
 *   SKIP_TRACE_DAILY_FREE_LIMIT   optional — max leads per run (default 100)
 *   SKIP_TRACE_DAILY_ENABLED      optional — "false" disables the routine
 */

export function skipTraceCacheKey(input: { ownerName: string; address: string; city: string; state: string; zipCode: string }) {
  return `${input.ownerName}|${input.address}|${input.city}|${input.state}|${input.zipCode}`.trim().toLowerCase();
}

function envInt(name: string, fallback: number): number {
  const raw = String(process.env[name] || "").trim();
  const n = raw ? parseInt(raw, 10) : NaN;
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

export type DailyEnrichmentResult = {
  ok: boolean;
  queued: number;
  skippedRecentlyTraced: number;
  limit: number;
  enabled: boolean;
};

export async function runDailyFreeLaneEnrichment(): Promise<DailyEnrichmentResult> {
  const enabled = String(process.env.SKIP_TRACE_DAILY_ENABLED || "").trim().toLowerCase() !== "false";
  const limit = envInt("SKIP_TRACE_DAILY_FREE_LIMIT", 100);
  if (!enabled) {
    return { ok: true, queued: 0, skippedRecentlyTraced: 0, limit, enabled: false };
  }

  // Candidate leads: no usable phone, not archived. Prioritized by score then recency.
  const candidates: any = await db.execute(sql`
    SELECT l.id, l.owner_name, l.address, l.city, l.state, l.zip_code, l.relas_score
    FROM leads l
    WHERE (l.owner_phone IS NULL OR regexp_replace(l.owner_phone, '\\D', '', 'g') = '')
      AND l.archived_at IS NULL
    ORDER BY l.relas_score DESC NULLS LAST, l.id DESC
    LIMIT ${limit * 2}
  `);
  const rows: any[] = (candidates as any).rows || [];

  // Cache keys of successful traces in the last 90 days — one lookup, not N+1.
  const recent: any = await db.execute(sql`
    SELECT DISTINCT r.cache_key AS k
    FROM skip_trace_results r
    WHERE r.status = 'success'
      AND r.completed_at > now() - interval '90 days'
      AND r.provider_name <> 'mock'
  `);
  const tracedKeys = new Set(((recent as any).rows || []).map((r: any) => String(r.k || "").trim().toLowerCase()));

  let queued = 0;
  let skippedRecentlyTraced = 0;
  for (const row of rows) {
    if (queued >= limit) break;
    const key = skipTraceCacheKey({
      ownerName: String(row.owner_name || ""),
      address: String(row.address || ""),
      city: String(row.city || ""),
      state: String(row.state || ""),
      zipCode: String(row.zip_code || ""),
    });
    if (tracedKeys.has(key)) {
      skippedRecentlyTraced++;
      continue;
    }
    try {
      await createSkipTraceJob({
        entityType: "lead",
        entityId: Number(row.id),
        mode: "public_research",
        requestedByUserId: null as any,
      });
      tracedKeys.add(key); // avoid double-queueing the same property in one run
      queued++;
    } catch (e: any) {
      console.error(JSON.stringify({ ts: new Date().toISOString(), event: "skip_trace_daily_enrichment", kind: "queue_failed", leadId: row.id, message: String(e?.message || e) }));
    }
  }

  await storage.createGlobalActivity({
    userId: 0, // 0 denotes system
    action: "skip_trace_daily_enrichment",
    description: `Daily free-lane enrichment queued ${queued} lead(s) for public research`,
    metadata: JSON.stringify({ queued, skippedRecentlyTraced, limit }),
  } as any).catch(() => {});

  return { ok: true, queued, skippedRecentlyTraced, limit, enabled: true };
}
