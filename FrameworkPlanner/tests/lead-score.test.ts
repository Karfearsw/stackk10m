import { describe, it, expect } from "vitest";
import {
  buildScoreBreakdown,
  classifyProviderResult,
  evidenceMatchesFactor,
  normalizeEvidence,
  summarizeScoreRows,
} from "../client/src/lib/lead-score";

describe("skip trace provider result classification", () => {
  it("maps null result to a truthful not-run state", () => {
    const info = classifyProviderResult(null);
    expect(info.state).toBe("none");
    expect(info.label).toBe("Not run yet");
  });

  it("maps pending to in-progress", () => {
    const info = classifyProviderResult({ status: "pending", providerName: "mock", phonesJson: "[]", emailsJson: "[]" });
    expect(info.state).toBe("pending");
    expect(info.label).toBe("In progress");
  });

  it("maps success with phones+emails to hit", () => {
    const info = classifyProviderResult({
      status: "success",
      providerName: "mock",
      phonesJson: JSON.stringify(["+12025550123"]),
      emailsJson: JSON.stringify(["owner@example.com"]),
      costCents: 99,
      completedAt: "2026-08-23T00:00:00Z",
    });
    expect(info.state).toBe("hit");
    expect(info.detail).toContain("1 phone");
    expect(info.costCents).toBe(99);
  });

  it("maps success with only phones to partial hit", () => {
    const info = classifyProviderResult({ status: "success", providerName: "mock", phonesJson: "[\"+12025550123\"]", emailsJson: "[]" });
    expect(info.state).toBe("partial");
    expect(info.label).toBe("Partial hit");
  });

  it("maps success with no contacts to no hit (not a lie)", () => {
    const info = classifyProviderResult({ status: "success", providerName: "mock", phonesJson: "[]", emailsJson: "[]" });
    expect(info.state).toBe("no_hit");
    expect(info.label).toBe("No hit");
  });

  it("maps provider no-hit error message to no hit", () => {
    const info = classifyProviderResult({ status: "fail", providerName: "mock", errorMessage: "No hits found", phonesJson: "[]", emailsJson: "[]" });
    expect(info.state).toBe("no_hit");
  });

  it("maps rate/quota errors to rate limited", () => {
    const info = classifyProviderResult({ status: "fail", providerName: "mock", errorMessage: "Rate limit exceeded, try again later", phonesJson: "[]", emailsJson: "[]" });
    expect(info.state).toBe("rate_limited");
    expect(info.label).toBe("Rate limited");
  });

  it("maps other failures to failed", () => {
    const info = classifyProviderResult({ status: "fail", providerName: "mock", errorMessage: "Internal provider error", phonesJson: "[]", emailsJson: "[]" });
    expect(info.state).toBe("failed");
  });
});

describe("explainable score breakdown", () => {
  const factorsJson = [
    { key: "vacancy", label: "Vacancy", value: true, points: 10, urgencyPoints: 15 },
    { key: "tax_delinquent", label: "Tax delinquent", value: true, points: 15, urgencyPoints: 15 },
    { key: "has_phone", label: "Has phone", value: false, points: 0, urgencyPoints: 0 },
    { key: "has_email", label: "Has email", value: true, points: 5, urgencyPoints: 0 },
  ];

  it("renders scored, no_signal, and unavailable states explicitly", () => {
    const rows = buildScoreBreakdown({ factorsJson });
    const byKey = new Map(rows.map((r) => [r.key, r]));
    expect(byKey.get("vacancy")?.state).toBe("scored");
    expect((byKey.get("vacancy") as any).points).toBe(10);
    expect(byKey.get("tax_delinquent")?.state).toBe("scored");
    // explicitly negative data on file
    expect(byKey.get("has_phone")?.state).toBe("no_signal");
    // no data on file -> never positive evidence
    expect(byKey.get("probate")?.state).toBe("unavailable");
    expect(byKey.get("pre_foreclosure")?.state).toBe("unavailable");
    expect((byKey.get("probate") as any).valueText).toBe("no data on file");
  });

  it("attaches matching evidence to a factor and leaves others empty", () => {
    const evidence = [
      { sourceType: "county", notes: "Tax delinquency notice on file", sourceUrl: "https://county.example/tax" },
      { sourceType: "other", notes: "Public research placeholder" },
    ];
    const rows = buildScoreBreakdown({ factorsJson, evidence });
    const tax = rows.find((r) => r.key === "tax_delinquent")!;
    expect(tax.evidence.length).toBe(1);
    expect(tax.evidence[0].notes).toContain("Tax delinquency");
    const vacancy = rows.find((r) => r.key === "vacancy")!;
    expect(vacancy.evidence.length).toBe(0);
  });

  it("never counts absent data as positive evidence", () => {
    const rows = buildScoreBreakdown({ factorsJson: [] });
    expect(rows.every((r) => r.points === 0)).toBe(true);
    expect(rows.filter((r) => r.state === "unavailable").length).toBe(10);
    expect(summarizeScoreRows(rows)).toBe("");
  });

  it("normalizes evidence rows and tolerates garbage", () => {
    expect(normalizeEvidence(null as unknown as unknown[])).toEqual([]);
    expect(normalizeEvidence([{ sourceType: "  ", notes: "  " }])).toEqual([]);
    expect(evidenceMatchesFactor([], "vacancy")).toEqual([]);
  });
});
