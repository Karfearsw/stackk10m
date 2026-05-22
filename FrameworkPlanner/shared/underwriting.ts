import { z } from "zod";

export const underwritingCompSchema = z.object({
  id: z.string().min(1),
  address: z.string().min(1),
  url: z.string().url().optional().nullable(),
  distanceMi: z.number().finite().nonnegative().optional().nullable(),
  domDays: z.number().finite().nonnegative().optional().nullable(),
  soldPrice: z.number().finite().nonnegative().optional().nullable(),
  sqft: z.number().finite().nonnegative().optional().nullable(),
  beds: z.number().finite().nonnegative().optional().nullable(),
  baths: z.number().finite().nonnegative().optional().nullable(),
  included: z.boolean().default(true),
  primary: z.boolean().default(false),
  createdAt: z.string().min(1),
});
export type UnderwritingComp = z.infer<typeof underwritingCompSchema>;

export const underwritingRepairCategorySchema = z.object({
  key: z.string().min(1),
  label: z.string().min(1),
  level: z.enum(["low", "med", "high", "custom"]).default("med"),
  estimate: z.number().finite().nonnegative().optional().nullable(),
});
export type UnderwritingRepairCategory = z.infer<typeof underwritingRepairCategorySchema>;

export const underwritingRepairSchema = z.object({
  mode: z.enum(["lite", "detailed"]).default("lite"),
  liteEstimate: z.number().finite().nonnegative().optional().nullable(),
  categories: z.array(underwritingRepairCategorySchema).default([]),
});
export type UnderwritingRepair = z.infer<typeof underwritingRepairSchema>;

export const underwritingNotesSchema = z.object({
  sellerSaid: z.array(z.string().min(1)).default([]),
  buyerFeedback: z.array(z.string().min(1)).default([]),
  inspection: z.array(z.string().min(1)).default([]),
  risks: z.array(z.string().min(1)).default([]),
});
export type UnderwritingNotes = z.infer<typeof underwritingNotesSchema>;

export const underwritingAssumptionsSchema = z.object({
  closingHoldingPct: z.number().finite().nonnegative().max(50).default(10),
  targetProfitMode: z.enum(["pct_arv", "flat"]).default("pct_arv"),
  targetProfitValue: z.number().finite().nonnegative().default(10),
  assignmentFeeMode: z.enum(["flat", "pct_arv"]).default("flat"),
  assignmentFeeValue: z.number().finite().nonnegative().default(10000),
  targetDiscountPctOverride: z.number().finite().nonnegative().max(100).optional().nullable(),
  offerAggression: z.enum(["conservative", "balanced", "aggressive"]).default("balanced"),
});
export type UnderwritingAssumptions = z.infer<typeof underwritingAssumptionsSchema>;

export const underwritingFinancingSchema = z.object({
  loanType: z.enum(["cash", "hard_money", "conventional"]).default("cash"),
  interestPctAnnual: z.number().finite().nonnegative().max(100).default(12),
  pointsPct: z.number().finite().nonnegative().max(20).default(2),
  loanToCostPct: z.number().finite().nonnegative().max(100).default(90),
  downPaymentPct: z.number().finite().nonnegative().max(100).default(20),
  termYears: z.number().finite().nonnegative().max(40).default(30),
  lenderFeesFlat: z.number().finite().nonnegative().default(0),
  includeRepairsInLoan: z.boolean().default(true),
});
export type UnderwritingFinancing = z.infer<typeof underwritingFinancingSchema>;

export const underwritingHoldCostsSchema = z.object({
  monthsHeld: z.number().finite().nonnegative().max(60).default(4),
  taxesPerMonth: z.number().finite().nonnegative().default(0),
  insurancePerMonth: z.number().finite().nonnegative().default(0),
  utilitiesPerMonth: z.number().finite().nonnegative().default(0),
  hoaPerMonth: z.number().finite().nonnegative().default(0),
  miscPerMonth: z.number().finite().nonnegative().default(0),
});
export type UnderwritingHoldCosts = z.infer<typeof underwritingHoldCostsSchema>;

export const underwritingSaleCostsSchema = z.object({
  realtorPct: z.number().finite().nonnegative().max(20).default(6),
  closingCostPct: z.number().finite().nonnegative().max(20).default(2),
  miscFlat: z.number().finite().nonnegative().default(0),
});
export type UnderwritingSaleCosts = z.infer<typeof underwritingSaleCostsSchema>;

export const underwritingCostsSchema = z.object({
  purchaseClosingFlat: z.number().finite().nonnegative().default(0),
  marketingFlat: z.number().finite().nonnegative().default(0),
});
export type UnderwritingCosts = z.infer<typeof underwritingCostsSchema>;

export const underwritingRentalSchema = z.object({
  rentPerMonth: z.number().finite().nonnegative().optional().nullable(),
  otherIncomePerMonth: z.number().finite().nonnegative().default(0),
  vacancyPct: z.number().finite().nonnegative().max(50).default(5),
  managementPct: z.number().finite().nonnegative().max(50).default(10),
  maintenancePct: z.number().finite().nonnegative().max(50).default(8),
  capexPct: z.number().finite().nonnegative().max(50).default(5),
});
export type UnderwritingRental = z.infer<typeof underwritingRentalSchema>;

export const underwritingSnapshotSchema = z.object({
  occupancy: z.enum(["vacant", "occupied"]).optional().nullable(),
  strategy: z.enum(["wholesale", "wholetail", "flip", "rental"]).optional().nullable(),
  sellerMotivation: z.enum(["high", "medium", "low"]).optional().nullable(),
  condition: z.enum(["turnkey", "light_cosmetic", "medium_rehab", "heavy_rehab", "teardown"]).optional().nullable(),
  timeline: z.enum(["0_7", "7_30", "30_60", "60_plus"]).optional().nullable(),
});
export type UnderwritingSnapshot = z.infer<typeof underwritingSnapshotSchema>;

export const underwritingArvSchema = z.object({
  value: z.number().finite().nonnegative().optional().nullable(),
  rangeLow: z.number().finite().nonnegative().optional().nullable(),
  rangeHigh: z.number().finite().nonnegative().optional().nullable(),
  method: z.enum(["manual", "comps"]).default("manual"),
});
export type UnderwritingArv = z.infer<typeof underwritingArvSchema>;

export const underwritingDealMathSchema = z.object({
  mao: z.number().finite().optional().nullable(),
  offerMin: z.number().finite().optional().nullable(),
  offerMax: z.number().finite().optional().nullable(),
  offerTarget: z.number().finite().optional().nullable(),
  lineItemMao: z.number().finite().optional().nullable(),
  discountMao: z.number().finite().optional().nullable(),
  assignmentFee: z.number().finite().optional().nullable(),
  projectedSpread: z.number().finite().optional().nullable(),
  meetsCriteria: z.boolean().default(false),
});
export type UnderwritingDealMath = z.infer<typeof underwritingDealMathSchema>;

export const underwritingOutputsSchema = z.object({
  allInCost: z.number().finite().optional().nullable(),
  profit: z.number().finite().optional().nullable(),
  profitMarginPct: z.number().finite().optional().nullable(),
  cashToClose: z.number().finite().optional().nullable(),
  cashInvested: z.number().finite().optional().nullable(),
  roiPct: z.number().finite().optional().nullable(),
  noiMonthly: z.number().finite().optional().nullable(),
  noiAnnual: z.number().finite().optional().nullable(),
  capRatePct: z.number().finite().optional().nullable(),
  debtServiceMonthly: z.number().finite().optional().nullable(),
  dscr: z.number().finite().optional().nullable(),
  cashflowAnnual: z.number().finite().optional().nullable(),
  cashOnCashPct: z.number().finite().optional().nullable(),
});
export type UnderwritingOutputs = z.infer<typeof underwritingOutputsSchema>;

export const underwritingScenarioSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  createdAt: z.string().min(1),
  strategy: z.enum(["wholesale", "wholetail", "flip", "rental"]).optional().nullable(),
  arv: z.number().finite().nonnegative(),
  repairs: z.number().finite().nonnegative(),
  monthsHeld: z.number().finite().nonnegative(),
  offerTarget: z.number().finite().optional().nullable(),
  dealMath: underwritingDealMathSchema,
  outputs: underwritingOutputsSchema,
});
export type UnderwritingScenario = z.infer<typeof underwritingScenarioSchema>;

export const underwritingSchemaV1 = z.object({
  version: z.literal(1),
  templateId: z.string().optional().nullable(),
  snapshot: underwritingSnapshotSchema.default({}),
  arv: underwritingArvSchema.default({ method: "manual" }),
  comps: z.array(underwritingCompSchema).default([]),
  repairs: underwritingRepairSchema.default({ mode: "lite", categories: [] }),
  assumptions: underwritingAssumptionsSchema.default({}),
  financing: underwritingFinancingSchema.default({}),
  holdCosts: underwritingHoldCostsSchema.default({}),
  saleCosts: underwritingSaleCostsSchema.default({}),
  costs: underwritingCostsSchema.default({}),
  dealMath: underwritingDealMathSchema.default({ meetsCriteria: false }),
  outputs: underwritingOutputsSchema.default({}),
  rental: underwritingRentalSchema.default({}),
  scenarios: z.array(underwritingScenarioSchema).default([]),
  notes: underwritingNotesSchema.default({}),
  updatedAt: z.string().min(1),
});
export type UnderwritingV1 = z.infer<typeof underwritingSchemaV1>;

export function makeEmptyUnderwritingV1(nowIso: string): UnderwritingV1 {
  return underwritingSchemaV1.parse({ version: 1, updatedAt: nowIso });
}

function safeNumber(n: unknown): number | null {
  if (typeof n === "number" && Number.isFinite(n)) return n;
  if (typeof n === "string") {
    const v = parseFloat(n);
    return Number.isFinite(v) ? v : null;
  }
  return null;
}

export function computeCompPricePerSqft(comp: Pick<UnderwritingComp, "soldPrice" | "sqft">): number | null {
  const p = safeNumber(comp.soldPrice);
  const s = safeNumber(comp.sqft);
  if (!p || !s || s <= 0) return null;
  return p / s;
}

export function computeArvFromComps(input: {
  subjectSqft?: number | null;
  comps: UnderwritingComp[];
}): { low: number | null; high: number | null; value: number | null } {
  const included = input.comps.filter((c) => c.included);
  const primary = included.filter((c) => c.primary);
  const pool = primary.length ? primary : included;
  if (!pool.length) return { low: null, high: null, value: null };

  const prices: number[] = [];
  const ppsf: number[] = [];
  for (const c of pool) {
    const sp = safeNumber(c.soldPrice);
    if (sp) prices.push(sp);
    const v = computeCompPricePerSqft(c);
    if (v) ppsf.push(v);
  }

  const subjectSqft = safeNumber(input.subjectSqft);
  const fromPpsf = subjectSqft && ppsf.length ? ppsf.map((x) => x * subjectSqft) : [];
  const all = [...prices, ...fromPpsf].filter((x) => Number.isFinite(x) && x > 0);
  if (!all.length) return { low: null, high: null, value: null };

  all.sort((a, b) => a - b);
  const low = all[Math.floor(all.length * 0.2)];
  const high = all[Math.floor(all.length * 0.8)];
  const mid = all[Math.floor(all.length * 0.5)];
  return { low, high, value: mid };
}

export function computeRepairTotal(repairs: UnderwritingRepair): number {
  if (repairs.mode === "lite") return safeNumber(repairs.liteEstimate) || 0;
  return repairs.categories.reduce((sum, c) => sum + (safeNumber(c.estimate) || 0), 0);
}

export function computeDealMath(input: {
  arv: number;
  repairs: number;
  assumptions: UnderwritingAssumptions;
  targetDiscountPct?: number | null;
  strategy?: UnderwritingSnapshot["strategy"] | null;
  financing?: UnderwritingFinancing;
  holdCosts?: UnderwritingHoldCosts;
  saleCosts?: UnderwritingSaleCosts;
  costs?: UnderwritingCosts;
}): UnderwritingDealMath {
  const closingHolding = (input.assumptions.closingHoldingPct / 100) * input.arv;
  const targetProfit =
    input.assumptions.targetProfitMode === "flat" ? input.assumptions.targetProfitValue : (input.assumptions.targetProfitValue / 100) * input.arv;
  const assignmentFee =
    input.assumptions.assignmentFeeMode === "flat" ? input.assumptions.assignmentFeeValue : (input.assumptions.assignmentFeeValue / 100) * input.arv;

  const strategy = input.strategy || "wholesale";
  const hold = input.holdCosts ? underwritingHoldCostsSchema.parse(input.holdCosts) : underwritingHoldCostsSchema.parse({});
  const sale = input.saleCosts ? underwritingSaleCostsSchema.parse(input.saleCosts) : underwritingSaleCostsSchema.parse({});
  const costs = input.costs ? underwritingCostsSchema.parse(input.costs) : underwritingCostsSchema.parse({});
  const fin = input.financing ? underwritingFinancingSchema.parse(input.financing) : underwritingFinancingSchema.parse({});

  const holdMonthly = hold.taxesPerMonth + hold.insurancePerMonth + hold.utilitiesPerMonth + hold.hoaPerMonth + hold.miscPerMonth;
  const holdTotal = holdMonthly * hold.monthsHeld;

  const salePct = (sale.realtorPct + sale.closingCostPct) / 100;
  const saleTotal = input.arv * salePct + sale.miscFlat;

  const assignmentCost = strategy === "wholesale" ? assignmentFee : 0;

  const baseNoFin = input.arv - input.repairs - closingHolding - targetProfit - assignmentCost - holdTotal - saleTotal - costs.purchaseClosingFlat - costs.marketingFlat;

  const months = hold.monthsHeld;
  const kInterestOnly = (fin.pointsPct / 100) + (fin.interestPctAnnual / 100) * (months / 12);
  const paymentFactor = fin.loanType === "conventional" ? amortizingMonthlyPaymentFactor(fin.interestPctAnnual, fin.termYears * 12) * months : kInterestOnly;

  const { loanCoeffPurchase, loanCoeffRepairs, feesFlat } = (() => {
    if (fin.loanType === "hard_money") {
      const ltc = fin.loanToCostPct / 100;
      return { loanCoeffPurchase: ltc * paymentFactor, loanCoeffRepairs: (fin.includeRepairsInLoan ? ltc : 0) * paymentFactor, feesFlat: fin.lenderFeesFlat };
    }
    if (fin.loanType === "conventional") {
      const loanPct = 1 - fin.downPaymentPct / 100;
      return { loanCoeffPurchase: loanPct * paymentFactor, loanCoeffRepairs: 0, feesFlat: fin.lenderFeesFlat };
    }
    return { loanCoeffPurchase: 0, loanCoeffRepairs: 0, feesFlat: 0 };
  })();

  const denom = 1 + loanCoeffPurchase;
  const lineItemMaoRaw = denom > 0 ? (baseNoFin - feesFlat - loanCoeffRepairs * input.repairs) / denom : baseNoFin;
  const lineItemMao = Number.isFinite(lineItemMaoRaw) ? lineItemMaoRaw : baseNoFin;

  const discountMao =
    typeof input.targetDiscountPct === "number" && Number.isFinite(input.targetDiscountPct) ? input.arv * (1 - input.targetDiscountPct / 100) - input.repairs : null;
  const mao = discountMao !== null ? Math.min(lineItemMao, discountMao) : lineItemMao;

  const spread = assignmentFee;
  const aggression = input.assumptions.offerAggression;
  const wiggle = aggression === "conservative" ? 0.04 : aggression === "aggressive" ? 0.01 : 0.025;
  const offerMin = mao * (1 - wiggle);
  const offerMax = mao * (1 + wiggle);

  const meetsCriteria = mao > 0 && offerMax > 0;

  return {
    mao,
    offerMin,
    offerMax,
    lineItemMao,
    discountMao,
    assignmentFee,
    projectedSpread: spread,
    meetsCriteria,
  };
}

export function computeUnderwritingOutputs(input: {
  strategy: UnderwritingSnapshot["strategy"] | null | undefined;
  arv: number;
  repairs: number;
  offerTarget: number;
  financing: UnderwritingFinancing;
  holdCosts: UnderwritingHoldCosts;
  saleCosts: UnderwritingSaleCosts;
  costs: UnderwritingCosts;
  rental: UnderwritingRental;
}): UnderwritingOutputs {
  const strategy = input.strategy || "wholesale";
  const holdMonthly = input.holdCosts.taxesPerMonth + input.holdCosts.insurancePerMonth + input.holdCosts.utilitiesPerMonth + input.holdCosts.hoaPerMonth + input.holdCosts.miscPerMonth;
  const holdTotal = holdMonthly * input.holdCosts.monthsHeld;
  const saleTotal = computeSaleCostsTotal(input.arv, input.saleCosts);
  const financingSummary = computeFinancingSummary({
    purchasePrice: input.offerTarget,
    repairs: input.repairs,
    monthsHeld: input.holdCosts.monthsHeld,
    costs: input.costs,
    financing: input.financing,
  });

  if (strategy === "rental") {
    const rent = safeNumber(input.rental.rentPerMonth) || 0;
    const otherIncome = input.rental.otherIncomePerMonth || 0;
    const gross = rent + otherIncome;
    const egi = gross * (1 - (input.rental.vacancyPct / 100));
    const mgmt = egi * (input.rental.managementPct / 100);
    const maint = egi * (input.rental.maintenancePct / 100);
    const capex = egi * (input.rental.capexPct / 100);
    const opex = holdMonthly + mgmt + maint + capex;
    const noiMonthly = egi - opex;
    const noiAnnual = noiMonthly * 12;

    const debtServiceMonthly = computeDebtServiceMonthly({
      purchasePrice: input.offerTarget,
      repairs: input.repairs,
      financing: input.financing,
    });
    const dscr = debtServiceMonthly > 0 ? noiMonthly / debtServiceMonthly : null;

    const basis = input.offerTarget + input.repairs + input.costs.purchaseClosingFlat;
    const capRatePct = basis > 0 ? (noiAnnual / basis) * 100 : null;
    const cashflowAnnual = (noiMonthly - debtServiceMonthly) * 12;

    const cashToClose = computeCashToClose({
      purchasePrice: input.offerTarget,
      repairs: input.repairs,
      costs: input.costs,
      financing: input.financing,
    });
    const cashInvested = cashToClose;
    const cashOnCashPct = cashInvested > 0 ? (cashflowAnnual / cashInvested) * 100 : null;

    return {
      cashToClose,
      cashInvested,
      noiMonthly,
      noiAnnual,
      capRatePct,
      debtServiceMonthly,
      dscr,
      cashflowAnnual,
      cashOnCashPct,
    };
  }

  const allInCost =
    input.offerTarget +
    input.repairs +
    input.costs.purchaseClosingFlat +
    input.costs.marketingFlat +
    saleTotal +
    holdTotal +
    financingSummary.points +
    financingSummary.lenderFees +
    financingSummary.interestCarry;
  const profit = input.arv - allInCost;
  const profitMarginPct = input.arv > 0 ? (profit / input.arv) * 100 : null;
  const cashToClose = financingSummary.cashToClose;
  const cashInvested = cashToClose + holdTotal + financingSummary.interestCarry + input.costs.marketingFlat + saleTotal;
  const roiPct = cashInvested > 0 ? (profit / cashInvested) * 100 : null;

  return {
    allInCost,
    profit,
    profitMarginPct,
    cashToClose,
    cashInvested,
    roiPct,
  };
}

export function computeScenarioTriplet(input: {
  strategy: UnderwritingSnapshot["strategy"] | null | undefined;
  arv: number;
  repairs: number;
  monthsHeld: number;
  arvLow?: number | null;
  arvHigh?: number | null;
}): { key: "low" | "base" | "high"; name: string; arv: number; repairs: number; monthsHeld: number }[] {
  const baseArv = input.arv;
  const baseRepairs = input.repairs;
  const baseMonths = input.monthsHeld;
  const lowArv = input.arvLow && input.arvLow > 0 ? input.arvLow : baseArv * 0.95;
  const highArv = input.arvHigh && input.arvHigh > 0 ? input.arvHigh : baseArv * 1.05;
  const low = { key: "low" as const, name: "Low", arv: lowArv, repairs: baseRepairs * 1.15, monthsHeld: Math.max(0, baseMonths + 1) };
  const base = { key: "base" as const, name: "Base", arv: baseArv, repairs: baseRepairs, monthsHeld: baseMonths };
  const high = { key: "high" as const, name: "High", arv: highArv, repairs: baseRepairs * 0.85, monthsHeld: Math.max(0, baseMonths - 1) };
  return [low, base, high].map((r) => ({
    ...r,
    arv: Math.max(0, Math.round(r.arv)),
    repairs: Math.max(0, Math.round(r.repairs)),
    monthsHeld: Math.max(0, Math.round(r.monthsHeld)),
  }));
}

export function computeSaleCostsTotal(arv: number, saleCosts: UnderwritingSaleCosts): number {
  const pct = (saleCosts.realtorPct + saleCosts.closingCostPct) / 100;
  return arv * pct + saleCosts.miscFlat;
}

function amortizingMonthlyPaymentFactor(annualRatePct: number, termMonths: number): number {
  const n = Math.max(1, Math.round(termMonths));
  const r = annualRatePct > 0 ? (annualRatePct / 100) / 12 : 0;
  if (r === 0) return 1 / n;
  const pow = Math.pow(1 + r, n);
  return (r * pow) / (pow - 1);
}

function computeDebtServiceMonthly(input: {
  purchasePrice: number;
  repairs: number;
  financing: UnderwritingFinancing;
}): number {
  if (input.financing.loanType === "hard_money") {
    const basis = input.purchasePrice + (input.financing.includeRepairsInLoan ? input.repairs : 0);
    const loan = (input.financing.loanToCostPct / 100) * basis;
    return loan * (input.financing.interestPctAnnual / 100) / 12;
  }
  if (input.financing.loanType === "conventional") {
    const loan = (1 - input.financing.downPaymentPct / 100) * input.purchasePrice;
    const factor = amortizingMonthlyPaymentFactor(input.financing.interestPctAnnual, input.financing.termYears * 12);
    return loan * factor;
  }
  return 0;
}

function computeCashToClose(input: { purchasePrice: number; repairs: number; costs: UnderwritingCosts; financing: UnderwritingFinancing }): number {
  const fin = input.financing;
  const total = input.purchasePrice + input.repairs;
  const financed = (() => {
    if (fin.loanType === "hard_money") {
      const basis = input.purchasePrice + (fin.includeRepairsInLoan ? input.repairs : 0);
      return (fin.loanToCostPct / 100) * basis;
    }
    if (fin.loanType === "conventional") {
      return (1 - fin.downPaymentPct / 100) * input.purchasePrice;
    }
    return 0;
  })();
  const points = financed * (fin.pointsPct / 100);
  return Math.max(0, total - financed + points + fin.lenderFeesFlat + input.costs.purchaseClosingFlat);
}

function computeFinancingSummary(input: {
  purchasePrice: number;
  repairs: number;
  monthsHeld: number;
  costs: UnderwritingCosts;
  financing: UnderwritingFinancing;
}): { cashToClose: number; points: number; lenderFees: number; interestCarry: number } {
  const fin = underwritingFinancingSchema.parse(input.financing);
  const cashToClose = computeCashToClose({ purchasePrice: input.purchasePrice, repairs: input.repairs, costs: input.costs, financing: fin });
  const financed = (() => {
    if (fin.loanType === "hard_money") {
      const basis = input.purchasePrice + (fin.includeRepairsInLoan ? input.repairs : 0);
      return (fin.loanToCostPct / 100) * basis;
    }
    if (fin.loanType === "conventional") {
      return (1 - fin.downPaymentPct / 100) * input.purchasePrice;
    }
    return 0;
  })();
  const points = financed * (fin.pointsPct / 100);
  const interestCarry = (() => {
    if (fin.loanType === "hard_money") {
      return financed * (fin.interestPctAnnual / 100) * (input.monthsHeld / 12);
    }
    if (fin.loanType === "conventional") {
      const m = computeDebtServiceMonthly({ purchasePrice: input.purchasePrice, repairs: input.repairs, financing: fin });
      return m * input.monthsHeld;
    }
    return 0;
  })();
  return { cashToClose, points, lenderFees: fin.lenderFeesFlat, interestCarry };
}

export const underwritingTemplateConfigSchema = z.object({
  targetDiscountPct: z.number().finite().nonnegative().max(100).default(30),
  closingHoldingPct: z.number().finite().nonnegative().max(50).default(10),
  defaultAssignmentFee: z.number().finite().nonnegative().default(10000),
  repairLitePresets: z.object({
    low: z.number().finite().nonnegative().default(5000),
    med: z.number().finite().nonnegative().default(15000),
    high: z.number().finite().nonnegative().default(30000),
    heavy: z.number().finite().nonnegative().default(50000),
  }).default({ low: 5000, med: 15000, high: 30000, heavy: 50000 }),
  typicalRepairByCondition: z
    .object({
      turnkey: z.number().finite().nonnegative().default(5000),
      light_cosmetic: z.number().finite().nonnegative().default(15000),
      medium_rehab: z.number().finite().nonnegative().default(30000),
      heavy_rehab: z.number().finite().nonnegative().default(50000),
      teardown: z.number().finite().nonnegative().default(80000),
    })
    .default({
      turnkey: 5000,
      light_cosmetic: 15000,
      medium_rehab: 30000,
      heavy_rehab: 50000,
      teardown: 80000,
    }),
});
export type UnderwritingTemplateConfig = z.infer<typeof underwritingTemplateConfigSchema>;
