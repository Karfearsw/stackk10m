/**
 * Signal → lead loop: scoring contract + promotion policy.
 *
 * Regression coverage for the "invisible leads" bug (Oct 2026): thousands of
 * municipal distress signals were ingested via POST /api/v1/signals/bulk but
 * never appeared on the Leads page, because
 *   1. the bulk endpoint never created parcel_watchlist rows, so
 *      promoteParcelToLead() always failed with "parcel not on watchlist", and
 *   2. promotion was gated on distress score >= 8 while single-signal parcels
 *      score 2-4, so it was never even attempted.
 *
 * Policy going forward: EVERY distressed parcel becomes a callable seller
 * lead on its first signal (idempotent, one lead per parcel ever); the score
 * drives priority (hot-lead alert at 8) and lead-list filtering — not whether
 * the parcel becomes a lead at all.
 */
import { describe, it, expect } from "vitest";
import { parcelDistressScore } from "../services/lead-promotion.js";
import { HIGH_SCORE_THRESHOLD, signalDedupeKey } from "../routes/automation.js";

describe("parcelDistressScore", () => {
  it("weights severities critical=4, alert=3, watch=2, info=1", () => {
    expect(parcelDistressScore([{ severity: "critical" }])).toBe(4);
    expect(parcelDistressScore([{ severity: "alert" }])).toBe(3);
    expect(parcelDistressScore([{ severity: "watch" }])).toBe(2);
    expect(parcelDistressScore([{ severity: "info" }])).toBe(1);
  });

  it("sums stacked signals on one parcel", () => {
    expect(
      parcelDistressScore([
        { severity: "watch" },
        { severity: "alert" },
        { severity: "watch" },
      ])
    ).toBe(7);
  });

  it("unknown severity falls back to weight 1", () => {
    expect(parcelDistressScore([{ severity: "bogus" }])).toBe(1);
  });

  it("empty signal list scores 0", () => {
    expect(parcelDistressScore([])).toBe(0);
  });
});

describe("promotion policy", () => {
  it("hot-lead alert threshold stays at 8 (urgency signal, not lead existence)", () => {
    expect(HIGH_SCORE_THRESHOLD).toBe(8);
  });

  it("a single watch/alert signal scores below the hot threshold — yet must still become a lead", () => {
    // This is the core regression assertion: under the old policy these
    // parcels never promoted (score < 8) and were invisible on the Leads page.
    expect(parcelDistressScore([{ severity: "watch" }])).toBeLessThan(HIGH_SCORE_THRESHOLD);
    expect(parcelDistressScore([{ severity: "alert" }])).toBeLessThan(HIGH_SCORE_THRESHOLD);
    expect(parcelDistressScore([{ severity: "critical" }])).toBeLessThan(HIGH_SCORE_THRESHOLD);
  });
});

describe("signalDedupeKey", () => {
  const row = {
    source: "Detroit BSEED/DAH",
    parcelKey: "14230 jefferson ave|detroit|mi|48215",
    signalType: "code_violation",
    severity: "critical",
    occurredAt: "2025-05-05",
    title: "287 blight ticket(s), $282,592 unpaid",
  };

  it("is deterministic for identical rows (re-imports dedupe)", () => {
    expect(signalDedupeKey(row)).toBe(signalDedupeKey({ ...row }));
  });

  it("differs when the content differs (genuinely new signals still import)", () => {
    expect(signalDedupeKey(row)).not.toBe(
      signalDedupeKey({ ...row, occurredAt: "2025-06-05" })
    );
    expect(signalDedupeKey(row)).not.toBe(
      signalDedupeKey({ ...row, title: "different violation" })
    );
  });

  it("prefers an explicit sourceRecordId when the importer provides one", () => {
    expect(signalDedupeKey({ ...row, sourceRecordId: "det-123" })).toBe("det-123");
  });

  it("normalizes case/whitespace so formatting drift doesn't duplicate", () => {
    expect(signalDedupeKey({ ...row, title: "  287 BLIGHT ticket(s), $282,592 unpaid " }))
      .toBe(signalDedupeKey(row));
  });

  it("hash keys are namespaced so they can't collide with explicit IDs", () => {
    expect(signalDedupeKey(row).startsWith("hash:")).toBe(true);
  });
});
