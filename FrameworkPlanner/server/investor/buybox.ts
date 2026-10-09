/**
 * Investor Deal Matchroom: profile + named buy-box HTTP routes (Phase 9/10).
 *
 * NOT mounted here — the coordinator mounts it (see the mount snippet in
 * server/app.ts conventions). All paths sit under /api/investor and are
 * gated by investorPortalGuard, matching router.ts conventions.
 *
 * Auth model: same separate investor session key (investorUserId) as
 * router.ts; investors never touch /api/auth/* and can only reach their
 * own profile and buy boxes.
 */
import { Router, type Request, type Response } from "express";
import { sql } from "drizzle-orm";
import { investorPortalGuard } from "./flag.js";
import { InvestorError, requireActiveInvestor } from "./service.js";
import type { InvestorStore, InvestorUserRow } from "./store.js";

export interface BuyBoxRouterDeps {
  store: InvestorStore;
  db: Db;
}

/** Minimal database surface this module needs (raw SQL, like store.ts). */
export type Db = {
  execute: (query: unknown) => Promise<{ rows?: Array<Record<string, unknown>> }>;
};

// ---------------------------------------------------------------------------
// Input narrowing helpers (strict TS — no `any` anywhere in this module).
// ---------------------------------------------------------------------------
function asStr(v: unknown): string | null {
  return typeof v === "string" ? v : null;
}

function asNum(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() !== "") {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function asBool(v: unknown): boolean {
  return v === true;
}

function asStrArray(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  const out: string[] = [];
  for (const item of v) {
    const s = asStr(item);
    if (s !== null && s.trim() !== "") out.push(s.trim());
  }
  return out;
}

/** Plain JSON object or {} — arrays and primitives are rejected. */
function asJsonObject(v: unknown): Record<string, unknown> {
  if (typeof v === "object" && v !== null && !Array.isArray(v)) {
    return v as Record<string, unknown>;
  }
  return {};
}

function asJsonArray(v: unknown): unknown[] {
  return Array.isArray(v) ? v : [];
}

function clampName(v: unknown, fallback: string): string {
  const s = asStr(v);
  const trimmed = (s ?? "").trim();
  if (!trimmed) return fallback;
  return trimmed.slice(0, 120);
}

const NOTIFY_FREQUENCIES = ["instant", "digest", "weekly", "off"] as const;
type NotifyFrequency = (typeof NOTIFY_FREQUENCIES)[number];

function asNotifyFrequency(v: unknown): NotifyFrequency {
  const s = asStr(v);
  return (NOTIFY_FREQUENCIES as readonly string[]).includes(s ?? "") ? (s as NotifyFrequency) : "digest";
}

// ---------------------------------------------------------------------------
// Profile criteria — mirrors the client ProfileCriteria shape (onboarding).
// ---------------------------------------------------------------------------
export interface ProfileCriteria {
  targetStates: string[];
  targetZips: string[];
  radiusMiles: number | null;
  preferredAreas: string[];
  propertyTypes: string[];
  occupancy: string[];
  yearBuiltMin: number | null;
  yearBuiltMax: number | null;
  conditionTolerance: string[];
  priceMin: number | null;
  priceMax: number | null;
  maxRepairBudget: number | null;
  minDesiredMargin: number | null;
  minRentalYield: number | null;
  minCashFlow: number | null;
  strategies: string[];
  financingTypes: string[];
  closingSpeedDays: number | null;
  dealBreakers: string[];
  minBeds: number | null;
  maxBeds: number | null;
  minSpread: number | null;
}

export interface NotificationPrefs {
  frequency: NotifyFrequency;
  channels: string[];
}

export interface PrivacySettings {
  profileVisibility: "private" | "team" | "public";
  shareWithSellers: boolean;
}

export interface InvestorProfileDto {
  id: number;
  displayName: string | null;
  companyName: string | null;
  role: string | null;
  criteria: ProfileCriteria;
  notificationPrefs: NotificationPrefs;
  privacy: PrivacySettings;
  completenessScore: number;
  isComplete: boolean;
  updatedAt: string | null;
}

export interface BuyBoxDto {
  id: number;
  name: string;
  isActive: boolean;
  isArchived: boolean;
  hardRequirements: Record<string, unknown>;
  preferences: Record<string, unknown>;
  exclusions: Record<string, unknown>;
  notifyFrequency: NotifyFrequency;
  teamOwnerId: number | null;
  matchCount: number;
  lastMatchedAt: string | null;
  createdAt: string | null;
  updatedAt: string | null;
}

export interface BuyBoxMatchDto {
  id: number;
  propertyId: number | null;
  address: string | null;
  city: string | null;
  score: number;
  reasons: unknown[];
  matchedAt: string | null;
  notifiedAt: string | null;
}

const EMPTY_CRITERIA: ProfileCriteria = {
  targetStates: [],
  targetZips: [],
  radiusMiles: null,
  preferredAreas: [],
  propertyTypes: [],
  occupancy: [],
  yearBuiltMin: null,
  yearBuiltMax: null,
  conditionTolerance: [],
  priceMin: null,
  priceMax: null,
  maxRepairBudget: null,
  minDesiredMargin: null,
  minRentalYield: null,
  minCashFlow: null,
  strategies: [],
  financingTypes: [],
  closingSpeedDays: null,
  dealBreakers: [],
  minBeds: null,
  maxBeds: null,
  minSpread: null,
};

function toCriteria(raw: unknown): ProfileCriteria {
  const o = asJsonObject(raw);
  const c = EMPTY_CRITERIA;
  return {
    targetStates: asStrArray(o.targetStates ?? o.target_states).length ? asStrArray(o.targetStates ?? o.target_states) : c.targetStates,
    targetZips: asStrArray(o.targetZips ?? o.target_zips),
    radiusMiles: asNum(o.radiusMiles ?? o.radius_miles),
    preferredAreas: asStrArray(o.preferredAreas ?? o.preferred_areas),
    propertyTypes: asStrArray(o.propertyTypes ?? o.property_types),
    occupancy: asStrArray(o.occupancy),
    yearBuiltMin: asNum(o.yearBuiltMin ?? o.year_built_min),
    yearBuiltMax: asNum(o.yearBuiltMax ?? o.year_built_max),
    conditionTolerance: asStrArray(o.conditionTolerance ?? o.condition_tolerance),
    priceMin: asNum(o.priceMin ?? o.price_min),
    priceMax: asNum(o.priceMax ?? o.price_max),
    maxRepairBudget: asNum(o.maxRepairBudget ?? o.max_repair_budget),
    minDesiredMargin: asNum(o.minDesiredMargin ?? o.min_desired_margin),
    minRentalYield: asNum(o.minRentalYield ?? o.min_rental_yield),
    minCashFlow: asNum(o.minCashFlow ?? o.min_cash_flow),
    strategies: asStrArray(o.strategies),
    financingTypes: asStrArray(o.financingTypes ?? o.financing_types),
    closingSpeedDays: asNum(o.closingSpeedDays ?? o.closing_speed_days),
    dealBreakers: asStrArray(o.dealBreakers ?? o.deal_breakers),
    minBeds: asNum(o.minBeds ?? o.min_beds),
    maxBeds: asNum(o.maxBeds ?? o.max_beds),
    minSpread: asNum(o.minSpread ?? o.min_spread),
  };
}

function toNotificationPrefs(raw: unknown): NotificationPrefs {
  const o = asJsonObject(raw);
  const channels = asStrArray(o.channels);
  return {
    frequency: asNotifyFrequency(o.frequency),
    channels: channels.length ? channels : ["in_app"],
  };
}

function toPrivacy(raw: unknown): PrivacySettings {
  const o = asJsonObject(raw);
  const vis = asStr(o.profileVisibility ?? o.profile_visibility);
  return {
    profileVisibility: vis === "team" || vis === "public" ? vis : "private",
    shareWithSellers: asBool(o.shareWithSellers ?? o.share_with_sellers),
  };
}

type CompletenessItem = { id: string; done: boolean };

function computeCompleteness(profile: { displayName: string | null; role: string | null; criteria: ProfileCriteria; notificationPrefs: NotificationPrefs }): { score: number; items: CompletenessItem[]; isComplete: boolean } {
  const c = profile.criteria;
  const items: CompletenessItem[] = [
    { id: "identity", done: Boolean((profile.displayName ?? "").trim()) },
    { id: "markets", done: c.targetStates.length > 0 || c.targetZips.length > 0 || c.preferredAreas.length > 0 },
    { id: "property", done: c.propertyTypes.length > 0 },
    { id: "price", done: c.priceMin !== null || c.priceMax !== null },
    { id: "strategy", done: c.strategies.length > 0 },
    { id: "capital", done: c.financingTypes.length > 0 || c.closingSpeedDays !== null },
    { id: "returns", done: c.minDesiredMargin !== null || c.minRentalYield !== null || c.minCashFlow !== null || c.minSpread !== null },
    { id: "notifications", done: profile.notificationPrefs.frequency !== "off" || profile.notificationPrefs.channels.length > 0 },
  ];
  const done = items.filter((i) => i.done).length;
  const score = Math.round((done / items.length) * 100);
  return { score, items, isComplete: score >= 100 };
}

function rowToProfile(r: Record<string, unknown>): InvestorProfileDto {
  const criteria = toCriteria(r.criteria);
  const notificationPrefs = toNotificationPrefs(r.notification_prefs);
  const privacy = toPrivacy(r.privacy);
  const displayName = asStr(r.display_name);
  const role = asStr(r.role);
  const { score, isComplete } = computeCompleteness({ displayName, role, criteria, notificationPrefs });
  return {
    id: Number(r.id),
    displayName,
    companyName: asStr(r.company_name),
    role,
    criteria,
    notificationPrefs,
    privacy,
    completenessScore: score,
    isComplete,
    updatedAt: r.updated_at ? String(r.updated_at) : null,
  };
}

function rowToBuyBox(r: Record<string, unknown>): BuyBoxDto {
  return {
    id: Number(r.id),
    name: String(r.name ?? ""),
    isActive: asBool(r.is_active),
    isArchived: asBool(r.is_archived),
    hardRequirements: asJsonObject(r.hard_requirements),
    preferences: asJsonObject(r.preferences),
    exclusions: asJsonObject(r.exclusions),
    notifyFrequency: asNotifyFrequency(r.notify_frequency),
    teamOwnerId: asNum(r.team_owner_id),
    matchCount: asNum(r.match_count) ?? 0,
    lastMatchedAt: r.last_matched_at ? String(r.last_matched_at) : null,
    createdAt: r.created_at ? String(r.created_at) : null,
    updatedAt: r.updated_at ? String(r.updated_at) : null,
  };
}

function rowToMatch(r: Record<string, unknown>): BuyBoxMatchDto {
  return {
    id: Number(r.id),
    propertyId: asNum(r.property_id),
    address: asStr(r.address),
    city: asStr(r.city),
    score: asNum(r.score) ?? 0,
    reasons: asJsonArray(r.reasons),
    matchedAt: r.matched_at ? String(r.matched_at) : null,
    notifiedAt: r.notified_at ? String(r.notified_at) : null,
  };
}

// ---------------------------------------------------------------------------
// Buy-box store (raw SQL, mirroring server/investor/store.ts conventions).
// ---------------------------------------------------------------------------
export interface BuyBoxStore {
  getProfile(userId: number): Promise<InvestorProfileDto | null>;
  upsertProfile(userId: number, input: Partial<InvestorProfileDto> & { criteria?: unknown; notificationPrefs?: unknown; privacy?: unknown }): Promise<InvestorProfileDto>;
  listBuyBoxes(userId: number, includeArchived: boolean): Promise<BuyBoxDto[]>;
  getBuyBox(userId: number, id: number): Promise<BuyBoxDto | null>;
  createBuyBox(userId: number, input: { name: string; hardRequirements?: unknown; preferences?: unknown; exclusions?: unknown; notifyFrequency?: unknown; teamOwnerId?: unknown; seedFromProfile?: unknown }): Promise<BuyBoxDto>;
  updateBuyBox(userId: number, id: number, input: { name?: unknown; hardRequirements?: unknown; preferences?: unknown; exclusions?: unknown; notifyFrequency?: unknown; teamOwnerId?: unknown }): Promise<BuyBoxDto>;
  setActive(userId: number, id: number, active: boolean): Promise<BuyBoxDto>;
  setArchived(userId: number, id: number, archived: boolean): Promise<BuyBoxDto>;
  duplicateBuyBox(userId: number, id: number): Promise<BuyBoxDto>;
  listMatches(userId: number, id: number, limit: number): Promise<BuyBoxMatchDto[]>;
  recordMatch(userId: number, id: number, input: { propertyId?: unknown; score?: unknown; reasons?: unknown }): Promise<BuyBoxMatchDto>;
}

const PROFILE_COLS = `id, investor_user_id, display_name, company_name, role, criteria, notification_prefs, privacy, completeness_score, is_complete, updated_at`;

export function drizzleBuyBoxStore(db: Db): BuyBoxStore {
  async function scopedBox(userId: number, id: number): Promise<Record<string, unknown> | null> {
    const out = await db.execute(sql`
      SELECT b.*, COUNT(h.id)::int AS match_count, MAX(h.matched_at) AS last_matched_at
      FROM buy_boxes b
      LEFT JOIN buy_box_match_history h ON h.buy_box_id = b.id
      WHERE b.id = ${id} AND b.investor_id = ${userId}
      GROUP BY b.id
      LIMIT 1`);
    const rows = out.rows ?? [];
    return rows.length ? rows[0] : null;
  }

  function requireBox(userId: number, id: number): Promise<Record<string, unknown>> {
    return scopedBox(userId, id).then((row) => {
      if (!row) throw new InvestorError(404, "not_found", "Buy box not found.");
      return row;
    });
  }

  return {
    async getProfile(userId: number) {
      const out = await db.execute(sql`SELECT ${sql.raw(PROFILE_COLS)} FROM investor_profiles WHERE investor_user_id = ${userId} LIMIT 1`);
      const rows = out.rows ?? [];
      return rows.length ? rowToProfile(rows[0]) : null;
    },

    async upsertProfile(userId, input) {
      const criteria = toCriteria(input.criteria ?? {});
      const notificationPrefs = toNotificationPrefs(input.notificationPrefs ?? {});
      const privacy = toPrivacy(input.privacy ?? {});
      const displayName = clampName(input.displayName, "");
      const companyName = clampName(input.companyName, "");
      const role = clampName(input.role, "");
      const { score, isComplete } = computeCompleteness({ displayName: displayName || null, role: role || null, criteria, notificationPrefs });
      const out = await db.execute(sql`
        INSERT INTO investor_profiles (investor_user_id, display_name, company_name, role, criteria, notification_prefs, privacy, completeness_score, is_complete, updated_at)
        VALUES (${userId}, ${displayName || null}, ${companyName || null}, ${role || null}, ${JSON.stringify(criteria)}::jsonb, ${JSON.stringify(notificationPrefs)}::jsonb, ${JSON.stringify(privacy)}::jsonb, ${score}, ${isComplete}, now())
        ON CONFLICT (investor_user_id) DO UPDATE SET
          display_name = EXCLUDED.display_name,
          company_name = EXCLUDED.company_name,
          role = EXCLUDED.role,
          criteria = EXCLUDED.criteria,
          notification_prefs = EXCLUDED.notification_prefs,
          privacy = EXCLUDED.privacy,
          completeness_score = EXCLUDED.completeness_score,
          is_complete = EXCLUDED.is_complete,
          updated_at = now()
        RETURNING ${sql.raw(PROFILE_COLS)}`);
      const rows = out.rows ?? [];
      if (!rows.length) throw new InvestorError(500, "profile_save_failed", "Could not save the investor profile.");
      return rowToProfile(rows[0]);
    },

    async listBuyBoxes(userId, includeArchived) {
      const out = await db.execute(sql`
        SELECT b.*, COUNT(h.id)::int AS match_count, MAX(h.matched_at) AS last_matched_at
        FROM buy_boxes b
        LEFT JOIN buy_box_match_history h ON h.buy_box_id = b.id
        WHERE b.investor_id = ${userId} AND (${includeArchived} OR b.is_archived = false)
        GROUP BY b.id
        ORDER BY b.is_archived ASC, b.updated_at DESC`);
      return (out.rows ?? []).map(rowToBuyBox);
    },

    async getBuyBox(userId, id) {
      const row = await scopedBox(userId, id);
      return row ? rowToBuyBox(row) : null;
    },

    async createBuyBox(userId, input) {
      const name = clampName(input.name, "Custom Buy Box");
      let hard = asJsonObject(input.hardRequirements ?? {});
      const prefs = asJsonObject(input.preferences ?? {});
      const excl = asJsonObject(input.exclusions ?? {});
      const freq = asNotifyFrequency(input.notifyFrequency);
      const ownerRaw = asNum(input.teamOwnerId);
      const teamOwnerId = ownerRaw !== null && Number.isInteger(ownerRaw) && ownerRaw > 0 ? ownerRaw : null;
      if (asBool(input.seedFromProfile)) {
        const profile = await this.getProfile(userId);
        if (profile) {
          const c = profile.criteria;
          hard = {
            ...hard,
            targetStates: c.targetStates,
            targetZips: c.targetZips,
            preferredAreas: c.preferredAreas,
            propertyTypes: c.propertyTypes,
            priceMin: c.priceMin,
            priceMax: c.priceMax,
            minSpread: c.minSpread,
            strategies: c.strategies,
          };
        }
      }
      const out = await db.execute(sql`
        INSERT INTO buy_boxes (investor_id, name, is_active, is_archived, hard_requirements, preferences, exclusions, notify_frequency, team_owner_id, updated_at)
        VALUES (${userId}, ${name}, true, false, ${JSON.stringify(hard)}::jsonb, ${JSON.stringify(prefs)}::jsonb, ${JSON.stringify(excl)}::jsonb, ${freq}, ${teamOwnerId}, now())
        RETURNING id, name, is_active, is_archived, hard_requirements, preferences, exclusions, notify_frequency, team_owner_id, 0 AS match_count, NULL AS last_matched_at, created_at, updated_at`);
      const rows = out.rows ?? [];
      if (!rows.length) throw new InvestorError(500, "buy_box_create_failed", "Could not create the buy box.");
      return rowToBuyBox(rows[0]);
    },

    async updateBuyBox(userId, id, input) {
      const row = await requireBox(userId, id);
      const current = rowToBuyBox(row);
      const name = input.name === undefined ? current.name : clampName(input.name, current.name);
      const freq = input.notifyFrequency === undefined ? current.notifyFrequency : asNotifyFrequency(input.notifyFrequency);
      const ownerRaw = input.teamOwnerId === undefined ? current.teamOwnerId : asNum(input.teamOwnerId);
      const teamOwnerId = ownerRaw !== null && Number.isInteger(ownerRaw) && ownerRaw > 0 ? ownerRaw : null;
      const out = await db.execute(sql`
        UPDATE buy_boxes SET
          name = ${name},
          hard_requirements = ${JSON.stringify(input.hardRequirements === undefined ? current.hardRequirements : asJsonObject(input.hardRequirements))}::jsonb,
          preferences = ${JSON.stringify(input.preferences === undefined ? current.preferences : asJsonObject(input.preferences))}::jsonb,
          exclusions = ${JSON.stringify(input.exclusions === undefined ? current.exclusions : asJsonObject(input.exclusions))}::jsonb,
          notify_frequency = ${freq},
          team_owner_id = ${teamOwnerId},
          updated_at = now()
        WHERE id = ${id} AND investor_id = ${userId}
        RETURNING id, name, is_active, is_archived, hard_requirements, preferences, exclusions, notify_frequency, team_owner_id,
          (SELECT COUNT(*)::int FROM buy_box_match_history h WHERE h.buy_box_id = buy_boxes.id) AS match_count,
          (SELECT MAX(matched_at) FROM buy_box_match_history h WHERE h.buy_box_id = buy_boxes.id) AS last_matched_at,
          created_at, updated_at`);
      const rows = out.rows ?? [];
      if (!rows.length) throw new InvestorError(404, "not_found", "Buy box not found.");
      return rowToBuyBox(rows[0]);
    },

    async setActive(userId, id, active) {
      await requireBox(userId, id);
      const out = await db.execute(sql`
        UPDATE buy_boxes SET is_active = ${active}, updated_at = now()
        WHERE id = ${id} AND investor_id = ${userId}
        RETURNING id, name, is_active, is_archived, hard_requirements, preferences, exclusions, notify_frequency, team_owner_id,
          (SELECT COUNT(*)::int FROM buy_box_match_history h WHERE h.buy_box_id = buy_boxes.id) AS match_count,
          (SELECT MAX(matched_at) FROM buy_box_match_history h WHERE h.buy_box_id = buy_boxes.id) AS last_matched_at,
          created_at, updated_at`);
      const rows = out.rows ?? [];
      if (!rows.length) throw new InvestorError(404, "not_found", "Buy box not found.");
      return rowToBuyBox(rows[0]);
    },

    async setArchived(userId, id, archived) {
      await requireBox(userId, id);
      const out = await db.execute(sql`
        UPDATE buy_boxes SET is_archived = ${archived}, updated_at = now()
        WHERE id = ${id} AND investor_id = ${userId}
        RETURNING id, name, is_active, is_archived, hard_requirements, preferences, exclusions, notify_frequency, team_owner_id,
          (SELECT COUNT(*)::int FROM buy_box_match_history h WHERE h.buy_box_id = buy_boxes.id) AS match_count,
          (SELECT MAX(matched_at) FROM buy_box_match_history h WHERE h.buy_box_id = buy_boxes.id) AS last_matched_at,
          created_at, updated_at`);
      const rows = out.rows ?? [];
      if (!rows.length) throw new InvestorError(404, "not_found", "Buy box not found.");
      return rowToBuyBox(rows[0]);
    },

    async duplicateBuyBox(userId, id) {
      const row = await requireBox(userId, id);
      const src = rowToBuyBox(row);
      const out = await db.execute(sql`
        INSERT INTO buy_boxes (investor_id, name, is_active, is_archived, hard_requirements, preferences, exclusions, notify_frequency, team_owner_id, updated_at)
        VALUES (${userId}, ${(src.name + " (copy)").slice(0, 120)}, true, false,
          ${JSON.stringify(src.hardRequirements)}::jsonb, ${JSON.stringify(src.preferences)}::jsonb, ${JSON.stringify(src.exclusions)}::jsonb,
          ${src.notifyFrequency}, ${src.teamOwnerId}, now())
        RETURNING id, name, is_active, is_archived, hard_requirements, preferences, exclusions, notify_frequency, team_owner_id, 0 AS match_count, NULL AS last_matched_at, created_at, updated_at`);
      const rows = out.rows ?? [];
      if (!rows.length) throw new InvestorError(500, "buy_box_duplicate_failed", "Could not duplicate the buy box.");
      return rowToBuyBox(rows[0]);
    },

    async listMatches(userId, id, limit) {
      await requireBox(userId, id);
      const lim = Math.max(1, Math.min(200, Math.floor(limit) || 50));
      const out = await db.execute(sql`
        SELECT h.id, h.property_id, h.score, h.reasons, h.matched_at, h.notified_at,
               p.address, p.city
        FROM buy_box_match_history h
        LEFT JOIN properties p ON p.id = h.property_id
        WHERE h.buy_box_id = ${id}
        ORDER BY h.matched_at DESC
        LIMIT ${lim}`);
      return (out.rows ?? []).map(rowToMatch);
    },

    async recordMatch(userId, id, input) {
      await requireBox(userId, id);
      const propertyId = asNum(input.propertyId);
      const scoreRaw = asNum(input.score) ?? 0;
      const score = Math.max(0, Math.min(100, Math.round(scoreRaw)));
      const reasons = asJsonArray(input.reasons);
      const out = await db.execute(sql`
        INSERT INTO buy_box_match_history (buy_box_id, property_id, score, reasons, matched_at)
        VALUES (${id}, ${propertyId !== null && Number.isInteger(propertyId) ? propertyId : null}, ${score}, ${JSON.stringify(reasons)}::jsonb, now())
        RETURNING id, property_id, score, reasons, matched_at, notified_at,
          (SELECT address FROM properties WHERE id = buy_box_match_history.property_id) AS address,
          (SELECT city FROM properties WHERE id = buy_box_match_history.property_id) AS city`);
      const rows = out.rows ?? [];
      if (!rows.length) throw new InvestorError(500, "match_record_failed", "Could not record the match.");
      return rowToMatch(rows[0]);
    },
  };
}

// ---------------------------------------------------------------------------
// Router. Mounted by the coordinator, e.g.:
//   import { createBuyBoxRouter, drizzleBuyBoxStore } from "./investor/buybox.js";
//   const { db } = await import("./db.js");
//   app.use(createBuyBoxRouter({ store: drizzleInvestorStore(db), db }));
// ---------------------------------------------------------------------------
function sendBuyBoxError(res: Response, err: unknown) {
  if (err instanceof InvestorError) {
    return res.status(err.status).json({ code: err.code, message: err.message });
  }
  console.error("[investor-buybox]", err);
  return res.status(500).json({ code: "internal_error", message: "Something went wrong." });
}

function investorSessionUserId(req: Request): number | null {
  const id = req.session?.investorUserId;
  return typeof id === "number" && Number.isFinite(id) ? id : null;
}

export function createBuyBoxRouter(deps: BuyBoxRouterDeps): Router {
  const { store, db } = deps;
  const bb = drizzleBuyBoxStore(db);
  const r = Router();

  r.use(investorPortalGuard);

  const requireInvestor = async (req: Request, res: Response): Promise<InvestorUserRow | null> => {
    const id = investorSessionUserId(req);
    if (!id) {
      res.status(401).json({ code: "unauthorized", message: "Investor login required." });
      return null;
    }
    try {
      const { user } = await requireActiveInvestor(store, id);
      return user;
    } catch (e) {
      sendBuyBoxError(res, e);
      return null;
    }
  };

  function parseId(req: Request, res: Response): number | null {
    const id = parseInt(req.params.id, 10);
    if (!Number.isFinite(id)) {
      res.status(400).json({ code: "bad_id", message: "Invalid buy box id." });
      return null;
    }
    return id;
  }

  // ---------- investor profile ----------
  r.get("/api/investor/profile", async (req: Request, res: Response) => {
    try {
      const user = await requireInvestor(req, res);
      if (!user) return;
      res.json({ profile: await bb.getProfile(user.id) });
    } catch (e) {
      sendBuyBoxError(res, e);
    }
  });

  r.put("/api/investor/profile", async (req: Request, res: Response) => {
    try {
      const user = await requireInvestor(req, res);
      if (!user) return;
      const body: unknown = req.body ?? {};
      const o = asJsonObject(body);
      const profile = await bb.upsertProfile(user.id, {
        displayName: asStr(o.displayName),
        companyName: asStr(o.companyName),
        role: asStr(o.role),
        criteria: toCriteria(o.criteria),
        notificationPrefs: toNotificationPrefs(o.notificationPrefs),
        privacy: toPrivacy(o.privacy),
      });
      res.json({ profile });
    } catch (e) {
      sendBuyBoxError(res, e);
    }
  });

  // ---------- buy boxes ----------
  r.get("/api/investor/buy-boxes", async (req: Request, res: Response) => {
    try {
      const user = await requireInvestor(req, res);
      if (!user) return;
      const includeArchived = String(req.query.includeArchived || "").toLowerCase() === "true";
      res.json({ boxes: await bb.listBuyBoxes(user.id, includeArchived) });
    } catch (e) {
      sendBuyBoxError(res, e);
    }
  });

  r.post("/api/investor/buy-boxes", async (req: Request, res: Response) => {
    try {
      const user = await requireInvestor(req, res);
      if (!user) return;
      const o = asJsonObject((req.body ?? {}) as unknown);
      res.status(201).json({
        box: await bb.createBuyBox(user.id, {
          name: asStr(o.name) ?? "Untitled Buy Box",
          hardRequirements: o.hardRequirements,
          preferences: o.preferences,
          exclusions: o.exclusions,
          notifyFrequency: o.notifyFrequency,
          teamOwnerId: o.teamOwnerId,
          seedFromProfile: o.seedFromProfile,
        }),
      });
    } catch (e) {
      sendBuyBoxError(res, e);
    }
  });

  r.get("/api/investor/buy-boxes/:id", async (req: Request, res: Response) => {
    try {
      const user = await requireInvestor(req, res);
      if (!user) return;
      const id = parseId(req, res);
      if (id === null) return;
      const box = await bb.getBuyBox(user.id, id);
      if (!box) return res.status(404).json({ code: "not_found", message: "Buy box not found." });
      res.json({ box });
    } catch (e) {
      sendBuyBoxError(res, e);
    }
  });

  r.put("/api/investor/buy-boxes/:id", async (req: Request, res: Response) => {
    try {
      const user = await requireInvestor(req, res);
      if (!user) return;
      const id = parseId(req, res);
      if (id === null) return;
      const o = asJsonObject((req.body ?? {}) as unknown);
      res.json({
        box: await bb.updateBuyBox(user.id, id, {
          name: o.name,
          hardRequirements: o.hardRequirements,
          preferences: o.preferences,
          exclusions: o.exclusions,
          notifyFrequency: o.notifyFrequency,
          teamOwnerId: o.teamOwnerId,
        }),
      });
    } catch (e) {
      sendBuyBoxError(res, e);
    }
  });

  r.delete("/api/investor/buy-boxes/:id", async (req: Request, res: Response) => {
    try {
      const user = await requireInvestor(req, res);
      if (!user) return;
      const id = parseId(req, res);
      if (id === null) return;
      await bb.setArchived(user.id, id, true);
      res.json({ ok: true });
    } catch (e) {
      sendBuyBoxError(res, e);
    }
  });

  r.post("/api/investor/buy-boxes/:id/duplicate", async (req: Request, res: Response) => {
    try {
      const user = await requireInvestor(req, res);
      if (!user) return;
      const id = parseId(req, res);
      if (id === null) return;
      res.status(201).json({ box: await bb.duplicateBuyBox(user.id, id) });
    } catch (e) {
      sendBuyBoxError(res, e);
    }
  });

  r.post("/api/investor/buy-boxes/:id/pause", async (req: Request, res: Response) => {
    try {
      const user = await requireInvestor(req, res);
      if (!user) return;
      const id = parseId(req, res);
      if (id === null) return;
      res.json({ box: await bb.setActive(user.id, id, false) });
    } catch (e) {
      sendBuyBoxError(res, e);
    }
  });

  r.post("/api/investor/buy-boxes/:id/resume", async (req: Request, res: Response) => {
    try {
      const user = await requireInvestor(req, res);
      if (!user) return;
      const id = parseId(req, res);
      if (id === null) return;
      res.json({ box: await bb.setActive(user.id, id, true) });
    } catch (e) {
      sendBuyBoxError(res, e);
    }
  });

  r.post("/api/investor/buy-boxes/:id/archive", async (req: Request, res: Response) => {
    try {
      const user = await requireInvestor(req, res);
      if (!user) return;
      const id = parseId(req, res);
      if (id === null) return;
      res.json({ box: await bb.setArchived(user.id, id, true) });
    } catch (e) {
      sendBuyBoxError(res, e);
    }
  });

  r.post("/api/investor/buy-boxes/:id/restore", async (req: Request, res: Response) => {
    try {
      const user = await requireInvestor(req, res);
      if (!user) return;
      const id = parseId(req, res);
      if (id === null) return;
      res.json({ box: await bb.setArchived(user.id, id, false) });
    } catch (e) {
      sendBuyBoxError(res, e);
    }
  });

  // ---------- match history ----------
  r.get("/api/investor/buy-boxes/:id/matches", async (req: Request, res: Response) => {
    try {
      const user = await requireInvestor(req, res);
      if (!user) return;
      const id = parseId(req, res);
      if (id === null) return;
      const limit = parseInt(String(req.query.limit || "50"), 10);
      res.json({ matches: await bb.listMatches(user.id, id, Number.isFinite(limit) ? limit : 50) });
    } catch (e) {
      sendBuyBoxError(res, e);
    }
  });

  r.post("/api/investor/buy-boxes/:id/matches", async (req: Request, res: Response) => {
    try {
      const user = await requireInvestor(req, res);
      if (!user) return;
      const id = parseId(req, res);
      if (id === null) return;
      const o = asJsonObject((req.body ?? {}) as unknown);
      res.status(201).json({
        match: await bb.recordMatch(user.id, id, {
          propertyId: o.propertyId,
          score: o.score,
          reasons: o.reasons,
        }),
      });
    } catch (e) {
      sendBuyBoxError(res, e);
    }
  });

  return r;
}
