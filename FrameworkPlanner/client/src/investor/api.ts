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

export class InvestorApiError extends Error {
  status: number;
  code: string;
  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
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
