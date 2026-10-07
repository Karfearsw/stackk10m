import { describe, it, expect } from "vitest";
import {
  normalizePhone,
  validateAgentPhoneSettings,
  settingsFromRow,
  resolveCallerId,
  isCallMode,
  DEFAULT_AGENT_PHONE_SETTINGS,
} from "../server/dialer/user-settings";

describe("normalizePhone", () => {
  it("accepts E.164 directly", () => {
    expect(normalizePhone("+15551234567")).toBe("+15551234567");
  });

  it("formats US 10- and 11-digit numbers", () => {
    expect(normalizePhone("(555) 123-4567")).toBe("+15551234567");
    expect(normalizePhone("1-555-123-4567")).toBe("+15551234567");
    expect(normalizePhone("5551234567")).toBe("+15551234567");
  });

  it("returns null for empty or unusable input", () => {
    expect(normalizePhone("")).toBeNull();
    expect(normalizePhone(null)).toBeNull();
    expect(normalizePhone("123")).toBeNull();
  });
});

describe("validateAgentPhoneSettings", () => {
  it("normalizes a phone and defaults the rest", () => {
    const { values, errors } = validateAgentPhoneSettings({ phoneE164: "5551234567" });
    expect(errors).toEqual([]);
    expect(values.phoneE164).toBe("+15551234567");
    expect(values.callerIdE164).toBeNull();
    expect(values.defaultCallMode).toBe("human_first");
    expect(values.recordingEnabled).toBe(true);
  });

  it("treats a blank caller ID as the platform default", () => {
    const { values, errors } = validateAgentPhoneSettings({
      phoneE164: "+15551234567",
      callerIdE164: "",
    });
    expect(errors).toEqual([]);
    expect(values.callerIdE164).toBeNull();
  });

  it("rejects invalid numbers and modes", () => {
    expect(validateAgentPhoneSettings({ phoneE164: "nope" }).errors.length).toBeGreaterThan(0);
    expect(
      validateAgentPhoneSettings({ phoneE164: "+15551234567", callerIdE164: "not-a-number" }).errors.length,
    ).toBeGreaterThan(0);
    expect(
      validateAgentPhoneSettings({ phoneE164: "+15551234567", defaultCallMode: "telepathy" }).errors.length,
    ).toBeGreaterThan(0);
  });

  it("merges onto current settings so partial saves keep prior values", () => {
    const current = { phoneE164: "+15551234567", callerIdE164: "+15559998888", defaultCallMode: "ai_screen" as const, recordingEnabled: false };
    const { values, errors } = validateAgentPhoneSettings({ recordingEnabled: true }, current);
    expect(errors).toEqual([]);
    expect(values.phoneE164).toBe("+15551234567");
    expect(values.callerIdE164).toBe("+15559998888");
    expect(values.defaultCallMode).toBe("ai_screen");
    expect(values.recordingEnabled).toBe(true);
  });

  it("requires a phone number by default", () => {
    const { errors } = validateAgentPhoneSettings({}, DEFAULT_AGENT_PHONE_SETTINGS);
    expect(errors.some((e) => e.includes("phoneE164"))).toBe(true);
  });
});

describe("settingsFromRow", () => {
  it("returns defaults for a missing row", () => {
    expect(settingsFromRow(undefined)).toEqual(DEFAULT_AGENT_PHONE_SETTINGS);
  });

  it("maps stored columns and coerces unknown modes", () => {
    expect(
      settingsFromRow({ phoneE164: "+15551234567", callerIdE164: "+15559998888", defaultCallMode: "bogus", recordingEnabled: false }),
    ).toEqual({ phoneE164: "+15551234567", callerIdE164: "+15559998888", defaultCallMode: "human_first", recordingEnabled: false });
  });
});

describe("resolveCallerId + isCallMode", () => {
  it("prefers the user's caller ID and falls back to the platform default", () => {
    expect(resolveCallerId({ callerIdE164: "+15559998888" }, "+15550000000")).toBe("+15559998888");
    expect(resolveCallerId({ callerIdE164: null }, "+15550000000")).toBe("+15550000000");
    expect(resolveCallerId(undefined, "+15550000000")).toBe("+15550000000");
  });

  it("recognizes the supported call modes", () => {
    expect(isCallMode("ai_screen_handoff")).toBe(true);
    expect(isCallMode("carrier_pigeon")).toBe(false);
  });
});
