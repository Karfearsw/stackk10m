/**
 * Disposition Phase 1 — unit tests (no DB, no network).
 *
 * Covers the task's required areas:
 *   - kanban stage filtering
 *   - compliance gates: consent, doNotCall suppression, quiet hours
 *   - offer status transitions
 */
import { describe, it, expect } from "vitest";
import {
  DISPO_STAGES,
  DISPO_STAGE_LABELS,
  DISPO_ACTIVE_STAGES,
  isDispoStage,
  filterDealsByDispoStage,
  canTransitionOfferStatus,
  isOfferStatus,
  canTransitionOpportunityStage,
} from "../shared/dispo-stages";
import {
  OPPORTUNITY_STAGES,
  OPPORTUNITY_STAGE_LABELS,
} from "../shared/pipeline-stages";
import {
  buyerChannelEligibility,
  isWithinQuietHours,
  planBlastRecipients,
  personalizeBlastMessage,
  timeZoneForState,
} from "../server/disposition/compliance";

describe("dispo stages", () => {
  it("kanban shows exactly the six dispo stages in order", () => {
    expect([...DISPO_STAGES]).toEqual([
      "under_contract",
      "in_disposition",
      "reserved",
      "sold",
      "closed",
      "dead",
    ]);
  });

  it("isDispoStage rejects non-dispo opportunity stages", () => {
    expect(isDispoStage("in_disposition")).toBe(true);
    expect(isDispoStage("lead")).toBe(false);
    expect(isDispoStage("negotiating")).toBe(false);
    expect(isDispoStage("")).toBe(false);
    expect(isDispoStage(null)).toBe(false);
    expect(isDispoStage(undefined)).toBe(false);
  });

  it("filterDealsByDispoStage only returns deals in the requested column", () => {
    const deals = [
      { id: 1, stage: "under_contract" },
      { id: 2, stage: "in_disposition" },
      { id: 3, stage: "in_disposition" },
      { id: 4, stage: "lead" },
      { id: 5, stage: null },
      { id: 6, stage: "sold" },
    ];
    expect(filterDealsByDispoStage(deals, "in_disposition").map((d) => d.id)).toEqual([2, 3]);
    expect(filterDealsByDispoStage(deals, "under_contract").map((d) => d.id)).toEqual([1]);
    expect(filterDealsByDispoStage(deals, "dead")).toEqual([]);
  });

  it("active stages exclude terminal stages", () => {
    expect(DISPO_ACTIVE_STAGES).toContain("under_contract");
    expect(DISPO_ACTIVE_STAGES).toContain("in_disposition");
    expect(DISPO_ACTIVE_STAGES).toContain("reserved");
    expect(DISPO_ACTIVE_STAGES).not.toContain("sold");
    expect(DISPO_ACTIVE_STAGES).not.toContain("closed");
    expect(DISPO_ACTIVE_STAGES).not.toContain("dead");
  });
});

describe("canonical taxonomy alignment", () => {
  it("every dispo stage is a canonical opportunity stage with a matching label", () => {
    for (const s of DISPO_STAGES) {
      expect(OPPORTUNITY_STAGES as readonly string[]).toContain(s);
      expect(OPPORTUNITY_STAGE_LABELS[s]).toBe(DISPO_STAGE_LABELS[s]);
    }
  });

  it("canonical transition rules: dead/voided are terminal", () => {
    expect(canTransitionOpportunityStage("dead", "in_disposition")).toBe(false);
    expect(canTransitionOpportunityStage("voided", "reserved")).toBe(false);
    expect(canTransitionOpportunityStage("in_disposition", "reserved")).toBe(true);
    expect(canTransitionOpportunityStage("reserved", "sold")).toBe(true);
    expect(canTransitionOpportunityStage("sold", "closed")).toBe(true);
  });

  it("isDispoStage requires canonical membership", () => {
    expect(isDispoStage("in_disposition")).toBe(true);
    expect(isDispoStage("negotiating")).toBe(false); // canonical, not dispo
    expect(isDispoStage("bogus")).toBe(false); // not canonical at all
  });
});

describe("offer status transitions", () => {
  it("accepts the happy path verbal -> loi_sent -> accepted", () => {
    expect(canTransitionOfferStatus("verbal", "loi_sent")).toBe(true);
    expect(canTransitionOfferStatus("loi_sent", "accepted")).toBe(true);
  });

  it("allows dead from any non-terminal status", () => {
    expect(canTransitionOfferStatus("verbal", "dead")).toBe(true);
    expect(canTransitionOfferStatus("loi_sent", "dead")).toBe(true);
    expect(canTransitionOfferStatus("accepted", "dead")).toBe(true);
  });

  it("dead is terminal", () => {
    expect(canTransitionOfferStatus("dead", "verbal")).toBe(false);
    expect(canTransitionOfferStatus("dead", "loi_sent")).toBe(false);
    expect(canTransitionOfferStatus("dead", "accepted")).toBe(false);
    expect(canTransitionOfferStatus("dead", "dead")).toBe(true); // idempotent
  });

  it("rejects skips and backwards moves", () => {
    expect(canTransitionOfferStatus("verbal", "accepted")).toBe(false);
    expect(canTransitionOfferStatus("loi_sent", "verbal")).toBe(false);
    expect(canTransitionOfferStatus("accepted", "loi_sent")).toBe(false);
    expect(canTransitionOfferStatus("accepted", "verbal")).toBe(false);
  });

  it("rejects unknown statuses", () => {
    expect(canTransitionOfferStatus("verbal", "sent")).toBe(false);
    expect(canTransitionOfferStatus("draft", "verbal")).toBe(false);
    expect(canTransitionOfferStatus(null, "dead")).toBe(false);
    expect(isOfferStatus("verbal")).toBe(true);
    expect(isOfferStatus("bogus")).toBe(false);
  });
});

describe("blast compliance gates", () => {
  const consentingSmsBuyer = {
    id: 1,
    name: "Buyer One",
    phone: "+15551234567",
    smsConsent: true,
    emailConsent: false,
    doNotCall: false,
  };

  it("doNotCall hard-suppresses on every channel", () => {
    const dnc = { ...consentingSmsBuyer, doNotCall: true };
    expect(buyerChannelEligibility(dnc, "sms")).toEqual({
      eligible: false,
      reasons: ["do_not_call"],
    });
    expect(
      buyerChannelEligibility({ ...dnc, email: "b@x.com", emailConsent: true }, "email"),
    ).toEqual({ eligible: false, reasons: ["do_not_call"] });
  });

  it("requires channel consent", () => {
    const noConsent = { ...consentingSmsBuyer, smsConsent: false };
    const r = buyerChannelEligibility(noConsent, "sms");
    expect(r.eligible).toBe(false);
    expect(r.reasons).toContain("no_sms_consent");

    const emailNoConsent = {
      id: 2,
      email: "b@x.com",
      emailConsent: null,
      doNotCall: false,
    };
    const re = buyerChannelEligibility(emailNoConsent, "email");
    expect(re.eligible).toBe(false);
    expect(re.reasons).toContain("no_email_consent");
  });

  it("requires a reachable phone/email", () => {
    const noPhone = { id: 3, smsConsent: true, doNotCall: false, phone: "" };
    expect(buyerChannelEligibility(noPhone, "sms").reasons).toContain("no_phone");
    const noEmail = { id: 4, emailConsent: true, doNotCall: false };
    expect(buyerChannelEligibility(noEmail, "email").reasons).toContain("no_email");
  });

  it("passes a fully compliant buyer", () => {
    expect(buyerChannelEligibility(consentingSmsBuyer, "sms")).toEqual({
      eligible: true,
      reasons: [],
    });
  });

  it("quiet hours are 8am–9pm in the recipient timezone", () => {
    const tz = "America/New_York";
    // 2026-10-07: EDT (UTC-4)
    expect(isWithinQuietHours(new Date("2026-10-07T12:00:00Z"), tz)).toBe(true); // 8am EDT
    expect(isWithinQuietHours(new Date("2026-10-07T11:59:00Z"), tz)).toBe(false); // 7:59am EDT
    expect(isWithinQuietHours(new Date("2026-10-08T00:30:00Z"), tz)).toBe(true); // 8:30pm EDT
    expect(isWithinQuietHours(new Date("2026-10-08T01:00:00Z"), tz)).toBe(false); // 9pm EDT
    expect(isWithinQuietHours(new Date("2026-10-07T03:00:00Z"), tz)).toBe(false); // 11pm EDT
  });

  it("maps property states to timezones", () => {
    expect(timeZoneForState("FL")).toBe("America/New_York");
    expect(timeZoneForState("MI")).toBe("America/Detroit");
    expect(timeZoneForState("TX")).toBe("America/Chicago");
    expect(timeZoneForState("CA")).toBe("America/Los_Angeles");
    expect(timeZoneForState("??")).toBe("America/New_York");
    expect(timeZoneForState(null)).toBe("America/New_York");
  });

  it("planBlastRecipients suppresses with reasons and caps the send set", () => {
    const now = new Date("2026-10-07T16:00:00Z"); // noon EDT — inside window
    const plan = planBlastRecipients(
      [
        { buyer: consentingSmsBuyer, score: 90 },
        { buyer: { ...consentingSmsBuyer, id: 2, doNotCall: true }, score: 95 },
        { buyer: { ...consentingSmsBuyer, id: 3, smsConsent: false }, score: 80 },
        { buyer: { ...consentingSmsBuyer, id: 4 }, score: 10 },
      ],
      { channel: "sms", minScore: 50, now, timeZone: "America/New_York" },
    );
    expect(plan.eligible.map((e) => e.buyer.id)).toEqual([1]);
    expect(plan.suppressed.map((s) => s.buyer.id).sort()).toEqual([2, 3, 4]);
    const byId = new Map(plan.suppressed.map((s) => [s.buyer.id, s.reasons]));
    expect(byId.get(2)).toContain("do_not_call");
    expect(byId.get(3)).toContain("no_sms_consent");
    expect(byId.get(4)).toContain("below_score_threshold");
  });

  it("planBlastRecipients suppresses everyone outside quiet hours", () => {
    const now = new Date("2026-10-07T03:00:00Z"); // 11pm EDT — outside window
    const plan = planBlastRecipients(
      [{ buyer: consentingSmsBuyer, score: 90 }],
      { channel: "sms", minScore: 0, now, timeZone: "America/New_York" },
    );
    expect(plan.eligible).toEqual([]);
    expect(plan.suppressed[0].reasons).toContain("quiet_hours");
    expect(plan.withinQuietHours).toBe(false);
  });

  it("caps recipients at maxRecipients", () => {
    const now = new Date("2026-10-07T16:00:00Z");
    const candidates = Array.from({ length: 5 }, (_, i) => ({
      buyer: { ...consentingSmsBuyer, id: 10 + i },
      score: 90 - i,
    }));
    const plan = planBlastRecipients(candidates, {
      channel: "sms",
      minScore: 0,
      now,
      timeZone: "America/New_York",
      maxRecipients: 2,
    });
    expect(plan.eligible).toHaveLength(2);
    expect(plan.suppressed).toHaveLength(3);
    expect(plan.suppressed[0].reasons).toContain("over_recipient_cap");
    // Highest scores kept
    expect(plan.eligible.map((e) => e.buyer.id)).toEqual([10, 11]);
  });
});

describe("blast personalization", () => {
  it("replaces known tokens and leaves unknown ones visible", () => {
    expect(
      personalizeBlastMessage("Hi {firstName}, {address} at {price} {bogus}", {
        firstName: "Sam",
        address: "1 Main St",
        price: "$200,000",
      }),
    ).toBe("Hi Sam, 1 Main St at $200,000 {bogus}");
  });
});
