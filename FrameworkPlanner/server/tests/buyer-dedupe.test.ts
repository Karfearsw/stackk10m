/**
 * Buyer dedupe: normalization + key contract + test-buyer heuristics.
 *
 * Regression coverage for buyer-state dedupe (Oct 2026): the buyers table
 * had no enforced dedupe — imports and manual creates could insert the same
 * person repeatedly (email/phone variations), and test pollution sat
 * unflagged in the list.
 *
 * Policy going forward: every buyer create stamps the canonical dedupeKey
 * (same function the CSV import uses); key conflicts return the existing
 * row instead of inserting a duplicate.
 */
import { describe, it, expect } from "vitest";
import {
  normalizeBuyerEmail,
  normalizeBuyerPhone,
  buyerDedupeKey,
  testBuyerReasons,
} from "../services/buyer-dedupe.js";

describe("normalizeBuyerEmail", () => {
  it("trims and lowercases", () => {
    expect(normalizeBuyerEmail("  Jane@Example.COM ")).toBe("jane@example.com");
  });

  it("returns null for empty or invalid", () => {
    expect(normalizeBuyerEmail("")).toBeNull();
    expect(normalizeBuyerEmail(null)).toBeNull();
    expect(normalizeBuyerEmail("not-an-email")).toBeNull();
  });
});

describe("normalizeBuyerPhone", () => {
  it("normalizes US numbers to E.164", () => {
    expect(normalizeBuyerPhone("(401) 555-0100")).toBe("+14015550100");
    expect(normalizeBuyerPhone("4015550100")).toBe("+14015550100");
  });

  it("returns null for junk", () => {
    expect(normalizeBuyerPhone("")).toBeNull();
    expect(normalizeBuyerPhone("123")).toBeNull();
    expect(normalizeBuyerPhone(null)).toBeNull();
  });
});

describe("buyerDedupeKey", () => {
  it("is deterministic for identical input", () => {
    const a = { name: "Jane Doe", email: "JANE@EXAMPLE.COM", phone: "(401) 555-0100" };
    expect(buyerDedupeKey(a)).toBe(buyerDedupeKey({ ...a }));
  });

  it("treats email case and phone formatting as the same buyer", () => {
    const base = buyerDedupeKey({ name: "Jane Doe", email: "jane@example.com", phone: "4015550100" });
    expect(buyerDedupeKey({ name: "jane doe", email: "JANE@example.com", phone: "(401) 555-0100" })).toBe(base);
  });

  it("differs for different people", () => {
    const a = buyerDedupeKey({ name: "Jane Doe", email: "jane@example.com" });
    const b = buyerDedupeKey({ name: "John Doe", email: "john@example.com" });
    expect(a).not.toBe(b);
  });

  it("returns empty string when there is nothing to key on", () => {
    expect(buyerDedupeKey({})).toBe("");
  });
});

describe("testBuyerReasons", () => {
  it("flags obvious test names", () => {
    expect(testBuyerReasons({ name: "Testy McTesterson" })).toContain("test-like name");
    expect(testBuyerReasons({ name: "Jane Doe", email: "jane@gmail.com" })).toEqual([]);
  });

  it("flags example/test emails", () => {
    expect(testBuyerReasons({ name: "Jane", email: "test123@example.com" })).toContain("test-like email");
  });

  it("flags fictional 555-01xx phones", () => {
    expect(testBuyerReasons({ name: "Jane", phone: "(401) 555-0142" })).toContain("fictional 555-01xx phone");
  });

  it("does not flag real-looking buyers", () => {
    expect(
      testBuyerReasons({ name: "William Dubois", email: "william@realmail.com", phone: "(401) 555-2837" }),
    ).toEqual([]);
  });
});
