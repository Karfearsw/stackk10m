/**
 * Investor portal API client. Separate from the CRM queryClient auth flow:
 * investors authenticate via their own session (investorUserId) and never
 * touch /api/auth/*.
 */
import { useCallback, useEffect, useState } from "react";

export interface InvestorUser {
  id: number;
  email: string;
  firstName: string | null;
  lastName: string | null;
  phone: string | null;
  companyName: string | null;
  role: string | null;
  isActive: boolean | null;
  investorStatus: string | null;
}

export interface BuyBox {
  targetStates: string[];
  targetZips: string[];
  strategies: string[];
  minSpread: number | null;
  minYield: number | null;
  propertyTypes: string[];
  priceMin: number | null;
  priceMax: number | null;
  minBeds: number | null;
  maxBeds: number | null;
  notifyMode: "instant" | "digest" | "off";
}

// ---------------------------------------------------------------------------
// Deal Matchroom: investor profile + named buy boxes (Phase 9/10).
// ---------------------------------------------------------------------------

export type NotifyFrequency = "instant" | "digest" | "weekly" | "off";

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

export interface InvestorProfile {
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

export interface NamedBuyBox {
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

export interface BuyBoxMatchEntry {
  id: number;
  propertyId: number | null;
  address: string | null;
  city: string | null;
  score: number;
  reasons: string[];
  matchedAt: string | null;
  notifiedAt: string | null;
}

export interface BuyBoxCreateInput {
  name: string;
  hardRequirements?: Record<string, unknown>;
  preferences?: Record<string, unknown>;
  exclusions?: Record<string, unknown>;
  notifyFrequency?: NotifyFrequency;
  teamOwnerId?: number | null;
  seedFromProfile?: boolean;
}

const put = (data: unknown) => ({
  method: "PUT",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(data),
});

export interface DealCard {
  score: number;
  reasons: string[];
  spread: number | null;
  saved: boolean;
  deal: {
    id: number;
    address: string;
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
  };
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
  address: string | null;
  city: string | null;
  loiStatus: string | null;
}

/* ---------- Phase 11/12: discovery feed with explainable matching ---------- */

export type DiscoveryAction = "viewed" | "saved" | "passed" | "interested" | "offer_submitted";

export type DimensionStatus = "strong" | "moderate" | "weak" | "missing" | "hard_fail";

export interface MatchDimension {
  key: string;
  label: string;
  status: DimensionStatus;
  /** 0-100 fit for this dimension. */
  score: number;
  weight: number;
  /** Plain-English explanation of this dimension's result. */
  detail: string;
  /** True when the detail involves an estimate (ARV, spread, yield). */
  estimate?: boolean;
}

export interface HardRuleFailure {
  rule: string;
  message: string;
}

export interface MatchExplanation {
  /** 0-100 overall fit. 0 when a hard rule fails. Estimates only — never guaranteed returns. */
  score: number;
  hardFail: boolean;
  dimensions: MatchDimension[];
  strongMatches: string[];
  weakMatches: string[];
  hardRuleFailures: HardRuleFailure[];
  missingInformation: string[];
  dataSources: string[];
  /** ISO timestamp of the calculation. */
  calculatedAt: string;
}

export type VerificationState = "verified" | "partial" | "unverified";

export interface DiscoveryDealCard extends DealCard {
  explanation: MatchExplanation;
  deal: DealCard["deal"] & {
    /** Visibility-safe address: off-market listings hide the street. */
    displayAddress: string;
    visibility: string | null;
    strategy: string | null;
    occupancy: string | null;
    /** Contract/offer deadline, ISO string or null. */
    deadline: string | null;
    condition: string | null;
    verificationState: VerificationState;
    missingWarnings: string[];
  };
}

export class InvestorApiError extends Error {
  status: number;
  code: string;
  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

// ---------------- Phase 13/14: deal rooms + structured offers ----------------

export type InterestStatus =
  | "available" | "viewed" | "saved" | "passed" | "interested" | "owner_review"
  | "mutual_match" | "due_diligence" | "offer_submitted" | "negotiating"
  | "offer_accepted" | "contract_sent" | "fully_executed" | "locked_up"
  | "closing" | "closed";

export type OfferStatus =
  | "draft" | "submitted" | "viewed" | "countered" | "accepted" | "rejected"
  | "withdrawn" | "expired" | "converted_to_contract";

export interface InterestProperty {
  id: number;
  address: string | null;
  city: string | null;
  state: string | null;
  zipCode: string | null;
  price: number | null;
  beds: number | null;
  baths: number | null;
  sqft: number | null;
  propertyType: string | null;
  images: string[];
  arv: number | null;
  repairCost: number | null;
  askingPrice: number | null;
  targetDispositionPrice: number | null;
}

export interface InterestRecord {
  id: number;
  propertyId: number;
  status: InterestStatus | string;
  createdAt: string | null;
  updatedAt: string | null;
  roomId: number | null;
  property: InterestProperty;
}

export interface DealRoomSummary {
  id: number;
  status: string | null;
  interestStatus: string | null;
  updatedAt: string | null;
  property: { id: number | null; address: string | null; city: string | null; state: string | null; price: number | null; image: string | null };
}

export interface RoomMessage {
  id: number;
  authorName: string;
  mine: boolean;
  kind: string | null;
  body: string | null;
  parentId: number | null;
  createdAt: string | null;
}

export interface RoomTask {
  id: number;
  title: string | null;
  description: string | null;
  dueAt: string | null;
  status: string | null;
  category: string | null;
  completedAt: string | null;
}

export interface RoomFile {
  id: number;
  filename: string | null;
  mimeType: string | null;
  storageKey: string | null;
  category: string | null;
  createdAt: string | null;
}

export interface Showing {
  id: number;
  startsAt: string | null;
  endsAt: string | null;
  status: string | null;
  notes: string | null;
}

export interface StructuredOffer {
  id: number;
  dealRoomId: number | null;
  propertyId: number | null;
  investorUserId: number | null;
  offerAmount: number | null;
  earnestMoney: number | null;
  financingType: string | null;
  inspectionPeriodDays: number | null;
  closingDate: string | null;
  dealStructure: string | null;
  contingencies: string[];
  additionalTerms: string | null;
  pofStorageKey: string | null;
  expirationAt: string | null;
  buyerEntity: string | null;
  authorizedSigner: string | null;
  status: OfferStatus | string;
  versionNumber: number | null;
  parentOfferId: number | null;
  submittedAt: string | null;
  createdAt: string | null;
  updatedAt: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
}

export interface OfferVersion {
  versionNumber: number | null;
  snapshot: Record<string, unknown>;
  createdAt: string | null;
}

export interface DealRoomDetail {
  id: number;
  status: string | null;
  createdAt: string | null;
  property: InterestProperty | null;
  interestStatus: string | null;
  participants: { userId: number | null; role: string | null; name: string; email: string | null; joinedAt: string | null }[];
  messages: RoomMessage[];
  tasks: RoomTask[];
  files: RoomFile[];
  showings: Showing[];
  offers: StructuredOffer[];
}

export interface OfferForm {
  offerAmount: number;
  earnestMoney?: number | null;
  financingType?: string | null;
  inspectionPeriodDays?: number | null;
  closingDate?: string | null;
  dealStructure?: string | null;
  contingencies?: string[];
  additionalTerms?: string | null;
  expirationAt?: string | null;
  buyerEntity?: string | null;
  authorizedSigner?: string | null;
}

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, { credentials: "include", ...init });
  const body = await res.json().catch(() => null);
  if (!res.ok) {
    throw new InvestorApiError(res.status, body?.code || "request_failed", body?.message || `Request failed (${res.status})`);
  }
  return body as T;
}

const json = (data: unknown) => ({
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(data),
});

export const investorApi = {
  status: () => req<{ enabled: boolean }>("/api/investor/status"),
  signup: (data: { firstName: string; lastName: string; email: string; password: string; phone?: string; company?: string }, pof?: File) => {
    if (pof) {
      const fd = new FormData();
      Object.entries(data).forEach(([k, v]) => { if (v) fd.append(k, v); });
      fd.append("pof", pof);
      return req<{ user: InvestorUser; pendingApproval: boolean }>("/api/investor/signup", { method: "POST", body: fd });
    }
    return req<{ user: InvestorUser; pendingApproval: boolean }>("/api/investor/signup", json(data));
  },
  login: (email: string, password: string) =>
    req<{ user: InvestorUser }>("/api/investor/login", json({ email, password })),
  logout: () => req<{ ok: boolean }>("/api/investor/logout", { method: "POST" }),
  me: () => req<{ user: InvestorUser; pofVerified: boolean; pofProvided: boolean }>("/api/investor/me"),
  getBuyBox: () => req<BuyBox>("/api/investor/buy-box"),
  saveBuyBox: (box: Partial<BuyBox>) =>
    req<BuyBox>("/api/investor/buy-box", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(box) }),
  feed: (sort: "score" | "newest" | "price" = "score") =>
    req<{ cards: DealCard[] }>(`/api/investor/feed?sort=${sort}`),
  saved: () => req<{ saved: DealCard[] }>("/api/investor/saved"),
  interest: (dealId: number) => req<{ ok: boolean }>(`/api/investor/deals/${dealId}/interest`, { method: "POST" }),
  pass: (dealId: number) => req<{ ok: boolean }>(`/api/investor/deals/${dealId}/pass`, { method: "POST" }),
  offer: (dealId: number, data: { offerAmount: number; earnestMoney?: number | null; closingTimelineDays?: number | null; contingencies?: string[]; specialTerms?: string | null }) =>
    req<{ offerId: number; loiId: number }>(`/api/investor/deals/${dealId}/offers`, json(data)),
  offers: () => req<{ offers: OfferRow[] }>("/api/investor/offers"),
  uploadPof: (file: File) => {
    const fd = new FormData();
    fd.append("pof", file);
    return req<{ ok: boolean }>("/api/investor/pof", { method: "POST", body: fd });
  },

  // --- Phase 13: interest lifecycle ---
  expressInterest: (dealId: number) =>
    req<{ interest: InterestRecord }>(`/api/investor/deals/${dealId}/interests`, { method: "POST" }),
  interests: () => req<{ interests: InterestRecord[] }>("/api/investor/interests"),
  updateInterest: (interestId: number, status: string) =>
    req<{ interest: InterestRecord }>(`/api/investor/interests/${interestId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    }),

  // --- Phase 13: deal rooms ---
  dealRooms: () => req<{ rooms: DealRoomSummary[] }>("/api/investor/deal-rooms"),
  dealRoom: (roomId: number) => req<{ room: DealRoomDetail }>(`/api/investor/deal-rooms/${roomId}`),
  sendRoomMessage: (roomId: number, data: { body: string; kind?: "message" | "question" | "answer"; parentId?: number | null }) =>
    req<{ message: RoomMessage }>(`/api/investor/deal-rooms/${roomId}/messages`, json(data)),
  requestShowing: (roomId: number, data: { startsAt: string; endsAt: string; notes?: string | null }) =>
    req<{ showing: Showing }>(`/api/investor/deal-rooms/${roomId}/showings`, json(data)),

  // --- Phase 14: structured offers ---
  structuredOffers: () => req<{ offers: StructuredOffer[] }>("/api/investor/offers/structured"),
  structuredOfferDetail: (offerId: number) =>
    req<{ offer: StructuredOffer; versions: OfferVersion[] }>(`/api/investor/offers/structured/${offerId}`),
  createOfferDraft: (roomId: number, data: OfferForm) =>
    req<{ offer: StructuredOffer }>(`/api/investor/deal-rooms/${roomId}/offers`, json(data)),
  updateOfferDraft: (offerId: number, data: Partial<OfferForm>) =>
    req<{ offer: StructuredOffer }>(`/api/investor/offers/structured/${offerId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    }),
  submitOffer: (offerId: number) =>
    req<{ offer: StructuredOffer }>(`/api/investor/offers/structured/${offerId}/submit`, json({ confirmed: true })),
  withdrawOffer: (offerId: number) =>
    req<{ offer: StructuredOffer }>(`/api/investor/offers/structured/${offerId}/withdraw`, { method: "POST" }),

  // --- Phase 9/10: investor profile + named buy boxes ---
  getProfile: () => req<{ profile: InvestorProfile | null }>("/api/investor/profile"),
  saveProfile: (data: {
    displayName?: string | null;
    companyName?: string | null;
    role?: string | null;
    criteria?: Partial<ProfileCriteria>;
    notificationPrefs?: Partial<NotificationPrefs>;
    privacy?: Partial<PrivacySettings>;
  }) => req<{ profile: InvestorProfile }>("/api/investor/profile", put(data)),
  listBuyBoxes: (includeArchived = false) =>
    req<{ boxes: NamedBuyBox[] }>(`/api/investor/buy-boxes${includeArchived ? "?includeArchived=true" : ""}`),
  getBuyBoxDetail: (id: number) => req<{ box: NamedBuyBox }>(`/api/investor/buy-boxes/${id}`),
  createBuyBox: (data: BuyBoxCreateInput) => req<{ box: NamedBuyBox }>("/api/investor/buy-boxes", json(data)),
  updateBuyBox: (id: number, data: Partial<BuyBoxCreateInput>) =>
    req<{ box: NamedBuyBox }>(`/api/investor/buy-boxes/${id}`, put(data)),
  deleteBuyBox: (id: number) => req<{ ok: boolean }>(`/api/investor/buy-boxes/${id}`, { method: "DELETE" }),
  duplicateBuyBox: (id: number) => req<{ box: NamedBuyBox }>(`/api/investor/buy-boxes/${id}/duplicate`, { method: "POST" }),
  pauseBuyBox: (id: number) => req<{ box: NamedBuyBox }>(`/api/investor/buy-boxes/${id}/pause`, { method: "POST" }),
  resumeBuyBox: (id: number) => req<{ box: NamedBuyBox }>(`/api/investor/buy-boxes/${id}/resume`, { method: "POST" }),
  archiveBuyBox: (id: number) => req<{ box: NamedBuyBox }>(`/api/investor/buy-boxes/${id}/archive`, { method: "POST" }),
  restoreBuyBox: (id: number) => req<{ box: NamedBuyBox }>(`/api/investor/buy-boxes/${id}/restore`, { method: "POST" }),
  buyBoxMatches: (id: number, limit = 50) =>
    req<{ matches: BuyBoxMatchEntry[] }>(`/api/investor/buy-boxes/${id}/matches?limit=${limit}`),

  // --- Phase 11/12: explainable discovery feed + interaction log ---
  discoverFeed: (sort: "score" | "newest" | "price" = "score") =>
    req<{ cards: DiscoveryDealCard[] }>(`/api/investor/discover/feed?sort=${sort}`),
  logInteraction: (dealId: number, action: DiscoveryAction, sourceScreen = "discover_feed") =>
    req<{ ok: boolean; action: DiscoveryAction; prevState: string | null }>(
      `/api/investor/discover/deals/${dealId}/interactions`,
      json({ action, sourceScreen }),
    ),
  undoPass: (dealId: number, sourceScreen = "discover_feed") =>
    req<{ ok: boolean; undone: boolean }>(
      `/api/investor/discover/deals/${dealId}/interactions`,
      json({ action: "undo", sourceScreen }),
    ),
  matchExplanation: (dealId: number) =>
    req<{ dealId: number; explanation: MatchExplanation }>(`/api/investor/discover/deals/${dealId}/explanation`),
};

export function useInvestorSession() {
  const [user, setUser] = useState<InvestorUser | null>(null);
  const [pofVerified, setPofVerified] = useState(false);
  const [pofProvided, setPofProvided] = useState(false);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const me = await investorApi.me();
      setUser(me.user);
      setPofVerified(me.pofVerified);
      setPofProvided(me.pofProvided);
    } catch {
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const logout = useCallback(async () => {
    await investorApi.logout().catch(() => null);
    setUser(null);
  }, []);

  return { user, pofVerified, pofProvided, loading, refresh, logout };
}

export function usePortalEnabled() {
  const [state, setState] = useState<{ loading: boolean; enabled: boolean }>({ loading: true, enabled: false });
  useEffect(() => {
    investorApi.status()
      .then((s) => setState({ loading: false, enabled: s.enabled }))
      .catch(() => setState({ loading: false, enabled: false }));
  }, []);
  return state;
}

export function money(n: number | string | null | undefined): string {
  if (n === null || n === undefined || n === "") return "—";
  const v = Number(n);
  if (!Number.isFinite(v)) return "—";
  return "$" + v.toLocaleString("en-US", { maximumFractionDigits: 0 });
}
