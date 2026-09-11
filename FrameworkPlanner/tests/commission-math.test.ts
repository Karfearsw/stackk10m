import { describe, expect, it } from "vitest";
import { computeCommissionMath } from "../shared/underwriting";

describe("computeCommissionMath", () => {
  it("computes a standard listing-side deal with cap rollover", () => {
    // $450k price, 3% listing side = $13,500 gross. 70/30 split → $4,050
    // company dollar, but the agent's $23k annual cap has only $3k remaining,
    // so $1,050 rolls back to the agent; $500 transaction fee comes off.
    const r = computeCommissionMath({
      dealType: "standard_sale",
      salePrice: 450000,
      assignmentFee: 0,
      listingCommissionPct: 3,
      buyerAgentPct: 3,
      side: "listing",
      referralOutPct: 0,
      agentSplitPct: 70,
      annualCap: 23000,
      companyDollarYtd: 20000,
      transactionFeeFlat: 500,
      taxReservePct: 25,
    });
    expect(r.grossCommission).toBeCloseTo(13500);
    expect(r.companyDollar).toBeCloseTo(3000);
    expect(r.capPortionToAgent).toBeCloseTo(1050);
    expect(r.agentNet).toBeCloseTo(10000); // 9450 agent gross + 1050 rollover − 500 fee
    expect(r.afterTax).toBeCloseTo(7500);
    expect(r.capHitThisDeal).toBe(true);
    expect(r.capReached).toBe(false);
  });

  it("computes a wholesale assignment fee with referral out and no cap", () => {
    const r = computeCommissionMath({
      dealType: "wholesale_assignment",
      salePrice: 0,
      assignmentFee: 15000,
      listingCommissionPct: 0,
      buyerAgentPct: 0,
      side: "listing",
      referralOutPct: 10,
      agentSplitPct: 70,
      annualCap: 0,
      companyDollarYtd: 0,
      transactionFeeFlat: 0,
      taxReservePct: 20,
    });
    expect(r.grossCommission).toBeCloseTo(15000);
    expect(r.referralFee).toBeCloseTo(1500);
    expect(r.afterReferral).toBeCloseTo(13500);
    expect(r.companyDollar).toBeCloseTo(4050);
    expect(r.agentNet).toBeCloseTo(9450);
    expect(r.afterTax).toBeCloseTo(7560);
    expect(r.capPortionToAgent).toBe(0);
  });

  it("treats the cap as already reached when company dollar YTD exceeds it", () => {
    const r = computeCommissionMath({
      dealType: "standard_sale",
      salePrice: 300000,
      assignmentFee: 0,
      listingCommissionPct: 3,
      buyerAgentPct: 0,
      side: "listing",
      referralOutPct: 0,
      agentSplitPct: 70,
      annualCap: 18000,
      companyDollarYtd: 18000,
      transactionFeeFlat: 0,
      taxReservePct: 0,
    });
    expect(r.capReached).toBe(true);
    expect(r.companyDollar).toBeCloseTo(0);
    expect(r.capPortionToAgent).toBeCloseTo(2700); // entire 30% company share rolls to the agent
    expect(r.agentNet).toBeCloseTo(9000); // 70% agent gross + full rollover
  });
});
