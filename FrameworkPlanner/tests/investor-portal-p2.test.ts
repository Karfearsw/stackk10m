/**
 * Investor Portal Phase 2 tests (flagged OFF by default).
 *
 * Covers, with zero database access (in-memory fake store):
 *  - flag gating: OFF => 404 on every portal route, ON => full happy path
 *  - signup (no employee code) -> pending -> admin approve -> login
 *  - buy-box wizard validation + persistence
 *  - match feed: scoring via the buyer-match engine (read-only), stored
 *    scores preferred, pass permanently suppresses, off-market hidden
 *    without verified POF
 *  - swipe-right notifies dispo (buyer_communications log)
 *  - offer -> LOI creation (ties to lois table)
 *  - messages threads per deal
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import request from "supertest";
import express from "express";
import session from "express-session";

import { parsePortalEnvBool, isInvestorPortalEnabled, investorPortalGuard, isPofRequiredForOffMarket } from "../server/investor/flag.js";
import {
  buildScorerInput, buildReasons, normalizeStoredScore, scoreDeal,
  EMPTY_BUY_BOX, type FeedDeal, type InvestorBuyBox,
} from "../server/investor/scoring-adapter.js";
import {
  InvestorError, signupInvestor, loginInvestor, decideInvestor,
  validateBuyBox, buildFeed, swipeDeal, makeOffer, canSeeVisibility,
  getMessageThreads, sendInvestorMessage, tagDealContent,
} from "../server/investor/service.js";
import { createInvestorRouter } from "../server/investor/router.js";
import type { InvestorStore, InvestorUserRow } from "../server/investor/store.js";

// ---------------------------------------------------------------------------
// In-memory fake store
// ---------------------------------------------------------------------------
function makeUser(over: Partial<InvestorUserRow> = {}): InvestorUserRow {
  return {
    id: 1, email: "inv@example.com", firstName: "Ivy", lastName: "Investor",
    phone: null, companyName: null, role: "investor", isActive: false,
    isSuperAdmin: null, investorStatus: "pending", investorRejectedReason: null,
    passwordHash: null, ...over,
  };
}

function fakeStore(): InvestorStore & { state: any } {
  const state = {
    users: new Map<number, InvestorUserRow>(),
    buyers: new Map<number, any>(), // userId -> buyer
    buyBoxes: new Map<number, InvestorBuyBox>(),
    deals: new Map<number, FeedDeal>(),
    stored: new Map<string, { propertyId: number; score: number; reasons: unknown }>(),
    interactions: [] as { userId: number; propertyId: number; action: string }[],
    offers: [] as any[],
    comms: [] as any[],
    pof: [] as any[],
    nextUser: 1, nextBuyer: 1, nextOffer: 1, nextLoi: 1, nextComm: 1,
  };
  const store: InvestorStore = {
    async getUserByEmail(email) {
      for (const u of state.users.values()) if (u.email === email.toLowerCase()) return u;
      return null;
    },
    async getUserById(id) { return state.users.get(id) ?? null; },
    async createInvestorUser(input) {
      const u = makeUser({
        id: state.nextUser++, email: input.email, passwordHash: input.passwordHash,
        firstName: input.firstName, lastName: input.lastName,
        phone: input.phone, companyName: input.companyName,
      });
      state.users.set(u.id, u);
      return u;
    },
    async setInvestorStatus(id, status, reason = null) {
      const u = state.users.get(id)!;
      u.investorStatus = status;
      u.isActive = status === "active";
      u.investorRejectedReason = reason ?? null;
      return u;
    },
    async listPendingInvestors() {
      return [...state.users.values()].filter((u) => u.investorStatus === "pending").map((u) => ({ ...u, pofProvided: false, createdAt: null }));
    },
    async getBuyerByUserId(userId) { return state.buyers.get(userId) ?? null; },
    async createBuyerForInvestor(input) {
      const b = { id: state.nextBuyer++, name: input.name, email: input.email, proofOfFunds: false, proofOfFundsVerifiedAt: null };
      state.buyers.set(input.userId, b);
      return b;
    },
    async markPofProvided(userId) {
      const b = state.buyers.get(userId);
      if (b) b.proofOfFunds = true;
    },
    async setPofVerified(buyerId, verified) {
      for (const b of state.buyers.values()) if (b.id === buyerId) b.proofOfFundsVerifiedAt = verified ? new Date().toISOString() : null;
    },
    async getBuyBox(userId) { return state.buyBoxes.get(userId) ?? { ...EMPTY_BUY_BOX }; },
    async upsertBuyBox(userId, box) {
      const merged = { ...(state.buyBoxes.get(userId) ?? { ...EMPTY_BUY_BOX }), ...box };
      state.buyBoxes.set(userId, merged as InvestorBuyBox);
      return merged as InvestorBuyBox;
    },
    async listVisibleDeals({ pofVerified, limit }) {
      const vis = (v: string | null) =>
        v === "public" || v === "approved_investors" || (pofVerified && (v === "off_market" || !v));
      return [...state.deals.values()].filter((d) => vis(d.visibility)).slice(0, limit);
    },
    async getDealById(id) { return state.deals.get(id) ?? null; },
    async getStoredMatches(propertyIds, buyerId) {
      const m = new Map();
      for (const pid of propertyIds) {
        const r = state.stored.get(`${pid}:${buyerId}`);
        if (r) m.set(pid, r);
      }
      return m;
    },
    async getInteractions(userId) {
      return state.interactions.filter((i) => i.userId === userId).map((i) => ({ propertyId: i.propertyId, action: i.action }));
    },
    async recordInteraction(userId, propertyId, action) {
      const ex = state.interactions.find((i) => i.userId === userId && i.propertyId === propertyId);
      if (ex) ex.action = action;
      else state.interactions.push({ userId, propertyId, action });
    },
    async createOffer(input) {
      const o = {
        id: state.nextOffer++, propertyId: input.propertyId,
        offerAmount: String(input.offerAmount), earnestMoney: input.earnestMoney === null ? null : String(input.earnestMoney),
        closingTimelineDays: input.closingTimelineDays, contingencies: input.contingencies,
        specialTerms: input.specialTerms, status: "submitted", loiId: null, createdAt: new Date().toISOString(),
      };
      state.offers.push({ ...o, investorUserId: input.userId });
      return o;
    },
    async createLoiForOffer(_input) { return { id: state.nextLoi++ }; },
    async linkOfferLoi(offerId, loiId) {
      const o = state.offers.find((x) => x.id === offerId);
      if (o) o.loiId = loiId;
    },
    async getOffers(userId) {
      return state.offers.filter((o) => o.investorUserId === userId).map((o) => ({
        ...o, address: state.deals.get(o.propertyId)?.address ?? null,
        city: state.deals.get(o.propertyId)?.city ?? null, loiStatus: o.loiId ? "draft" : null,
      }));
    },
    async logBuyerCommunication(input) {
      state.comms.push({ id: state.nextComm++, ...input, direction: "inbound", createdAt: new Date().toISOString() });
    },
    async getBuyerComms(buyerId, limit) {
      return state.comms.filter((c) => c.buyerId === buyerId).slice(-limit).reverse().map((c) => ({
        id: c.id, type: c.type, content: c.content, direction: c.direction, createdAt: c.createdAt,
      }));
    },
    async savePofDocument(_input) { state.pof.push(_input); return state.pof.length; },
  };
  return { ...store, state } as any;
}

function seedDeals(s: InvestorStore & { state: any }) {
  const deals: FeedDeal[] = [
    { id: 1, address: "101 Palm Ave", city: "Orlando", state: "FL", zipCode: "32801", price: 180000, beds: 3, baths: 2, sqft: 1400, propertyType: "sfr", images: [], arv: 260000, repairCost: 30000, visibility: "approved_investors" },
    { id: 2, address: "9 Rodeo Dr", city: "Beverly Hills", state: "CA", zipCode: "90210", price: 900000, beds: 4, baths: 3, sqft: 3000, propertyType: "sfr", images: [], arv: 1200000, repairCost: 50000, visibility: "off_market" },
    { id: 3, address: "55 Lake St", city: "Orlando", state: "FL", zipCode: "32801", price: 150000, beds: 3, baths: 2, sqft: 1200, propertyType: "sfr", images: [], arv: 230000, repairCost: 25000, visibility: "public" },
  ];
  for (const d of deals) s.state.deals.set(d.id, d);
}

function seedBuyBox(s: InvestorStore & { state: any }, userId: number) {
  s.state.buyBoxes.set(userId, {
    ...EMPTY_BUY_BOX,
    targetStates: ["FL"], targetZips: ["32801"], strategies: ["fix-and-flip"],
    propertyTypes: ["sfr"], priceMin: 100000, priceMax: 250000, minBeds: 3,
  } as InvestorBuyBox);
}

async function activeInvestor(s: InvestorStore & { state: any }, email = "inv@example.com"): Promise<InvestorUserRow> {
  const u = await signupInvestor(s, { firstName: "Ivy", lastName: "Investor", email, password: "supersecretpw" });
  await decideInvestor(s, u.id, { decision: "approve" });
  return (await s.getUserById(u.id))!;
}

// ---------------------------------------------------------------------------
// Flag tests
// ---------------------------------------------------------------------------
describe("investor portal flag", () => {
  const OLD = { ...process.env };
  afterEach(() => {
    process.env = { ...OLD };
  });

  it("is OFF by default", () => {
    delete process.env.INVESTOR_PORTAL_ENABLED;
    expect(isInvestorPortalEnabled()).toBe(false);
  });

  it("parses truthy values", () => {
    for (const v of ["1", "true", "yes", "on", "TRUE", " On "]) expect(parsePortalEnvBool(v)).toBe(true);
    for (const v of ["0", "false", "no", "off", "", undefined, null]) expect(parsePortalEnvBool(v)).toBe(false);
    process.env.INVESTOR_PORTAL_ENABLED = "1";
    expect(isInvestorPortalEnabled()).toBe(true);
  });

  it("guard returns 404 when OFF and calls next() when ON", () => {
    delete process.env.INVESTOR_PORTAL_ENABLED;
    let status = 0; let body: any = null; let nexted = false;
    const res: any = { status: (s: number) => { status = s; return { json: (b: any) => { body = b; } }; } };
    investorPortalGuard({} as any, res, () => { nexted = true; });
    expect(status).toBe(404);
    expect(body.code).toBe("INVESTOR_PORTAL_DISABLED");
    expect(nexted).toBe(false);

    process.env.INVESTOR_PORTAL_ENABLED = "true";
    investorPortalGuard({} as any, res, () => { nexted = true; });
    expect(nexted).toBe(true);
  });

  it("POF is required for off-market by default", () => {
    delete process.env.INVESTOR_POF_REQUIRED_FOR_OFFMARKET;
    expect(isPofRequiredForOffMarket()).toBe(true);
    process.env.INVESTOR_POF_REQUIRED_FOR_OFFMARKET = "false";
    expect(isPofRequiredForOffMarket()).toBe(false);
    expect(canSeeVisibility("off_market", false)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Scoring adapter tests (engine used read-only)
// ---------------------------------------------------------------------------
describe("scoring adapter", () => {
  const deal: FeedDeal = {
    id: 7, address: "1 Main St", city: "Orlando", state: "FL", zipCode: "32801",
    price: 180000, beds: 3, baths: 2, sqft: 1400, propertyType: "sfr",
    images: [], arv: 260000, repairCost: 30000, visibility: "public",
  };
  const box: InvestorBuyBox = {
    ...EMPTY_BUY_BOX, targetStates: ["FL"], targetZips: ["32801"],
    strategies: ["fix-and-flip"], propertyTypes: ["sfr"],
    priceMin: 100000, priceMax: 250000, minBeds: 3,
  };

  it("maps buy box + deal into the engine input", () => {
    const input = buildScorerInput(box, deal);
    expect(input.dealZipCode).toBe("32801");
    expect(input.buyerZipCodes).toEqual(["32801"]);
    expect(input.buyerMinPrice).toBe(100000);
    expect(input.buyerPropertyTypes).toEqual(["sfr"]);
  });

  it("builds human-readable reasons", () => {
    const reasons = buildReasons(box, deal);
    expect(reasons).toContain("In their zip 32801");
    expect(reasons).toContain("In their market: Orlando, FL");
    expect(reasons.some((r) => r.includes("100k") && r.includes("250k"))).toBe(true);
  });

  it("live engine scores a matching deal > 0 and a wrong-zip deal 0", () => {
    const good = scoreDeal(box, deal, null);
    expect(good.score).toBeGreaterThan(0);
    expect(good.fromStored).toBe(false);
    const bad = scoreDeal(box, { ...deal, zipCode: "90210", city: "Beverly Hills", state: "CA" }, null);
    expect(bad.score).toBe(0);
  });

  it("prefers stored scores (0-1000 -> 0-100) with stored reasons", () => {
    const s = scoreDeal(box, deal, { score: 850, reasons: ["Stored reason A", "Stored reason B"] });
    expect(s.score).toBe(85);
    expect(s.reasons).toEqual(["Stored reason A", "Stored reason B"]);
    expect(s.fromStored).toBe(true);
    expect(normalizeStoredScore(1000)).toBe(100);
    expect(normalizeStoredScore(0)).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Service tests
// ---------------------------------------------------------------------------
describe("investor service", () => {
  let s: InvestorStore & { state: any };
  beforeEach(() => { s = fakeStore(); seedDeals(s); });

  it("signup validates input and rejects duplicates (no employee code involved)", async () => {
    await expect(signupInvestor(s, { firstName: "A", lastName: "B", email: "bad", password: "supersecretpw" }))
      .rejects.toMatchObject({ status: 400 });
    await expect(signupInvestor(s, { firstName: "A", lastName: "B", email: "a@b.co", password: "short" }))
      .rejects.toMatchObject({ code: "weak_password" });
    const u = await signupInvestor(s, { firstName: "A", lastName: "B", email: "a@b.co", password: "supersecretpw" });
    expect(u.role).toBe("investor");
    expect(u.investorStatus).toBe("pending");
    expect(u.isActive).toBe(false);
    await expect(signupInvestor(s, { firstName: "A", lastName: "B", email: "a@b.co", password: "supersecretpw2" }))
      .rejects.toMatchObject({ status: 409 });
  });

  it("login blocks pending/rejected investors and bad passwords", async () => {
    const u = await signupInvestor(s, { firstName: "A", lastName: "B", email: "a@b.co", password: "supersecretpw" });
    await expect(loginInvestor(s, "a@b.co", "supersecretpw")).rejects.toMatchObject({ code: "account_pending" });
    await decideInvestor(s, u.id, { decision: "reject", reason: "nope" });
    await expect(loginInvestor(s, "a@b.co", "supersecretpw")).rejects.toMatchObject({ code: "account_rejected" });
    const u2 = await signupInvestor(s, { firstName: "C", lastName: "D", email: "c@d.co", password: "supersecretpw" });
    await decideInvestor(s, u2.id, { decision: "approve" });
    await expect(loginInvestor(s, "c@d.co", "wrongpassword")).rejects.toMatchObject({ status: 401 });
    const ok = await loginInvestor(s, "c@d.co", "supersecretpw");
    expect(ok.id).toBe(u2.id);
  });

  it("approval links a buyer row", async () => {
    const u = await activeInvestor(s);
    const buyer = await s.getBuyerByUserId(u.id);
    expect(buyer).toBeTruthy();
    expect(buyer!.name).toContain("Ivy");
  });

  it("buy-box validation rejects inverted bands and cleans input", () => {
    expect(() => validateBuyBox({ priceMin: 300000, priceMax: 100000 })).toThrowError(InvestorError);
    expect(() => validateBuyBox({ minBeds: 5, maxBeds: 2 })).toThrowError(InvestorError);
    const v = validateBuyBox({ targetZips: ["32801-1234", "abc"], targetStates: ["fl", "XX"], strategies: ["fix-and-flip", "bogus"], notifyMode: "instant" });
    expect(v.targetZips).toEqual(["32801"]);
    expect(v.targetStates).toEqual(["FL", "XX"]);
    expect(v.strategies).toEqual(["fix-and-flip"]);
    expect(v.notifyMode).toBe("instant");
  });

  it("feed hides off-market without verified POF, scores, and sorts by score", async () => {
    const u = await activeInvestor(s);
    seedBuyBox(s, u.id);
    const cards = await buildFeed(s, u.id);
    const ids = cards.map((c) => c.deal.id);
    expect(ids).toContain(1);
    expect(ids).toContain(3);
    expect(ids).not.toContain(2); // off_market, POF unverified
    for (let i = 1; i < cards.length; i++) expect(cards[i - 1].score).toBeGreaterThanOrEqual(cards[i].score);
    // verify POF -> off-market appears
    const buyer = await s.getBuyerByUserId(u.id);
    await s.setPofVerified(buyer!.id, true);
    const cards2 = await buildFeed(s, u.id);
    expect(cards2.map((c) => c.deal.id)).toContain(2);
  });

  it("pass permanently suppresses a deal; interest logs a warm lead", async () => {
    const u = await activeInvestor(s);
    seedBuyBox(s, u.id);
    await swipeDeal(s, u.id, 1, "pass");
    const cards = await buildFeed(s, u.id);
    expect(cards.map((c) => c.deal.id)).not.toContain(1);
    // still suppressed on a second fetch
    const cards2 = await buildFeed(s, u.id);
    expect(cards2.map((c) => c.deal.id)).not.toContain(1);

    await swipeDeal(s, u.id, 3, "interested");
    const buyer = await s.getBuyerByUserId(u.id);
    const comms = await s.getBuyerComms(buyer!.id, 10);
    expect(comms.some((c) => c.type === "investor_interest")).toBe(true);
    const cards3 = await buildFeed(s, u.id);
    expect(cards3.find((c) => c.deal.id === 3)?.saved).toBe(true);
  });

  it("swipe on invisible deal is forbidden", async () => {
    const u = await activeInvestor(s);
    seedBuyBox(s, u.id);
    await expect(swipeDeal(s, u.id, 2, "interested")).rejects.toMatchObject({ status: 403 });
  });

  it("offer validates and creates offer + LOI", async () => {
    const u = await activeInvestor(s);
    seedBuyBox(s, u.id);
    await expect(makeOffer(s, u.id, 3, { offerAmount: -5 })).rejects.toMatchObject({ status: 400 });
    const r = await makeOffer(s, u.id, 3, { offerAmount: 140000, earnestMoney: 1000, closingTimelineDays: 21, contingencies: ["inspection"], specialTerms: null });
    expect(r.offerId).toBeGreaterThan(0);
    expect(r.loiId).toBeGreaterThan(0);
    const offers = await s.getOffers(u.id);
    expect(offers[0].loiId).toBe(r.loiId);
    const buyer = await s.getBuyerByUserId(u.id);
    const comms = await s.getBuyerComms(buyer!.id, 10);
    expect(comms.some((c) => c.type === "investor_offer")).toBe(true);
  });

  it("messages thread per deal", async () => {
    const u = await activeInvestor(s);
    seedBuyBox(s, u.id);
    await sendInvestorMessage(s, u.id, 3, "Is the roof new?");
    const threads = await getMessageThreads(s, u.id);
    expect(threads.length).toBe(1);
    expect(threads[0].dealId).toBe(3);
    expect(threads[0].messages[0].content).toBe("Is the roof new?");
    expect(threads[0].messages[0].mine).toBe(true);
    await expect(sendInvestorMessage(s, u.id, 3, "   ")).rejects.toMatchObject({ status: 400 });
  });

  it("tagDealContent prefixes parseably", () => {
    expect(tagDealContent(42, "hello")).toBe("[deal:42] hello");
  });
});

// ---------------------------------------------------------------------------
// Router integration tests (supertest, flag ON/OFF)
// ---------------------------------------------------------------------------
describe("investor router", () => {
  const OLD_ENV = { ...process.env };
  afterEach(() => { process.env = { ...OLD_ENV }; });

  function buildApp(store: InvestorStore) {
    const app = express();
    app.use(express.json());
    app.use(session({ secret: "test-secret", resave: false, saveUninitialized: false }));
    app.use(createInvestorRouter({ store }));
    return app;
  }

  it("flag OFF: portal routes 404, status reports disabled", async () => {
    delete process.env.INVESTOR_PORTAL_ENABLED;
    const s = fakeStore();
    const app = buildApp(s);
    const st = await request(app).get("/api/investor/status");
    expect(st.status).toBe(200);
    expect(st.body.enabled).toBe(false);
    for (const [method, path] of [
      ["post", "/api/investor/signup"], ["post", "/api/investor/login"],
      ["get", "/api/investor/me"], ["get", "/api/investor/feed"],
      ["get", "/api/investor/buy-box"], ["get", "/api/investor/offers"],
      ["post", "/api/investor/deals/1/interest"], ["post", "/api/investor/deals/1/offers"],
      ["get", "/api/admin/investors/pending"],
    ] as const) {
      const r = await (request(app)[method] as any)(path).send({});
      expect(r.status, `${method} ${path}`).toBe(404);
      expect(r.body.code).toBe("INVESTOR_PORTAL_DISABLED");
    }
  });

  it("happy path with flag ON: signup -> approval -> login -> buy-box -> feed -> interest/pass -> offer -> LOI", async () => {
    process.env.INVESTOR_PORTAL_ENABLED = "1";
    const s = fakeStore();
    seedDeals(s);
    const app = buildApp(s);
    const agent = request.agent(app);

    // signup (no employee code)
    const su = await agent.post("/api/investor/signup").send({
      firstName: "Ivy", lastName: "Investor", email: "ivy@example.com", password: "supersecretpw", phone: "555-0100",
    });
    expect(su.status).toBe(201);
    expect(su.body.pendingApproval).toBe(true);
    const investorId = su.body.user.id;

    // login blocked before approval
    const blocked = await agent.post("/api/investor/login").send({ email: "ivy@example.com", password: "supersecretpw" });
    expect(blocked.status).toBe(403);
    expect(blocked.body.code).toBe("account_pending");

    // admin approves (agent CRM session simulated via middleware userId)
    const adminApp = express();
    adminApp.use(express.json());
    adminApp.use(session({ secret: "test-secret", resave: false, saveUninitialized: false }));
    const adminUser = makeUser({ id: 99, email: "admin@oceanluxe.org", role: "admin", isSuperAdmin: true, isActive: true, investorStatus: null });
    (s as any).state.users.set(99, adminUser);
    adminApp.use((req: any, _res, next) => { req.session.userId = 99; next(); });
    adminApp.use(createInvestorRouter({ store: s }));
    const pending = await request(adminApp).get("/api/admin/investors/pending");
    expect(pending.status).toBe(200);
    expect(pending.body.investors.map((i: any) => i.id)).toContain(investorId);
    const appr = await request(adminApp).post(`/api/admin/investors/${investorId}/approve`).send({ decision: "approve" });
    expect(appr.status).toBe(200);
    expect(appr.body.user.investorStatus).toBe("active");

    // login now works and sets the investor session
    const li = await agent.post("/api/investor/login").send({ email: "ivy@example.com", password: "supersecretpw" });
    expect(li.status).toBe(200);
    expect(li.body.user.role).toBe("investor");

    // buy box
    const bb = await agent.put("/api/investor/buy-box").send({
      targetStates: ["FL"], targetZips: ["32801"], strategies: ["fix-and-flip"],
      propertyTypes: ["sfr"], priceMin: 100000, priceMax: 250000, minBeds: 3, notifyMode: "digest",
    });
    expect(bb.status).toBe(200);
    expect(bb.body.targetZips).toEqual(["32801"]);

    // feed
    const feed = await agent.get("/api/investor/feed?sort=score");
    expect(feed.status).toBe(200);
    const ids = feed.body.cards.map((c: any) => c.deal.id);
    expect(ids).toContain(1);
    expect(ids).toContain(3);
    expect(ids).not.toContain(2); // off-market hidden (POF unverified)
    expect(feed.body.cards[0].score).toBeGreaterThanOrEqual(feed.body.cards[1].score);
    expect(feed.body.cards[0].reasons.length).toBeGreaterThan(0);
    expect(typeof feed.body.cards[0].spread).toBe("number");

    // interest -> saved
    const dealId = feed.body.cards[0].deal.id;
    const intr = await agent.post(`/api/investor/deals/${dealId}/interest`);
    expect(intr.status).toBe(200);
    const saved = await agent.get("/api/investor/saved");
    expect(saved.body.saved.map((c: any) => c.deal.id)).toContain(dealId);

    // pass the other deal -> gone from feed permanently
    const otherId = ids.find((x: number) => x !== dealId)!;
    const ps = await agent.post(`/api/investor/deals/${otherId}/pass`);
    expect(ps.status).toBe(200);
    const feed2 = await agent.get("/api/investor/feed");
    expect(feed2.body.cards.map((c: any) => c.deal.id)).not.toContain(otherId);

    // offer -> LOI
    const of = await agent.post(`/api/investor/deals/${dealId}/offers`).send({
      offerAmount: 170000, earnestMoney: 1000, closingTimelineDays: 21,
      contingencies: ["inspection"], specialTerms: "As-is",
    });
    expect(of.status).toBe(201);
    expect(of.body.offerId).toBeGreaterThan(0);
    expect(of.body.loiId).toBeGreaterThan(0);

    const offers = await agent.get("/api/investor/offers");
    expect(offers.status).toBe(200);
    expect(offers.body.offers[0].loiId).toBe(of.body.loiId);

    // messages thread exists for the deal
    const msgs = await agent.get("/api/investor/messages");
    expect(msgs.status).toBe(200);
    expect(msgs.body.threads.some((t: any) => t.dealId === dealId)).toBe(true);
    const mr = await agent.post(`/api/investor/deals/${dealId}/messages`).send({ content: "Can we close in 14 days?" });
    expect(mr.status).toBe(200);

    // logout
    const lo = await agent.post("/api/investor/logout");
    expect(lo.status).toBe(200);
    const me2 = await agent.get("/api/investor/me");
    expect(me2.status).toBe(401);
  });

  it("signup rejects weak input and duplicate emails at the HTTP layer", async () => {
    process.env.INVESTOR_PORTAL_ENABLED = "true";
    const s = fakeStore();
    const app = buildApp(s);
    const bad = await request(app).post("/api/investor/signup").send({ firstName: "A", lastName: "B", email: "x@y.zz", password: "short" });
    expect(bad.status).toBe(400);
    const ok1 = await request(app).post("/api/investor/signup").send({ firstName: "A", lastName: "B", email: "dup@example.com", password: "supersecretpw" });
    expect(ok1.status).toBe(201);
    const ok2 = await request(app).post("/api/investor/signup").send({ firstName: "A", lastName: "B", email: "dup@example.com", password: "supersecretpw" });
    expect(ok2.status).toBe(409);
  });

  it("admin endpoints require an admin CRM session", async () => {
    process.env.INVESTOR_PORTAL_ENABLED = "1";
    const s = fakeStore();
    const app = buildApp(s);
    // no session at all
    const r1 = await request(app).get("/api/admin/investors/pending");
    expect(r1.status).toBe(401);
    // non-admin session
    const app2 = express();
    app2.use(express.json());
    app2.use(session({ secret: "test-secret", resave: false, saveUninitialized: false }));
    app2.use((req: any, _res, next) => { req.session.userId = 5; next(); });
    (s as any).state.users.set(5, makeUser({ id: 5, role: "agent", isActive: true }));
    app2.use(createInvestorRouter({ store: s }));
    const r2 = await request(app2).get("/api/admin/investors/pending");
    expect(r2.status).toBe(403);
  });
});
