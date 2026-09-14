// N1: the dashboard and analytics pages used to compute closed deals and
// revenue with different rules (Store B assignment fees vs Store A contract
// amounts), so the same number disagreed across pages. Both now call this
// helper.
//
// Canonical rule (matches the Close Deal & Record Revenue flow):
//  - Store B contract_documents with status "closed" are the closed-deal
//    ledger; revenue is the assignment fee recorded at closing.
//  - Store A contracts marked executed count only when they were closed
//    outside the generator (no generated document), so a deal is never
//    double-counted across the two stores.

export type StoreAContract = {
  id?: number;
  amount?: string | number | null;
  status?: string | null;
  generatedDocumentId?: number | null;
};

export type StoreBDocument = {
  status?: string | null;
  mergeData?: unknown;
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

export function computeDealMetrics(
  contracts: StoreAContract[] | undefined,
  contractDocuments: StoreBDocument[] | undefined,
  opts?: { totalLeads?: number },
) {
  const closedDocs = (contractDocuments || []).filter((d) => String(d.status || "") === "closed");
  const closedDocIds = new Set<number>();
  let revenue = 0;
  for (const doc of closedDocs) {
    revenue += readAssignmentFee(doc);
    const id = (doc as any).id;
    if (typeof id === "number") closedDocIds.add(id);
  }

  // Wet-ink Store A deals with no generated document — count once.
  let storeAClosed = 0;
  for (const c of contracts || []) {
    if (String(c.status || "") !== "executed") continue;
    if (c.generatedDocumentId && closedDocIds.has(Number(c.generatedDocumentId))) continue;
    storeAClosed += 1;
    revenue += parseFloat(String(c.amount ?? "")) || 0;
  }

  const dealsClosed = closedDocs.length + storeAClosed;
  const avgDealSize = dealsClosed > 0 ? revenue / dealsClosed : 0;
  const totalLeads = opts?.totalLeads ?? 0;
  const conversionRate = totalLeads > 0 ? (dealsClosed / totalLeads) * 100 : 0;

  return { dealsClosed, revenue, avgDealSize, conversionRate };
}
