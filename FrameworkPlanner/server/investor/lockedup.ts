/**
 * Locked-Up workspace (Phase 15) + contract display / e-sign workspace (Phase 16).
 *
 * A deal enters "Locked Up" ONLY through the server-side gate
 * (evaluateLockedUpGate): fully executed agreement, every required signer
 * done, effective date, contract expiration, closing date, and earnest-money
 * info all present. Never from likes/saves/matches/verbal acceptance.
 *
 * This module exports an express Router (DO NOT mount here — the coordinator
 * mounts it) and the pure gate function. Envelope/signature logic is reused
 * from server/esign/* via import; no signing ceremony is reimplemented.
 *
 * Auth: investor portal session (investorUserId), scoped to the investor's own
 * buyer-linked contracts. Reminder rows are records only — nothing here sends
 * email or SMS.
 */
import { Router, type Request, type Response } from "express";
import { and, desc, eq, sql } from "drizzle-orm";
import { db } from "../db.js";
import {
  buyers,
  contacts,
  contractDocuments,
  contractEnvelopes,
  contractEvents,
  contractSigners,
  contractTemplates,
  contracts,
  documentVersions,
  properties,
} from "../shared-schema.js";
import type { InvestorStore } from "./store.js";
import { InvestorError, requireActiveInvestor } from "./service.js";
import {
  EsignError,
  buildCertificate,
  drizzleAuditStore,
  getEnvelopeDetail,
  getFinalPdf,
  voidEnvelope,
} from "../esign/envelopes.js";
import { appendAuditEvent } from "../esign/audit.js";
import { mergeTemplate } from "../services/esign/merge.js";

// ---------------------------------------------------------------------------
// Stages
// ---------------------------------------------------------------------------

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

export function isLockedUpStage(v: string): v is LockedUpStage {
  return LOCKED_UP_STAGES.some((s) => s.value === v);
}

export function stageLabel(v: string): string {
  return LOCKED_UP_STAGES.find((s) => s.value === v)?.label ?? v;
}

/** Full contract lifecycle shown in the workspace (Phase 16). */
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

export const EMD_STATUSES = ["not_received", "pending", "deposited", "released"] as const;
export const FUNDING_STATUSES = ["not_started", "in_progress", "committed", "funded"] as const;

// ---------------------------------------------------------------------------
// Row types (new tables have no drizzle defs; raw SQL is used)
// ---------------------------------------------------------------------------

interface LockedUpDealRow {
  id: number;
  property_id: number;
  contract_id: number | null;
  stage: string;
  assigned_team: string;
  next_action: string | null;
  next_action_due: string | null;
  risk_notes: string | null;
  locked_at: string | null;
  unlocked_at: string | null;
  created_at: string | null;
  updated_at: string | null;
}

interface DealConditionRow {
  id: number;
  locked_up_deal_id: number;
  title: string;
  status: string;
  due_date: string | null;
  notes: string | null;
  created_at: string | null;
  updated_at: string | null;
}

interface ContractReminderRow {
  id: number;
  contract_id: number;
  envelope_id: number | null;
  signer_id: number | null;
  remind_at: string;
  channel: string;
  recipient: string;
  note: string | null;
  status: string;
  created_at: string | null;
}

export interface RiskWarning {
  severity: "warning" | "critical";
  message: string;
}

type ContractRow = typeof contracts.$inferSelect;
type EnvelopeRow = typeof contractEnvelopes.$inferSelect;
type SignerRow = typeof contractSigners.$inferSelect;

// ---------------------------------------------------------------------------
// Phase 15: the Locked-Up gate
// ---------------------------------------------------------------------------

export interface GateRequirement {
  key: string;
  label: string;
  met: boolean;
}

export interface LockedUpGateResult {
  contractId: number;
  eligible: boolean;
  unmet: string[];
  requirements: GateRequirement[];
}

async function latestV2Envelope(contractId: number): Promise<EnvelopeRow | null> {
  const rows = await db
    .select()
    .from(contractEnvelopes)
    .where(and(eq(contractEnvelopes.contractId, contractId), eq(contractEnvelopes.esignVersion, 2)))
    .orderBy(desc(contractEnvelopes.id))
    .limit(1);
  return rows[0] ?? null;
}

async function envelopeSigners(envelopeId: number): Promise<SignerRow[]> {
  return db.select().from(contractSigners).where(eq(contractSigners.envelopeId, envelopeId));
}

/**
 * The server-side gate. A contract may enter Locked Up ONLY when every
 * requirement below is met. Returns which requirements are unmet.
 */
export async function evaluateLockedUpGate(contractId: number): Promise<LockedUpGateResult> {
  const reqs: GateRequirement[] = [];
  const [contract] = await db.select().from(contracts).where(eq(contracts.id, contractId)).limit(1);

  if (!contract) {
    return {
      contractId,
      eligible: false,
      unmet: ["Contract record not found."],
      requirements: [{ key: "contract_exists", label: "Contract record exists", met: false }],
    };
  }

  const envelope = await latestV2Envelope(contractId);
  const signers = envelope ? await envelopeSigners(envelope.id) : [];
  const c = contract as ContractRow & {
    effectiveDate?: Date | string | null;
    expirationDate?: Date | string | null;
    closingDate?: Date | string | null;
    emdAmount?: string | null;
    emdStatus?: string | null;
  };

  const executedAgreement =
    (envelope?.status === "completed" || contract.status === "executed" || contract.executedAt != null) &&
    envelope?.status !== "voided" &&
    envelope?.status !== "expired" &&
    contract.voidedAt == null;
  reqs.push({
    key: "executed_agreement",
    label: "Fully executed agreement is on file (envelope completed, not voided or expired)",
    met: executedAgreement,
  });

  const signersDone =
    signers.length > 0 && signers.every((s) => s.status === "signed") && !signers.some((s) => s.status === "declined");
  reqs.push({
    key: "signers_complete",
    label: "All required signers have completed signing (none pending or declined)",
    met: signersDone,
  });

  reqs.push({ key: "effective_date", label: "Effective date is set", met: c.effectiveDate != null });
  reqs.push({ key: "expiration_date", label: "Contract expiration date is set", met: c.expirationDate != null });
  reqs.push({
    key: "closing_date",
    label: "Closing date is set",
    met: c.closingDate != null || contract.closeDate != null,
  });
  reqs.push({
    key: "emd",
    label: "Earnest-money amount and status are recorded",
    met: c.emdAmount != null && c.emdStatus != null && c.emdStatus !== "",
  });

  const unmet = reqs.filter((r) => !r.met).map((r) => r.label);
  return { contractId, eligible: unmet.length === 0, unmet, requirements: reqs };
}

/** Genuine operational risks only — oxblood is reserved for these. */
export function computeRisks(
  deal: { stage: string },
  contract: ContractRow & {
    expirationDate?: Date | string | null;
    closingDate?: Date | string | null;
    emdStatus?: string | null;
    inspectionDeadline?: Date | string | null;
  },
  envelope: EnvelopeRow | null,
): RiskWarning[] {
  const risks: RiskWarning[] = [];
  const now = Date.now();
  const DAY = 86_400_000;
  const toTime = (v: Date | string | null | undefined): number | null => {
    if (v == null) return null;
    const t = v instanceof Date ? v.getTime() : new Date(v).getTime();
    return Number.isFinite(t) ? t : null;
  };

  const insp = toTime(contract.inspectionDeadline);
  if (insp !== null && insp < now && deal.stage !== "closed") {
    risks.push({ severity: "critical", message: "Inspection deadline has passed." });
  }
  const exp = toTime(contract.expirationDate);
  if (exp !== null && deal.stage !== "closed") {
    if (exp < now) risks.push({ severity: "critical", message: "Contract expiration date has passed." });
    else if (exp - now < 7 * DAY) risks.push({ severity: "warning", message: "Contract expires within 7 days." });
  }
  const close = toTime(contract.closingDate ?? contract.closeDate);
  if (close !== null && close < now && deal.stage !== "closed") {
    risks.push({ severity: "critical", message: "Closing date has passed and the deal is not closed." });
  }
  if (
    contract.emdStatus === "not_received" &&
    deal.stage !== "awaiting_deposit" &&
    deal.stage !== "closed" &&
    deal.stage !== "at_risk"
  ) {
    risks.push({ severity: "warning", message: "Earnest money not yet received for a deal past Awaiting Deposit." });
  }
  if (deal.stage === "at_risk") {
    risks.push({ severity: "critical", message: "Deal is flagged At Risk." });
  }
  const envExp = toTime(envelope?.expiresAt ?? null);
  if (envExp !== null && envelope && !["completed", "voided", "expired"].includes(envelope.status)) {
    if (envExp < now) risks.push({ severity: "warning", message: "Signing envelope has expired." });
    else if (envExp - now < 3 * DAY) risks.push({ severity: "warning", message: "Signing envelope expires within 3 days." });
  }
  return risks;
}

/** Derive the Phase 16 lifecycle stage for a contract. */
export function deriveContractStage(
  contract: ContractRow,
  document: { status?: string | null } | null,
  envelope: EnvelopeRow | null,
  signers: SignerRow[],
): ContractStage {
  const c = contract as ContractRow & { supersededByContractId?: number | null };
  if (c.supersededByContractId != null || document?.status === "superseded") return "superseded";
  if (contract.voidedAt != null || envelope?.status === "voided" || document?.status === "voided") return "voided";
  if (envelope?.status === "expired" || document?.status === "expired") return "expired";
  if (envelope?.status === "completed" || contract.status === "executed" || contract.executedAt != null) return "executed";
  if (signers.some((s) => s.status === "declined") || document?.status === "declined" || contract.status === "declined") {
    return "declined";
  }
  if (envelope) {
    if (signers.some((s) => s.status === "signed")) return "partially_signed";
    if (envelope.status === "viewed" || signers.some((s) => s.status === "viewed")) return "opened";
    if (envelope.status === "signed") return "partially_signed";
    if (envelope.status === "sent") {
      const allInvited = signers.length > 0 && signers.every((s) => s.sentAt != null);
      return allInvited ? "delivered" : "sent";
    }
    return "draft";
  }
  const docStatus = String(document?.status ?? "draft");
  if (docStatus === "internal_review" || docStatus === "attorney_review" || docStatus === "ready") {
    return docStatus as ContractStage;
  }
  return "draft";
}

/** Next action label for a contract card, derived from its stage. */
export function contractNextAction(stage: ContractStage, signersDone: number, signersTotal: number): string {
  switch (stage) {
    case "draft": return "Finish the draft and move it to internal review.";
    case "internal_review": return "Complete internal review.";
    case "attorney_review": return "Awaiting attorney review — do not send until cleared.";
    case "ready": return "Ready to send for signature.";
    case "sent": return "Invitations are going out to signers.";
    case "delivered": return `Waiting on signers (${signersDone}/${signersTotal} signed).`;
    case "opened": return `A signer has opened the document (${signersDone}/${signersTotal} signed).`;
    case "partially_signed": return `Chase remaining signatures (${signersDone}/${signersTotal} signed).`;
    case "executed": return "Fully executed — verify gate requirements, then move to Locked Up.";
    case "declined": return "Declined — review the reason and decide whether to re-issue.";
    case "voided": return "Voided — no further action.";
    case "expired": return "Expired — re-issue with a new expiration if still wanted.";
    case "superseded": return "Superseded by a newer version.";
  }
}

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------

export interface LockedUpRouterDeps {
  store: InvestorStore;
}

function investorSessionUserId(req: Request): number | null {
  const s = req.session as unknown as { investorUserId?: unknown } | undefined;
  const id = s?.investorUserId;
  return typeof id === "number" && Number.isFinite(id) ? id : null;
}

function sendLockedUpError(res: Response, err: unknown) {
  if (err instanceof InvestorError) {
    return res.status(err.status).json({ code: err.code, message: err.message });
  }
  if (err instanceof EsignError) {
    return res.status(err.http).json({ code: err.code, message: err.message });
  }
  console.error("[lockedup]", err);
  return res.status(500).json({ code: "internal_error", message: "Something went wrong." });
}

function toIso(v: Date | string | null | undefined): string | null {
  if (v == null) return null;
  const d = v instanceof Date ? v : new Date(v);
  return Number.isFinite(d.getTime()) ? d.toISOString() : null;
}

function num(v: string | number | null | undefined): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function parseTeam(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const v: unknown = JSON.parse(raw);
    return Array.isArray(v) ? v.map((x) => String(x)).filter(Boolean) : [];
  } catch {
    return [];
  }
}

async function audit(contractId: number, eventType: string, payload: unknown, actorUserId: number | null, req: Request) {
  await appendAuditEvent(
    drizzleAuditStore(),
    contractId,
    eventType,
    payload,
    {
      actorType: "agent",
      actorUserId,
      ip: (req.ip as string | undefined) ?? null,
      userAgent: req.get("user-agent") ?? null,
    },
  );
}

/** Load the CRM contract and confirm it belongs to this investor's buyer link. */
async function investorContract(contractId: number, buyerId: number) {
  const [contract] = await db.select().from(contracts).where(eq(contracts.id, contractId)).limit(1);
  if (!contract) throw new InvestorError(404, "contract_not_found", "Contract not found.");
  if (contract.buyerId !== buyerId) {
    throw new InvestorError(403, "contract_forbidden", "This contract does not belong to your account.");
  }
  return contract;
}

async function lockedUpRowById(id: number): Promise<LockedUpDealRow | null> {
  const r = await db.execute(sql`SELECT * FROM locked_up_deals WHERE id = ${id} LIMIT 1`);
  return (r.rows[0] as unknown as LockedUpDealRow | undefined) ?? null;
}

async function conditionsForDeal(dealId: number): Promise<DealConditionRow[]> {
  const r = await db.execute(
    sql`SELECT * FROM deal_conditions WHERE locked_up_deal_id = ${dealId} ORDER BY id ASC`,
  );
  return r.rows as unknown as DealConditionRow[];
}

async function remindersForContract(contractId: number): Promise<ContractReminderRow[]> {
  const r = await db.execute(
    sql`SELECT * FROM contract_reminders WHERE contract_id = ${contractId} ORDER BY remind_at ASC`,
  );
  return r.rows as unknown as ContractReminderRow[];
}

async function eventsForContract(contractId: number) {
  const rows = await db
    .select()
    .from(contractEvents)
    .where(eq(contractEvents.contractId, contractId))
    .orderBy(desc(contractEvents.id))
    .limit(200);
  return rows.map((e) => ({
    id: e.id,
    eventType: e.eventType,
    payload: (() => { try { return JSON.parse(String(e.payloadJson ?? "{}")); } catch { return {}; } })(),
    actorType: e.actorType,
    ip: e.ip,
    createdAt: toIso(e.createdAt),
    eventHash: e.eventHash,
    prevHash: e.prevHash,
  }));
}

async function primaryDocumentForContract(contractId: number) {
  // The v2 envelope points at the active document; fall back to the newest
  // contract_documents row for the contract's property.
  const envelope = await latestV2Envelope(contractId);
  if (envelope?.documentId) {
    const [doc] = await db.select().from(contractDocuments).where(eq(contractDocuments.id, envelope.documentId)).limit(1);
    if (doc) return { doc, envelope };
  }
  const [contract] = await db.select().from(contracts).where(eq(contracts.id, contractId)).limit(1);
  if (contract?.propertyId) {
    const docs = await db
      .select()
      .from(contractDocuments)
      .where(eq(contractDocuments.propertyId, contract.propertyId))
      .orderBy(desc(contractDocuments.id))
      .limit(1);
    if (docs[0]) return { doc: docs[0], envelope };
  }
  return { doc: null, envelope };
}

export interface LockedUpDealDto {
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

async function buildDealDto(row: LockedUpDealRow): Promise<LockedUpDealDto> {
  const [property] = row.property_id
    ? await db.select().from(properties).where(eq(properties.id, row.property_id)).limit(1)
    : [];
  const [contract] = row.contract_id
    ? await db.select().from(contracts).where(eq(contracts.id, row.contract_id)).limit(1)
    : [];

  let contractDto: LockedUpDealDto["contract"] = null;
  let risks: RiskWarning[] = [];
  if (contract) {
    const c = contract as ContractRow & {
      effectiveDate?: Date | string | null;
      expirationDate?: Date | string | null;
      closingDate?: Date | string | null;
      emdAmount?: string | null;
      emdStatus?: string | null;
      titleCompany?: string | null;
      fundingStatus?: string | null;
    };
    const envelope = await latestV2Envelope(contract.id);
    const signers = envelope ? await envelopeSigners(envelope.id) : [];
    const { doc } = await primaryDocumentForContract(contract.id);
    const stage = deriveContractStage(contract, doc, envelope, signers);
    const [buyerRow] = contract.buyerId
      ? await db.select({ name: buyers.name }).from(buyers).where(eq(buyers.id, contract.buyerId)).limit(1)
      : [];
    const [sellerRow] = contract.sellerId
      ? await db.select({ name: buyers.name }).from(buyers).where(eq(buyers.id, contract.sellerId)).limit(1)
      : [];
    const [sellerContact] = !sellerRow && contract.sellerContactId
      ? await db.select({ name: contacts.name }).from(contacts).where(eq(contacts.id, contract.sellerContactId)).limit(1)
      : [];
    contractDto = {
      id: contract.id,
      contractType: contract.contractType ?? null,
      acquisitionPrice: num(contract.purchasePrice),
      assignmentPrice: num(contract.amount),
      emdAmount: num(c.emdAmount ?? contract.earnestMoney),
      emdStatus: c.emdStatus ?? null,
      inspectionDeadline: toIso(contract.inspectionDeadline),
      expirationDate: toIso(c.expirationDate),
      closingDate: toIso(c.closingDate ?? contract.closeDate),
      titleCompany: c.titleCompany ?? null,
      fundingStatus: c.fundingStatus ?? null,
      effectiveDate: toIso(c.effectiveDate),
      stage,
      signersDone: signers.filter((s) => s.status === "signed").length,
      signersTotal: signers.length,
      parties: { buyer: buyerRow?.name ?? null, seller: sellerRow?.name ?? sellerContact?.name ?? null },
    };
    risks = computeRisks({ stage: row.stage }, contract as ContractRow, envelope);
  }
  const conditions = await conditionsForDeal(row.id);

  return {
    id: row.id,
    stage: (isLockedUpStage(row.stage) ? row.stage : "awaiting_deposit"),
    stageLabel: stageLabel(row.stage),
    assignedTeam: parseTeam(row.assigned_team),
    nextAction: row.next_action,
    nextActionDue: row.next_action_due,
    riskNotes: row.risk_notes,
    lockedAt: toIso(row.locked_at),
    openConditions: conditions.filter((cnd) => cnd.status === "open").length,
    property: property
      ? {
          id: property.id,
          address: property.address,
          city: property.city,
          state: property.state,
          zipCode: property.zipCode,
          image: Array.isArray(property.images) && property.images.length ? property.images[0] : null,
          beds: property.beds,
          baths: num(property.baths),
          sqft: property.sqft,
          propertyType: property.propertyType,
          arv: num(property.arv),
          repairCost: num(property.repairCost),
        }
      : null,
    contract: contractDto,
    risks,
  };
}

export function createLockedUpRouter(deps: LockedUpRouterDeps): Router {
  const { store } = deps;
  const r = Router();

  const requireInvestor = async (req: Request, res: Response) => {
    const id = investorSessionUserId(req);
    if (!id) {
      res.status(401).json({ code: "unauthorized", message: "Investor login required." });
      return null;
    }
    try {
      return await requireActiveInvestor(store, id);
    } catch (e) {
      sendLockedUpError(res, e);
      return null;
    }
  };

  // ---------------- Locked-Up pipeline ----------------

  /** Board / table / calendar list: the investor's locked-up deals. */
  r.get("/api/investor/locked-up/deals", async (req: Request, res: Response) => {
    try {
      const ctx = await requireInvestor(req, res);
      if (!ctx) return;
      const dealRows = await db.execute(sql`
        SELECT lud.* FROM locked_up_deals lud
        JOIN contracts c ON c.id = lud.contract_id
        WHERE c.buyer_id = ${ctx.buyer.id} AND lud.unlocked_at IS NULL
        ORDER BY lud.locked_at DESC NULLS LAST
      `);
      const deals: LockedUpDealDto[] = [];
      for (const row of dealRows.rows as unknown as LockedUpDealRow[]) {
        deals.push(await buildDealDto(row));
      }
      res.json({ deals });
    } catch (e) {
      sendLockedUpError(res, e);
    }
  });

  /** Full detail for one locked-up deal: conditions, timeline, risks. */
  r.get("/api/investor/locked-up/deals/:id", async (req: Request, res: Response) => {
    try {
      const ctx = await requireInvestor(req, res);
      if (!ctx) return;
      const id = parseInt(req.params.id, 10);
      if (!Number.isFinite(id)) return res.status(400).json({ code: "bad_id", message: "Invalid deal id." });
      const row = await lockedUpRowById(id);
      if (!row) return res.status(404).json({ code: "not_found", message: "Locked-up deal not found." });
      if (row.contract_id) await investorContract(row.contract_id, ctx.buyer.id);
      const deal = await buildDealDto(row);
      const conditions = await conditionsForDeal(id);
      const timeline = row.contract_id ? await eventsForContract(row.contract_id) : [];
      res.json({
        deal,
        conditions: conditions.map((cnd) => ({
          id: cnd.id,
          title: cnd.title,
          status: cnd.status,
          dueDate: cnd.due_date,
          notes: cnd.notes,
        })),
        timeline,
      });
    } catch (e) {
      sendLockedUpError(res, e);
    }
  });

  /** Gate check for a contract (does not lock anything). */
  r.get("/api/investor/locked-up/gate/contracts/:contractId", async (req: Request, res: Response) => {
    try {
      const ctx = await requireInvestor(req, res);
      if (!ctx) return;
      const contractId = parseInt(req.params.contractId, 10);
      if (!Number.isFinite(contractId)) return res.status(400).json({ code: "bad_id", message: "Invalid contract id." });
      await investorContract(contractId, ctx.buyer.id);
      res.json(await evaluateLockedUpGate(contractId));
    } catch (e) {
      sendLockedUpError(res, e);
    }
  });

  /**
   * Lock a deal: runs the gate first. 422 + unmet list when the contract is
   * not fully ready. Never locks from interest/match state.
   */
  r.post("/api/investor/locked-up/deals", async (req: Request, res: Response) => {
    try {
      const ctx = await requireInvestor(req, res);
      if (!ctx) return;
      const contractId = parseInt(String(req.body?.contractId ?? ""), 10);
      if (!Number.isFinite(contractId)) {
        return res.status(400).json({ code: "bad_contract", message: "contractId is required." });
      }
      const contract = await investorContract(contractId, ctx.buyer.id);
      const gate = await evaluateLockedUpGate(contractId);
      if (!gate.eligible) {
        return res.status(422).json({ code: "gate_unmet", message: "Contract is not ready for Locked Up.", unmet: gate.unmet });
      }
      const existing = await db.execute(
        sql`SELECT id FROM locked_up_deals WHERE property_id = ${contract.propertyId} AND unlocked_at IS NULL LIMIT 1`,
      );
      let dealId: number;
      if (existing.rows[0]) {
        dealId = (existing.rows[0] as { id: number }).id;
        await db.execute(sql`
          UPDATE locked_up_deals SET contract_id = ${contractId}, updated_at = now() WHERE id = ${dealId}
        `);
      } else {
        const inserted = await db.execute(sql`
          INSERT INTO locked_up_deals (property_id, contract_id, stage, locked_at)
          VALUES (${contract.propertyId}, ${contractId}, 'awaiting_deposit', now())
          RETURNING id
        `);
        dealId = (inserted.rows[0] as { id: number }).id;
      }
      await db.execute(sql`
        UPDATE contracts SET locked_up_at = now(), locked_up_by = ${ctx.user.id} WHERE id = ${contractId}
      `);
      await audit(contractId, "lockedup.locked", { dealId, stage: "awaiting_deposit" }, ctx.user.id, req);
      const row = await lockedUpRowById(dealId);
      res.status(201).json({ deal: row ? await buildDealDto(row) : null, gate });
    } catch (e) {
      sendLockedUpError(res, e);
    }
  });

  /** Move a locked-up deal between workflow columns. */
  r.put("/api/investor/locked-up/deals/:id/stage", async (req: Request, res: Response) => {
    try {
      const ctx = await requireInvestor(req, res);
      if (!ctx) return;
      const id = parseInt(req.params.id, 10);
      const stage = String(req.body?.stage ?? "");
      if (!Number.isFinite(id)) return res.status(400).json({ code: "bad_id", message: "Invalid deal id." });
      if (!isLockedUpStage(stage)) {
        return res.status(400).json({ code: "bad_stage", message: `stage must be one of: ${LOCKED_UP_STAGES.map((s) => s.value).join(", ")}` });
      }
      const row = await lockedUpRowById(id);
      if (!row) return res.status(404).json({ code: "not_found", message: "Locked-up deal not found." });
      if (row.contract_id) await investorContract(row.contract_id, ctx.buyer.id);
      const from = row.stage;
      await db.execute(sql`UPDATE locked_up_deals SET stage = ${stage}, updated_at = now() WHERE id = ${id}`);
      if (row.contract_id) {
        await audit(row.contract_id, "lockedup.stage_changed", { dealId: id, from, to: stage }, ctx.user.id, req);
      }
      const updated = await lockedUpRowById(id);
      res.json({ deal: updated ? await buildDealDto(updated) : null });
    } catch (e) {
      sendLockedUpError(res, e);
    }
  });

  /** Update deal fields (next action, team, risk notes, contract terms). */
  r.put("/api/investor/locked-up/deals/:id", async (req: Request, res: Response) => {
    try {
      const ctx = await requireInvestor(req, res);
      if (!ctx) return;
      const id = parseInt(req.params.id, 10);
      if (!Number.isFinite(id)) return res.status(400).json({ code: "bad_id", message: "Invalid deal id." });
      const row = await lockedUpRowById(id);
      if (!row) return res.status(404).json({ code: "not_found", message: "Locked-up deal not found." });
      if (row.contract_id) await investorContract(row.contract_id, ctx.buyer.id);
      const b = req.body ?? {};

      const team = Array.isArray(b.assignedTeam) ? b.assignedTeam.map((x: unknown) => String(x)).filter(Boolean).slice(0, 20) : null;
      await db.execute(sql`
        UPDATE locked_up_deals SET
          assigned_team = COALESCE(${team ? JSON.stringify(team) : null}, assigned_team),
          next_action = COALESCE(${b.nextAction !== undefined ? String(b.nextAction).slice(0, 2000) : null}, next_action),
          next_action_due = COALESCE(${b.nextActionDue ? String(b.nextActionDue).slice(0, 10) : null}::date, next_action_due),
          risk_notes = COALESCE(${b.riskNotes !== undefined ? String(b.riskNotes).slice(0, 2000) : null}, risk_notes),
          updated_at = now()
        WHERE id = ${id}
      `);
      if (row.contract_id) {
        // New locked-up columns (migration 0102) are written with raw SQL.
        const sets: ReturnType<typeof sql>[] = [];
        if (b.titleCompany !== undefined) sets.push(sql`title_company = ${String(b.titleCompany).slice(0, 255) || null}`);
        if (b.fundingStatus !== undefined && (FUNDING_STATUSES as readonly string[]).includes(String(b.fundingStatus))) {
          sets.push(sql`funding_status = ${String(b.fundingStatus)}`);
        }
        if (b.emdStatus !== undefined && (EMD_STATUSES as readonly string[]).includes(String(b.emdStatus))) {
          sets.push(sql`emd_status = ${String(b.emdStatus)}`);
        }
        if (b.emdAmount !== undefined) {
          const n = num(b.emdAmount);
          if (n !== null) sets.push(sql`emd_amount = ${String(n)}`);
        }
        if (sets.length) {
          const setClause = sets.reduce((acc, s, i) => (i === 0 ? s : sql`${acc}, ${s}`));
          await db.execute(sql`UPDATE contracts SET ${setClause} WHERE id = ${row.contract_id}`);
          await audit(row.contract_id, "lockedup.terms_updated", { dealId: id, fields: sets.length }, ctx.user.id, req);
        }
      }
      const updated = await lockedUpRowById(id);
      res.json({ deal: updated ? await buildDealDto(updated) : null });
    } catch (e) {
      sendLockedUpError(res, e);
    }
  });

  // ---------------- Open conditions ----------------

  r.get("/api/investor/locked-up/deals/:id/conditions", async (req: Request, res: Response) => {
    try {
      const ctx = await requireInvestor(req, res);
      if (!ctx) return;
      const id = parseInt(req.params.id, 10);
      if (!Number.isFinite(id)) return res.status(400).json({ code: "bad_id", message: "Invalid deal id." });
      const row = await lockedUpRowById(id);
      if (!row) return res.status(404).json({ code: "not_found", message: "Locked-up deal not found." });
      if (row.contract_id) await investorContract(row.contract_id, ctx.buyer.id);
      const conditions = await conditionsForDeal(id);
      res.json({ conditions: conditions.map((c) => ({ id: c.id, title: c.title, status: c.status, dueDate: c.due_date, notes: c.notes })) });
    } catch (e) {
      sendLockedUpError(res, e);
    }
  });

  r.post("/api/investor/locked-up/deals/:id/conditions", async (req: Request, res: Response) => {
    try {
      const ctx = await requireInvestor(req, res);
      if (!ctx) return;
      const id = parseInt(req.params.id, 10);
      if (!Number.isFinite(id)) return res.status(400).json({ code: "bad_id", message: "Invalid deal id." });
      const row = await lockedUpRowById(id);
      if (!row) return res.status(404).json({ code: "not_found", message: "Locked-up deal not found." });
      if (row.contract_id) await investorContract(row.contract_id, ctx.buyer.id);
      const title = String(req.body?.title ?? "").trim().slice(0, 255);
      if (!title) return res.status(400).json({ code: "title_required", message: "A condition title is required." });
      const due = req.body?.dueDate ? String(req.body.dueDate).slice(0, 10) : null;
      const notes = req.body?.notes ? String(req.body.notes).slice(0, 2000) : null;
      const inserted = await db.execute(sql`
        INSERT INTO deal_conditions (locked_up_deal_id, title, due_date, notes)
        VALUES (${id}, ${title}, ${due}::date, ${notes}) RETURNING id
      `);
      res.status(201).json({ id: (inserted.rows[0] as { id: number }).id });
    } catch (e) {
      sendLockedUpError(res, e);
    }
  });

  r.put("/api/investor/locked-up/deals/:id/conditions/:condId", async (req: Request, res: Response) => {
    try {
      const ctx = await requireInvestor(req, res);
      if (!ctx) return;
      const id = parseInt(req.params.id, 10);
      const condId = parseInt(req.params.condId, 10);
      if (!Number.isFinite(id) || !Number.isFinite(condId)) {
        return res.status(400).json({ code: "bad_id", message: "Invalid id." });
      }
      const row = await lockedUpRowById(id);
      if (!row) return res.status(404).json({ code: "not_found", message: "Locked-up deal not found." });
      if (row.contract_id) await investorContract(row.contract_id, ctx.buyer.id);
      const b = req.body ?? {};
      const status = b.status !== undefined ? String(b.status) : null;
      if (status !== null && !["open", "met", "waived"].includes(status)) {
        return res.status(400).json({ code: "bad_status", message: "status must be open, met, or waived." });
      }
      await db.execute(sql`
        UPDATE deal_conditions SET
          title = COALESCE(${b.title !== undefined ? String(b.title).trim().slice(0, 255) : null}, title),
          status = COALESCE(${status}, status),
          due_date = COALESCE(${b.dueDate !== undefined ? String(b.dueDate).slice(0, 10) : null}::date, due_date),
          notes = COALESCE(${b.notes !== undefined ? String(b.notes).slice(0, 2000) : null}, notes),
          updated_at = now()
        WHERE id = ${condId} AND locked_up_deal_id = ${id}
      `);
      res.json({ ok: true });
    } catch (e) {
      sendLockedUpError(res, e);
    }
  });

  r.delete("/api/investor/locked-up/deals/:id/conditions/:condId", async (req: Request, res: Response) => {
    try {
      const ctx = await requireInvestor(req, res);
      if (!ctx) return;
      const id = parseInt(req.params.id, 10);
      const condId = parseInt(req.params.condId, 10);
      if (!Number.isFinite(id) || !Number.isFinite(condId)) {
        return res.status(400).json({ code: "bad_id", message: "Invalid id." });
      }
      const row = await lockedUpRowById(id);
      if (!row) return res.status(404).json({ code: "not_found", message: "Locked-up deal not found." });
      if (row.contract_id) await investorContract(row.contract_id, ctx.buyer.id);
      await db.execute(sql`DELETE FROM deal_conditions WHERE id = ${condId} AND locked_up_deal_id = ${id}`);
      res.json({ ok: true });
    } catch (e) {
      sendLockedUpError(res, e);
    }
  });

  // ---------------- Contract workspace ----------------

  /** Contract cards: document name, property, deal, parties, version, status, signers, times, next action. */
  r.get("/api/investor/locked-up/contracts", async (req: Request, res: Response) => {
    try {
      const ctx = await requireInvestor(req, res);
      if (!ctx) return;
      const rows = await db
        .select()
        .from(contracts)
        .where(eq(contracts.buyerId, ctx.buyer.id))
        .orderBy(desc(contracts.id))
        .limit(100);
      const cards = [];
      for (const contract of rows) {
        const c = contract as ContractRow & {
          expirationDate?: Date | string | null;
          closingDate?: Date | string | null;
          emdAmount?: string | null;
          emdStatus?: string | null;
        };
        const envelope = await latestV2Envelope(contract.id);
        const signers = envelope ? await envelopeSigners(envelope.id) : [];
        const { doc } = await primaryDocumentForContract(contract.id);
        const stage = deriveContractStage(contract, doc, envelope, signers);
        const [property] = contract.propertyId
          ? await db.select().from(properties).where(eq(properties.id, contract.propertyId)).limit(1)
          : [];
        const dealRow = (await db.execute(
          sql`SELECT id, stage FROM locked_up_deals WHERE contract_id = ${contract.id} AND unlocked_at IS NULL LIMIT 1`,
        )).rows[0] as { id: number; stage: string } | undefined;
        const signersDone = signers.filter((s) => s.status === "signed").length;
        cards.push({
          id: contract.id,
          documentName: (doc?.title as string | undefined) ?? contract.title ?? `Contract #${contract.id}`,
          property: property ? { id: property.id, address: property.address, city: property.city, state: property.state } : null,
          deal: dealRow ? { id: dealRow.id, stage: dealRow.stage, stageLabel: stageLabel(dealRow.stage) } : null,
          parties: {
            buyer: (await db.select({ name: buyers.name }).from(buyers).where(eq(buyers.id, contract.buyerId ?? -1)).limit(1))[0]?.name ?? null,
            seller: contract.sellerId
              ? (await db.select({ name: buyers.name }).from(buyers).where(eq(buyers.id, contract.sellerId)).limit(1))[0]?.name ?? null
              : null,
          },
          version: (doc?.version as number | undefined) ?? contract.templateVersion ?? 1,
          contractType: contract.contractType ?? null,
          stage,
          signersDone,
          signersTotal: signers.length,
          sentAt: toIso(envelope?.sentAt ?? contract.sentAt),
          lastOpenedAt: toIso(envelope?.viewedAt ?? contract.viewedAt),
          expiration: toIso(c.expirationDate ?? envelope?.expiresAt ?? contract.expiresAt),
          closingDate: toIso(c.closingDate ?? contract.closeDate),
          nextAction: contractNextAction(stage, signersDone, signers.length),
        });
      }
      res.json({ contracts: cards });
    } catch (e) {
      sendLockedUpError(res, e);
    }
  });

  /** Contract detail: lifecycle, signers, template, reminders, versions, certificate, audit. */
  r.get("/api/investor/locked-up/contracts/:id", async (req: Request, res: Response) => {
    try {
      const ctx = await requireInvestor(req, res);
      if (!ctx) return;
      const id = parseInt(req.params.id, 10);
      if (!Number.isFinite(id)) return res.status(400).json({ code: "bad_id", message: "Invalid contract id." });
      const contract = await investorContract(id, ctx.buyer.id);
      const c = contract as ContractRow & {
        effectiveDate?: Date | string | null;
        expirationDate?: Date | string | null;
        closingDate?: Date | string | null;
        emdAmount?: string | null;
        emdStatus?: string | null;
        titleCompany?: string | null;
        fundingStatus?: string | null;
        supersededByContractId?: number | null;
      };
      const envelope = await latestV2Envelope(id);
      const signers = envelope ? await envelopeSigners(envelope.id) : [];
      const { doc } = await primaryDocumentForContract(id);
      const stage = deriveContractStage(contract, doc, envelope, signers);
      const [property] = contract.propertyId
        ? await db.select().from(properties).where(eq(properties.id, contract.propertyId)).limit(1)
        : [];
      const [template] = doc?.templateId
        ? await db.select().from(contractTemplates).where(eq(contractTemplates.id, doc.templateId)).limit(1)
        : [];
      const versions = doc
        ? await db.select().from(documentVersions).where(eq(documentVersions.documentId, doc.id)).orderBy(desc(documentVersions.versionNumber))
        : [];
      const reminders = await remindersForContract(id);
      const events = await eventsForContract(id);
      const gate = await evaluateLockedUpGate(id);
      const signersDone = signers.filter((s) => s.status === "signed").length;

      res.json({
        contract: {
          id: contract.id,
          documentName: (doc?.title as string | undefined) ?? contract.title ?? `Contract #${contract.id}`,
          contractType: contract.contractType ?? null,
          stage,
          version: (doc?.version as number | undefined) ?? contract.templateVersion ?? 1,
          signersDone,
          signersTotal: signers.length,
          acquisitionPrice: num(contract.purchasePrice),
          assignmentPrice: num(contract.amount),
          emdAmount: num(c.emdAmount ?? contract.earnestMoney),
          emdStatus: c.emdStatus ?? null,
          effectiveDate: toIso(c.effectiveDate),
          expirationDate: toIso(c.expirationDate),
          inspectionDeadline: toIso(contract.inspectionDeadline),
          closingDate: toIso(c.closingDate ?? contract.closeDate),
          titleCompany: c.titleCompany ?? null,
          fundingStatus: c.fundingStatus ?? null,
          sentAt: toIso(envelope?.sentAt ?? contract.sentAt),
          lastOpenedAt: toIso(envelope?.viewedAt ?? contract.viewedAt),
          executedAt: toIso(envelope?.completedAt ?? contract.executedAt),
          voidedAt: toIso(contract.voidedAt),
          voidedReason: contract.voidedReason ?? null,
          documentSha256: envelope?.documentSha256 ?? null,
          finalPdfSha256: envelope?.finalPdfSha256 ?? null,
          immutable: stage === "executed",
          nextAction: contractNextAction(stage, signersDone, signers.length),
          mergeFields: doc?.mergeData ? safeJson(doc.mergeData) : null,
        },
        property: property
          ? {
              id: property.id, address: property.address, city: property.city, state: property.state,
              zipCode: property.zipCode, image: Array.isArray(property.images) && property.images.length ? property.images[0] : null,
              beds: property.beds, baths: num(property.baths), sqft: property.sqft, propertyType: property.propertyType,
              arv: num(property.arv), repairCost: num(property.repairCost),
            }
          : null,
        template: template
          ? {
              id: template.id, name: template.name, version: template.version ?? 1,
              jurisdiction: template.jurisdiction ?? null, status: template.status ?? null,
              approvedAt: toIso(template.approvedAt),
            }
          : null,
        envelope: envelope
          ? {
              id: envelope.id, status: envelope.status, signingMode: envelope.signingMode,
              sentAt: toIso(envelope.sentAt), expiresAt: toIso(envelope.expiresAt),
              completedAt: toIso(envelope.completedAt),
            }
          : null,
        signers: signers.map((s) => ({
          id: s.id,
          name: s.name,
          email: s.email,
          role: s.role,
          signingOrder: s.signingOrder,
          status: s.status,
          sentAt: toIso(s.sentAt),
          viewedAt: toIso(s.viewedAt),
          signedAt: toIso(s.signedAt),
          declinedAt: toIso(s.declinedAt),
          declineReason: s.declineReason,
          consentAt: toIso(s.consentAt),
          hasSignature: s.signatureImageBase64 != null || s.signedAt != null,
        })),
        versions: versions.map((v) => ({
          id: v.id, versionNumber: v.versionNumber, changes: v.changes, createdBy: v.createdBy, createdAt: toIso(v.createdAt),
        })),
        reminders: reminders.map((rm) => ({
          id: rm.id, remindAt: rm.remind_at, channel: rm.channel, recipient: rm.recipient,
          note: rm.note, status: rm.status, signerId: rm.signer_id,
        })),
        timeline: events,
        gate,
      });
    } catch (e) {
      sendLockedUpError(res, e);
    }
  });

  /** Draft preview: template content with deal-data merge fields applied. */
  r.get("/api/investor/locked-up/contracts/:id/preview", async (req: Request, res: Response) => {
    try {
      const ctx = await requireInvestor(req, res);
      if (!ctx) return;
      const id = parseInt(req.params.id, 10);
      if (!Number.isFinite(id)) return res.status(400).json({ code: "bad_id", message: "Invalid contract id." });
      const contract = await investorContract(id, ctx.buyer.id);
      const { doc } = await primaryDocumentForContract(id);
      const content = String((doc?.content as string | undefined) ?? "");
      const [property] = contract.propertyId
        ? await db.select().from(properties).where(eq(properties.id, contract.propertyId)).limit(1)
        : [];
      const [buyerRow] = contract.buyerId
        ? await db.select().from(buyers).where(eq(buyers.id, contract.buyerId)).limit(1)
        : [];
      const now = new Date();
      const mergeData = {
        buyer: {
          name: buyerRow?.name ?? "",
          company: buyerRow?.company ?? "",
          email: buyerRow?.email ?? "",
          phone: buyerRow?.phone ?? "",
        },
        property: {
          address: property?.address ?? "",
          city: property?.city ?? "",
          state: property?.state ?? "",
          zip: property?.zipCode ?? "",
        },
        contract: {
          purchasePrice: contract.purchasePrice != null ? `$${Number(contract.purchasePrice).toLocaleString("en-US")}` : "",
          amount: contract.amount != null ? `$${Number(contract.amount).toLocaleString("en-US")}` : "",
        },
        date: { today: now.toISOString().split("T")[0], now: now.toISOString() },
        company: { name: "Ocean Luxe" },
      };
      res.json({ title: (doc?.title as string | undefined) ?? contract.title ?? `Contract #${id}`, content: mergeTemplate(content, mergeData) });
    } catch (e) {
      sendLockedUpError(res, e);
    }
  });

  /** Create a reminder record. Records only — nothing is sent from here. */
  r.post("/api/investor/locked-up/contracts/:id/reminders", async (req: Request, res: Response) => {
    try {
      const ctx = await requireInvestor(req, res);
      if (!ctx) return;
      const id = parseInt(req.params.id, 10);
      if (!Number.isFinite(id)) return res.status(400).json({ code: "bad_id", message: "Invalid contract id." });
      await investorContract(id, ctx.buyer.id);
      const remindAt = String(req.body?.remindAt ?? "").trim();
      const channel = String(req.body?.channel ?? "email").toLowerCase();
      const recipient = String(req.body?.recipient ?? "").trim().slice(0, 255);
      if (!remindAt || !Number.isFinite(new Date(remindAt).getTime())) {
        return res.status(400).json({ code: "bad_remind_at", message: "remindAt must be a valid date/time." });
      }
      if (!["email", "sms", "in_app"].includes(channel)) {
        return res.status(400).json({ code: "bad_channel", message: "channel must be email, sms, or in_app." });
      }
      if (!recipient) return res.status(400).json({ code: "recipient_required", message: "A recipient is required." });
      const envelope = await latestV2Envelope(id);
      const signerId = req.body?.signerId ? parseInt(String(req.body.signerId), 10) : null;
      const note = req.body?.note ? String(req.body.note).slice(0, 1000) : null;
      const inserted = await db.execute(sql`
        INSERT INTO contract_reminders (contract_id, envelope_id, signer_id, remind_at, channel, recipient, note, created_by)
        VALUES (${id}, ${envelope?.id ?? null}, ${signerId}, ${remindAt}::timestamptz, ${channel}, ${recipient}, ${note}, ${ctx.user.id})
        RETURNING id
      `);
      await audit(id, "contract.reminder_scheduled", {
        reminderId: (inserted.rows[0] as { id: number }).id,
        remindAt, channel, recipient, note,
      }, ctx.user.id, req);
      res.status(201).json({ id: (inserted.rows[0] as { id: number }).id, sent: false });
    } catch (e) {
      sendLockedUpError(res, e);
    }
  });

  r.get("/api/investor/locked-up/contracts/:id/reminders", async (req: Request, res: Response) => {
    try {
      const ctx = await requireInvestor(req, res);
      if (!ctx) return;
      const id = parseInt(req.params.id, 10);
      if (!Number.isFinite(id)) return res.status(400).json({ code: "bad_id", message: "Invalid contract id." });
      await investorContract(id, ctx.buyer.id);
      const reminders = await remindersForContract(id);
      res.json({ reminders: reminders.map((rm) => ({
        id: rm.id, remindAt: rm.remind_at, channel: rm.channel, recipient: rm.recipient,
        note: rm.note, status: rm.status, signerId: rm.signer_id,
      })) });
    } catch (e) {
      sendLockedUpError(res, e);
    }
  });

  r.delete("/api/investor/locked-up/contracts/:id/reminders/:reminderId", async (req: Request, res: Response) => {
    try {
      const ctx = await requireInvestor(req, res);
      if (!ctx) return;
      const id = parseInt(req.params.id, 10);
      const reminderId = parseInt(req.params.reminderId, 10);
      if (!Number.isFinite(id) || !Number.isFinite(reminderId)) {
        return res.status(400).json({ code: "bad_id", message: "Invalid id." });
      }
      await investorContract(id, ctx.buyer.id);
      await db.execute(sql`UPDATE contract_reminders SET status = 'cancelled' WHERE id = ${reminderId} AND contract_id = ${id}`);
      await audit(id, "contract.reminder_cancelled", { reminderId }, ctx.user.id, req);
      res.json({ ok: true });
    } catch (e) {
      sendLockedUpError(res, e);
    }
  });

  /** Void the contract (voids the live envelope when one exists). */
  r.post("/api/investor/locked-up/contracts/:id/void", async (req: Request, res: Response) => {
    try {
      const ctx = await requireInvestor(req, res);
      if (!ctx) return;
      const id = parseInt(req.params.id, 10);
      if (!Number.isFinite(id)) return res.status(400).json({ code: "bad_id", message: "Invalid contract id." });
      await investorContract(id, ctx.buyer.id);
      const reason = req.body?.reason ? String(req.body.reason).slice(0, 1000) : null;
      const envelope = await latestV2Envelope(id);
      if (envelope && !["completed", "voided", "expired"].includes(envelope.status)) {
        await voidEnvelope(envelope.id, ctx.user.id, reason ?? undefined);
      }
      await db.update(contracts)
        .set({ voidedAt: new Date(), voidedReason: reason, status: "voided" })
        .where(eq(contracts.id, id));
      const { doc } = await primaryDocumentForContract(id);
      if (doc) await db.update(contractDocuments).set({ status: "voided" }).where(eq(contractDocuments.id, doc.id));
      res.json({ ok: true });
    } catch (e) {
      sendLockedUpError(res, e);
    }
  });

  /** Team decline: records the reason; signer self-decline stays on the token ceremony. */
  r.post("/api/investor/locked-up/contracts/:id/decline", async (req: Request, res: Response) => {
    try {
      const ctx = await requireInvestor(req, res);
      if (!ctx) return;
      const id = parseInt(req.params.id, 10);
      if (!Number.isFinite(id)) return res.status(400).json({ code: "bad_id", message: "Invalid contract id." });
      await investorContract(id, ctx.buyer.id);
      const reason = String(req.body?.reason ?? "").trim().slice(0, 1000);
      if (!reason) return res.status(400).json({ code: "reason_required", message: "A decline reason is required." });
      await db.update(contracts).set({ status: "declined", voidedReason: reason }).where(eq(contracts.id, id));
      const { doc } = await primaryDocumentForContract(id);
      if (doc) await db.update(contractDocuments).set({ status: "declined" }).where(eq(contractDocuments.id, doc.id));
      await audit(id, "contract.declined", { reason }, ctx.user.id, req);
      res.json({ ok: true });
    } catch (e) {
      sendLockedUpError(res, e);
    }
  });

  /**
   * Amendment: snapshots the current document into document_versions and opens
   * a new draft version (v+1). Executed documents are immutable — they are
   * never edited in place.
   */
  r.post("/api/investor/locked-up/contracts/:id/amend", async (req: Request, res: Response) => {
    try {
      const ctx = await requireInvestor(req, res);
      if (!ctx) return;
      const id = parseInt(req.params.id, 10);
      if (!Number.isFinite(id)) return res.status(400).json({ code: "bad_id", message: "Invalid contract id." });
      const contract = await investorContract(id, ctx.buyer.id);
      const { doc, envelope } = await primaryDocumentForContract(id);
      if (!doc) return res.status(404).json({ code: "no_document", message: "No document on this contract yet." });
      const stage = deriveContractStage(contract, doc, envelope, envelope ? await envelopeSigners(envelope.id) : []);
      if (stage === "executed") {
        return res.status(409).json({ code: "immutable", message: "Executed documents are immutable. Create an addendum contract instead." });
      }
      const changes = String(req.body?.changes ?? "").trim().slice(0, 2000);
      const content = req.body?.content !== undefined ? String(req.body.content) : String(doc.content ?? "");
      if (!changes) return res.status(400).json({ code: "changes_required", message: "Describe the amendment (changes)." });
      const nextVersion = ((doc.version as number | undefined) ?? 1) + 1;
      await db.insert(documentVersions).values({
        documentId: doc.id,
        versionNumber: (doc.version as number | undefined) ?? 1,
        content: String(doc.content ?? ""),
        changes: "Snapshot before amendment",
        createdBy: String(ctx.user.id),
      });
      const [newDoc] = await db.insert(contractDocuments).values({
        templateId: (doc.templateId as number | null | undefined) ?? null,
        propertyId: (doc.propertyId as number | null | undefined) ?? null,
        title: `${String(doc.title ?? "Document")} (Amendment ${nextVersion})`,
        documentType: (doc.documentType as string | undefined) ?? "contract",
        status: "draft",
        content,
        version: nextVersion,
        createdBy: String(ctx.user.id),
      }).returning();
      await db.update(contractDocuments).set({ status: "superseded" }).where(eq(contractDocuments.id, doc.id));
      await audit(id, "contract.amended", {
        fromDocumentId: doc.id, toDocumentId: newDoc.id, fromVersion: doc.version, toVersion: nextVersion, changes,
      }, ctx.user.id, req);
      res.status(201).json({ documentId: newDoc.id, version: nextVersion });
    } catch (e) {
      sendLockedUpError(res, e);
    }
  });

  /** Completion certificate for the executed envelope. */
  r.get("/api/investor/locked-up/contracts/:id/certificate", async (req: Request, res: Response) => {
    try {
      const ctx = await requireInvestor(req, res);
      if (!ctx) return;
      const id = parseInt(req.params.id, 10);
      if (!Number.isFinite(id)) return res.status(400).json({ code: "bad_id", message: "Invalid contract id." });
      await investorContract(id, ctx.buyer.id);
      const envelope = await latestV2Envelope(id);
      if (!envelope) return res.status(404).json({ code: "no_envelope", message: "No signing envelope on this contract." });
      res.json(await buildCertificate(envelope.id));
    } catch (e) {
      sendLockedUpError(res, e);
    }
  });

  /** Download the executed PDF (hash-verified). */
  r.get("/api/investor/locked-up/contracts/:id/download", async (req: Request, res: Response) => {
    try {
      const ctx = await requireInvestor(req, res);
      if (!ctx) return;
      const id = parseInt(req.params.id, 10);
      if (!Number.isFinite(id)) return res.status(400).json({ code: "bad_id", message: "Invalid contract id." });
      await investorContract(id, ctx.buyer.id);
      const envelope = await latestV2Envelope(id);
      if (!envelope) return res.status(404).json({ code: "no_envelope", message: "No signing envelope on this contract." });
      const { bytes, filename } = await getFinalPdf(envelope.id);
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
      res.send(bytes);
    } catch (e) {
      sendLockedUpError(res, e);
    }
  });

  /** Audit trail for a contract. */
  r.get("/api/investor/locked-up/contracts/:id/events", async (req: Request, res: Response) => {
    try {
      const ctx = await requireInvestor(req, res);
      if (!ctx) return;
      const id = parseInt(req.params.id, 10);
      if (!Number.isFinite(id)) return res.status(400).json({ code: "bad_id", message: "Invalid contract id." });
      await investorContract(id, ctx.buyer.id);
      res.json({ events: await eventsForContract(id) });
    } catch (e) {
      sendLockedUpError(res, e);
    }
  });

  /** Envelope detail passthrough (signers, verification, audit trail) from server/esign. */
  r.get("/api/investor/locked-up/contracts/:id/envelope", async (req: Request, res: Response) => {
    try {
      const ctx = await requireInvestor(req, res);
      if (!ctx) return;
      const id = parseInt(req.params.id, 10);
      if (!Number.isFinite(id)) return res.status(400).json({ code: "bad_id", message: "Invalid contract id." });
      await investorContract(id, ctx.buyer.id);
      const envelope = await latestV2Envelope(id);
      if (!envelope) return res.status(404).json({ code: "no_envelope", message: "No signing envelope on this contract." });
      res.json(await getEnvelopeDetail(envelope.id));
    } catch (e) {
      sendLockedUpError(res, e);
    }
  });

  /** Approved templates (jurisdiction / version metadata for new contracts). */
  r.get("/api/investor/locked-up/templates", async (req: Request, res: Response) => {
    try {
      const ctx = await requireInvestor(req, res);
      if (!ctx) return;
      const rows = await db
        .select()
        .from(contractTemplates)
        .where(and(eq(contractTemplates.isActive, true), eq(contractTemplates.status, "approved")))
        .orderBy(desc(contractTemplates.id))
        .limit(100);
      res.json({
        templates: rows.map((t) => ({
          id: t.id,
          name: t.name,
          description: t.description,
          category: t.category,
          version: t.version ?? 1,
          jurisdiction: t.jurisdiction ?? null,
          approvedAt: toIso(t.approvedAt),
          mergeFields: t.mergeFields ?? [],
        })),
      });
    } catch (e) {
      sendLockedUpError(res, e);
    }
  });

  return r;
}

function safeJson(raw: unknown): unknown {
  try {
    return typeof raw === "string" ? JSON.parse(raw) : raw;
  } catch {
    return null;
  }
}
