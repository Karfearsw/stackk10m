/**
 * Signal → Lead promotion service.
 *
 * Closes the loop between municipal distress-signal ingestion and the
 * agent-callable leads pipeline:
 *
 *   signal(s) → parcel score → lead (status=new, source=municipal-signal)
 *     → assigned agent → calls → contract
 *
 * Promotion triggers:
 *   1. Automatic — when a parcel's distress score crosses HIGH_SCORE_THRESHOLD
 *      (called from onSignalCreated in routes/automation.ts).
 *   2. Manual — POST /api/parcels/promote-to-lead { parcelKey } for any parcel,
 *      regardless of score (used by the Signals UI "Convert to Lead" button).
 *
 * Dedupe: leads carry dedupeKey = parcel_key, so a parcel can only ever
 * produce one signal-sourced lead. All signals on the parcel are linked back
 * via distress_signals.lead_id.
 */

import { eq, desc, sql } from "drizzle-orm";
import { db } from "../db.js";
import {
  distressSignals,
  parcelWatchlist,
  leads,
  parcelKeyFor,
} from "../shared-schema.js";
import { emitAutomationEvent } from "../routes/automation.js";

const SCORE_WEIGHTS: Record<string, number> = {
  critical: 4,
  alert: 3,
  watch: 2,
  info: 1,
};

export function parcelDistressScore(signals: { severity: string }[]): number {
  return signals.reduce((s, x) => s + (SCORE_WEIGHTS[x.severity] || 1), 0);
}

const SIGNAL_LABELS: Record<string, string> = {
  code_violation: "Code violation",
  tax_delinquent: "Tax delinquent",
  vacancy: "Vacant",
  court_filing: "Court filing",
  permit: "Permit activity",
  water_shutoff: "Water shutoff",
  fire_damage: "Fire damage",
  eviction: "Eviction",
  probate: "Probate",
  lien: "Lien",
};

export interface PromotionResult {
  promoted: boolean;
  leadId: number | null;
  reason: string;
}

/**
 * Promote a parcel (by parcel key) to a callable seller lead.
 * Idempotent: returns the existing lead if one was already created.
 */
export async function promoteParcelToLead(
  parcelKey: string,
  opts: { createdBy?: number | null; force?: boolean; quiet?: boolean } = {}
): Promise<PromotionResult> {
  const key = (parcelKey || "").trim();
  if (!key) return { promoted: false, leadId: null, reason: "parcelKey required" };

  // 1. Dedupe — already a signal-sourced lead for this parcel?
  const [existing] = await db
    .select({ id: leads.id })
    .from(leads)
    .where(eq(leads.dedupeKey, key))
    .limit(1);
  if (existing) {
    return { promoted: false, leadId: existing.id, reason: "lead already exists" };
  }

  // 2. Load parcel + signals
  const [parcel] = await db
    .select()
    .from(parcelWatchlist)
    .where(eq(parcelWatchlist.parcelKey, key))
    .limit(1);
  if (!parcel) return { promoted: false, leadId: null, reason: "parcel not on watchlist" };

  const signals = await db
    .select()
    .from(distressSignals)
    .where(eq(distressSignals.parcelKey, key))
    .orderBy(desc(distressSignals.occurredAt));
  if (!signals.length && !opts.force)
    return { promoted: false, leadId: null, reason: "no signals on parcel" };

  const score = parcelDistressScore(signals);
  const byType: Record<string, number> = {};
  for (const s of signals) byType[s.signalType] = (byType[s.signalType] || 0) + 1;
  const typeSummary = Object.entries(byType)
    .map(([t, n]) => `${n}× ${SIGNAL_LABELS[t] || t}`)
    .join(", ");

  const ownerName = (parcel.ownerName || "").trim() || "Unknown Owner";

  // 3. Create the lead
  const [lead] = await db
    .insert(leads)
    .values({
      address: parcel.address,
      city: parcel.city,
      state: parcel.state,
      zipCode: parcel.zipCode,
      ownerName,
      status: "new",
      source: "municipal-signal",
      leadType: "seller",
      dedupeKey: key,
      notes:
        `Auto-created from ${signals.length} distress signal(s) ` +
        `(distress score ${score}). ${typeSummary}. ` +
        `Parcel: ${parcel.address}, ${parcel.city}, ${parcel.state} ${parcel.zipCode}.` +
        (parcel.apn ? ` APN: ${parcel.apn}.` : ""),
      tags: ["distress-signal", ...Object.keys(byType)],
    })
    .returning();

  // 4. Link every signal on the parcel back to the lead
  if (signals.length) {
    await db
      .update(distressSignals)
      .set({ leadId: lead.id })
      .where(eq(distressSignals.parcelKey, key));
  }

  // 5. Fire the lead.created automation event (drives n8n / Discord / speed-to-lead).
  // Skipped when quiet (mass backfill) to avoid fanning out thousands of
  // events at once; the leads themselves are still created and queryable.
  if (!opts.quiet) {
    emitAutomationEvent("lead.created", {
      id: lead.id,
      address: lead.address,
      city: lead.city,
      state: lead.state,
      source: lead.source,
      distressScore: score,
      signalCount: signals.length,
    }).catch(() => {});
  }

  return { promoted: true, leadId: lead.id, reason: `created (score ${score}, ${signals.length} signals)` };
}

/**
 * Backfill helper: promote every parcel whose distress score is at or above
 * the threshold and which has no lead yet. Returns counts; safe to re-run.
 */
/**
 * Reconstruct a missing parcel_watchlist row for historical signals.
 *
 * Signals imported before PR #51 (via /api/v1/signals/bulk) never got
 * watchlist rows, so promoteParcelToLead() fails for them with
 * "parcel not on watchlist". This pulls address parts from the signal's
 * rawData (preferring explicit fields) and upserts the watchlist row.
 * Idempotent — onConflictDoNothing on the unique parcel_key.
 */
async function ensureWatchlistForBackfill(
  parcelKey: string,
  createdBy: number | null,
): Promise<void> {
  const key = (parcelKey || "").trim();
  if (!key) return;
  // Skip if the watchlist row already exists.
  const [existing] = await db
    .select({ id: parcelWatchlist.id })
    .from(parcelWatchlist)
    .where(eq(parcelWatchlist.parcelKey, key))
    .limit(1);
  if (existing) return;
  // Pull address parts from the most recent signal's rawData for this parcel.
  const [sig] = await db
    .select({ rawData: distressSignals.rawData })
    .from(distressSignals)
    .where(eq(distressSignals.parcelKey, key))
    .orderBy(desc(distressSignals.discoveredAt))
    .limit(1);
  const raw: any = (sig as any)?.rawData || {};
  let address = String(raw.address || raw.street || raw.propertyAddress || "").trim();
  let city = String(raw.city || "").trim();
  let state = String(raw.state || "").trim();
  let zipCode = String(raw.zip || raw.zipCode || raw.postalCode || "").trim();
  // Fallback: bulk imports (e.g. Detroit CSV) stored no rawData address —
  // reconstruct from the parcel key itself ("address|city|state|zip",
  // normalized lowercase by parcelKeyFor). Title-cased for readability.
  if ((!address || !city || !state || !zipCode) && key.includes("|")) {
    const parts = key.split("|");
    const titleCase = (s: string) =>
      s.replace(/\w\S*/g, (w) => w.charAt(0).toUpperCase() + w.slice(1));
    if (parts.length >= 4) {
      if (!address) address = titleCase(parts[0] || "");
      if (!city) city = titleCase(parts[1] || "");
      if (!state) state = (parts[2] || "").toUpperCase();
      if (!zipCode) zipCode = (parts[3] || "").replace(/[^0-9]/g, "").slice(0, 5);
    }
  }
  // Watchlist columns are NOT NULL — without address parts we cannot create
  // a valid row; promotion will fail gracefully as before.
  if (!address || !city || !state || !zipCode) return;
  try {
    await db.insert(parcelWatchlist).values({
      parcelKey: key,
      address: address.slice(0, 255),
      city: city.slice(0, 100),
      state: state.slice(0, 2),
      zipCode: zipCode.slice(0, 10),
      apn: raw.apn ? String(raw.apn).slice(0, 100) : null,
      ownerName: raw.ownerName ? String(raw.ownerName).slice(0, 255) : null,
      createdBy,
    }).onConflictDoNothing({ target: parcelWatchlist.parcelKey });
  } catch (e) {
    console.error("[lead-promotion] backfill watchlist upsert failed for", key, e);
  }
}

export async function backfillHighScoreParcels(
  threshold: number,
  opts: { createdBy?: number | null; limit?: number; quiet?: boolean } = {}
): Promise<{ promoted: number; skippedExisting: number; checked: number }> {
  // Aggregate scores per parcel in SQL, then promote the qualifiers.
  const rows: any = await db.execute(sql`
    SELECT ds.parcel_key AS "parcelKey",
           SUM(CASE ds.severity
             WHEN 'critical' THEN 4 WHEN 'alert' THEN 3
             WHEN 'watch' THEN 2 ELSE 1 END) AS score,
           COUNT(*)::int AS "signalCount"
    FROM distress_signals ds
    LEFT JOIN leads l ON l.dedupe_key = ds.parcel_key
    WHERE l.id IS NULL
    GROUP BY ds.parcel_key
    HAVING SUM(CASE ds.severity
             WHEN 'critical' THEN 4 WHEN 'alert' THEN 3
             WHEN 'watch' THEN 2 ELSE 1 END) >= ${threshold}
    ORDER BY 2 DESC
    LIMIT ${opts.limit ?? 5000}
  `);

  let promoted = 0;
  let skippedExisting = 0;
  const list = rows.rows ?? rows;
  for (const r of list as any[]) {
    try {
      // Historical signals (imported before PR #51) lack parcel_watchlist rows.
      // Reconstruct the watchlist row from the signal's rawData before promotion,
      // otherwise promoteParcelToLead() fails with "parcel not on watchlist".
      await ensureWatchlistForBackfill(r.parcelKey, opts.createdBy ?? null);
      const res = await promoteParcelToLead(r.parcelKey, { createdBy: opts.createdBy, quiet: opts.quiet });
      if (res.promoted) promoted++;
      else skippedExisting++;
    } catch (e) {
      // One bad parcel must not stop the backfill.
      console.error("[lead-promotion] backfill failed for", r.parcelKey, e);
    }
  }
  return { promoted, skippedExisting, checked: (list as any[]).length };
}
