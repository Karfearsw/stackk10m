/**
 * Investor portal business logic. Pure + store-backed functions, all
 * unit-testable by injecting a fake InvestorStore.
 */
import bcrypt from "bcryptjs";
import { createHash } from "node:crypto";
import type { InvestorStore, InvestorUserRow } from "./store.js";
import type { FeedDeal, InvestorBuyBox, ScoredDeal } from "./scoring-adapter.js";
import { EMPTY_BUY_BOX, scoreDeal, computeDealSpread } from "./scoring-adapter.js";
import { isPofRequiredForOffMarket } from "./flag.js";

export class InvestorError extends Error {
  status: number;
  code: string;
  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export interface SignupInput {
  firstName: string;
  lastName: string;
  email: string;
  password: string;
  phone?: string | null;
  company?: string | null;
}

export function validateSignup(input: SignupInput): { email: string; firstName: string; lastName: string } {
  const firstName = String(input.firstName || "").trim();
  const lastName = String(input.lastName || "").trim();
  const email = String(input.email || "").trim().toLowerCase();
  const password = String(input.password || "");
  if (!firstName || !lastName) throw new InvestorError(400, "name_required", "First and last name are required.");
  if (!EMAIL_RE.test(email)) throw new InvestorError(400, "invalid_email", "A valid email address is required.");
  if (password.length < 10) throw new InvestorError(400, "weak_password", "Password must be at least 10 characters.");
  return { email, firstName, lastName };
}

export async function signupInvestor(store: InvestorStore, input: SignupInput): Promise<InvestorUserRow> {
  const { email, firstName, lastName } = validateSignup(input);
  const existing = await store.getUserByEmail(email);
  if (existing) throw new InvestorError(409, "email_in_use", "An account with this email already exists.");
  const passwordHash = await bcrypt.hash(String(input.password), 12);
  return store.createInvestorUser({
    email,
    passwordHash,
    firstName,
    lastName,
    phone: input.phone ? String(input.phone).trim() || null : null,
    companyName: input.company ? String(input.company).trim() || null : null,
  });
}

export function sanitizeInvestorUser(u: InvestorUserRow) {
  const { passwordHash: _ph, ...rest } = u;
  return rest;
}

/** Login: only active, approved investors. Returns the user row (sans hash). */
export async function loginInvestor(store: InvestorStore, email: string, password: string): Promise<InvestorUserRow> {
  const normalized = String(email || "").trim().toLowerCase();
  const user = await store.getUserByEmail(normalized);
  if (!user || user.role !== "investor") {
    throw new InvestorError(401, "invalid_credentials", "Invalid email or password.");
  }
  if (user.investorStatus !== "active" || user.isActive === false) {
    const code = user.investorStatus === "rejected" ? "account_rejected" : "account_pending";
    throw new InvestorError(403, code, user.investorStatus === "rejected"
      ? `This account was not approved.${user.investorRejectedReason ? ` Reason: ${user.investorRejectedReason}` : ""}`
      : "Your investor account is pending approval. You'll get access once an admin approves it.");
  }
  const ok = user.passwordHash ? await bcrypt.compare(String(password || ""), user.passwordHash) : false;
  if (!ok) throw new InvestorError(401, "invalid_credentials", "Invalid email or password.");
  return user;
}

export interface DecisionInput {
  decision: "approve" | "reject";
  reason?: string | null;
}

export async function decideInvestor(store: InvestorStore, investorId: number, input: DecisionInput): Promise<InvestorUserRow> {
  const user = await store.getUserById(investorId);
  if (!user || user.role !== "investor") throw new InvestorError(404, "not_found", "Investor not found.");
  if (input.decision === "reject") {
    return store.setInvestorStatus(investorId, "rejected", input.reason ? String(input.reason).trim() || null : null);
  }
  const updated = await store.setInvestorStatus(investorId, "active", null);
  // Link portal user <-> buyer pipeline row (idempotent).
  const existingBuyer = await store.getBuyerByUserId(investorId);
  if (!existingBuyer) {
    await store.createBuyerForInvestor({
      userId: investorId,
      name: `${user.firstName ?? ""} ${user.lastName ?? ""}`.trim() || user.email,
      email: user.email,
      phone: user.phone,
      company: user.companyName,
    });
  }
  return updated;
}

export const BUY_BOX_STRATEGIES = ["fix-and-flip", "buy-and-hold", "brrrr", "wholesale", "land", "new-build"] as const;
export const BUY_BOX_PROPERTY_TYPES = ["sfr", "mfr-2-4", "mfr-5+", "condo", "land", "commercial", "mobile"] as const;
export const NOTIFY_MODES = ["instant", "digest", "off"] as const;

export interface BuyBoxInput {
  targetStates?: string[];
  targetZips?: string[];
  strategies?: string[];
  minSpread?: number | null;
  priceMin?: number | null;
  priceMax?: number | null;
  minBeds?: number | null;
  maxBeds?: number | null;
  propertyTypes?: string[];
  notifyMode?: string | null;
}

function cleanStrList(v: unknown, allowed?: readonly string[]): string[] {
  if (!Array.isArray(v)) return [];
  const out = new Set<string>();
  for (const x of v) {
    const s = String(x || "").trim().toLowerCase();
    if (!s) continue;
    if (allowed && !(allowed as readonly string[]).includes(s)) continue;
    out.add(s);
  }
  return [...out];
}

function cleanNum(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

export function validateBuyBox(input: BuyBoxInput): Partial<InvestorBuyBox> {
  const priceMin = cleanNum(input.priceMin);
  const priceMax = cleanNum(input.priceMax);
  if (priceMin !== null && priceMax !== null && priceMin > priceMax) {
    throw new InvestorError(400, "invalid_price_band", "Minimum price cannot exceed maximum price.");
  }
  const minBeds = cleanNum(input.minBeds);
  const maxBeds = cleanNum(input.maxBeds);
  if (minBeds !== null && maxBeds !== null && minBeds > maxBeds) {
    throw new InvestorError(400, "invalid_bed_band", "Minimum beds cannot exceed maximum beds.");
  }
  const notifyMode = input.notifyMode ? String(input.notifyMode).toLowerCase() : null;
  return {
    targetStates: cleanStrList(input.targetStates).map((s) => s.toUpperCase()),
    targetZips: cleanStrList(input.targetZips).map((z) => z.replace(/\D/g, "").slice(0, 5)).filter(Boolean),
    strategies: cleanStrList(input.strategies, BUY_BOX_STRATEGIES),
    minSpread: cleanNum(input.minSpread),
    minYield: null,
    propertyTypes: cleanStrList(input.propertyTypes, BUY_BOX_PROPERTY_TYPES),
    priceMin,
    priceMax,
    minBeds: minBeds === null ? null : Math.round(minBeds),
    maxBeds: maxBeds === null ? null : Math.round(maxBeds),
    notifyMode: notifyMode && (NOTIFY_MODES as readonly string[]).includes(notifyMode)
      ? (notifyMode as InvestorBuyBox["notifyMode"])
      : "digest",
  };
}

/** An active investor with a verified buyer link, ready for feed/offers. */
export async function requireActiveInvestor(store: InvestorStore, userId: number) {
  const user = await store.getUserById(userId);
  if (!user || user.role !== "investor" || user.investorStatus !== "active" || user.isActive === false) {
    throw new InvestorError(403, "investor_forbidden", "Investor access required.");
  }
  const buyer = await store.getBuyerByUserId(userId);
  if (!buyer) throw new InvestorError(409, "buyer_link_missing", "Investor is not linked to a buyer record yet.");
  return { user, buyer };
}

export function canSeeVisibility(visibility: string | null, pofVerified: boolean): boolean {
  if (visibility === "public" || visibility === "approved_investors") return true;
  if (visibility === "off_market" || !visibility) {
    return !isPofRequiredForOffMarket() || pofVerified;
  }
  return false;
}

export interface FeedCard extends ScoredDeal {
  saved: boolean;
}

/**
 * Build the discover feed: visible deals, passed deals suppressed, scored
 * against the investor's buy box (stored matches preferred).
 */
export async function buildFeed(
  store: InvestorStore,
  userId: number,
  opts: { sort?: "score" | "newest" | "price"; limit?: number } = {},
): Promise<FeedCard[]> {
  const { buyer } = await requireActiveInvestor(store, userId);
  const pofVerified = Boolean(buyer.proofOfFundsVerifiedAt);
  const buyBox = await store.getBuyBox(userId);
  const deals = await store.listVisibleDeals({ pofVerified, limit: opts.limit ?? 100 });
  const visible = deals.filter((d) => canSeeVisibility(d.visibility, pofVerified));
  const stored = await store.getStoredMatches(visible.map((d) => d.id), buyer.id);
  const interactions = await store.getInteractions(userId);
  const passed = new Set(interactions.filter((i) => i.action === "pass").map((i) => i.propertyId));
  const savedSet = new Set(interactions.filter((i) => i.action === "interested").map((i) => i.propertyId));

  let cards: FeedCard[] = visible
    .filter((d) => !passed.has(d.id))
    .map((deal) => {
      const scored = scoreDeal(buyBox, deal, stored.get(deal.id) ?? null);
      return { ...scored, saved: savedSet.has(deal.id) };
    });

  const sort = opts.sort ?? "score";
  if (sort === "price") cards.sort((a, b) => (a.deal.price ?? Infinity) - (b.deal.price ?? Infinity));
  else if (sort === "newest") cards.reverse();
  else cards.sort((a, b) => b.score - a.score);
  return cards;
}

export async function swipeDeal(
  store: InvestorStore,
  userId: number,
  propertyId: number,
  action: "interested" | "pass",
): Promise<{ ok: true }> {
  const { user, buyer } = await requireActiveInvestor(store, userId);
  const deal = await store.getDealById(propertyId);
  if (!deal) throw new InvestorError(404, "deal_not_found", "Deal not found.");
  if (!canSeeVisibility(deal.visibility, Boolean(buyer.proofOfFundsVerifiedAt))) {
    throw new InvestorError(403, "deal_not_visible", "This deal is not visible to your account.");
  }
  await store.recordInteraction(userId, propertyId, action);
  if (action === "interested") {
    const name = `${user.firstName ?? ""} ${user.lastName ?? ""}`.trim() || user.email;
    await store.logBuyerCommunication({
      buyerId: buyer.id,
      userId,
      type: "investor_interest",
      content: tagDealContent(propertyId, `Investor ${name} saved this deal — warm lead for dispo.`),
    });
  }
  return { ok: true };
}

export interface OfferInput {
  offerAmount: number;
  earnestMoney?: number | null;
  closingTimelineDays?: number | null;
  contingencies?: string[];
  specialTerms?: string | null;
}

export function validateOffer(input: OfferInput) {
  const offerAmount = cleanNum(input.offerAmount);
  if (offerAmount === null || offerAmount <= 0) {
    throw new InvestorError(400, "invalid_offer_amount", "Offer amount must be a positive number.");
  }
  const earnestMoney = input.earnestMoney === undefined ? null : cleanNum(input.earnestMoney);
  const closingTimelineDays = input.closingTimelineDays === undefined || input.closingTimelineDays === null
    ? null
    : Math.round(Number(input.closingTimelineDays));
  if (closingTimelineDays !== null && (!Number.isFinite(closingTimelineDays) || closingTimelineDays <= 0)) {
    throw new InvestorError(400, "invalid_timeline", "Closing timeline must be a positive number of days.");
  }
  const contingencies = Array.isArray(input.contingencies)
    ? input.contingencies.map((c) => String(c).trim()).filter(Boolean).slice(0, 20)
    : [];
  return {
    offerAmount,
    earnestMoney,
    closingTimelineDays,
    contingencies,
    specialTerms: input.specialTerms ? String(input.specialTerms).trim().slice(0, 2000) || null : null,
  };
}

function buildLoiContent(o: {
  buyerName: string;
  address: string;
  offerAmount: number;
  earnestMoney: number | null;
  closingTimelineDays: number | null;
  contingencies: string[];
  specialTerms: string | null;
}): string {
  const lines = [
    "LETTER OF INTENT — INVESTOR PORTAL",
    "",
    `Buyer: ${o.buyerName}`,
    `Property: ${o.address}`,
    `Offer amount: $${o.offerAmount.toLocaleString("en-US")}`,
    `Earnest money: ${o.earnestMoney !== null ? `$${o.earnestMoney.toLocaleString("en-US")}` : "TBD"}`,
    `Closing timeline: ${o.closingTimelineDays !== null ? `${o.closingTimelineDays} days` : "TBD"}`,
    `Contingencies: ${o.contingencies.length ? o.contingencies.join("; ") : "None listed"}`,
  ];
  if (o.specialTerms) lines.push(`Special terms: ${o.specialTerms}`);
  lines.push("", "Generated from the Ocean Luxe investor portal. Non-binding expression of interest.");
  return lines.join("\n");
}

/**
 * Investor makes an offer -> creates investor_offers row + a draft LOI row
 * (ties to the `lois` table used by the Dispo tab's offer tracker).
 */
export async function makeOffer(
  store: InvestorStore,
  userId: number,
  propertyId: number,
  input: OfferInput,
): Promise<{ offerId: number; loiId: number }> {
  const { user, buyer } = await requireActiveInvestor(store, userId);
  const v = validateOffer(input);
  const deal = await store.getDealById(propertyId);
  if (!deal) throw new InvestorError(404, "deal_not_found", "Deal not found.");
  if (!canSeeVisibility(deal.visibility, Boolean(buyer.proofOfFundsVerifiedAt))) {
    throw new InvestorError(403, "deal_not_visible", "This deal is not visible to your account.");
  }
  const offer = await store.createOffer({
    userId,
    buyerId: buyer.id,
    propertyId,
    offerAmount: v.offerAmount,
    earnestMoney: v.earnestMoney,
    closingTimelineDays: v.closingTimelineDays,
    contingencies: v.contingencies,
    specialTerms: v.specialTerms,
  });
  const buyerName = `${user.firstName ?? ""} ${user.lastName ?? ""}`.trim() || user.email;
  const closingDate = v.closingTimelineDays !== null
    ? new Date(Date.now() + v.closingTimelineDays * 86_400_000)
    : null;
  const loi = await store.createLoiForOffer({
    propertyId,
    buyerName,
    offerAmount: v.offerAmount,
    earnestMoney: v.earnestMoney,
    closingDate,
    contingencies: v.contingencies,
    specialTerms: v.specialTerms,
    content: buildLoiContent({
      buyerName,
      address: `${deal.address}, ${deal.city ?? ""} ${deal.state ?? ""} ${deal.zipCode ?? ""}`.trim(),
      offerAmount: v.offerAmount,
      earnestMoney: v.earnestMoney,
      closingTimelineDays: v.closingTimelineDays,
      contingencies: v.contingencies,
      specialTerms: v.specialTerms,
    }),
  });
  await store.linkOfferLoi(offer.id, loi.id);
  await store.logBuyerCommunication({
    buyerId: buyer.id,
    userId,
    type: "investor_offer",
    content: tagDealContent(propertyId, `Investor ${buyerName} submitted offer #${offer.id} for $${v.offerAmount.toLocaleString("en-US")} (LOI #${loi.id} drafted).`),
  });
  return { offerId: offer.id, loiId: loi.id };
}

export function hashPof(bytes: Buffer): string {
  return createHash("sha256").update(bytes).digest("hex");
}

/** Deal tag embedded at the start of investor-authored comms for threading. */
export function tagDealContent(propertyId: number, content: string): string {
  return `[deal:${propertyId}] ${content}`;
}

const DEAL_TAG_RE = /^\[deal:(\d+)\]\s*/;

export interface MessageThread {
  dealId: number | null;
  address: string | null;
  messages: { id: number; direction: string | null; content: string; createdAt: string | null; mine: boolean }[];
}

/**
 * Per-deal message threads with the dispo team, built on the existing
 * buyer_communications table. Agent notes on the buyer record are NOT
 * included — only comms tied to investor deal tags or investor-authored.
 */
export async function getMessageThreads(store: InvestorStore, userId: number): Promise<MessageThread[]> {
  const { buyer } = await requireActiveInvestor(store, userId);
  const comms = await store.getBuyerComms(buyer.id, 200);
  const investorTypes = new Set(["investor_interest", "investor_message", "investor_offer"]);
  const relevant = comms.filter((c) => investorTypes.has(c.type));
  const byDeal = new Map<number | null, typeof relevant>();
  for (const c of relevant) {
    const m = DEAL_TAG_RE.exec(String(c.content || ""));
    const dealId = m ? Number(m[1]) : null;
    const list = byDeal.get(dealId) ?? [];
    list.push(c);
    byDeal.set(dealId, list);
  }
  const threads: MessageThread[] = [];
  for (const [dealId, msgs] of byDeal) {
    let address: string | null = null;
    if (dealId !== null) {
      const deal = await store.getDealById(dealId);
      address = deal ? `${deal.address}, ${deal.city ?? ""} ${deal.state ?? ""}`.trim() : `Deal #${dealId}`;
    }
    threads.push({
      dealId,
      address,
      messages: msgs
        .slice()
        .reverse()
        .map((c) => ({
          id: c.id,
          direction: c.direction,
          content: String(c.content || "").replace(DEAL_TAG_RE, ""),
          createdAt: c.createdAt,
          mine: c.direction === "inbound",
        })),
    });
  }
  threads.sort((a, b) => {
    const ta = a.messages[a.messages.length - 1]?.createdAt ?? "";
    const tb = b.messages[b.messages.length - 1]?.createdAt ?? "";
    return tb.localeCompare(ta);
  });
  return threads;
}

export async function sendInvestorMessage(
  store: InvestorStore,
  userId: number,
  propertyId: number,
  content: string,
): Promise<{ ok: true }> {
  const { user, buyer } = await requireActiveInvestor(store, userId);
  const text = String(content || "").trim().slice(0, 2000);
  if (!text) throw new InvestorError(400, "empty_message", "Message cannot be empty.");
  const deal = await store.getDealById(propertyId);
  if (!deal) throw new InvestorError(404, "deal_not_found", "Deal not found.");
  if (!canSeeVisibility(deal.visibility, Boolean(buyer.proofOfFundsVerifiedAt))) {
    throw new InvestorError(403, "deal_not_visible", "This deal is not visible to your account.");
  }
  await store.logBuyerCommunication({
    buyerId: buyer.id,
    userId: user.id,
    type: "investor_message",
    content: tagDealContent(propertyId, text),
  });
  return { ok: true };
}

export const POF_ALLOWED_MIME = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
]);

export function validatePofFile(file: { mimetype: string; size: number; originalname: string }): void {
  if (!POF_ALLOWED_MIME.has(file.mimetype)) {
    throw new InvestorError(400, "invalid_pof_type", "Proof of funds must be a PDF or image (JPEG/PNG/WebP).");
  }
  if (file.size > 10 * 1024 * 1024) {
    throw new InvestorError(400, "pof_too_large", "Proof of funds file must be under 10 MB.");
  }
}

export { EMPTY_BUY_BOX };
export type { FeedDeal, InvestorBuyBox };
export { computeDealSpread };
