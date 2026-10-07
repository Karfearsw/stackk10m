/**
 * Buyer-match recompute orchestration.
 *
 * Fetches the deal + buyer universe, scores every buyer with the shared engine
 * (server/services/buyerMatch/scoring.ts — extended with strategies + spread),
 * persists the top matches to deal_buyer_matches, and returns them.
 *
 * The Dispo tab's "Recompute" button calls
 * POST /api/opportunities/:id/buyer-matches/recompute, which delegates here.
 * Reasons are human-readable strings rendered as score bars in the UI.
 */
import { db } from "../../db.js";
import { sql } from "drizzle-orm";
import { storage } from "../../storage.js";
import { scoreBuyerMatch } from "./scoring.js";

function toNumberOrNull(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

export type RecomputedBuyerMatch = {
  buyerId: number;
  /** 0-1000 scale (matches the existing deal_buyer_matches convention). */
  scoreInt: number;
  reasons: string[];
};

export async function recomputeBuyerMatchesForOpportunity(
  opportunityId: number,
): Promise<RecomputedBuyerMatch[]> {
  const property = await storage.getPropertyById(opportunityId);
  if (!property) throw new Error("Opportunity not found");

  const dealZipCode = String((property as any).zipCode || "").trim();
  const dealCity = String((property as any).city || "").trim();
  const dealState = String((property as any).state || "").trim();
  const dealPrice = toNumberOrNull((property as any).price);
  const dealBeds = toNumberOrNull((property as any).beds);
  const dealPropertyType = String((property as any).propertyType || "").trim();
  const dealRepairCost = toNumberOrNull((property as any).repairCost ?? (property as any).repair_cost);

  // Deal spread: ARV from real comp snapshots (or the property's ARV field),
  // minus price and repairs. Null when unknown — the engine then skips spread scoring.
  const snapshotRows = await storage.getCompSnapshotRowsByOpportunity(opportunityId, 500);
  const saleRows = snapshotRows.filter((r: any) => !r.isRentalComp);
  const avgArvFromSnapshots = (() => {
    const vals = saleRows.map((r: any) => toNumberOrNull(r.soldPrice)).filter((x): x is number => x !== null);
    if (!vals.length) return null;
    return vals.reduce((a, b) => a + b, 0) / vals.length;
  })();
  const dealArv = avgArvFromSnapshots ?? toNumberOrNull((property as any).arv);
  const dealSpread =
    dealArv !== null && dealPrice !== null ? dealArv - dealPrice - (dealRepairCost ?? 0) : null;

  const buyers = await storage.getBuyers(2000, 0);
  const buyerIds = (buyers || []).map((b: any) => Number(b.id)).filter(Number.isFinite);
  const profilesById = new Map<number, any>();
  if (buyerIds.length) {
    const idsSql = sql.join(
      buyerIds.map((id) => sql`${id}`),
      sql`, `,
    );
    const out: any = await db.execute(sql`SELECT * FROM buyer_profiles WHERE id IN (${idsSql})`);
    for (const r of (out as any).rows || []) profilesById.set(Number(r.id), r);
  }

  // Buyers who previously bought in this zip (deal_assignments history).
  const historyBuyerIds = new Set<number>();
  if (dealZipCode) {
    const out: any = await db.execute(sql`
      SELECT DISTINCT da.buyer_id
      FROM deal_assignments da
      INNER JOIN properties p ON p.id = da.property_id
      WHERE p.zip_code = ${dealZipCode}
    `);
    for (const r of (out as any).rows || []) historyBuyerIds.add(Number(r.buyer_id));
  }

  const scored: RecomputedBuyerMatch[] = ((buyers || []) as any[])
    .map((b: any) => {
      const buyerId = Number(b.id);
      const profile = profilesById.get(buyerId) || null;
      const targetZips = Array.isArray(profile?.target_zips)
        ? profile.target_zips.map(String)
        : Array.isArray(b.zipCodes)
          ? b.zipCodes.map(String)
          : [];
      const targetStates = Array.isArray(profile?.target_states) ? profile.target_states.map(String) : [];
      const buyerAreas = [...targetStates, ...(Array.isArray(b.preferredAreas) ? b.preferredAreas.map(String) : [])];
      const buyerStrategies = Array.isArray(profile?.strategies) ? profile.strategies.map(String) : [];
      const minSpread = toNumberOrNull(profile?.min_spread);

      const { score, reasons } = scoreBuyerMatch({
        dealZipCode,
        dealCity,
        dealState,
        dealPrice,
        dealBeds,
        dealPropertyType,
        dealStrategies: [],
        dealSpread,
        buyerZipCodes: targetZips,
        buyerPreferredAreas: buyerAreas,
        buyerMinPrice: toNumberOrNull(b.minPrice),
        buyerMaxPrice: toNumberOrNull(b.maxPrice),
        buyerMinBeds: toNumberOrNull(b.minBeds),
        buyerMaxBeds: toNumberOrNull(b.maxBeds),
        buyerPropertyTypes: Array.isArray(b.propertyTypes) ? b.propertyTypes.map(String) : [],
        buyerTags: Array.isArray(b.tags) ? b.tags.map(String) : [],
        buyerStrategies,
        buyerMinSpread: minSpread,
      });

      const finalReasons = [...reasons];
      let finalScore = score;
      if (historyBuyerIds.has(buyerId) && dealZipCode) {
        finalScore = Math.min(100, finalScore + 10);
        finalReasons.push(`Previously bought in ${dealZipCode}`);
      }

      return { buyerId, scoreInt: Math.max(0, Math.round(finalScore * 10)), reasons: finalReasons };
    })
    .filter((m) => m.scoreInt > 0)
    .sort((a, b) => b.scoreInt - a.scoreInt)
    .slice(0, 50);

  await storage.replaceDealBuyerMatches(
    opportunityId,
    scored.map((m) => ({ buyerId: m.buyerId, score: m.scoreInt, reasons: m.reasons, computedAt: new Date() })) as any,
  );
  return scored;
}
