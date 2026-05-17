import { describe, it, expect } from "vitest";
import { computeLeadScore } from "../server/services/leadScoring/engine";

describe("lead scoring engine", () => {
  it("computes score, confidence, urgency, reasons, and factors deterministically", () => {
    const now = new Date("2026-01-01T12:00:00.000Z");
    const input = {
      motivationScore: 80,
      isAbsentee: true,
      yearsOwned: 12,
      distress: { probate: true },
      hasPhone: true,
      hasEmail: false,
      nextTouchAt: "2026-01-01T11:00:00.000Z",
    } as const;

    const r1 = computeLeadScore(input, { now });
    const r2 = computeLeadScore(input, { now });

    expect(r1).toEqual(r2);
    expect(r1.score).toBe(100);
    expect(r1.urgency).toBe(100);
    expect(r1.confidence).toBe(1);

    expect(r1.reasons).toEqual([
      { key: "motivation_score", label: "Motivation score", points: 36 },
      { key: "absentee_owner", label: "Absentee owner", points: 30 },
      { key: "years_owned", label: "Years owned", points: 25 },
      { key: "probate", label: "Probate", points: 15 },
      { key: "has_phone", label: "Has phone", points: 5 },
    ]);

    expect(r1.factorsJson.map((f) => f.key)).toEqual([
      "motivation_score",
      "absentee_owner",
      "years_owned",
      "probate",
      "has_phone",
      "has_email",
      "next_touch_at",
    ]);
  });

  it("computes partial confidence when only some signals are present", () => {
    const now = new Date("2026-01-01T12:00:00.000Z");
    const r = computeLeadScore({ motivationScore: 60 }, { now });
    expect(r.score).toBe(27);
    expect(r.urgency).toBe(25);
    expect(r.confidence).toBe(0.48);
    expect(r.reasons).toEqual([{ key: "motivation_score", label: "Motivation score", points: 27 }]);
  });

  it("derives distress signals from tags and includes them in score and confidence", () => {
    const now = new Date("2026-01-01T12:00:00.000Z");
    const r = computeLeadScore({ tags: ["Probate", "Vacant"] }, { now });
    expect(r.score).toBe(25);
    expect(r.confidence).toBe(0.32);
    expect(r.reasons).toEqual([
      { key: "probate", label: "Probate", points: 15 },
      { key: "vacancy", label: "Vacancy", points: 10 },
    ]);
  });
});

