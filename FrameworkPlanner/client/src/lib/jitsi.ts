/**
 * Free team video meetings via Jitsi Meet (meet.jit.si).
 * No account, no API key, no backend provisioning — the room name IS the meeting.
 */

export const JITSI_DOMAIN = "meet.jit.si";
export const JITSI_SCRIPT_URL = `https://${JITSI_DOMAIN}/external_api.js`;

/** Generate a unique, URL-safe Jitsi room name for a team meeting. */
export function newTeamMeetingRoom(prefix = "OceanLuxeTeam"): { roomName: string; joinUrl: string } {
  const rand = Math.random().toString(36).slice(2, 8);
  const roomName = `${prefix}${Date.now().toString(36)}${rand}`;
  return { roomName, joinUrl: `https://${JITSI_DOMAIN}/${roomName}` };
}
