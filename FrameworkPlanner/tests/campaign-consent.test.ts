import { describe, it, expect } from "vitest";
import { evaluateCampaignRecipient } from "../server/services/campaigns/consent";

describe("campaign consent + DNC suppression", () => {
  const optedInSms = {
    ownerPhone: "+15555550100",
    smsConsent: true,
    doNotCall: false,
    doNotText: false,
  };
  const optedInEmail = {
    ownerEmail: "owner@example.com",
    emailConsent: true,
    doNotCall: false,
    doNotEmail: false,
  };

  it("allows SMS to an opted-in recipient with no DNC flags", () => {
    expect(evaluateCampaignRecipient("sms", optedInSms)).toEqual({ allowed: true });
  });

  it("allows email to an opted-in recipient with no DNC flags", () => {
    expect(evaluateCampaignRecipient("email", optedInEmail)).toEqual({ allowed: true });
  });

  it("hard-suppresses SMS when doNotCall is set (even with SMS consent)", () => {
    const d = evaluateCampaignRecipient("sms", { ...optedInSms, doNotCall: true });
    expect(d.allowed).toBe(false);
    if (!d.allowed) expect(d.code).toBe("DNC_DO_NOT_CALL");
  });

  it("hard-suppresses email when doNotCall is set (even with email consent)", () => {
    const d = evaluateCampaignRecipient("email", { ...optedInEmail, doNotCall: true });
    expect(d.allowed).toBe(false);
    if (!d.allowed) expect(d.code).toBe("DNC_DO_NOT_CALL");
  });

  it("suppresses SMS when doNotText is set", () => {
    const d = evaluateCampaignRecipient("sms", { ...optedInSms, doNotText: true });
    expect(d.allowed).toBe(false);
    if (!d.allowed) expect(d.code).toBe("DNC_DO_NOT_TEXT");
  });

  it("suppresses email when doNotEmail is set", () => {
    const d = evaluateCampaignRecipient("email", { ...optedInEmail, doNotEmail: true });
    expect(d.allowed).toBe(false);
    if (!d.allowed) expect(d.code).toBe("DNC_DO_NOT_EMAIL");
  });

  it("blocks SMS without positive opt-in (null consent = not opted in)", () => {
    const d = evaluateCampaignRecipient("sms", {
      ownerPhone: "+15555550100",
      smsConsent: null,
      doNotCall: false,
      doNotText: false,
    });
    expect(d.allowed).toBe(false);
    if (!d.allowed) expect(d.code).toBe("NO_SMS_CONSENT");
  });

  it("blocks email without positive opt-in", () => {
    const d = evaluateCampaignRecipient("email", {
      ownerEmail: "owner@example.com",
      emailConsent: false,
      doNotCall: false,
      doNotEmail: false,
    });
    expect(d.allowed).toBe(false);
    if (!d.allowed) expect(d.code).toBe("NO_EMAIL_CONSENT");
  });

  it("blocks SMS with consent but no phone number", () => {
    const d = evaluateCampaignRecipient("sms", { ...optedInSms, ownerPhone: "" });
    expect(d.allowed).toBe(false);
    if (!d.allowed) expect(d.code).toBe("NO_PHONE");
  });

  it("blocked decisions always carry a human-readable reason", () => {
    const cases = [
      evaluateCampaignRecipient("sms", { ...optedInSms, doNotCall: true }),
      evaluateCampaignRecipient("sms", { ownerPhone: "+1", smsConsent: null }),
      evaluateCampaignRecipient("email", { ownerEmail: "a@b.c", emailConsent: null }),
    ];
    for (const d of cases) {
      expect(d.allowed).toBe(false);
      if (!d.allowed) {
        expect(typeof d.code).toBe("string");
        expect(d.code.length).toBeGreaterThan(0);
        expect(typeof d.reason).toBe("string");
        expect(d.reason.length).toBeGreaterThan(0);
      }
    }
  });
});
