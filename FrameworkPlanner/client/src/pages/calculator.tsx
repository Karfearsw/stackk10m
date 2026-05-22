import { Layout } from "@/components/layout/Layout";
import { DealCalculator } from "@/components/deals/DealCalculator";
import { Spinner } from "@/components/ui/spinner";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { useToast } from "@/hooks/use-toast";
import { computeDealMath, computeRepairTotal, computeUnderwritingOutputs, makeEmptyUnderwritingV1, underwritingSchemaV1 } from "@shared/underwriting";

export default function Calculator() {
  const { toast } = useToast();
  const params = new URLSearchParams(window.location.search);
  const propertyIdRaw = params.get("propertyId");
  const propertyId = propertyIdRaw ? parseInt(propertyIdRaw, 10) : 0;
  const sessionIdRaw = params.get("sessionId");
  const sessionId = sessionIdRaw ? parseInt(sessionIdRaw, 10) : 0;
  const addressRaw = String(params.get("address") || "").trim();

  const { data, isLoading, error } = useQuery<any>({
    queryKey: ["/api/opportunities", propertyId],
    queryFn: async () => {
      const res = await fetch(`/api/opportunities/${propertyId}`);
      if (!res.ok) throw new Error("Failed to fetch opportunity");
      return res.json();
    },
    enabled: propertyId > 0,
  });

  const property = data?.property;
  const num = (v: unknown) =>
    typeof v === "string" ? (Number.isFinite(parseFloat(v)) ? parseFloat(v) : 0) : typeof v === "number" ? (Number.isFinite(v) ? v : 0) : 0;

  const { data: session, isLoading: sessionLoading } = useQuery<any>({
    queryKey: ["/api/playground/session", sessionId || addressRaw || property?.address || ""],
    queryFn: async () => {
      if (sessionId > 0) {
        const res = await fetch(`/api/playground/sessions/${sessionId}`, { credentials: "include" });
        if (!res.ok) throw new Error("Failed to fetch session");
        return res.json();
      }
      const addr = addressRaw || String(property?.address || "").trim();
      if (!addr) return null;
      const res = await fetch(`/api/playground/sessions/open`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ address: addr, propertyId: propertyId > 0 ? propertyId : undefined }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.message || "Failed to open session");
      return json;
    },
    enabled: sessionId > 0 || Boolean(addressRaw) || (propertyId > 0 && Boolean(property?.address)),
  });

  const underwriting = (() => {
    try {
      return session?.underwritingJson ? JSON.parse(session.underwritingJson) : {};
    } catch {
      return {};
    }
  })();
  const underwritingV1 = underwritingSchemaV1.safeParse(underwriting);

  const baseUw = underwritingV1.success ? underwritingV1.data : makeEmptyUnderwritingV1(new Date().toISOString());
  const repairsFromUw = underwritingV1.success ? computeRepairTotal(underwritingV1.data.repairs) || 0 : num((underwriting as any)?.repairEstimate);
  const legacyStrategy =
    typeof (underwriting as any)?.exitStrategy === "string"
      ? String((underwriting as any)?.exitStrategy || "")
          .toLowerCase()
          .includes("rent")
        ? "rental"
        : String((underwriting as any)?.exitStrategy || "")
            .toLowerCase()
            .includes("wholetail")
          ? "wholetail"
          : String((underwriting as any)?.exitStrategy || "")
              .toLowerCase()
              .includes("flip")
            ? "flip"
            : String((underwriting as any)?.exitStrategy || "")
                .toLowerCase()
                .includes("wholesale")
              ? "wholesale"
              : null
      : null;

  return (
    <Layout>
      <div className="space-y-1 mb-6">
        <h1 className="text-3xl font-bold tracking-tight">Deal Calculator</h1>
        <p className="text-muted-foreground">Analyze deal profitability and ROI on potential properties.</p>
      </div>

      {propertyId > 0 && (
        <div className="mb-4">
          <Link href={`/opportunities/${propertyId}`} className="text-sm text-primary hover:underline">
            Back to Opportunity
          </Link>
        </div>
      )}

      {propertyId > 0 && isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Spinner />
        </div>
      ) : sessionLoading ? (
        <div className="flex items-center justify-center py-12">
          <Spinner />
        </div>
      ) : (
        <DealCalculator
          initialValues={
            (session && !sessionLoading) || (propertyId > 0 && !error)
              ? {
                  strategy: underwritingV1.success ? underwritingV1.data.snapshot.strategy : legacyStrategy,
                  templateId: underwritingV1.success ? underwritingV1.data.templateId : null,
                  arv: underwritingV1.success ? num(underwritingV1.data.arv.value) : num((underwriting as any)?.arv) || num(property?.arv),
                  arvLow: underwritingV1.success ? num(underwritingV1.data.arv.rangeLow) || null : null,
                  arvHigh: underwritingV1.success ? num(underwritingV1.data.arv.rangeHigh) || null : null,
                  repairs: repairsFromUw || num(property?.repairCost),
                  offerTarget: underwritingV1.success
                    ? num(underwritingV1.data.dealMath.offerTarget) || num(property?.price)
                    : num((underwriting as any)?.mao) || num(property?.price),

                  closingHoldingPct: underwritingV1.success ? num(underwritingV1.data.assumptions.closingHoldingPct) : 10,
                  targetProfitMode: underwritingV1.success ? underwritingV1.data.assumptions.targetProfitMode : "pct_arv",
                  targetProfitValue: underwritingV1.success ? num(underwritingV1.data.assumptions.targetProfitValue) : 10,
                  assignmentFeeMode: underwritingV1.success ? underwritingV1.data.assumptions.assignmentFeeMode : "flat",
                  assignmentFeeValue: underwritingV1.success ? num(underwritingV1.data.assumptions.assignmentFeeValue) : 10000,
                  targetDiscountPct: underwritingV1.success ? underwritingV1.data.assumptions.targetDiscountPctOverride ?? null : null,
                  offerAggression: underwritingV1.success ? underwritingV1.data.assumptions.offerAggression : "balanced",

                  purchaseClosingFlat: underwritingV1.success ? num(underwritingV1.data.costs.purchaseClosingFlat) : 0,
                  marketingFlat: underwritingV1.success ? num(underwritingV1.data.costs.marketingFlat) : 0,

                  saleRealtorPct: underwritingV1.success ? num(underwritingV1.data.saleCosts.realtorPct) : 6,
                  saleClosingCostPct: underwritingV1.success ? num(underwritingV1.data.saleCosts.closingCostPct) : 2,
                  saleMiscFlat: underwritingV1.success ? num(underwritingV1.data.saleCosts.miscFlat) : 0,

                  monthsHeld: underwritingV1.success ? num(underwritingV1.data.holdCosts.monthsHeld) : 4,
                  taxesPerMonth: underwritingV1.success ? num(underwritingV1.data.holdCosts.taxesPerMonth) : 0,
                  insurancePerMonth: underwritingV1.success ? num(underwritingV1.data.holdCosts.insurancePerMonth) : 0,
                  utilitiesPerMonth: underwritingV1.success ? num(underwritingV1.data.holdCosts.utilitiesPerMonth) : 0,
                  hoaPerMonth: underwritingV1.success ? num(underwritingV1.data.holdCosts.hoaPerMonth) : 0,
                  holdMiscPerMonth: underwritingV1.success ? num(underwritingV1.data.holdCosts.miscPerMonth) : 0,

                  loanType: underwritingV1.success ? underwritingV1.data.financing.loanType : "cash",
                  interestPctAnnual: underwritingV1.success ? num(underwritingV1.data.financing.interestPctAnnual) : 12,
                  pointsPct: underwritingV1.success ? num(underwritingV1.data.financing.pointsPct) : 2,
                  loanToCostPct: underwritingV1.success ? num(underwritingV1.data.financing.loanToCostPct) : 90,
                  downPaymentPct: underwritingV1.success ? num(underwritingV1.data.financing.downPaymentPct) : 20,
                  termYears: underwritingV1.success ? num(underwritingV1.data.financing.termYears) : 30,
                  lenderFeesFlat: underwritingV1.success ? num(underwritingV1.data.financing.lenderFeesFlat) : 0,
                  includeRepairsInLoan: underwritingV1.success ? underwritingV1.data.financing.includeRepairsInLoan : true,

                  rentPerMonth: underwritingV1.success ? num(underwritingV1.data.rental.rentPerMonth) : num(property?.rentPerMonth),
                  otherIncomePerMonth: underwritingV1.success ? num(underwritingV1.data.rental.otherIncomePerMonth) : 0,
                  vacancyPct: underwritingV1.success ? num(underwritingV1.data.rental.vacancyPct) : 5,
                  managementPct: underwritingV1.success ? num(underwritingV1.data.rental.managementPct) : 10,
                  maintenancePct: underwritingV1.success ? num(underwritingV1.data.rental.maintenancePct) : 8,
                  capexPct: underwritingV1.success ? num(underwritingV1.data.rental.capexPct) : 5,
                }
              : undefined
          }
          linked={{
            opportunity: propertyId > 0 ? { id: propertyId, href: `/opportunities/${propertyId}` } : undefined,
            playground: session?.id ? { id: Number(session.id), href: `/playground?sessionId=${Number(session.id)}` } : undefined,
          }}
          onSave={async (values) => {
            try {
              const nextStrategy = (values.strategy || baseUw.snapshot.strategy || "wholesale") as any;
              const nextArv = num(values.arv);
              const nextRepairs = num(values.repairs);
              const nextHoldCosts = {
                ...baseUw.holdCosts,
                monthsHeld: num(values.monthsHeld) || baseUw.holdCosts.monthsHeld,
                taxesPerMonth: num(values.taxesPerMonth),
                insurancePerMonth: num(values.insurancePerMonth),
                utilitiesPerMonth: num(values.utilitiesPerMonth),
                hoaPerMonth: num(values.hoaPerMonth),
                miscPerMonth: num(values.holdMiscPerMonth),
              };
              const nextSaleCosts = {
                ...baseUw.saleCosts,
                realtorPct: num(values.saleRealtorPct) || baseUw.saleCosts.realtorPct,
                closingCostPct: num(values.saleClosingCostPct) || baseUw.saleCosts.closingCostPct,
                miscFlat: num(values.saleMiscFlat),
              };
              const nextCosts = {
                ...baseUw.costs,
                purchaseClosingFlat: num(values.purchaseClosingFlat),
                marketingFlat: num(values.marketingFlat),
              };
              const nextFinancing = {
                ...baseUw.financing,
                loanType: (values.loanType || baseUw.financing.loanType) as any,
                interestPctAnnual: num(values.interestPctAnnual) || baseUw.financing.interestPctAnnual,
                pointsPct: num(values.pointsPct) || baseUw.financing.pointsPct,
                loanToCostPct: num(values.loanToCostPct) || baseUw.financing.loanToCostPct,
                downPaymentPct: num(values.downPaymentPct) || baseUw.financing.downPaymentPct,
                termYears: num(values.termYears) || baseUw.financing.termYears,
                lenderFeesFlat: num(values.lenderFeesFlat),
                includeRepairsInLoan: typeof values.includeRepairsInLoan === "boolean" ? values.includeRepairsInLoan : baseUw.financing.includeRepairsInLoan,
              };
              const nextRental = {
                ...baseUw.rental,
                rentPerMonth: values.rentPerMonth === null || values.rentPerMonth === undefined ? baseUw.rental.rentPerMonth : num(values.rentPerMonth),
                otherIncomePerMonth: num(values.otherIncomePerMonth),
                vacancyPct: num(values.vacancyPct) || baseUw.rental.vacancyPct,
                managementPct: num(values.managementPct) || baseUw.rental.managementPct,
                maintenancePct: num(values.maintenancePct) || baseUw.rental.maintenancePct,
                capexPct: num(values.capexPct) || baseUw.rental.capexPct,
              };

              const nextAssumptions = {
                ...baseUw.assumptions,
                closingHoldingPct: num(values.closingHoldingPct) || baseUw.assumptions.closingHoldingPct,
                targetProfitMode: (values.targetProfitMode || baseUw.assumptions.targetProfitMode) as any,
                targetProfitValue: num(values.targetProfitValue) || baseUw.assumptions.targetProfitValue,
                assignmentFeeMode: (values.assignmentFeeMode || baseUw.assumptions.assignmentFeeMode) as any,
                assignmentFeeValue: num(values.assignmentFeeValue) || baseUw.assumptions.assignmentFeeValue,
                offerAggression: (values.offerAggression || baseUw.assumptions.offerAggression) as any,
                targetDiscountPctOverride: typeof values.targetDiscountPct === "number" && Number.isFinite(values.targetDiscountPct) ? values.targetDiscountPct : null,
              };

              const targetDiscountPct = nextAssumptions.targetDiscountPctOverride ?? null;
              const dm = computeDealMath({
                arv: nextArv,
                repairs: nextRepairs,
                assumptions: nextAssumptions as any,
                targetDiscountPct,
                strategy: nextStrategy,
                financing: nextFinancing as any,
                holdCosts: nextHoldCosts as any,
                saleCosts: nextSaleCosts as any,
                costs: nextCosts as any,
              });
              const offerTarget = typeof values.offerTarget === "number" && Number.isFinite(values.offerTarget) && values.offerTarget > 0 ? values.offerTarget : dm.mao || 0;
              const out = computeUnderwritingOutputs({
                strategy: nextStrategy,
                arv: nextArv,
                repairs: nextRepairs,
                offerTarget,
                financing: nextFinancing as any,
                holdCosts: nextHoldCosts as any,
                saleCosts: nextSaleCosts as any,
                costs: nextCosts as any,
                rental: nextRental as any,
              });

              const scenarioId = `sc_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
              const scenario = {
                id: scenarioId,
                name: `Saved ${new Date().toISOString().slice(0, 16).replace("T", " ")}`,
                createdAt: new Date().toISOString(),
                strategy: nextStrategy,
                arv: nextArv,
                repairs: nextRepairs,
                monthsHeld: nextHoldCosts.monthsHeld,
                offerTarget: offerTarget || null,
                dealMath: { ...dm, offerTarget: offerTarget || null },
                outputs: out,
              };

              const nextUw = {
                ...baseUw,
                templateId: values.templateId || null,
                snapshot: { ...baseUw.snapshot, strategy: nextStrategy },
                arv: { ...baseUw.arv, value: nextArv || null, rangeLow: values.arvLow ? num(values.arvLow) : baseUw.arv.rangeLow, rangeHigh: values.arvHigh ? num(values.arvHigh) : baseUw.arv.rangeHigh },
                repairs: { ...baseUw.repairs, mode: "lite", liteEstimate: nextRepairs || null },
                assumptions: nextAssumptions,
                financing: nextFinancing,
                holdCosts: nextHoldCosts,
                saleCosts: nextSaleCosts,
                costs: nextCosts,
                dealMath: { ...dm, offerTarget: offerTarget || null },
                outputs: out,
                rental: nextRental,
                scenarios: Array.from(new Map([...(baseUw.scenarios || []), scenario].map((s: any) => [s.id, s])).values()),
                updatedAt: new Date().toISOString(),
              };

              if (session?.id) {
                const res = await fetch(`/api/playground/sessions/${session.id}`, {
                  method: "PATCH",
                  credentials: "include",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ underwritingJson: JSON.stringify(nextUw) }),
                });
                const json = await res.json();
                if (!res.ok) throw new Error(json?.message || "Failed to save session");
              }
              if (propertyId > 0 && !error) {
                const patch: any = {
                  arv: nextArv || null,
                  repairCost: nextRepairs || null,
                  price: offerTarget || dm.mao || null,
                };
                if (nextStrategy === "rental") patch.rentPerMonth = nextRental.rentPerMonth || null;
                await fetch(`/api/opportunities/${propertyId}`, {
                  method: "PATCH",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify(patch),
                });
              }
              toast({ title: "Saved" });
            } catch (e: any) {
              toast({ title: "Save failed", description: e?.message || "Unknown error", variant: "destructive" });
            }
          }}
        />
      )}
    </Layout>
  );
}
