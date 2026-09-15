// N1: the dashboard and analytics pages used to compute closed deals and
// revenue with different rules (Store B assignment fees vs Store A contract
// amounts), so the same number disagreed across pages. Both now call this
// helper.
//
// DEV-002: the per-deal ledger (deal_assignments) is a first-class revenue
// source alongside closed documents. A deal closed from the pipeline
// ("Close Deal & Record Revenue" on the opportunity, or a manual stage move
// to sold/closed) writes a ledger row with status "closed" even when no
// contract document was ever closed — those rows count here.
//
// Canonical rule:
//  - Store B contract_documents with status "closed" are the closed-deal
//    ledger; revenue is the assignment fee recorded at closing.
//  - Store A contracts marked executed count only when they were closed
//    outside the generator (no generated document), so a deal is never
//    double-counted across the two stores.
//  - deal_assignments rows with status "closed" count when their property is
//    not already counted via a closed document or an executed Store A
//    contract; revenue is payoutAmount ?? assignmentFee ?? 0.

export type StoreAContract = {
  id?: number;
  propertyId?: number | null;
  amount?: string | number | null;
  status?: string | null;
  generatedDocumentId?: number | null;
};

export type StoreBDocument = {
  id?: number;
  propertyId?: number | null;
  status?: string | null;
  mergeData?: unknown;
};

export type LedgerRow = {
  id?: number;
  propertyId?: number | null;
  status?: string | null;
  payoutAmount?: string | number | null;
  assignmentFee?: string | number | null;
};

function readAssignmentFee(doc: StoreBDocument): number {
  try {
    const md = doc.mergeData
      ? typeof doc.mergeData === "string"
        ? JSON.parse(doc.mergeData)
        : doc.mergeData
      : {};
    const fee = parseFloat(String(md?.closingData?.assignmentFee ?? md?.assignmentFee ?? ""));
    return Number.isFinite(fee) ? fee : 0;
  } catch {
    return 0;
  }
}

function toNumber(v: string | number | null | undefined): number {
  const n = parseFloat(String(v ?? ""));
  return Number.isFinite(n) ? n : 0;
}

export function computeDealMetrics(
  contracts: StoreAContract[] | undefined,
  contractDocuments: StoreBDocument[] | undefined,
  opts?: { totalLeads?: number; ledger?: LedgerRow[] },
) {
  const closedDocs = (contractDocuments || []).filter((d) => String(d.status || "") === "closed");
  const closedDocIds = new Set<number>();
  // Properties already counted, so the ledger can never double-count them.
  const countedPropertyIds = new Set<number>();
  let revenue = 0;
  for (const doc of closedDocs) {
    revenue += readAssignmentFee(doc);
    const id = (doc as any).id;
    if (typeof id === "number") closedDocIds.add(id);
    const pid = (doc as any).propertyId;
    if (typeof pid === "number") countedPropertyIds.add(pid);
  }

  // Wet-ink Store A deals with no generated document — count once.
  let storeAClosed = 0;
  for (const c of contracts || []) {
    if (String(c.status || "") !== "executed") continue;
    if (c.generatedDocumentId && closedDocIds.has(Number(c.generatedDocumentId))) continue;
    storeAClosed += 1;
    revenue += toNumber(c.amount);
    if (typeof c.propertyId === "number") countedPropertyIds.add(c.propertyId);
  }

  // Ledger-backed closes (pipeline closes with no closed document).
  let ledgerClosed = 0;
  for (const row of opts?.ledger || []) {
    if (String(row.status || "") !== "closed") continue;
    const pid = row.propertyId;
    if (typeof pid === "number" && countedPropertyIds.has(pid)) continue;
    ledgerClosed += 1;
    revenue += toNumber(row.payoutAmount ?? row.assignmentFee);
    if (typeof pid === "number") countedPropertyIds.add(pid);
  }

  const dealsClosed = closedDocs.length + storeAClosed + ledgerClosed;
  const avgDealSize = dealsClosed > 0 ? revenue / dealsClosed : 0;
  const totalLeads = opts?.totalLeads ?? 0;
  const conversionRate = totalLeads > 0 ? (dealsClosed / totalLeads) * 100 : 0;

  return { dealsClosed, revenue, avgDealSize, conversionRate };
}
