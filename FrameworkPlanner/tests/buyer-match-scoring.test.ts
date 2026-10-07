import { describe, it, expect } from "vitest";
import { computeBuyerMatchScore, scoreBuyerMatch } from "../server/services/buyerMatch/scoring";

describe("buyer match engine (extended: strategies + spread)", () => {
  const baseDeal = {
    dealZipCode: "32801",
    dealCity: "Orlando",
    dealState: "FL",
    dealPrice: 200000,
    dealBeds: 3,
    dealPropertyType: "sfr",
  };
  const baseBuyer = {
    buyerZipCodes: ["32801"],
    buyerMinPrice: 150000,
    buyerMaxPrice: 250000,
    buyerMinBeds: 3,
    buyerPropertyTypes: ["sfr"],
  };

  it("scores a strong match with human-readable reasons", () => {
    const r = scoreBuyerMatch({ ...baseDeal, ...baseBuyer });
    expect(r.score).toBeGreaterThan(70);
    expect(r.reasons.length).toBeGreaterThan(0);
    for (const reason of r.reasons) {
      expect(typeof reason).toBe("string");
      expect(reason.trim().length).toBeGreaterThan(0);
    }
    expect(r.reasons.join(" ")).toMatch(/32801/);
  });

  it("adds a strategy bonus + reason on strategy overlap", () => {
    const leanBuyer = { buyerZipCodes: ["32801"], buyerMinPrice: 150000, buyerMaxPrice: 250000 };
    const without = scoreBuyerMatch({ ...baseDeal, ...leanBuyer });
    const withStrategies = scoreBuyerMatch({
      ...baseDeal,
      ...leanBuyer,
      dealStrategies: ["fix-and-flip"],
      buyerStrategies: ["fix-and-flip", "brrrr"],
    });
    expect(withStrategies.score).toBeGreaterThan(without.score);
    expect(withStrategies.reasons.some((x) => x.toLowerCase().includes("strategy"))).toBe(true);
  });

  it("adds no strategy bonus when strategies do not overlap", () => {
    const withStrategies = scoreBuyerMatch({
      ...baseDeal,
      ...baseBuyer,
      dealStrategies: ["buy-and-hold"],
      buyerStrategies: ["fix-and-flip"],
    });
    const without = scoreBuyerMatch({ ...baseDeal, ...baseBuyer });
    expect(withStrategies.score).toBe(without.score);
    expect(withStrategies.reasons.some((x) => x.toLowerCase().includes("strategy"))).toBe(false);
  });

  it("adds a spread bonus + reason when the deal meets the buyer's minimum spread", () => {
    const leanBuyer = { buyerZipCodes: ["32801"], buyerMinPrice: 150000, buyerMaxPrice: 250000 };
    const r = scoreBuyerMatch({
      ...baseDeal,
      ...leanBuyer,
      dealSpread: 60000,
      buyerMinSpread: 40000,
    });
    expect(r.reasons.some((x) => x.includes("minimum spread"))).toBe(true);
    const noSpread = scoreBuyerMatch({ ...baseDeal, ...leanBuyer });
    expect(r.score).toBeGreaterThan(noSpread.score);
  });

  it("does not hard-fail when spread is below the minimum (no bonus, agent reviews)", () => {
    const r = scoreBuyerMatch({
      ...baseDeal,
      ...baseBuyer,
      dealSpread: 10000,
      buyerMinSpread: 40000,
    });
    expect(r.score).toBeGreaterThan(0);
    expect(r.reasons.some((x) => x.includes("minimum spread"))).toBe(false);
  });

  it("hard-fails with a reason when the zip is outside the buyer's list", () => {
    const r = scoreBuyerMatch({ ...baseDeal, ...baseBuyer, buyerZipCodes: ["33101"] });
    expect(r.score).toBe(0);
    expect(r.reasons.length).toBeGreaterThan(0);
  });

  it("hard-fails with a reason when the price is above the buyer's maximum", () => {
    const r = scoreBuyerMatch({ ...baseDeal, ...baseBuyer, dealPrice: 999000 });
    expect(r.score).toBe(0);
    expect(r.reasons[0]).toMatch(/maximum/);
  });

  it("keeps backward compatibility: old inputs produce the same numeric score", () => {
    const oldStyle = {
      dealZipCode: "32801",
      dealCity: "Orlando",
      dealState: "FL",
      dealPrice: 200000,
      dealBeds: 3,
      dealPropertyType: "sfr",
      buyerZipCodes: ["32801"],
      buyerMinPrice: 150000,
      buyerMaxPrice: 250000,
      buyerMinBeds: 3,
      buyerPropertyTypes: ["sfr"],
      buyerTags: ["cash"],
      dealTags: ["cash", "distressed"],
    };
    // zip 35 + price 30 + beds 20 + type 15 + tags 10 = 110 -> clamped 100
    expect(computeBuyerMatchScore(oldStyle)).toBe(100);
    expect(scoreBuyerMatch(oldStyle).score).toBe(100);
    // spread/strategy inputs absent -> no bonus change
    expect(scoreBuyerMatch({ ...oldStyle, dealSpread: null, buyerMinSpread: null }).score).toBe(100);
  });

  it("never returns a negative or >100 score", () => {
    const r = scoreBuyerMatch({
      dealZipCode: "32801",
      dealPrice: 200000,
      dealBeds: 1,
      buyerZipCodes: ["32801"],
      buyerMinBeds: 5,
      buyerMaxBeds: 5,
      buyerPropertyTypes: ["condo"],
      dealPropertyType: "sfr",
    });
    expect(r.score).toBeGreaterThanOrEqual(0);
    expect(r.score).toBeLessThanOrEqual(100);
  });
});
