/**
 * Campaign send gating — consent + DNC suppression.
 *
 * Single source of truth for "may this campaign step send to this recipient".
 * Used by the campaign scheduler (server/cron/campaign-scheduler.ts) and by the
 * audience-preview endpoint. Rules (server-side, never UI hints):
 *
 *  - doNotCall is a HARD suppress across every channel.
 *  - SMS requires positive opt-in (smsConsent === true) and no doNotText.
 *  - Email requires positive opt-in (emailConsent === true) and no doNotEmail.
 *  - A contact channel (phone/email) must be present.
 *
 * Every blocked send carries a machine-readable code + a human-readable reason
 * so campaign_deliveries rows explain exactly why a recipient was skipped.
 */

export type CampaignChannel = "sms" | "email";

export type ConsentLead = {
  ownerPhone?: string | null;
  ownerEmail?: string | null;
  smsConsent?: boolean | null;
  emailConsent?: boolean | null;
  doNotCall?: boolean | null;
  doNotText?: boolean | null;
  doNotEmail?: boolean | null;
};

export type ConsentDecision =
  | { allowed: true }
  | { allowed: false; code: string; reason: string };

export function evaluateCampaignRecipient(
  channel: CampaignChannel,
  lead: ConsentLead,
): ConsentDecision {
  // Hard suppress: Do Not Call blocks every outbound channel.
  if (lead.doNotCall) {
    return {
      allowed: false,
      code: "DNC_DO_NOT_CALL",
      reason: "Suppressed: recipient is marked Do Not Call",
    };
  }

  if (channel === "sms") {
    if (lead.doNotText) {
      return {
        allowed: false,
        code: "DNC_DO_NOT_TEXT",
        reason: "Suppressed: recipient opted out of texts",
      };
    }
    if (lead.smsConsent !== true) {
      return {
        allowed: false,
        code: "NO_SMS_CONSENT",
        reason: "Blocked: no SMS consent on file — campaigns only text opted-in recipients",
      };
    }
    if (!String(lead.ownerPhone || "").trim()) {
      return { allowed: false, code: "NO_PHONE", reason: "Blocked: missing phone number" };
    }
    return { allowed: true };
  }

  // email
  if (lead.doNotEmail) {
    return {
      allowed: false,
      code: "DNC_DO_NOT_EMAIL",
      reason: "Suppressed: recipient opted out of email",
    };
  }
  if (lead.emailConsent !== true) {
    return {
      allowed: false,
      code: "NO_EMAIL_CONSENT",
      reason: "Blocked: no email consent on file — campaigns only email opted-in recipients",
    };
  }
  if (!String(lead.ownerEmail || "").trim()) {
    return { allowed: false, code: "NO_EMAIL", reason: "Blocked: missing email address" };
  }
  return { allowed: true };
}
