/**
 * Investor discovery API (Phase 11/12): deal discovery feed with an
 * explainable match breakdown, plus rich interaction logging.
 *
 * This module exports a Router factory — it does NOT mount itself. The
 * coordinator wires it into the app after the session middleware exists.
 *
 * Routes (all gated by investorPortalGuard + an active investor session):
 * - GET  /api/investor/discover/feed?sort=score|newest|price
 *        Feed cards with the full explainable match breakdown per card.
 *        Reuses buildFeed from service.js for visibility, scoring inputs,
 *        and stored-match preference.
 * - POST /api/investor/discover/deals/:id/interactions
 *        Log an interaction. Body: { action, sourceScreen? }.
 *        action: viewed | saved | passed | interested | offer_submitted | undo.
 *        "undo" removes the most recent pass for that deal (restores it to
 *        the feed); it is not stored as an action row.
 * - GET  /api/investor/discover/deals/:id/explanation
 *        The match explanation for a single deal.
 *
 * Interaction rows go to the `deal_interactions` table (migration 0100).
 * pass/interested are additionally mirrored to the legacy
 * investor_deal_interactions table so the older feed/saved endpoints keep
 * working while clients migrate.
 */
import { Router, type Request, type Response } from "express";
import { sql } from "drizzle-orm";
import type { InvestorStore } from "./store.js";
import { investorPortalGuard } from "./flag.js";
import {
  InvestorError,
  buildFeed,
  canSeeVisibility,
  requireActiveInvestor,
  type FeedCard,
} from "./service.js";
import type { FeedDeal, InvestorBuyBox } from "./scoring-adapter.js";
import {
  explainBuyerMatch,
  type ExplainBuyBoxInput,
  type ExplainDealInput,
  type MatchExplanation,
} from "../services/buyerMatch/scoringExplain.js";

export interface DiscoveryDb {
  execute: (query: unknown) => Promise<unknown>;
}

export interface DiscoveryRouterDeps {
  store: InvestorStore;
  db: DiscoveryDb;
}

type Row = Record<string, unknown>;

function rowsOf(res: unknown): Row[] {
  if (Array.isArray(res)) return res as Row[];
  if (res && typeof res === "object" && Array.isArray((res as { rows?: unknown }).rows)) {
    return (res as { rows: Row[] }).rows;
  }
  return [];
}

function toNum(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function toStr(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s ? s : null;
}

function sendDiscoveryError(res: Response, err: unknown) {
  if (err instanceof InvestorError) {
    return res.status(err.status).json({ code: err.code, message: err.message });
  }
  console.error("[investor-discovery]", err);
  return res.status(500).json({ code: "internal_error", message: "Something went wrong." });
}

function investorSessionUserId(req: Request): number | null {
  const id = (req.session as unknown as { investorUserId?: unknown })?.investorUserId;
  return typeof id === "number" && Number.isFinite(id) ? id : null;
}

async function requireDiscoveryInvestor(deps: DiscoveryRouterDeps, req: Request, res: Response) {
  const id = investorSessionUserId(req);
  if (!id) {
    res.status(401).json({ code: "unauthorized", message: "Investor login required." });
    return null;
  }
  try {
    return await requireActiveInvestor(deps.store, id);
  } catch (e) {
    sendDiscoveryError(res, e);
    return null;
  }
}

interface ExtendedDealFields {
  occupancy: string | null;
  condition: string | null;
  closingDate: string | null;
  rentPerMonth: number | null;
  opportunityType: string | null;
  visibility: string | null;
}

async function getExtendedDealFields(db: DiscoveryDb, ids: number[]): Promise<Map<number, ExtendedDealFields>> {
  const map = new Map<number, ExtendedDealFields>();
  if (!ids.length) return map;
  // NOTE: sql.raw(", ") is used as the join separator instead of a nested
  // `` sql`, ` `` template: the TypeScript scanner misparses a nested
  // template containing only ", " inside another template's substitution.
  const out = await db.execute(sql`
    SELECT p.id, p.occupancy, p.condition, p.closing_date, p.rent_per_month,
           p.opportunity_type, p.investor_visibility
    FROM properties p WHERE p.id IN (${sql.join(ids.map((i) => sql`${i}`), sql.raw(", "))})
  `);
  for (const r of rowsOf(out)) {
    const id = toNum(r.id);
    if (id === null) continue;
    map.set(id, {
      occupancy: toStr(r.occupancy),
      condition: toStr(r.condition),
      closingDate: r.closing_date instanceof Date ? r.closing_date.toISOString() : toStr(r.closing_date),
      rentPerMonth: toNum(r.rent_per_month),
      opportunityType: toStr(r.opportunity_type),
      visibility: toStr(r.investor_visibility),
    });
  }
  return map;
}

/** Latest discovery action per deal for one investor (new table only). */
async function getLatestDiscoveryActions(db: DiscoveryDb, userId: number): Promise<Map<number, string>> {
  const map = new Map<number, string>();
  const out = await db.execute(sql`
    SELECT DISTINCT ON (deal_property_id) deal_property_id, action
    FROM deal_interactions
    WHERE investor_user_id = ${userId}
    ORDER BY deal_property_id, created_at DESC;
  `);
  for (const r of rowsOf(out)) {
    const dealId = toNum(r.deal_property_id);
    const action = toStr(r.action);
    if (dealId !== null && action) map.set(dealId, action);
  }
  return map;
}

function buyBoxToExplainInput(box: InvestorBuyBox): ExplainBuyBoxInput {
  return {
    targetZips: box.targetZips || [],
    targetStates: box.targetStates || [],
    propertyTypes: box.propertyTypes || [],
    priceMin: box.priceMin,
    priceMax: box.priceMax,
    strategies: box.strategies || [],
    minSpread: box.minSpread,
    minYield: box.minYield,
    minBeds: box.minBeds,
    maxBeds: box.maxBeds,
    occupancyPreferences: [],
    maxRepairBudget: null,
    closingTimelineDays: null,
    financingPreferences: [],
    // Only verified purchases ever feed similarity; the buy box carries
    // none, so this dimension reports "missing" rather than guessing.
    verifiedPastPurchases: [],
  };
}

function strategiesFromOpportunityType(opportunityType: string | null): string[] {
  const t = String(opportunityType || "").toLowerCase();
  if (!t) return [];
  const out: string[] = [];
  if (t.includes("flip")) out.push("fix-and-flip");
  if (t.includes("rent") || t.includes("hold") || t.includes("brrrr")) out.push("buy-and-hold");
  if (t.includes("wholesale")) out.push("wholesale");
  return out;
}

function dealToExplainInput(deal: FeedDeal, ext: ExtendedDealFields): ExplainDealInput {
  return {
    zipCode: deal.zipCode,
    city: deal.city,
    state: deal.state,
    price: deal.price,
    propertyType: deal.propertyType,
    beds: deal.beds,
    arv: deal.arv,
    repairCost: deal.repairCost,
    strategies: strategiesFromOpportunityType(ext.opportunityType),
    occupancy: ext.occupancy,
    condition: ext.condition,
    closingDate: ext.closingDate,
    rentPerMonth: ext.rentPerMonth,
    financingAccepted: [],
  };
}

export type VerificationState = "verified" | "partial" | "unverified";

function verificationStateOf(deal: FeedDeal, ext: ExtendedDealFields): VerificationState {
  const signals = [
    deal.arv !== null,
    deal.repairCost !== null,
    deal.images.length > 0,
    ext.occupancy !== null,
    ext.condition !== null,
  ].filter(Boolean).length;
  if (signals >= 4) return "verified";
  if (signals >= 2) return "partial";
  return "unverified";
}

/** Visibility-safe display address: off-market listings hide the street. */
function displayAddress(deal: FeedDeal, visibility: string | null): string {
  if (visibility === "off_market") {
    const loc = [deal.city, deal.state].filter(Boolean).join(", ");
    return loc ? `Off-market · ${loc}` : "Off-market listing";
  }
  return deal.address;
}

function missingWarningsFor(deal: FeedDeal, ext: ExtendedDealFields): string[] {
  const w: string[] = [];
  if (deal.arv === null) w.push("ARV not estimated");
  if (deal.repairCost === null) w.push("Repairs not estimated");
  if (ext.occupancy === null) w.push("Occupancy unknown");
  if (!deal.images.length) w.push("No photos");
  if (ext.closingDate === null) w.push("No deadline on file");
  return w;
}

export interface DiscoveryDealCard {
  score: number;
  reasons: string[];
  spread: number | null;
  saved: boolean;
  explanation: MatchExplanation;
  deal: {
    id: number;
    address: string;
    displayAddress: string;
    city: string | null;
    state: string | null;
    zipCode: string | null;
    price: number | null;
    beds: number | null;
    baths: number | null;
    sqft: number | null;
    propertyType: string | null;
    image: string | null;
    arv: number | null;
    repairCost: number | null;
    visibility: string | null;
    strategy: string | null;
    occupancy: string | null;
    deadline: string | null;
    condition: string | null;
    verificationState: VerificationState;
    missingWarnings: string[];
  };
}

function toDiscoveryCard(card: FeedCard, ext: ExtendedDealFields, explanation: MatchExplanation): DiscoveryDealCard {
  const d = card.deal;
  const strategy = strategiesFromOpportunityType(ext.opportunityType)[0] ?? null;
  return {
    // The explainable engine's score is the score the breakdown explains.
    score: explanation.score,
    reasons: card.reasons,
    spread: card.spread,
    saved: card.saved,
    explanation,
    deal: {
      id: d.id,
      address: d.address,
      displayAddress: displayAddress(d, ext.visibility),
      city: d.city,
      state: d.state,
      zipCode: d.zipCode,
      price: d.price,
      beds: d.beds,
      baths: d.baths,
      sqft: d.sqft,
      propertyType: d.propertyType,
      image: d.images[0] ?? null,
      arv: d.arv,
      repairCost: d.repairCost,
      visibility: ext.visibility ?? d.visibility,
      strategy,
      occupancy: ext.occupancy,
      deadline: ext.closingDate,
      condition: ext.condition,
      verificationState: verificationStateOf(d, ext),
      missingWarnings: missingWarningsFor(d, ext),
    },
  };
}

const DISCOVERY_ACTIONS = ["viewed", "saved", "passed", "interested", "offer_submitted", "undo"] as const;
export type DiscoveryAction = (typeof DISCOVERY_ACTIONS)[number];

export function createDiscoveryRouter(deps: DiscoveryRouterDeps): Router {
  const { store, db } = deps;
  const r = Router();

  r.use("/api/investor", investorPortalGuard);

  // ---------- GET /api/investor/discover/feed ----------
  r.get("/api/investor/discover/feed", async (req: Request, res: Response) => {
    try {
      const authed = await requireDiscoveryInvestor(deps, req, res);
      if (!authed) return;
      const { buyer } = authed;
      const sortParam = String(req.query.sort || "score");
      const sort = sortParam === "price" || sortParam === "newest" ? sortParam : "score";

      const box = await store.getBuyBox(authed.user.id);
      const explainBox = buyBoxToExplainInput(box);
      const cards = await buildFeed(store, authed.user.id, { sort, limit: 100 });
      const ids = cards.map((c) => c.deal.id);
      const [extended, latestActions] = await Promise.all([
        getExtendedDealFields(db, ids),
        getLatestDiscoveryActions(db, authed.user.id),
      ]);

      const discoveryCards: DiscoveryDealCard[] = [];
      for (const card of cards) {
        const ext = extended.get(card.deal.id) ?? {
          occupancy: null, condition: null, closingDate: null,
          rentPerMonth: null, opportunityType: null, visibility: card.deal.visibility,
        };
        // Merge new-table interactions: a fresh "passed" suppresses the card,
        // "saved"/"interested" mark it saved. Legacy-table state came from buildFeed.
        const latest = latestActions.get(card.deal.id);
        if (latest === "passed") continue;
        const explanation = explainBuyerMatch(explainBox, dealToExplainInput(card.deal, ext));
        const dc = toDiscoveryCard(card, ext, explanation);
        if (latest === "saved" || latest === "interested") dc.saved = true;
        discoveryCards.push(dc);
      }

      if (sort === "price") discoveryCards.sort((a, b) => (a.deal.price ?? Infinity) - (b.deal.price ?? Infinity));
      else if (sort === "newest") discoveryCards.reverse();
      else discoveryCards.sort((a, b) => b.score - a.score);

      void buyer;
      res.json({ cards: discoveryCards });
    } catch (e) {
      sendDiscoveryError(res, e);
    }
  });

  // ---------- POST /api/investor/discover/deals/:id/interactions ----------
  r.post("/api/investor/discover/deals/:id/interactions", async (req: Request, res: Response) => {
    try {
      const authed = await requireDiscoveryInvestor(deps, req, res);
      if (!authed) return;
      const { user, buyer } = authed;
      const dealId = parseInt(req.params.id, 10);
      if (!Number.isFinite(dealId)) {
        return res.status(400).json({ code: "bad_id", message: "Invalid deal id." });
      }
      const action = String(req.body?.action || "") as DiscoveryAction;
      if (!(DISCOVERY_ACTIONS as readonly string[]).includes(action)) {
        return res.status(400).json({ code: "bad_action", message: `action must be one of: ${DISCOVERY_ACTIONS.join(", ")}.` });
      }
      const sourceScreen = typeof req.body?.sourceScreen === "string" ? req.body.sourceScreen.slice(0, 64) : null;

      const deal = await store.getDealById(dealId);
      if (!deal) return res.status(404).json({ code: "deal_not_found", message: "Deal not found." });
      if (!canSeeVisibility(deal.visibility, Boolean(buyer.proofOfFundsVerifiedAt))) {
        return res.status(403).json({ code: "deal_not_visible", message: "This deal is not visible to your account." });
      }

      if (action === "undo") {
        // Undo a pass: remove the pass rows so the deal returns to the feed.
        await db.execute(sql`
          DELETE FROM deal_interactions
          WHERE investor_user_id = ${user.id} AND deal_property_id = ${dealId} AND action = 'passed';
        `);
        await db.execute(sql`
          DELETE FROM investor_deal_interactions
          WHERE investor_user_id = ${user.id} AND property_id = ${dealId} AND action = 'pass';
        `);
        return res.json({ ok: true, undone: true });
      }

      const prevRows = rowsOf(await db.execute(sql`
        SELECT action FROM deal_interactions
        WHERE investor_user_id = ${user.id} AND deal_property_id = ${dealId}
        ORDER BY created_at DESC LIMIT 1;
      `));
      const prevState = toStr(prevRows[0]?.action);

      let buyBoxId: number | null = null;
      try {
        const bb = rowsOf(await db.execute(sql`SELECT id FROM buyer_profiles WHERE user_id = ${user.id} LIMIT 1;`));
        buyBoxId = toNum(bb[0]?.id);
      } catch {
        buyBoxId = null;
      }

      await db.execute(sql`
        INSERT INTO deal_interactions
          (investor_user_id, deal_property_id, action, source_screen, buy_box_id, prev_state, new_state)
        VALUES (${user.id}, ${dealId}, ${action}, ${sourceScreen}, ${buyBoxId}, ${prevState}, ${action});
      `);

      // Compatibility mirror for the legacy feed/saved endpoints.
      if (action === "passed" || action === "interested") {
        await store.recordInteraction(user.id, dealId, action === "passed" ? "pass" : "interested");
      }
      if (action === "interested") {
        const name = `${user.firstName ?? ""} ${user.lastName ?? ""}`.trim() || user.email;
        await store.logBuyerCommunication({
          buyerId: buyer.id,
          userId: user.id,
          type: "investor_interest",
          content: `Investor ${name} marked deal #${dealId} as interested from ${sourceScreen || "discover feed"} — warm lead for dispo.`,
        });
      }

      res.json({ ok: true, action, prevState });
    } catch (e) {
      sendDiscoveryError(res, e);
    }
  });

  // ---------- GET /api/investor/discover/deals/:id/explanation ----------
  r.get("/api/investor/discover/deals/:id/explanation", async (req: Request, res: Response) => {
    try {
      const authed = await requireDiscoveryInvestor(deps, req, res);
      if (!authed) return;
      const { buyer } = authed;
      const dealId = parseInt(req.params.id, 10);
      if (!Number.isFinite(dealId)) {
        return res.status(400).json({ code: "bad_id", message: "Invalid deal id." });
      }
      const deal = await store.getDealById(dealId);
      if (!deal) return res.status(404).json({ code: "deal_not_found", message: "Deal not found." });
      if (!canSeeVisibility(deal.visibility, Boolean(buyer.proofOfFundsVerifiedAt))) {
        return res.status(403).json({ code: "deal_not_visible", message: "This deal is not visible to your account." });
      }
      const box = await store.getBuyBox(authed.user.id);
      const ext = (await getExtendedDealFields(db, [dealId])).get(dealId) ?? {
        occupancy: null, condition: null, closingDate: null,
        rentPerMonth: null, opportunityType: null, visibility: deal.visibility,
      };
      const explanation = explainBuyerMatch(buyBoxToExplainInput(box), dealToExplainInput(deal, ext));
      res.json({ dealId, explanation });
    } catch (e) {
      sendDiscoveryError(res, e);
    }
  });

  return r;
}
