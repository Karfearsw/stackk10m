import { describe, expect, test } from "vitest";
import { computeDealMath, computeUnderwritingOutputs } from "../shared/underwriting";

describe("underwriting math", () => {
  test("hybrid MAO uses discount guardrail (ARV*(1-discount)-repairs)", () => {
    const dm = computeDealMath({
      arv: 300000,
      repairs: 40000,
      assumptions: {
        closingHoldingPct: 0,
        targetProfitMode: "flat",
        targetProfitValue: 0,
        assignmentFeeMode: "flat",
        assignmentFeeValue: 0,
        targetDiscountPctOverride: null,
        offerAggression: "balanced",
      },
      targetDiscountPct: 30,
      strategy: "wholesale",
      financing: { loanType: "cash" } as any,
      holdCosts: { monthsHeld: 0 } as any,
      saleCosts: { realtorPct: 0, closingCostPct: 0, miscFlat: 0 } as any,
      costs: { purchaseClosingFlat: 0, marketingFlat: 0 } as any,
    });
    expect(dm.discountMao).toBeCloseTo(170000, 5);
    expect(dm.mao).toBeCloseTo(170000, 5);
  });

  test("financing carry reduces MAO vs cash", () => {
    const assumptions = {
      closingHoldingPct: 0,
      targetProfitMode: "flat",
      targetProfitValue: 0,
      assignmentFeeMode: "flat",
      assignmentFeeValue: 0,
      targetDiscountPctOverride: null,
      offerAggression: "balanced",
    } as const;

    const cash = computeDealMath({
      arv: 250000,
      repairs: 30000,
      assumptions,
      targetDiscountPct: null,
      strategy: "flip",
      financing: { loanType: "cash" } as any,
      holdCosts: { monthsHeld: 6 } as any,
      saleCosts: { realtorPct: 6, closingCostPct: 2, miscFlat: 0 } as any,
      costs: { purchaseClosingFlat: 0, marketingFlat: 0 } as any,
    });

    const hardMoney = computeDealMath({
      arv: 250000,
      repairs: 30000,
      assumptions,
      targetDiscountPct: null,
      strategy: "flip",
      financing: { loanType: "hard_money", interestPctAnnual: 12, pointsPct: 2, loanToCostPct: 90, lenderFeesFlat: 1000, includeRepairsInLoan: true } as any,
      holdCosts: { monthsHeld: 6 } as any,
      saleCosts: { realtorPct: 6, closingCostPct: 2, miscFlat: 0 } as any,
      costs: { purchaseClosingFlat: 0, marketingFlat: 0 } as any,
    });

    expect(typeof cash.mao).toBe("number");
    expect(typeof hardMoney.mao).toBe("number");
    expect((hardMoney.mao as number)!).toBeLessThan((cash.mao as number)!);
  });

  test("rental outputs compute NOI/cap rate/DSCR", () => {
    const outputs = computeUnderwritingOutputs({
      strategy: "rental",
      arv: 0,
      repairs: 20000,
      offerTarget: 200000,
      financing: { loanType: "conventional", downPaymentPct: 20, interestPctAnnual: 7, termYears: 30, pointsPct: 0, lenderFeesFlat: 0 } as any,
      holdCosts: { monthsHeld: 0, taxesPerMonth: 250, insurancePerMonth: 120, utilitiesPerMonth: 0, hoaPerMonth: 0, miscPerMonth: 50 } as any,
      saleCosts: { realtorPct: 0, closingCostPct: 0, miscFlat: 0 } as any,
      costs: { purchaseClosingFlat: 5000, marketingFlat: 0 } as any,
      rental: { rentPerMonth: 2200, otherIncomePerMonth: 0, vacancyPct: 5, managementPct: 10, maintenancePct: 8, capexPct: 5 } as any,
    });

    expect(typeof outputs.noiAnnual).toBe("number");
    expect((outputs.noiAnnual as number)!).toBeGreaterThan(0);
    expect(typeof outputs.capRatePct).toBe("number");
    expect((outputs.capRatePct as number)!).toBeGreaterThan(0);
    expect(typeof outputs.dscr).toBe("number");
    expect((outputs.dscr as number)!).toBeGreaterThan(0);
  });
});

