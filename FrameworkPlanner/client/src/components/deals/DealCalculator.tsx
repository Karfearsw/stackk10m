import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
<<<<<<< HEAD
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { TrendingUp } from "lucide-react";

export type DealCalculatorValues = {
  arv?: number | null;
  purchasePrice?: number | null;
  repairCosts?: number | null;
  closingCosts?: number | null;
  holdingCosts?: number | null;
  marketingCosts?: number | null;
  sellingCosts?: number | null;
=======
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { TrendingUp } from "lucide-react";
import {
  computeDealMath,
  computeScenarioTriplet,
  computeUnderwritingOutputs,
  underwritingTemplateConfigSchema,
  type UnderwritingFinancing,
  type UnderwritingHoldCosts,
  type UnderwritingRental,
  type UnderwritingSaleCosts,
  type UnderwritingSnapshot,
} from "@shared/underwriting";

export type DealCalculatorValues = {
  strategy?: UnderwritingSnapshot["strategy"] | null;
  templateId?: string | null;
  arv?: number | null;
  arvLow?: number | null;
  arvHigh?: number | null;
  repairs?: number | null;
  offerTarget?: number | null;

  closingHoldingPct?: number | null;
  targetProfitMode?: "pct_arv" | "flat" | null;
  targetProfitValue?: number | null;
  assignmentFeeMode?: "flat" | "pct_arv" | null;
  assignmentFeeValue?: number | null;
  targetDiscountPct?: number | null;
  offerAggression?: "conservative" | "balanced" | "aggressive" | null;

  purchaseClosingFlat?: number | null;
  marketingFlat?: number | null;

  saleRealtorPct?: number | null;
  saleClosingCostPct?: number | null;
  saleMiscFlat?: number | null;

  monthsHeld?: number | null;
  taxesPerMonth?: number | null;
  insurancePerMonth?: number | null;
  utilitiesPerMonth?: number | null;
  hoaPerMonth?: number | null;
  holdMiscPerMonth?: number | null;

  loanType?: "cash" | "hard_money" | "conventional" | null;
  interestPctAnnual?: number | null;
  pointsPct?: number | null;
  loanToCostPct?: number | null;
  downPaymentPct?: number | null;
  termYears?: number | null;
  lenderFeesFlat?: number | null;
  includeRepairsInLoan?: boolean | null;

  rentPerMonth?: number | null;
  otherIncomePerMonth?: number | null;
  vacancyPct?: number | null;
  managementPct?: number | null;
  maintenancePct?: number | null;
  capexPct?: number | null;
>>>>>>> origin/main
};

function safeNumber(value: unknown): number {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  if (typeof value === "string") {
    const n = parseFloat(value);
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
}

<<<<<<< HEAD
export function DealCalculator({
  initialValues,
  showActions = true,
=======
function safeBool(value: unknown): boolean {
  return value !== false;
}

function money(n: number | null | undefined, digits = 0) {
  const v = typeof n === "number" && Number.isFinite(n) ? n : 0;
  return v.toLocaleString("en-US", { maximumFractionDigits: digits, minimumFractionDigits: digits });
}

export function DealCalculator({
  initialValues,
  showActions = true,
  linked,
>>>>>>> origin/main
  onSave,
}: {
  initialValues?: DealCalculatorValues;
  showActions?: boolean;
<<<<<<< HEAD
  onSave?: (values: Required<DealCalculatorValues>) => void;
}) {
  const [arv, setArv] = useState(() => safeNumber(initialValues?.arv));
  const [purchasePrice, setPurchasePrice] = useState(() => safeNumber(initialValues?.purchasePrice));
  const [repairCosts, setRepairCosts] = useState(() => safeNumber(initialValues?.repairCosts));
  const [closingCosts, setClosingCosts] = useState(() => safeNumber(initialValues?.closingCosts));
  const [holdingCosts, setHoldingCosts] = useState(() => safeNumber(initialValues?.holdingCosts));
  const [marketingCosts, setMarketingCosts] = useState(() => safeNumber(initialValues?.marketingCosts));
  const [sellingCosts, setSellingCosts] = useState(() => safeNumber(initialValues?.sellingCosts));

  const metrics = useMemo(() => {
    const totalCosts = purchasePrice + repairCosts + closingCosts + holdingCosts + marketingCosts + sellingCosts;
    const profit = arv - totalCosts;
    const profitMargin = arv > 0 ? (profit / arv) * 100 : 0;
    const percentOfArv = arv > 0 ? (purchasePrice / arv) * 100 : 0;
    return { totalCosts, profit, profitMargin, percentOfArv };
  }, [arv, purchasePrice, repairCosts, closingCosts, holdingCosts, marketingCosts, sellingCosts]);

  const handleReset = () => {
    setArv(0);
    setPurchasePrice(0);
    setRepairCosts(0);
    setClosingCosts(0);
    setHoldingCosts(0);
    setMarketingCosts(0);
    setSellingCosts(0);
=======
  linked?: { opportunity?: { id: number; href: string }; playground?: { id: number; href: string } };
  onSave?: (values: DealCalculatorValues) => void;
}) {
  const { data: templates = [] } = useQuery<any[]>({
    queryKey: ["/api/underwriting/templates"],
    queryFn: async () => {
      const res = await fetch("/api/underwriting/templates", { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
  });

  const [values, setValues] = useState<DealCalculatorValues>(() => {
    const monthsHeld = safeNumber((initialValues as any)?.monthsHeld) || 4;
    const legacyHolding = safeNumber((initialValues as any)?.holdingCosts);
    return {
      strategy: initialValues?.strategy || "wholesale",
      templateId: initialValues?.templateId || null,
      arv: safeNumber(initialValues?.arv),
      arvLow: safeNumber(initialValues?.arvLow) || null,
      arvHigh: safeNumber(initialValues?.arvHigh) || null,
      repairs: safeNumber((initialValues as any)?.repairCosts ?? initialValues?.repairs),
      offerTarget: safeNumber((initialValues as any)?.purchasePrice ?? initialValues?.offerTarget),

      closingHoldingPct: safeNumber(initialValues?.closingHoldingPct) || 10,
      targetProfitMode: initialValues?.targetProfitMode || "pct_arv",
      targetProfitValue: safeNumber(initialValues?.targetProfitValue) || 10,
      assignmentFeeMode: initialValues?.assignmentFeeMode || "flat",
      assignmentFeeValue: safeNumber(initialValues?.assignmentFeeValue) || 10000,
      targetDiscountPct: safeNumber(initialValues?.targetDiscountPct) || 30,
      offerAggression: initialValues?.offerAggression || "balanced",

      purchaseClosingFlat: safeNumber((initialValues as any)?.closingCosts ?? initialValues?.purchaseClosingFlat),
      marketingFlat: safeNumber((initialValues as any)?.marketingCosts ?? initialValues?.marketingFlat),

      saleRealtorPct: safeNumber(initialValues?.saleRealtorPct) || 6,
      saleClosingCostPct: safeNumber(initialValues?.saleClosingCostPct) || 2,
      saleMiscFlat: safeNumber((initialValues as any)?.sellingCosts ?? initialValues?.saleMiscFlat),

      monthsHeld,
      taxesPerMonth: safeNumber(initialValues?.taxesPerMonth),
      insurancePerMonth: safeNumber(initialValues?.insurancePerMonth),
      utilitiesPerMonth: safeNumber(initialValues?.utilitiesPerMonth),
      hoaPerMonth: safeNumber(initialValues?.hoaPerMonth),
      holdMiscPerMonth: safeNumber(initialValues?.holdMiscPerMonth) || (legacyHolding > 0 ? legacyHolding / monthsHeld : 0),

      loanType: initialValues?.loanType || "cash",
      interestPctAnnual: safeNumber(initialValues?.interestPctAnnual) || 12,
      pointsPct: safeNumber(initialValues?.pointsPct) || 2,
      loanToCostPct: safeNumber(initialValues?.loanToCostPct) || 90,
      downPaymentPct: safeNumber(initialValues?.downPaymentPct) || 20,
      termYears: safeNumber(initialValues?.termYears) || 30,
      lenderFeesFlat: safeNumber(initialValues?.lenderFeesFlat),
      includeRepairsInLoan: typeof initialValues?.includeRepairsInLoan === "boolean" ? initialValues.includeRepairsInLoan : true,

      rentPerMonth: safeNumber(initialValues?.rentPerMonth),
      otherIncomePerMonth: safeNumber(initialValues?.otherIncomePerMonth),
      vacancyPct: safeNumber(initialValues?.vacancyPct) || 5,
      managementPct: safeNumber(initialValues?.managementPct) || 10,
      maintenancePct: safeNumber(initialValues?.maintenancePct) || 8,
      capexPct: safeNumber(initialValues?.capexPct) || 5,
    };
  });

  const set = <K extends keyof DealCalculatorValues>(key: K, value: DealCalculatorValues[K]) => setValues((v) => ({ ...v, [key]: value }));
  const n = <K extends keyof DealCalculatorValues>(key: K) => safeNumber(values[key]);

  const templateConfig = useMemo(() => {
    const id = values.templateId ? parseInt(values.templateId, 10) : NaN;
    const t = Number.isFinite(id) ? templates.find((x) => Number(x?.id) === id) : null;
    try {
      return underwritingTemplateConfigSchema.parse(t?.config || {});
    } catch {
      return underwritingTemplateConfigSchema.parse({});
    }
  }, [templates, values.templateId]);

  const strategy = (values.strategy || "wholesale") as UnderwritingSnapshot["strategy"];
  const arv = n("arv");
  const repairs = n("repairs");
  const holdCosts: UnderwritingHoldCosts = useMemo(
    () => ({
      monthsHeld: Math.max(0, Math.round(n("monthsHeld") || 0)),
      taxesPerMonth: n("taxesPerMonth"),
      insurancePerMonth: n("insurancePerMonth"),
      utilitiesPerMonth: n("utilitiesPerMonth"),
      hoaPerMonth: n("hoaPerMonth"),
      miscPerMonth: n("holdMiscPerMonth"),
    }),
    [values],
  );
  const saleCosts: UnderwritingSaleCosts = useMemo(
    () => ({
      realtorPct: n("saleRealtorPct"),
      closingCostPct: n("saleClosingCostPct"),
      miscFlat: n("saleMiscFlat"),
    }),
    [values],
  );
  const costs = useMemo(
    () => ({
      purchaseClosingFlat: n("purchaseClosingFlat"),
      marketingFlat: n("marketingFlat"),
    }),
    [values],
  );
  const financing: UnderwritingFinancing = useMemo(
    () => ({
      loanType: (values.loanType || "cash") as any,
      interestPctAnnual: n("interestPctAnnual"),
      pointsPct: n("pointsPct"),
      loanToCostPct: n("loanToCostPct"),
      downPaymentPct: n("downPaymentPct"),
      termYears: n("termYears"),
      lenderFeesFlat: n("lenderFeesFlat"),
      includeRepairsInLoan: typeof values.includeRepairsInLoan === "boolean" ? values.includeRepairsInLoan : true,
    }),
    [values],
  );
  const rental: UnderwritingRental = useMemo(
    () => ({
      rentPerMonth: values.rentPerMonth ?? null,
      otherIncomePerMonth: n("otherIncomePerMonth"),
      vacancyPct: n("vacancyPct"),
      managementPct: n("managementPct"),
      maintenancePct: n("maintenancePct"),
      capexPct: n("capexPct"),
    }),
    [values],
  );

  const assumptions = useMemo(
    () => ({
      closingHoldingPct: n("closingHoldingPct"),
      targetProfitMode: (values.targetProfitMode || "pct_arv") as any,
      targetProfitValue: n("targetProfitValue"),
      assignmentFeeMode: (values.assignmentFeeMode || "flat") as any,
      assignmentFeeValue: n("assignmentFeeValue"),
      targetDiscountPctOverride: typeof values.targetDiscountPct === "number" ? values.targetDiscountPct : templateConfig.targetDiscountPct,
      offerAggression: (values.offerAggression || "balanced") as any,
    }),
    [values, templateConfig.targetDiscountPct],
  );

  const dealMath = useMemo(() => {
    const targetDiscountPct = assumptions.targetDiscountPctOverride ?? templateConfig.targetDiscountPct;
    if (arv <= 0) return computeDealMath({ arv: 0, repairs: 0, assumptions, targetDiscountPct, strategy, financing, holdCosts, saleCosts, costs });
    return computeDealMath({ arv, repairs, assumptions, targetDiscountPct, strategy, financing, holdCosts, saleCosts, costs });
  }, [arv, repairs, assumptions, costs, financing, holdCosts, saleCosts, strategy, templateConfig.targetDiscountPct]);

  const offerTarget = values.offerTarget && values.offerTarget > 0 ? n("offerTarget") : dealMath.mao || 0;
  const outputs = useMemo(() => {
    return computeUnderwritingOutputs({
      strategy,
      arv,
      repairs,
      offerTarget,
      financing,
      holdCosts,
      saleCosts,
      costs,
      rental,
    });
  }, [arv, costs, financing, holdCosts, offerTarget, repairs, rental, saleCosts, strategy]);

  const scenarioRows = useMemo(() => {
    return computeScenarioTriplet({
      strategy,
      arv,
      repairs,
      monthsHeld: holdCosts.monthsHeld,
      arvLow: values.arvLow ?? null,
      arvHigh: values.arvHigh ?? null,
    }).map((row) => {
      const targetDiscountPct = assumptions.targetDiscountPctOverride ?? templateConfig.targetDiscountPct;
      const rowHold = { ...holdCosts, monthsHeld: row.monthsHeld };
      const dm = computeDealMath({ arv: row.arv, repairs: row.repairs, assumptions, targetDiscountPct, strategy, financing, holdCosts: rowHold, saleCosts, costs });
      const ot = values.offerTarget && values.offerTarget > 0 ? n("offerTarget") : dm.mao || 0;
      const out = computeUnderwritingOutputs({
        strategy,
        arv: row.arv,
        repairs: row.repairs,
        offerTarget: ot,
        financing,
        holdCosts: rowHold,
        saleCosts,
        costs,
        rental,
      });
      return { ...row, dealMath: dm, outputs: out };
    });
  }, [arv, assumptions, costs, financing, holdCosts, repairs, rental, saleCosts, strategy, templateConfig.targetDiscountPct, values.arvHigh, values.arvLow, values.offerTarget]);

  const warnings = useMemo(() => {
    const out = outputs;
    const list: { key: string; label: string }[] = [];
    if (strategy === "rental") {
      if (typeof out.cashflowAnnual === "number" && out.cashflowAnnual < 0) list.push({ key: "neg-cf", label: "Negative cashflow" });
      if (typeof out.dscr === "number" && out.dscr > 0 && out.dscr < 1.1) list.push({ key: "low-dscr", label: "DSCR < 1.10" });
    } else {
      if (typeof out.profit === "number" && out.profit < 0) list.push({ key: "neg-profit", label: "Negative profit" });
      if (typeof out.profitMarginPct === "number" && out.profitMarginPct > 0 && out.profitMarginPct < 10) list.push({ key: "thin", label: "Thin margin" });
    }
    if (arv > 0 && repairs / arv > 0.25) list.push({ key: "rehab", label: "High rehab % of ARV" });
    if (dealMath.mao !== null && typeof dealMath.mao === "number" && dealMath.mao <= 0) list.push({ key: "bad-mao", label: "MAO ≤ 0" });
    return list;
  }, [arv, dealMath.mao, outputs, repairs, strategy]);

  const handleReset = () => {
    setValues({
      strategy: "wholesale",
      templateId: null,
      arv: 0,
      arvLow: null,
      arvHigh: null,
      repairs: 0,
      offerTarget: 0,
      closingHoldingPct: 10,
      targetProfitMode: "pct_arv",
      targetProfitValue: 10,
      assignmentFeeMode: "flat",
      assignmentFeeValue: 10000,
      targetDiscountPct: 30,
      offerAggression: "balanced",
      purchaseClosingFlat: 0,
      marketingFlat: 0,
      saleRealtorPct: 6,
      saleClosingCostPct: 2,
      saleMiscFlat: 0,
      monthsHeld: 4,
      taxesPerMonth: 0,
      insurancePerMonth: 0,
      utilitiesPerMonth: 0,
      hoaPerMonth: 0,
      holdMiscPerMonth: 0,
      loanType: "cash",
      interestPctAnnual: 12,
      pointsPct: 2,
      loanToCostPct: 90,
      downPaymentPct: 20,
      termYears: 30,
      lenderFeesFlat: 0,
      includeRepairsInLoan: true,
      rentPerMonth: 0,
      otherIncomePerMonth: 0,
      vacancyPct: 5,
      managementPct: 10,
      maintenancePct: 8,
      capexPct: 5,
    });
>>>>>>> origin/main
  };

  const handleSave = () => {
    onSave?.({
<<<<<<< HEAD
      arv,
      purchasePrice,
      repairCosts,
      closingCosts,
      holdingCosts,
      marketingCosts,
      sellingCosts,
=======
      ...values,
      strategy,
      arv,
      repairs,
      offerTarget: values.offerTarget && values.offerTarget > 0 ? n("offerTarget") : null,
      targetDiscountPct: assumptions.targetDiscountPctOverride ?? templateConfig.targetDiscountPct,
      includeRepairsInLoan: safeBool(values.includeRepairsInLoan),
>>>>>>> origin/main
    });
  };

  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <div className="lg:col-span-2 space-y-6">
<<<<<<< HEAD
        <Card>
          <CardHeader>
            <CardTitle>Property Information</CardTitle>
=======
        {linked?.opportunity || linked?.playground ? (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">Linked Records</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-2">
              {linked?.opportunity ? (
                <Button asChild variant="outline" size="sm">
                  <Link href={linked.opportunity.href}>Opportunity O-{linked.opportunity.id}</Link>
                </Button>
              ) : null}
              {linked?.playground ? (
                <Button asChild variant="outline" size="sm">
                  <Link href={linked.playground.href}>Playground Session #{linked.playground.id}</Link>
                </Button>
              ) : null}
            </CardContent>
          </Card>
        ) : null}

        <Card>
          <CardHeader>
            <CardTitle>Deal Inputs</CardTitle>
>>>>>>> origin/main
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
<<<<<<< HEAD
=======
                <Label>Strategy</Label>
                <Select value={strategy || ""} onValueChange={(v) => set("strategy", v as any)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="wholesale">Wholesale</SelectItem>
                    <SelectItem value="wholetail">Wholetail</SelectItem>
                    <SelectItem value="flip">Flip</SelectItem>
                    <SelectItem value="rental">Buy-and-hold</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Criteria template</Label>
                <Select value={values.templateId || ""} onValueChange={(v) => set("templateId", v || null)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Default criteria" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">Default</SelectItem>
                    {templates.map((t) => (
                      <SelectItem key={String(t.id)} value={String(t.id)}>
                        {String(t.name || `Template ${t.id}`)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
>>>>>>> origin/main
                <Label htmlFor="dc-arv">After Repair Value (ARV)</Label>
                <div className="relative">
                  <span className="absolute left-3 top-2.5 text-muted-foreground">$</span>
                  <Input
                    id="dc-arv"
                    type="number"
                    placeholder="500000"
                    value={arv || ""}
<<<<<<< HEAD
                    onChange={(e) => setArv(safeNumber(e.target.value))}
=======
                    onChange={(e) => set("arv", safeNumber(e.target.value))}
>>>>>>> origin/main
                    className="pl-7"
                  />
                </div>
              </div>
              <div className="space-y-2">
<<<<<<< HEAD
                <Label htmlFor="dc-purchasePrice">Purchase Price</Label>
                <div className="relative">
                  <span className="absolute left-3 top-2.5 text-muted-foreground">$</span>
                  <Input
                    id="dc-purchasePrice"
                    type="number"
                    placeholder="300000"
                    value={purchasePrice || ""}
                    onChange={(e) => setPurchasePrice(safeNumber(e.target.value))}
=======
                <Label htmlFor="dc-offer">Target Offer (optional)</Label>
                <div className="relative">
                  <span className="absolute left-3 top-2.5 text-muted-foreground">$</span>
                  <Input
                    id="dc-offer"
                    type="number"
                    placeholder={dealMath.mao ? money(dealMath.mao) : "0"}
                    value={values.offerTarget || ""}
                    onChange={(e) => set("offerTarget", safeNumber(e.target.value))}
>>>>>>> origin/main
                    className="pl-7"
                  />
                </div>
              </div>
            </div>
<<<<<<< HEAD
=======

            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label>ARV Low</Label>
                <div className="relative">
                  <span className="absolute left-3 top-2.5 text-muted-foreground">$</span>
                  <Input type="number" value={values.arvLow || ""} onChange={(e) => set("arvLow", safeNumber(e.target.value) || null)} className="pl-7" />
                </div>
              </div>
              <div className="space-y-2">
                <Label>ARV High</Label>
                <div className="relative">
                  <span className="absolute left-3 top-2.5 text-muted-foreground">$</span>
                  <Input type="number" value={values.arvHigh || ""} onChange={(e) => set("arvHigh", safeNumber(e.target.value) || null)} className="pl-7" />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Repairs</Label>
                <div className="relative">
                  <span className="absolute left-3 top-2.5 text-muted-foreground">$</span>
                  <Input type="number" value={repairs || ""} onChange={(e) => set("repairs", safeNumber(e.target.value))} className="pl-7" />
                </div>
              </div>
            </div>
>>>>>>> origin/main
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
<<<<<<< HEAD
            <CardTitle>Costs & Expenses</CardTitle>
=======
            <CardTitle>Assumptions</CardTitle>
>>>>>>> origin/main
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
<<<<<<< HEAD
                <Label htmlFor="dc-repairs">Repair Costs</Label>
                <div className="relative">
                  <span className="absolute left-3 top-2.5 text-muted-foreground">$</span>
                  <Input
                    id="dc-repairs"
                    type="number"
                    placeholder="50000"
                    value={repairCosts || ""}
                    onChange={(e) => setRepairCosts(safeNumber(e.target.value))}
                    className="pl-7"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="dc-closing">Closing Costs</Label>
                <div className="relative">
                  <span className="absolute left-3 top-2.5 text-muted-foreground">$</span>
                  <Input
                    id="dc-closing"
                    type="number"
                    placeholder="9000"
                    value={closingCosts || ""}
                    onChange={(e) => setClosingCosts(safeNumber(e.target.value))}
                    className="pl-7"
                  />
                </div>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="dc-holding">Holding Costs</Label>
                <div className="relative">
                  <span className="absolute left-3 top-2.5 text-muted-foreground">$</span>
                  <Input
                    id="dc-holding"
                    type="number"
                    placeholder="3000"
                    value={holdingCosts || ""}
                    onChange={(e) => setHoldingCosts(safeNumber(e.target.value))}
                    className="pl-7"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="dc-marketing">Marketing Costs</Label>
                <div className="relative">
                  <span className="absolute left-3 top-2.5 text-muted-foreground">$</span>
                  <Input
                    id="dc-marketing"
                    type="number"
                    placeholder="2000"
                    value={marketingCosts || ""}
                    onChange={(e) => setMarketingCosts(safeNumber(e.target.value))}
                    className="pl-7"
                  />
                </div>
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="dc-selling">Selling Costs (Real Estate Commission, etc.)</Label>
              <div className="relative">
                <span className="absolute left-3 top-2.5 text-muted-foreground">$</span>
                <Input
                  id="dc-selling"
                  type="number"
                  placeholder="30000"
                  value={sellingCosts || ""}
                  onChange={(e) => setSellingCosts(safeNumber(e.target.value))}
                  className="pl-7"
                />
=======
                <Label>Target profit</Label>
                <div className="flex gap-2">
                  <Select value={values.targetProfitMode || "pct_arv"} onValueChange={(v) => set("targetProfitMode", v as any)}>
                    <SelectTrigger className="w-[110px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="pct_arv">% ARV</SelectItem>
                      <SelectItem value="flat">$</SelectItem>
                    </SelectContent>
                  </Select>
                  <div className="relative flex-1">
                    <span className="absolute left-3 top-2.5 text-muted-foreground">{values.targetProfitMode === "flat" ? "$" : ""}</span>
                    <Input
                      type="number"
                      value={values.targetProfitValue || ""}
                      onChange={(e) => set("targetProfitValue", safeNumber(e.target.value))}
                      className={values.targetProfitMode === "flat" ? "pl-7" : ""}
                    />
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                <Label>Closing/Holding % of ARV</Label>
                <Input type="number" value={values.closingHoldingPct || ""} onChange={(e) => set("closingHoldingPct", safeNumber(e.target.value))} />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Discount guardrail (70% rule style): {money(assumptions.targetDiscountPctOverride ?? templateConfig.targetDiscountPct, 0)}%</Label>
              <Slider
                value={[assumptions.targetDiscountPctOverride ?? templateConfig.targetDiscountPct]}
                min={0}
                max={60}
                step={1}
                onValueChange={(v) => set("targetDiscountPct", v?.[0] ?? templateConfig.targetDiscountPct)}
              />
            </div>

            {strategy === "wholesale" ? (
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Assignment fee</Label>
                  <div className="flex gap-2">
                    <Select value={values.assignmentFeeMode || "flat"} onValueChange={(v) => set("assignmentFeeMode", v as any)}>
                      <SelectTrigger className="w-[110px]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="flat">$</SelectItem>
                        <SelectItem value="pct_arv">% ARV</SelectItem>
                      </SelectContent>
                    </Select>
                    <div className="relative flex-1">
                      <span className="absolute left-3 top-2.5 text-muted-foreground">{values.assignmentFeeMode === "flat" ? "$" : ""}</span>
                      <Input
                        type="number"
                        value={values.assignmentFeeValue || ""}
                        onChange={(e) => set("assignmentFeeValue", safeNumber(e.target.value))}
                        className={values.assignmentFeeMode === "flat" ? "pl-7" : ""}
                      />
                    </div>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>Offer range aggression</Label>
                  <Select value={values.offerAggression || "balanced"} onValueChange={(v) => set("offerAggression", v as any)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="conservative">Conservative</SelectItem>
                      <SelectItem value="balanced">Balanced</SelectItem>
                      <SelectItem value="aggressive">Aggressive</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            ) : (
              <div className="space-y-2">
                <Label>Offer range aggression</Label>
                <Select value={values.offerAggression || "balanced"} onValueChange={(v) => set("offerAggression", v as any)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="conservative">Conservative</SelectItem>
                    <SelectItem value="balanced">Balanced</SelectItem>
                    <SelectItem value="aggressive">Aggressive</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Costs</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Purchase closing (flat)</Label>
                <div className="relative">
                  <span className="absolute left-3 top-2.5 text-muted-foreground">$</span>
                  <Input type="number" value={values.purchaseClosingFlat || ""} onChange={(e) => set("purchaseClosingFlat", safeNumber(e.target.value))} className="pl-7" />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Marketing (flat)</Label>
                <div className="relative">
                  <span className="absolute left-3 top-2.5 text-muted-foreground">$</span>
                  <Input type="number" value={values.marketingFlat || ""} onChange={(e) => set("marketingFlat", safeNumber(e.target.value))} className="pl-7" />
                </div>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label>Realtor %</Label>
                <Input type="number" value={values.saleRealtorPct || ""} onChange={(e) => set("saleRealtorPct", safeNumber(e.target.value))} />
              </div>
              <div className="space-y-2">
                <Label>Sale closing %</Label>
                <Input type="number" value={values.saleClosingCostPct || ""} onChange={(e) => set("saleClosingCostPct", safeNumber(e.target.value))} />
              </div>
              <div className="space-y-2">
                <Label>Sale misc (flat)</Label>
                <div className="relative">
                  <span className="absolute left-3 top-2.5 text-muted-foreground">$</span>
                  <Input type="number" value={values.saleMiscFlat || ""} onChange={(e) => set("saleMiscFlat", safeNumber(e.target.value))} className="pl-7" />
                </div>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label>Months held</Label>
                <Input type="number" value={values.monthsHeld || ""} onChange={(e) => set("monthsHeld", safeNumber(e.target.value))} />
              </div>
              <div className="space-y-2">
                <Label>Taxes / mo</Label>
                <div className="relative">
                  <span className="absolute left-3 top-2.5 text-muted-foreground">$</span>
                  <Input type="number" value={values.taxesPerMonth || ""} onChange={(e) => set("taxesPerMonth", safeNumber(e.target.value))} className="pl-7" />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Insurance / mo</Label>
                <div className="relative">
                  <span className="absolute left-3 top-2.5 text-muted-foreground">$</span>
                  <Input type="number" value={values.insurancePerMonth || ""} onChange={(e) => set("insurancePerMonth", safeNumber(e.target.value))} className="pl-7" />
                </div>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label>Utilities / mo</Label>
                <div className="relative">
                  <span className="absolute left-3 top-2.5 text-muted-foreground">$</span>
                  <Input type="number" value={values.utilitiesPerMonth || ""} onChange={(e) => set("utilitiesPerMonth", safeNumber(e.target.value))} className="pl-7" />
                </div>
              </div>
              <div className="space-y-2">
                <Label>HOA / mo</Label>
                <div className="relative">
                  <span className="absolute left-3 top-2.5 text-muted-foreground">$</span>
                  <Input type="number" value={values.hoaPerMonth || ""} onChange={(e) => set("hoaPerMonth", safeNumber(e.target.value))} className="pl-7" />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Misc / mo</Label>
                <div className="relative">
                  <span className="absolute left-3 top-2.5 text-muted-foreground">$</span>
                  <Input type="number" value={values.holdMiscPerMonth || ""} onChange={(e) => set("holdMiscPerMonth", safeNumber(e.target.value))} className="pl-7" />
                </div>
>>>>>>> origin/main
              </div>
            </div>
          </CardContent>
        </Card>

<<<<<<< HEAD
=======
        <Card>
          <CardHeader>
            <CardTitle>Financing</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Loan type</Label>
                <Select value={values.loanType || "cash"} onValueChange={(v) => set("loanType", v as any)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="cash">Cash</SelectItem>
                    <SelectItem value="hard_money">Hard money</SelectItem>
                    <SelectItem value="conventional">Conventional</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Interest % (annual)</Label>
                <Input type="number" value={values.interestPctAnnual || ""} onChange={(e) => set("interestPctAnnual", safeNumber(e.target.value))} />
              </div>
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label>Points %</Label>
                <Input type="number" value={values.pointsPct || ""} onChange={(e) => set("pointsPct", safeNumber(e.target.value))} />
              </div>
              <div className="space-y-2">
                <Label>Fees (flat)</Label>
                <div className="relative">
                  <span className="absolute left-3 top-2.5 text-muted-foreground">$</span>
                  <Input type="number" value={values.lenderFeesFlat || ""} onChange={(e) => set("lenderFeesFlat", safeNumber(e.target.value))} className="pl-7" />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Include repairs in loan</Label>
                <Select value={safeBool(values.includeRepairsInLoan) ? "yes" : "no"} onValueChange={(v) => set("includeRepairsInLoan", v === "yes")}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="yes">Yes</SelectItem>
                    <SelectItem value="no">No</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {values.loanType === "hard_money" ? (
              <div className="space-y-2">
                <Label>Loan-to-cost %</Label>
                <Input type="number" value={values.loanToCostPct || ""} onChange={(e) => set("loanToCostPct", safeNumber(e.target.value))} />
              </div>
            ) : values.loanType === "conventional" ? (
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Down payment %</Label>
                  <Input type="number" value={values.downPaymentPct || ""} onChange={(e) => set("downPaymentPct", safeNumber(e.target.value))} />
                </div>
                <div className="space-y-2">
                  <Label>Term (years)</Label>
                  <Input type="number" value={values.termYears || ""} onChange={(e) => set("termYears", safeNumber(e.target.value))} />
                </div>
              </div>
            ) : null}
          </CardContent>
        </Card>

        {strategy === "rental" ? (
          <Card>
            <CardHeader>
              <CardTitle>Rental Assumptions</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Rent / mo</Label>
                  <div className="relative">
                    <span className="absolute left-3 top-2.5 text-muted-foreground">$</span>
                    <Input type="number" value={values.rentPerMonth || ""} onChange={(e) => set("rentPerMonth", safeNumber(e.target.value))} className="pl-7" />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Other income / mo</Label>
                  <div className="relative">
                    <span className="absolute left-3 top-2.5 text-muted-foreground">$</span>
                    <Input
                      type="number"
                      value={values.otherIncomePerMonth || ""}
                      onChange={(e) => set("otherIncomePerMonth", safeNumber(e.target.value))}
                      className="pl-7"
                    />
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-4 gap-4">
                <div className="space-y-2">
                  <Label>Vacancy %</Label>
                  <Input type="number" value={values.vacancyPct || ""} onChange={(e) => set("vacancyPct", safeNumber(e.target.value))} />
                </div>
                <div className="space-y-2">
                  <Label>Mgmt %</Label>
                  <Input type="number" value={values.managementPct || ""} onChange={(e) => set("managementPct", safeNumber(e.target.value))} />
                </div>
                <div className="space-y-2">
                  <Label>Maint %</Label>
                  <Input type="number" value={values.maintenancePct || ""} onChange={(e) => set("maintenancePct", safeNumber(e.target.value))} />
                </div>
                <div className="space-y-2">
                  <Label>CapEx %</Label>
                  <Input type="number" value={values.capexPct || ""} onChange={(e) => set("capexPct", safeNumber(e.target.value))} />
                </div>
              </div>
            </CardContent>
          </Card>
        ) : null}

>>>>>>> origin/main
        {showActions && (
          <div className="flex gap-2">
            <Button onClick={handleReset} variant="outline" className={onSave ? "flex-1" : "w-full"}>
              Clear All
            </Button>
            {onSave && (
              <Button className="flex-1 bg-primary hover:bg-primary/90 text-white" onClick={handleSave}>
                Save Deal
              </Button>
            )}
          </div>
        )}
      </div>

      <div className="space-y-4">
        <Card className="border-primary/50 bg-primary/5">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-lg">
              <TrendingUp className="h-5 w-5 text-primary" />
<<<<<<< HEAD
              Profit Analysis
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <p className="text-xs text-muted-foreground mb-1">Total Profit</p>
              <p className={`text-3xl font-bold ${metrics.profit >= 0 ? "text-green-600" : "text-destructive"}`}>
                ${metrics.profit.toLocaleString("en-US", { maximumFractionDigits: 0 })}
              </p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground mb-1">Profit Margin</p>
              <p className={`text-2xl font-bold ${metrics.profit >= 0 ? "text-green-600" : "text-destructive"}`}>
                {metrics.profitMargin.toFixed(1)}%
              </p>
=======
              Deal Decision
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <div className="text-xs text-muted-foreground">MAO</div>
                <div className="text-2xl font-bold">${money(dealMath.mao ?? 0)}</div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">Offer range</div>
                <div className="text-sm font-medium">
                  ${money(dealMath.offerMin ?? 0)}–${money(dealMath.offerMax ?? 0)}
                </div>
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              <Badge variant={dealMath.meetsCriteria ? "default" : "secondary"} className={dealMath.meetsCriteria ? "bg-green-600 text-white" : ""}>
                {dealMath.meetsCriteria ? "Meets criteria" : "Needs work"}
              </Badge>
              {warnings.map((w) => (
                <Badge key={w.key} variant="secondary">
                  {w.label}
                </Badge>
              ))}
>>>>>>> origin/main
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
<<<<<<< HEAD
            <CardTitle className="text-sm">Cost Breakdown</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="flex justify-between pb-2 border-b">
              <span className="text-muted-foreground">ARV:</span>
              <span className="font-medium">${arv.toLocaleString("en-US", { maximumFractionDigits: 0 })}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Purchase:</span>
              <span>
                ${purchasePrice.toLocaleString("en-US", { maximumFractionDigits: 0 })} ({metrics.percentOfArv.toFixed(1)}%)
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Repairs:</span>
              <span>${repairCosts.toLocaleString("en-US", { maximumFractionDigits: 0 })}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Closing:</span>
              <span>${closingCosts.toLocaleString("en-US", { maximumFractionDigits: 0 })}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Holding:</span>
              <span>${holdingCosts.toLocaleString("en-US", { maximumFractionDigits: 0 })}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Marketing:</span>
              <span>${marketingCosts.toLocaleString("en-US", { maximumFractionDigits: 0 })}</span>
            </div>
            <div className="flex justify-between pb-2 border-b">
              <span className="text-muted-foreground">Selling:</span>
              <span>${sellingCosts.toLocaleString("en-US", { maximumFractionDigits: 0 })}</span>
            </div>
            <div className="flex justify-between font-bold">
              <span>Total Costs:</span>
              <span>${metrics.totalCosts.toLocaleString("en-US", { maximumFractionDigits: 0 })}</span>
            </div>
=======
            <CardTitle className="text-sm">Key Metrics</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">ARV</span>
              <span>${money(arv)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Repairs</span>
              <span>${money(repairs)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Offer</span>
              <span>${money(offerTarget)}</span>
            </div>

            {strategy === "rental" ? (
              <>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">NOI (annual)</span>
                  <span>${money(outputs.noiAnnual ?? 0)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Cap rate</span>
                  <span>{outputs.capRatePct ? `${money(outputs.capRatePct, 1)}%` : "—"}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">DSCR</span>
                  <span>{outputs.dscr ? money(outputs.dscr, 2) : "—"}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Cash-on-cash</span>
                  <span>{outputs.cashOnCashPct ? `${money(outputs.cashOnCashPct, 1)}%` : "—"}</span>
                </div>
              </>
            ) : (
              <>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">All-in cost</span>
                  <span>${money(outputs.allInCost ?? 0)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Profit</span>
                  <span className={typeof outputs.profit === "number" && outputs.profit < 0 ? "text-destructive font-medium" : "font-medium"}>
                    ${money(outputs.profit ?? 0)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">ROI</span>
                  <span>{outputs.roiPct ? `${money(outputs.roiPct, 1)}%` : "—"}</span>
                </div>
              </>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Scenario Compare</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Scenario</TableHead>
                  <TableHead className="text-right">ARV</TableHead>
                  <TableHead className="text-right">Repairs</TableHead>
                  <TableHead className="text-right">MAO</TableHead>
                  <TableHead className="text-right">Offer range</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {scenarioRows.map((r) => (
                  <TableRow key={r.key}>
                    <TableCell className="font-medium">{r.name}</TableCell>
                    <TableCell className="text-right">${money(r.arv)}</TableCell>
                    <TableCell className="text-right">${money(r.repairs)}</TableCell>
                    <TableCell className="text-right">${money(r.dealMath.mao ?? 0)}</TableCell>
                    <TableCell className="text-right">
                      ${money(r.dealMath.offerMin ?? 0)}–${money(r.dealMath.offerMax ?? 0)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
>>>>>>> origin/main
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
