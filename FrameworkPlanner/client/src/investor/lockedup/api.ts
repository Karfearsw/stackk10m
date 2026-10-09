/**
 * Locked-Up workspace + contract workspace API client (Phases 15/16).
 * Lives beside the investor api.ts; same session, same error shape.
 */
import { investorApi, InvestorApiError, money } from "../api";

export type LockedUpStage =
  | "awaiting_deposit"
  | "due_diligence"
  | "title"
  | "funding"
  | "ready_to_close"
  | "closed"
  | "at_risk";

export const LOCKED_UP_STAGES: Array<{ value: LockedUpStage; label: string }> = [
  { value: "awaiting_deposit", label: "Awaiting Deposit" },
  { value: "due_diligence", label: "Due Diligence" },
  { value: "title", label: "Title" },
  { value: "funding", label: "Funding" },
  { value: "ready_to_close", label: "Ready to Close" },
  { value: "closed", label: "Closed" },
  { value: "at_risk", label: "At Risk" },
];

export type ContractStage =
  | "draft"
  | "internal_review"
  | "attorney_review"
  | "ready"
  | "sent"
  | "delivered"
  | "opened"
  | "partially_signed"
  | "executed"
  | "declined"
  | "voided"
  | "expired"
  | "superseded";

export interface RiskWarning {
  severity: "warning" | "critical";
  message: string;
}

export interface LockedUpDeal {
  id: number;
  stage: LockedUpStage;
  stageLabel: string;
  assignedTeam: string[];
  nextAction: string | null;
  nextActionDue: string | null;
  riskNotes: string | null;
  lockedAt: string | null;
  openConditions: number;
  property: {
    id: number;
    address: string;
    city: string;
    state: string;
    zipCode: string;
    image: string | null;
    beds: number | null;
    baths: number | null;
    sqft: number | null;
    propertyType: string | null;
    arv: number | null;
    repairCost: number | null;
  } | null;
  contract: {
    id: number;
    contractType: string | null;
    acquisitionPrice: number | null;
    assignmentPrice: number | null;
    emdAmount: number | null;
    emdStatus: string | null;
    inspectionDeadline: string | null;
    expirationDate: string | null;
    closingDate: string | null;
    titleCompany: string | null;
    fundingStatus: string | null;
    effectiveDate: string | null;
    stage: ContractStage;
    signersDone: number;
    signersTotal: number;
    parties: { buyer: string | null; seller: string | null };
  } | null;
  risks: RiskWarning[];
}

export interface DealCondition {
  id: number;
  title: string;
  status: "open" | "met" | "waived";
  dueDate: string | null;
  notes: string | null;
}

export interface TimelineEvent {
  id: number;
  eventType: string;
  payload: Record<string, unknown>;
  actorType: string | null;
  ip: string | null;
  createdAt: string | null;
  eventHash: string | null;
  prevHash: string | null;
}

export interface GateRequirement {
  key: string;
  label: string;
  met: boolean;
}

export interface GateResult {
  contractId: number;
  eligible: boolean;
  unmet: string[];
  requirements: GateRequirement[];
}

export interface ContractCardDto {
  id: number;
  documentName: string;
  property: { id: number; address: string; city: string; state: string } | null;
  deal: { id: number; stage: string; stageLabel: string } | null;
  parties: { buyer: string | null; seller: string | null };
  version: number;
  contractType: string | null;
  stage: ContractStage;
  signersDone: number;
  signersTotal: number;
  sentAt: string | null;
  lastOpenedAt: string | null;
  expiration: string | null;
  closingDate: string | null;
  nextAction: string;
}

export interface ContractSigner {
  id: number;
  name: string;
  email: string | null;
  role: string | null;
  signingOrder: number | null;
  status: string;
  sentAt: string | null;
  viewedAt: string | null;
  signedAt: string | null;
  declinedAt: string | null;
  declineReason: string | null;
  consentAt: string | null;
  hasSignature: boolean;
}

export interface ContractReminder {
  id: number;
  remindAt: string;
  channel: string;
  recipient: string;
  note: string | null;
  status: string;
  signerId: number | null;
}

export interface ContractDetail {
  contract: {
    id: number;
    documentName: string;
    contractType: string | null;
    stage: ContractStage;
    version: number;
    signersDone: number;
    signersTotal: number;
    acquisitionPrice: number | null;
    assignmentPrice: number | null;
    emdAmount: number | null;
    emdStatus: string | null;
    effectiveDate: string | null;
    expirationDate: string | null;
    inspectionDeadline: string | null;
    closingDate: string | null;
    titleCompany: string | null;
    fundingStatus: string | null;
    sentAt: string | null;
    lastOpenedAt: string | null;
    executedAt: string | null;
    voidedAt: string | null;
    voidedReason: string | null;
    documentSha256: string | null;
    finalPdfSha256: string | null;
    immutable: boolean;
    nextAction: string;
    mergeFields: Record<string, unknown> | null;
  };
  property: LockedUpDeal["property"];
  template: {
    id: number;
    name: string;
    version: number;
    jurisdiction: string | null;
    status: string | null;
    approvedAt: string | null;
  } | null;
  envelope: {
    id: number;
    status: string;
    signingMode: string;
    sentAt: string | null;
    expiresAt: string | null;
    completedAt: string | null;
  } | null;
  signers: ContractSigner[];
  versions: Array<{ id: number; versionNumber: number; changes: string | null; createdBy: string | null; createdAt: string | null }>;
  reminders: ContractReminder[];
  timeline: TimelineEvent[];
  gate: GateResult;
}

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, { credentials: "include", ...init });
  const body = await res.json().catch(() => null);
  if (!res.ok) {
    const unmet = body?.unmet as string[] | undefined;
    const err = new InvestorApiError(res.status, body?.code || "request_failed", body?.message || `Request failed (${res.status})`);
    (err as unknown as { unmet?: string[] }).unmet = unmet;
    throw err;
  }
  return body as T;
}

const json = (data: unknown, method = "POST") => ({
  method,
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(data),
});

const BASE = "/api/investor/locked-up";

export const lockedUpApi = {
  deals: () => req<{ deals: LockedUpDeal[] }>(`${BASE}/deals`),
  deal: (id: number) => req<{ deal: LockedUpDeal; conditions: DealCondition[]; timeline: TimelineEvent[] }>(`${BASE}/deals/${id}`),
  gateCheck: (contractId: number) => req<GateResult>(`${BASE}/gate/contracts/${contractId}`),
  lock: (contractId: number) => req<{ deal: LockedUpDeal; gate: GateResult }>(`${BASE}/deals`, json({ contractId })),
  moveStage: (id: number, stage: LockedUpStage) => req<{ deal: LockedUpDeal }>(`${BASE}/deals/${id}/stage`, json({ stage }, "PUT")),
  updateDeal: (id: number, patch: Record<string, unknown>) => req<{ deal: LockedUpDeal }>(`${BASE}/deals/${id}`, json(patch, "PUT")),
  conditions: (id: number) => req<{ conditions: DealCondition[] }>(`${BASE}/deals/${id}/conditions`),
  addCondition: (id: number, data: { title: string; dueDate?: string | null; notes?: string | null }) =>
    req<{ id: number }>(`${BASE}/deals/${id}/conditions`, json(data)),
  updateCondition: (id: number, condId: number, patch: Partial<DealCondition>) =>
    req<{ ok: boolean }>(`${BASE}/deals/${id}/conditions/${condId}`, json(patch, "PUT")),
  deleteCondition: (id: number, condId: number) =>
    req<{ ok: boolean }>(`${BASE}/deals/${id}/conditions/${condId}`, { method: "DELETE" }),
};

export const contractWorkspaceApi = {
  list: () => req<{ contracts: ContractCardDto[] }>(`${BASE}/contracts`),
  detail: (id: number) => req<ContractDetail>(`${BASE}/contracts/${id}`),
  preview: (id: number) => req<{ title: string; content: string }>(`${BASE}/contracts/${id}/preview`),
  reminders: (id: number) => req<{ reminders: ContractReminder[] }>(`${BASE}/contracts/${id}/reminders`),
  createReminder: (id: number, data: { remindAt: string; channel: "email" | "sms" | "in_app"; recipient: string; signerId?: number | null; note?: string | null }) =>
    req<{ id: number; sent: boolean }>(`${BASE}/contracts/${id}/reminders`, json(data)),
  cancelReminder: (id: number, reminderId: number) =>
    req<{ ok: boolean }>(`${BASE}/contracts/${id}/reminders/${reminderId}`, { method: "DELETE" }),
  voidContract: (id: number, reason?: string | null) =>
    req<{ ok: boolean }>(`${BASE}/contracts/${id}/void`, json({ reason: reason ?? null })),
  declineContract: (id: number, reason: string) =>
    req<{ ok: boolean }>(`${BASE}/contracts/${id}/decline`, json({ reason })),
  amend: (id: number, data: { changes: string; content?: string }) =>
    req<{ documentId: number; version: number }>(`${BASE}/contracts/${id}/amend`, json(data)),
  certificate: (id: number) => req<Record<string, unknown>>(`${BASE}/contracts/${id}/certificate`),
  events: (id: number) => req<{ events: TimelineEvent[] }>(`${BASE}/contracts/${id}/events`),
  downloadUrl: (id: number) => `${BASE}/contracts/${id}/download`,
  templates: () => req<{ templates: Array<{ id: number; name: string; version: number; jurisdiction: string | null }> }>(`${BASE}/templates`),
};

export { money, InvestorApiError, investorApi };

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return "—";
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return "—";
  return d.toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });
}
