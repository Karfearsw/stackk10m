import { describe, expect, test } from "vitest";
import { computeManualTimeEntry } from "../server/lib/time-entry-math";

describe("time entry math", () => {
  test("computes same-day duration", () => {
    const r = computeManualTimeEntry({ date: "2026-05-22", startTime: "09:00", endTime: "17:00" });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.hours).toBeCloseTo(8, 5);
    expect(r.status).toBe("draft");
  });

  test("computes overnight duration", () => {
    const r = computeManualTimeEntry({ date: "2026-05-22", startTime: "23:00", endTime: "01:00" });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.hours).toBeCloseTo(2, 5);
  });

  test("flags too-long durations as disputed", () => {
    const r = computeManualTimeEntry({ date: "2026-05-22", startTime: "00:00", endTime: "20:00" });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.status).toBe("disputed");
    expect(r.payableHours).toBe(0);
    expect(r.flags).toContain("duration_over_max");
  });

  test("flags too-short durations as disputed", () => {
    const r = computeManualTimeEntry({ date: "2026-05-22", startTime: "09:00", endTime: "09:02" });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.status).toBe("disputed");
    expect(r.payableHours).toBe(0);
    expect(r.flags).toContain("too_short");
  });
});

