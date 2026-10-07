/**
 * Data access for the investor portal, behind a small interface so service
 * logic is unit-testable without a database.
 *
 * `drizzleInvestorStore(db)` is the real implementation. Raw SQL is used for
 * columns added by migration 0080 (users.investor_status, buyers.user_id,
 * properties.investor_visibility) because the shared drizzle schema is owned
 * by other workstreams and is intentionally not edited here.
 */
import { sql, eq, and, inArray } from "drizzle-orm";
import { buyers, lois, dealBuyerMatches, buyerCommunications } from "../shared-schema.js";
import {
  investorBuyerProfiles,
  investorDealInteractions,
  investorOffers,
} from "./schema.js";
import type { FeedDeal, InvestorBuyBox } from "./scoring-adapter.js";
import { EMPTY_BUY_BOX, toNum } from "./scoring-adapter.js";

export interface InvestorUserRow {
  id: number;
  email: string;
  firstName: string | null;
  lastName: string | null;
  phone: string | null;
  companyName: string | null;
  role: string | null;
  isActive: boolean | null;
  isSuperAdmin: boolean | null;
  investorStatus: string | null;
  investorRejectedReason: string | null;
  passwordHash: string | null;
}

export interface PendingInvestorRow extends InvestorUserRow {
  pofProvided: boolean;
  createdAt: string | null;
}

export interface BuyerLinkRow {
  id: number;
  name: string;
  email: string | null;
  proofOfFunds: boolean | null;
  proofOfFundsVerifiedAt: string | null;
}

export interface StoredMatchRow {
  propertyId: number;
  score: number;
  reasons: unknown;
}

export interface OfferRow {
  id: number;
  propertyId: number;
  offerAmount: string | null;
  earnestMoney: string | null;
  closingTimelineDays: number | null;
  contingencies: string[] | null;
  specialTerms: string | null;
  status: string;
  loiId: number | null;
  createdAt: string | null;
}

export interface InvestorStore {
  getUserByEmail(email: string): Promise<InvestorUserRow | null>;
  getUserById(id: number): Promise<InvestorUserRow | null>;
  createInvestorUser(input: {
    email: string;
    passwordHash: string;
    firstName: string;
    lastName: string;
    phone: string | null;
    companyName: string | null;
  }): Promise<InvestorUserRow>;
  setInvestorStatus(id: number, status: "active" | "rejected", reason?: string | null): Promise<InvestorUserRow>;
  listPendingInvestors(): Promise<PendingInvestorRow[]>;
  getBuyerByUserId(userId: number): Promise<BuyerLinkRow | null>;
  createBuyerForInvestor(input: {
    userId: number;
    name: string;
    email: string;
    phone: string | null;
    company: string | null;
  }): Promise<BuyerLinkRow>;
  markPofProvided(userId: number): Promise<void>;
  setPofVerified(buyerId: number, verified: boolean): Promise<void>;
  getBuyBox(userId: number): Promise<InvestorBuyBox>;
  upsertBuyBox(userId: number, box: Partial<InvestorBuyBox>): Promise<InvestorBuyBox>;
  listVisibleDeals(opts: { pofVerified: boolean; limit: number }): Promise<FeedDeal[]>;
  getDealById(id: number): Promise<FeedDeal | null>;
  getStoredMatches(propertyIds: number[], buyerId: number): Promise<Map<number, StoredMatchRow>>;
  getInteractions(userId: number): Promise<{ propertyId: number; action: string }[]>;
  recordInteraction(userId: number, propertyId: number, action: "interested" | "pass"): Promise<void>;
  createOffer(input: {
    userId: number;
    buyerId: number | null;
    propertyId: number;
    offerAmount: number;
    earnestMoney: number | null;
    closingTimelineDays: number | null;
    contingencies: string[];
    specialTerms: string | null;
  }): Promise<OfferRow>;
  createLoiForOffer(input: {
    propertyId: number;
    buyerName: string;
    offerAmount: number;
    earnestMoney: number | null;
    closingDate: Date | null;
    contingencies: string[];
    specialTerms: string | null;
    content: string;
  }): Promise<{ id: number }>;
  linkOfferLoi(offerId: number, loiId: number): Promise<void>;
  getOffers(userId: number): Promise<(OfferRow & { address: string | null; city: string | null; loiStatus: string | null })[]>;
  logBuyerCommunication(input: { buyerId: number; userId: number; type: string; content: string }): Promise<void>;
  getBuyerComms(buyerId: number, limit: number): Promise<{ id: number; type: string; content: string | null; direction: string | null; createdAt: string | null }[]>;
  savePofDocument(input: {
    userId: number;
    originalFilename: string;
    mimeType: string;
    sizeBytes: number;
    sha256: string;
    data: Buffer;
  }): Promise<number>;
}

type Db = {
  execute: (q: any) => Promise<any>;
  select: (...args: any[]) => any;
  insert: (...args: any[]) => any;
  update: (...args: any[]) => any;
};

function rowToUser(r: any): InvestorUserRow {
  return {
    id: Number(r.id),
    email: String(r.email),
    firstName: r.first_name ?? null,
    lastName: r.last_name ?? null,
    phone: r.phone ?? null,
    companyName: r.company_name ?? null,
    role: r.role ?? null,
    isActive: r.is_active ?? null,
    isSuperAdmin: r.is_super_admin ?? null,
    investorStatus: r.investor_status ?? null,
    investorRejectedReason: r.investor_rejected_reason ?? null,
    passwordHash: r.password_hash ?? null,
  };
}

function rowToBuyBox(profile: any, buyerTags: string[]): InvestorBuyBox {
  if (!profile) return { ...EMPTY_BUY_BOX };
  const notifyRaw = profile.notify_prefs ?? profile.notifyPrefs ?? null;
  const mode = typeof notifyRaw === "object" && notifyRaw && typeof (notifyRaw as any).mode === "string"
    ? (notifyRaw as any).mode
    : typeof notifyRaw === "string" && ["instant", "digest", "off"].includes(notifyRaw)
      ? notifyRaw
      : "digest";
  return {
    targetStates: Array.isArray(profile.target_states ?? profile.targetStates) ? (profile.target_states ?? profile.targetStates).map(String) : [],
    targetZips: Array.isArray(profile.target_zips ?? profile.targetZips) ? (profile.target_zips ?? profile.targetZips).map(String) : [],
    strategies: Array.isArray(profile.strategies) ? profile.strategies.map(String) : [],
    minSpread: toNum(profile.min_spread ?? profile.minSpread),
    minYield: toNum(profile.min_yield ?? profile.minYield),
    propertyTypes: Array.isArray(profile.property_types ?? profile.propertyTypes) ? (profile.property_types ?? profile.propertyTypes).map(String) : [],
    priceMin: toNum(profile.price_min ?? profile.priceMin),
    priceMax: toNum(profile.price_max ?? profile.priceMax),
    minBeds: (() => { const n = toNum(profile.min_beds ?? profile.minBeds); return n === null ? null : Math.round(n); })(),
    maxBeds: (() => { const n = toNum(profile.max_beds ?? profile.maxBeds); return n === null ? null : Math.round(n); })(),
    buyerTags,
    notifyMode: (["instant", "digest", "off"] as const).includes(mode) ? mode : "digest",
  };
}

function rowToDeal(r: any): FeedDeal {
  const price = toNum(r.asking_price ?? r.askingPrice) ?? toNum(r.target_disposition_price ?? r.targetDispositionPrice) ?? toNum(r.price);
  const baths = toNum(r.baths);
  return {
    id: Number(r.id),
    address: String(r.address ?? ""),
    city: r.city ?? null,
    state: r.state ?? null,
    zipCode: r.zip_code ?? r.zipCode ?? null,
    price,
    beds: (() => { const n = toNum(r.beds); return n === null ? null : Math.round(n); })(),
    baths,
    sqft: (() => { const n = toNum(r.sqft); return n === null ? null : Math.round(n); })(),
    propertyType: r.property_type ?? r.propertyType ?? null,
    images: Array.isArray(r.images) ? r.images.map(String) : [],
    arv: toNum(r.arv),
    repairCost: toNum(r.repair_cost ?? r.repairCost),
    visibility: r.investor_visibility ?? null,
  };
}

export function drizzleInvestorStore(db: Db): InvestorStore {
  return {
    async getUserByEmail(email) {
      const out: any = await db.execute(sql`
        SELECT id, email, first_name, last_name, phone, company_name, role,
               is_active, is_super_admin, investor_status, investor_rejected_reason, password_hash
        FROM users WHERE lower(email) = lower(${email}) LIMIT 1`);
      const rows = out?.rows ?? [];
      return rows.length ? rowToUser(rows[0]) : null;
    },

    async getUserById(id) {
      const out: any = await db.execute(sql`
        SELECT id, email, first_name, last_name, phone, company_name, role,
               is_active, is_super_admin, investor_status, investor_rejected_reason, password_hash
        FROM users WHERE id = ${id} LIMIT 1`);
      const rows = out?.rows ?? [];
      return rows.length ? rowToUser(rows[0]) : null;
    },

    async createInvestorUser(input) {
      const out: any = await db.execute(sql`
        INSERT INTO users (email, password_hash, first_name, last_name, phone, company_name, role, is_active, investor_status)
        VALUES (${input.email}, ${input.passwordHash}, ${input.firstName}, ${input.lastName}, ${input.phone}, ${input.companyName}, 'investor', false, 'pending')
        RETURNING id, email, first_name, last_name, phone, company_name, role, is_active, is_super_admin, investor_status, investor_rejected_reason, password_hash`);
      return rowToUser(out.rows[0]);
    },

    async setInvestorStatus(id, status, reason = null) {
      const active = status === "active";
      const out: any = await db.execute(sql`
        UPDATE users
        SET investor_status = ${status},
            is_active = ${active},
            investor_rejected_reason = ${reason},
            updated_at = now()
        WHERE id = ${id}
        RETURNING id, email, first_name, last_name, phone, company_name, role, is_active, is_super_admin, investor_status, investor_rejected_reason, password_hash`);
      return rowToUser(out.rows[0]);
    },

    async listPendingInvestors() {
      const out: any = await db.execute(sql`
        SELECT u.id, u.email, u.first_name, u.last_name, u.phone, u.company_name, u.role,
               u.is_active, u.is_super_admin, u.investor_status, u.investor_rejected_reason, u.password_hash,
               u.created_at,
               EXISTS (SELECT 1 FROM investor_pof_documents p WHERE p.investor_user_id = u.id) AS pof_provided
        FROM users u
        WHERE u.role = 'investor' AND u.investor_status = 'pending'
        ORDER BY u.created_at ASC`);
      return (out?.rows ?? []).map((r: any) => ({
        ...rowToUser(r),
        pofProvided: Boolean(r.pof_provided),
        createdAt: r.created_at ? String(r.created_at) : null,
      }));
    },

    async getBuyerByUserId(userId) {
      const out: any = await db.execute(sql`
        SELECT id, name, email, proof_of_funds, proof_of_funds_verified_at
        FROM buyers WHERE user_id = ${userId} LIMIT 1`);
      const rows = out?.rows ?? [];
      if (!rows.length) return null;
      const r = rows[0];
      return {
        id: Number(r.id),
        name: String(r.name),
        email: r.email ?? null,
        proofOfFunds: r.proof_of_funds ?? null,
        proofOfFundsVerifiedAt: r.proof_of_funds_verified_at ? String(r.proof_of_funds_verified_at) : null,
      };
    },

    async createBuyerForInvestor(input) {
      const out: any = await db.execute(sql`
        INSERT INTO buyers (name, company, email, phone, user_id, status, buyer_status, consent_source, consent_at)
        VALUES (${input.name}, ${input.company}, ${input.email}, ${input.phone}, ${input.userId}, 'active', 'new', 'investor_portal', now())
        RETURNING id, name, email, proof_of_funds, proof_of_funds_verified_at`);
      const r = out.rows[0];
      return {
        id: Number(r.id),
        name: String(r.name),
        email: r.email ?? null,
        proofOfFunds: r.proof_of_funds ?? null,
        proofOfFundsVerifiedAt: r.proof_of_funds_verified_at ? String(r.proof_of_funds_verified_at) : null,
      };
    },

    async markPofProvided(userId) {
      const buyer = await this.getBuyerByUserId(userId);
      if (buyer) {
        await db.execute(sql`UPDATE buyers SET proof_of_funds = true, updated_at = now() WHERE id = ${buyer.id}`);
      }
    },

    async setPofVerified(buyerId, verified) {
      await db.execute(sql`
        UPDATE buyers
        SET proof_of_funds_verified_at = ${verified ? sql`now()` : null},
            updated_at = now()
        WHERE id = ${buyerId}`);
    },

    async getBuyBox(userId) {
      const prof: any = await db.select().from(investorBuyerProfiles).where(eq(investorBuyerProfiles.userId, userId)).limit(1);
      const buyer = await this.getBuyerByUserId(userId);
      let buyerTags: string[] = [];
      if (buyer) {
        const b: any = await db.select({ tags: buyers.tags }).from(buyers).where(eq(buyers.id, buyer.id)).limit(1);
        buyerTags = Array.isArray(b?.[0]?.tags) ? b[0].tags.map(String) : [];
      }
      return rowToBuyBox(prof?.[0] ?? null, buyerTags);
    },

    async upsertBuyBox(userId, box) {
      const existing: any = await db.select().from(investorBuyerProfiles).where(eq(investorBuyerProfiles.userId, userId)).limit(1);
      const values = {
        targetStates: box.targetStates ?? [],
        targetZips: box.targetZips ?? [],
        strategies: box.strategies ?? [],
        minSpread: box.minSpread ?? null,
        minYield: box.minYield ?? null,
        propertyTypes: box.propertyTypes ?? [],
        priceMin: box.priceMin ?? null,
        priceMax: box.priceMax ?? null,
        minBeds: box.minBeds ?? null,
        maxBeds: box.maxBeds ?? null,
        notifyPrefs: { mode: box.notifyMode ?? "digest" },
        updatedAt: new Date(),
      } as any;
      if (existing?.length) {
        await db.update(investorBuyerProfiles).set(values).where(eq(investorBuyerProfiles.id, existing[0].id));
      } else {
        const maxRow: any = await db.execute(sql`SELECT COALESCE(MAX(id), 0) AS m FROM buyer_profiles`);
        const nextId = Number(maxRow?.rows?.[0]?.m ?? 0) + 1;
        await db.insert(investorBuyerProfiles).values({ id: nextId, userId, ...values, createdAt: new Date() } as any);
      }
      return this.getBuyBox(userId);
    },

    async listVisibleDeals({ pofVerified, limit }) {
      // visibility: public always; approved_investors for approved; off_market only when POF-verified
      const vis = pofVerified
        ? sql`p.investor_visibility IN ('public','approved_investors','off_market')`
        : sql`p.investor_visibility IN ('public','approved_investors')`;
      const out: any = await db.execute(sql`
        SELECT p.id, p.address, p.city, p.state, p.zip_code, p.beds, p.baths, p.sqft,
               p.property_type, p.images, p.price, p.asking_price, p.target_disposition_price,
               p.arv, p.repair_cost, p.investor_visibility
        FROM properties p
        WHERE p.opportunity_status = 'active' AND ${vis}
        ORDER BY p.updated_at DESC NULLS LAST
        LIMIT ${limit}`);
      return (out?.rows ?? []).map(rowToDeal);
    },

    async getDealById(id) {
      const out: any = await db.execute(sql`
        SELECT p.id, p.address, p.city, p.state, p.zip_code, p.beds, p.baths, p.sqft,
               p.property_type, p.images, p.price, p.asking_price, p.target_disposition_price,
               p.arv, p.repair_cost, p.investor_visibility, p.opportunity_status
        FROM properties p WHERE p.id = ${id} LIMIT 1`);
      const rows = out?.rows ?? [];
      return rows.length ? rowToDeal(rows[0]) : null;
    },

    async getStoredMatches(propertyIds, buyerId) {
      if (!propertyIds.length) return new Map();
      const rows: any = await db.select().from(dealBuyerMatches)
        .where(and(
          inArray(dealBuyerMatches.propertyId, propertyIds),
          eq(dealBuyerMatches.buyerId, buyerId),
        ));
      const map = new Map<number, StoredMatchRow>();
      for (const r of rows) {
        map.set(Number(r.propertyId), { propertyId: Number(r.propertyId), score: Number(r.score), reasons: r.reasons });
      }
      return map;
    },

    async getInteractions(userId) {
      const rows: any = await db.select({
        propertyId: investorDealInteractions.propertyId,
        action: investorDealInteractions.action,
      }).from(investorDealInteractions).where(eq(investorDealInteractions.investorUserId, userId));
      return rows.map((r: any) => ({ propertyId: Number(r.propertyId), action: String(r.action) }));
    },

    async recordInteraction(userId, propertyId, action) {
      await db.execute(sql`
        INSERT INTO investor_deal_interactions (investor_user_id, property_id, action)
        VALUES (${userId}, ${propertyId}, ${action})
        ON CONFLICT (investor_user_id, property_id) DO UPDATE SET action = EXCLUDED.action`);
    },

    async createOffer(input) {
      const rows: any = await db.insert(investorOffers).values({
        investorUserId: input.userId,
        buyerId: input.buyerId,
        propertyId: input.propertyId,
        offerAmount: String(input.offerAmount),
        earnestMoney: input.earnestMoney === null ? null : String(input.earnestMoney),
        closingTimelineDays: input.closingTimelineDays,
        contingencies: input.contingencies,
        specialTerms: input.specialTerms,
        status: "submitted",
      } as any).returning();
      const r = rows[0];
      return {
        id: Number(r.id),
        propertyId: Number(r.propertyId),
        offerAmount: r.offerAmount ? String(r.offerAmount) : null,
        earnestMoney: r.earnestMoney ? String(r.earnestMoney) : null,
        closingTimelineDays: r.closingTimelineDays ?? null,
        contingencies: Array.isArray(r.contingencies) ? r.contingencies.map(String) : null,
        specialTerms: r.specialTerms ?? null,
        status: String(r.status),
        loiId: r.loiId === null || r.loiId === undefined ? null : Number(r.loiId),
        createdAt: r.createdAt ? String(r.createdAt) : null,
      };
    },

    async createLoiForOffer(input) {
      const rows: any = await db.insert(lois).values({
        propertyId: input.propertyId,
        buyerName: input.buyerName,
        sellerName: "Ocean Luxe",
        offerAmount: String(input.offerAmount),
        earnestMoney: input.earnestMoney === null ? null : String(input.earnestMoney),
        closingDate: input.closingDate,
        contingencies: input.contingencies,
        specialTerms: input.specialTerms,
        status: "draft",
        content: input.content,
      } as any).returning({ id: lois.id });
      return { id: Number(rows[0].id) };
    },

    async linkOfferLoi(offerId, loiId) {
      await db.update(investorOffers).set({ loiId, updatedAt: new Date() } as any).where(eq(investorOffers.id, offerId));
    },

    async getOffers(userId) {
      const out: any = await db.execute(sql`
        SELECT o.id, o.property_id, o.offer_amount, o.earnest_money, o.closing_timeline_days,
               o.contingencies, o.special_terms, o.status, o.loi_id, o.created_at,
               p.address, p.city, l.status AS loi_status
        FROM investor_offers o
        LEFT JOIN properties p ON p.id = o.property_id
        LEFT JOIN lois l ON l.id = o.loi_id
        WHERE o.investor_user_id = ${userId}
        ORDER BY o.created_at DESC`);
      return (out?.rows ?? []).map((r: any) => ({
        id: Number(r.id),
        propertyId: Number(r.property_id),
        offerAmount: r.offer_amount ? String(r.offer_amount) : null,
        earnestMoney: r.earnest_money ? String(r.earnest_money) : null,
        closingTimelineDays: r.closing_timeline_days ?? null,
        contingencies: Array.isArray(r.contingencies) ? r.contingencies.map(String) : null,
        specialTerms: r.special_terms ?? null,
        status: String(r.status),
        loiId: r.loi_id === null ? null : Number(r.loi_id),
        createdAt: r.created_at ? String(r.created_at) : null,
        address: r.address ?? null,
        city: r.city ?? null,
        loiStatus: r.loi_status ?? null,
      }));
    },

    async logBuyerCommunication(input) {
      await db.insert(buyerCommunications).values({
        buyerId: input.buyerId,
        userId: input.userId,
        type: input.type,
        content: input.content,
        direction: "inbound",
      } as any);
    },

    async getBuyerComms(buyerId, limit) {
      const out: any = await db.execute(sql`
        SELECT id, type, content, direction, created_at
        FROM buyer_communications
        WHERE buyer_id = ${buyerId}
        ORDER BY created_at DESC
        LIMIT ${limit}`);
      return (out?.rows ?? []).map((r: any) => ({
        id: Number(r.id),
        type: String(r.type),
        content: r.content ?? null,
        direction: r.direction ?? null,
        createdAt: r.created_at ? String(r.created_at) : null,
      }));
    },

    async savePofDocument(input) {
      const out: any = await db.execute(sql`
        INSERT INTO investor_pof_documents (investor_user_id, original_filename, mime_type, size_bytes, sha256, data)
        VALUES (${input.userId}, ${input.originalFilename}, ${input.mimeType}, ${input.sizeBytes}, ${input.sha256}, ${input.data})
        RETURNING id`);
      return Number(out.rows[0].id);
    },
  };
}
