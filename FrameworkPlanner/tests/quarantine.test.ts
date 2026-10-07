import { describe, expect, it } from "vitest";
import {
  DEFAULT_TEST_PATTERNS,
  canRestoreQuarantine,
  isQuarantineCandidate,
  normalizeForMatch,
  scanRecordForTestPatterns,
} from "../server/crm/quarantine";

describe("quarantine pattern list", () => {
  it("represents every pattern called out in the ticket", () => {
    const matches = DEFAULT_TEST_PATTERNS.map((p) => p.match.toLowerCase());
    for (const expected of [
      "123 test st",
      "999 test way",
      "e2e uiaudit",
      "workflow test",
      "mike asset",
      "agent ava",
      "joe homebuyer",
    ]) {
      expect(matches).toContain(expected);
    }
  });
});

describe("scanRecordForTestPatterns", () => {
  it("flags known test addresses", () => {
    const m = scanRecordForTestPatterns({ address: "123 Test St", city: "Tampa" });
    expect(m).toHaveLength(1);
    expect(m[0].patternId).toBe("addr-123-test-st");
    expect(m[0].field).toBe("address");
    expect(m[0].reason).toMatch(/test address/i);

    expect(scanRecordForTestPatterns({ address: "999 Test Way" })[0].patternId).toBe("addr-999-test-way");
  });

  it("is case-insensitive and whitespace-normalized", () => {
    expect(scanRecordForTestPatterns({ address: "  123   TEST   st  " })).toHaveLength(1);
    expect(scanRecordForTestPatterns({ name: "e2e   uiaudit" })[0].patternId).toBe("name-e2e-uiaudit");
  });

  it("flags seeded test names", () => {
    for (const entry of [
      { name: "Workflow Test", id: "name-workflow-test" },
      { ownerName: "Mike Asset", id: "name-mike-asset" },
      { firstName: "Agent Ava", id: "name-agent-ava" },
      { name: "Joe Homebuyer", id: "name-joe-homebuyer" },
    ]) {
      const record: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(entry)) if (k !== "id") record[k] = v;
      expect(scanRecordForTestPatterns(record)[0].patternId).toBe(entry.id);
    }
  });

  it("does not flag ordinary records", () => {
    const real = { address: "671 Metacom Ave", city: "Bristol", ownerName: "Jared Smith", notes: "warm lead" };
    expect(scanRecordForTestPatterns(real)).toHaveLength(0);
    expect(isQuarantineCandidate(real)).toBe(false);
  });

  it("respects field restrictions (address patterns do not match notes)", () => {
    expect(scanRecordForTestPatterns({ notes: "called about 123 Test St" })).toHaveLength(0);
    expect(isQuarantineCandidate({ address: "123 Test St" })).toBe(true);
  });
});

describe("normalizeForMatch", () => {
  it("lowercases, collapses whitespace, and trims", () => {
    expect(normalizeForMatch("  Foo   Bar \n")).toBe("foo bar");
    expect(normalizeForMatch(null)).toBe("");
  });
});

describe("canRestoreQuarantine", () => {
  it("allows owner/admin and super admins only", () => {
    expect(canRestoreQuarantine({ role: "owner" })).toBe(true);
    expect(canRestoreQuarantine({ role: "admin" })).toBe(true);
    expect(canRestoreQuarantine({ role: "agent", isSuperAdmin: true })).toBe(true);
    expect(canRestoreQuarantine({ role: "agent" })).toBe(false);
    expect(canRestoreQuarantine(null)).toBe(false);
  });
});
