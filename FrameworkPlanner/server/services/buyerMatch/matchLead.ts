/**
 * Lead-to-buyer matching.
 *
 * Scores every active buyer against a seller lead using the shared scoring
 * engine (./scoring.ts) and persists the top matches to lead_buyer_matches.
 *
 * Unlike the opportunity matcher (recompute.ts), this works directly from the
 * leads table — so matching can fire the moment a lead is qualified, before
 * it becomes an opportunity/property.
 */
import { db } from "../../db.js";
import { sql } from "drizzle-orm";
import { storage } from "../../storage.js";
import { scoreBuyerMatch, type BuyerMatchInput } from "./scoring.js";

export type LeadBuyerMatchResult = {
  buyerId: number;
  buyerName: string;
  score: number;
  reasons: string[];
};

function toNumberOrNull(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/** Map lead_type to a property-type string the scorer understands. */
function leadTypeToPropertyType(leadType: string | null | undefined): string | null {
  const t = String(leadType || "").trim().toLowerCase();
  if (!t) return null;
  if (t.includes("single")) return "single_family";
  if (t.includes("multi") || t.includes("duplex") || t.includes("triplex") || t.includes("fourplex")) return "multi_family";
  if (t.includes("condo")) return "condo";
  if (t.includes("townhome")) return "townhouse";
  if (t.includes("land") || t.includes("vacant") || t.includes("lot")) return "land";
  if (t.includes("commercial")) return "commercial";
  return t.replace(/\s+/g, "_");
}

export async function matchBuyersToLead(leadId: number, opts?: { minScore?: number; limit?: number }): Promise<LeadBuyerMatchResult[]> {
  const lead = await storage.getLeadById(leadId);
  if (!lead) throw new Error("Lead not found");

  const minScore = opts?.minScore ?? 30;
  const limit = opts?.limit ?? 25;

  // If the lead already has a linked property with richer data, prefer it.
  let beds: number | null = null;
  let propertyType: string | null = leadTypeToPropertyType((lead as any).leadType);
  try {
    const props: any = await db.execute(sql`
      SELECT beds, property_type FROM properties WHERE source_lead_id = ${leadId} ORDER BY id DESC LIMIT 1
    `);
    const p = ((props as any).rows || [])[0];
    if (p) {
      if (p.beds != null) beds = toNumberOrNull(p.beds);
      if (p.property_type) propertyType = String(p.property_type).trim().toLowerCase().replace(/\s+/g, "_");
    }
  } catch { /* properties lookup is best-effort */ }

  const dealInput: Omit<BuyerMatchInput, "buyerZipCodes" | "buyerPreferredAreas" | "buyerMinPrice" | "buyerMaxPrice" | "buyerMinBeds" | "buyerMaxBeds" | "buyerPropertyTypes" | "buyerTags" | "buyerStrategies" | "buyerMinSpread"> = {
    dealZipCode: String((lead as any).zipCode || ""),
    dealCity: String((lead as any).city || ""),
    dealState: String((lead as any).state || ""),
    dealPrice: toNumberOrNull((lead as any).estimatedValue),
    dealBeds: beds,
    dealPropertyType: propertyType,
    dealTags: Array.isArray((lead as any).tags) ? (lead as any).tags : null,
  };

  const buyers = await storage.getBuyers(2000, 0);
  const scored: LeadBuyerMatchResult[] = [];

  for (const b of buyers || []) {
    const buyer = b as any;
    // Skip ineligible buyers
    if (buyer.doNotCall) continue;
    if (buyer.buyerStatus === "do_not_contact") continue;
    const status = String(buyer.status || "active").toLowerCase();
    if (status !== "active") continue;

    const input: BuyerMatchInput = {
      ...dealInput,
      buyerZipCodes: Array.isArray(buyer.zipCodes) ? buyer.zipCodes : null,
      buyerPreferredAreas: Array.isArray(buyer.preferredAreas) ? buyer.preferredAreas : null,
      buyerMinPrice: toNumberOrNull(buyer.minPrice),
      buyerMaxPrice: toNumberOrNull(buyer.maxPrice),
      buyerMinBeds: toNumberOrNull(buyer.minBeds),
      buyerMaxBeds: toNumberOrNull(buyer.maxBeds),
      buyerPropertyTypes: Array.isArray(buyer.propertyTypes) && buyer.propertyTypes.length
        ? buyer.propertyTypes
        : Array.isArray(buyer.preferredPropertyTypes) ? buyer.preferredPropertyTypes : null,
      buyerTags: Array.isArray(buyer.tags) ? buyer.tags : null,
    };

    const result = scoreBuyerMatch(input);
    if (result.score >= minScore) {
      // Quality boosts (small, additive — hard filters already passed in the scorer)
      let boost = 0;
      const reasons = [...result.reasons];
      if (buyer.proofOfFunds) { boost += 5; reasons.push("Proof of funds verified"); }
      if (buyer.isVip) { boost += 5; reasons.push("VIP buyer"); }
      const dpm = toNumberOrNull(buyer.dealsPerMonth);
      if (dpm !== null && dpm >= 2) { boost += 5; reasons.push(`Closes ${dpm}/mo`); }
      if (String(buyer.interestLevel || "").toLowerCase() === "hot") { boost += 5; reasons.push("Hot interest"); }

      scored.push({
        buyerId: Number(buyer.id),
        buyerName: String(buyer.name || `Buyer ${buyer.id}`),
        score: Math.min(100, result.score + boost),
        reasons,
      });
    }
  }

  scored.sort((a, b) => b.score - a.score);
  const top = scored.slice(0, limit);

  // Persist — replace previous matches for this lead
  await db.execute(sql`DELETE FROM lead_buyer_matches WHERE lead_id = ${leadId}`);
  for (const m of top) {
    await db.execute(sql`
      INSERT INTO lead_buyer_matches (lead_id, buyer_id, score, reasons)
      VALUES (${leadId}, ${m.buyerId}, ${m.score}, ${JSON.stringify(m.reasons)}::jsonb)
    `);
  }

  return top;
}

export async function getLeadBuyerMatches(leadId: number): Promise<LeadBuyerMatchResult[]> {
  const out: any = await db.execute(sql`
    SELECT m.buyer_id, b.name AS buyer_name, m.score, m.reasons, m.computed_at
    FROM lead_buyer_matches m
    JOIN buyers b ON b.id = m.buyer_id
    WHERE m.lead_id = ${leadId}
    ORDER BY m.score DESC
  `);
  return ((out as any).rows || []).map((r: any) => ({
    buyerId: Number(r.buyer_id),
    buyerName: String(r.buyer_name || `Buyer ${r.buyer_id}`),
    score: Number(r.score),
    reasons: Array.isArray(r.reasons) ? r.reasons : [],
  }));
}
