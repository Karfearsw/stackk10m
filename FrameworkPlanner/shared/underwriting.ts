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
  assignmentFee: z.number().finite().optional().nullable(),
  projectedSpread: z.number().finite().optional().nullable(),
  meetsCriteria: z.boolean().default(false),
});
export type UnderwritingDealMath = z.infer<typeof underwritingDealMathSchema>;

export const underwritingSchemaV1 = z.object({
  version: z.literal(1),
  templateId: z.string().optional().nullable(),
  snapshot: underwritingSnapshotSchema.default({}),
  arv: underwritingArvSchema.default({ method: "manual" }),
  comps: z.array(underwritingCompSchema).default([]),
  repairs: underwritingRepairSchema.default({ mode: "lite", categories: [] }),
  assumptions: underwritingAssumptionsSchema.default({}),
  dealMath: underwritingDealMathSchema.default({ meetsCriteria: false }),
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
}): UnderwritingDealMath {
  const closingHolding = (input.assumptions.closingHoldingPct / 100) * input.arv;
  const targetProfit =
    input.assumptions.targetProfitMode === "flat" ? input.assumptions.targetProfitValue : (input.assumptions.targetProfitValue / 100) * input.arv;
  const assignmentFee =
    input.assumptions.assignmentFeeMode === "flat" ? input.assumptions.assignmentFeeValue : (input.assumptions.assignmentFeeValue / 100) * input.arv;

  const baseMao = input.arv - input.repairs - closingHolding - targetProfit - assignmentFee;
  const discountGuard =
    typeof input.targetDiscountPct === "number" && Number.isFinite(input.targetDiscountPct) ? input.arv * (1 - input.targetDiscountPct / 100) : null;
  const mao = discountGuard !== null ? Math.min(baseMao, discountGuard) : baseMao;

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
    assignmentFee,
    projectedSpread: spread,
    meetsCriteria,
  };
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
