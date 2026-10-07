import { describe, it, expect } from "vitest";
import { validateManualCompInput } from "../server/services/comps/manual";
import { getCompProvider } from "../server/services/comps/provider";

describe("manual comp validation (no fabricated comps)", () => {
  it("accepts a valid manual comp with sold price + source", () => {
    const r = validateManualCompInput({
      address: "123 Main St",
      city: "Orlando",
      state: "fl",
      zip: "32801",
      soldPrice: 250000,
      soldDate: "2026-08-15",
      sqft: 1400,
      beds: 3,
      baths: 2,
      source: "MLS",
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.address).toBe("123 Main St");
      expect(r.value.state).toBe("FL");
      expect(r.value.soldPrice).toBe(250000);
      expect(r.value.source).toBe("MLS");
      expect(r.value.isRentalComp).toBe(false);
    }
  });

  it("accepts a rental comp with monthly rent instead of sold price", () => {
    const r = validateManualCompInput({
      address: "456 Oak Ave",
      rentPerMonth: 1800,
      isRentalComp: true,
      source: "Zillow",
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.rentPerMonth).toBe(1800);
      expect(r.value.soldPrice).toBeNull();
      expect(r.value.isRentalComp).toBe(true);
    }
  });

  it("rejects a comp with no address", () => {
    const r = validateManualCompInput({ soldPrice: 250000, source: "MLS" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.join(" ")).toMatch(/address/i);
  });

  it("rejects a comp with no source", () => {
    const r = validateManualCompInput({ address: "123 Main St", soldPrice: 250000 });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.join(" ")).toMatch(/source/i);
  });

  it("rejects a comp with no price signal at all", () => {
    const r = validateManualCompInput({ address: "123 Main St", source: "MLS" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.join(" ")).toMatch(/price/i);
  });

  it("rejects non-positive prices", () => {
    const r = validateManualCompInput({ address: "123 Main St", soldPrice: -5, source: "MLS" });
    expect(r.ok).toBe(false);
  });

  it("rejects an invalid sold date", () => {
    const r = validateManualCompInput({
      address: "123 Main St",
      soldPrice: 250000,
      soldDate: "not-a-date",
      source: "MLS",
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.join(" ")).toMatch(/date/i);
  });
});

describe("comps provider honesty (never fabricate)", () => {
  it("getCompProvider() throws instead of returning fake comps", () => {
    expect(() => getCompProvider()).toThrow(/no external comps provider/i);
  });
});
