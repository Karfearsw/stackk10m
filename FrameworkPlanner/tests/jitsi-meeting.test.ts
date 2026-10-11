/**
 * Unit tests for the free Jitsi meeting helpers (client/src/lib/jitsi.ts).
 * Pure logic — no browser APIs, no React.
 */
import { describe, it, expect } from "vitest";
import { newTeamMeetingRoom, JITSI_DOMAIN, JITSI_SCRIPT_URL } from "../client/src/lib/jitsi";

describe("newTeamMeetingRoom", () => {
  it("returns a roomName and a joinUrl on the Jitsi domain", () => {
    const { roomName, joinUrl } = newTeamMeetingRoom();
    expect(roomName).toMatch(/^OceanLuxeTeam[0-9a-z]+$/);
    expect(joinUrl).toBe(`https://${JITSI_DOMAIN}/${roomName}`);
  });

  it("generates unique room names (no meeting collisions)", () => {
    const a = newTeamMeetingRoom().roomName;
    const b = newTeamMeetingRoom().roomName;
    expect(a).not.toBe(b);
  });

  it("honors a custom prefix", () => {
    const { roomName } = newTeamMeetingRoom("DealRoom");
    expect(roomName.startsWith("DealRoom")).toBe(true);
  });

  it("room names are URL-safe (usable directly in the join link)", () => {
    const { roomName, joinUrl } = newTeamMeetingRoom();
    expect(encodeURIComponent(roomName)).toBe(roomName);
    expect(() => new URL(joinUrl)).not.toThrow();
  });
});

describe("jitsi constants", () => {
  it("points at the free meet.jit.si service", () => {
    expect(JITSI_DOMAIN).toBe("meet.jit.si");
    expect(JITSI_SCRIPT_URL).toBe("https://meet.jit.si/external_api.js");
  });
});
