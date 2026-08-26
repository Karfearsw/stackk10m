import { telnyx } from "./telnyx-client.js";

// ── Types ──────────────────────────────────────────────────────────────────

export type CreateRoomInput = {
  name: string;
  maxParticipants?: number;
};

export type CreateRoomResult = {
  roomId: string;
  roomSid: string;
  name: string;
  maxParticipants: number;
};

export type JoinTokenResult = {
  token: string;
  roomId: string;
  identity: string;
  refreshToken?: string;
  tokenExpiresAt?: string;
};

export type VideoHealthResult = {
  configured: boolean;
  reachable: boolean;
  roomsApiAvailable: boolean;
  blocker?: string;
};

// ── Video Service (Telnyx Rooms API V2) ───────────────────────────────────
//
// Current Telnyx Video product uses the REST V2 Rooms API:
//   POST /v2/rooms                                    create a room
//   POST /v2/rooms/{room_id}/actions/generate_join_client_token
//                                                     mint a short-lived join JWT
//   GET  /v2/rooms/{room_id}                          get a room
//   DELETE /v2/rooms/{room_id}                        end/delete a room
//   GET  /v2/rooms                                    list rooms (health probe)
// See https://developers.telnyx.com/docs/video/get-started

class TelnyxVideoService {
  private readonly videoBaseUrl = "https://api.telnyx.com/v2";

  private headers(): Record<string, string> {
    const apiKey = process.env.TELNYX_API_KEY || "";
    return {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    };
  }

  private requireConfigured(): void {
    if (!process.env.TELNYX_API_KEY) {
      throw new Error("TELNYX_API_KEY is required for Video rooms");
    }
    const enabled =
      (process.env.TELNYX_VIDEO_ENABLED || "").trim().toLowerCase();
    if (
      enabled !== "true" &&
      enabled !== "1" &&
      enabled !== "yes" &&
      enabled !== "on"
    ) {
      throw new Error(
        "Telnyx Video is not enabled. Set TELNYX_VIDEO_ENABLED=true in your environment.",
      );
    }
  }

  private errorMessage(data: any, fallback: string): string {
    return (
      data?.errors?.[0]?.title ||
      data?.errors?.[0]?.detail ||
      data?.error ||
      data?.message ||
      fallback
    );
  }

  async createRoom(input: CreateRoomInput): Promise<CreateRoomResult> {
    this.requireConfigured();

    const body: Record<string, unknown> = {
      unique_name: input.name,
    };
    if (input.maxParticipants) {
      body.max_participants = input.maxParticipants;
    } else {
      body.max_participants = 10;
    }
    body.enable_recording = false;

    const res = await fetch(`${this.videoBaseUrl}/rooms`, {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15000),
    });

    const data: any = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(this.errorMessage(data, `Telnyx video room creation failed (${res.status})`));
    }

    const room = data?.data || data;
    return {
      roomId: String(room?.id || ""),
      roomSid: String(room?.id || room?.room_sid || ""),
      name: String(room?.unique_name || input.name),
      maxParticipants: Number(room?.max_participants || input.maxParticipants || 10),
    };
  }

  async getJoinToken(
    roomId: string,
    identity: string,
  ): Promise<JoinTokenResult> {
    this.requireConfigured();

    const body = {
      token_ttl_secs: 600,
      refresh_token_ttl_secs: 3600,
    };

    const res = await fetch(
      `${this.videoBaseUrl}/rooms/${encodeURIComponent(roomId)}/actions/generate_join_client_token`,
      {
        method: "POST",
        headers: this.headers(),
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(15000),
      },
    );

    const data: any = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(this.errorMessage(data, `Telnyx join token creation failed (${res.status})`));
    }

    return {
      token: String(data?.data?.token || data?.token || ""),
      roomId,
      identity,
      refreshToken: data?.data?.refresh_token || data?.refresh_token || undefined,
      tokenExpiresAt: data?.data?.token_expires_at || data?.token_expires_at || undefined,
    };
  }

  async endRoom(roomId: string): Promise<void> {
    this.requireConfigured();

    const res = await fetch(
      `${this.videoBaseUrl}/rooms/${encodeURIComponent(roomId)}`,
      {
        method: "DELETE",
        headers: this.headers(),
        signal: AbortSignal.timeout(10000),
      },
    );

    if (!res.ok) {
      const data: any = await res.json().catch(() => ({}));
      throw new Error(this.errorMessage(data, `Telnyx room end failed (${res.status})`));
    }
  }

  async getRoom(roomId: string): Promise<any | null> {
    this.requireConfigured();

    const res = await fetch(
      `${this.videoBaseUrl}/rooms/${encodeURIComponent(roomId)}`,
      {
        method: "GET",
        headers: this.headers(),
        signal: AbortSignal.timeout(10000),
      },
    );

    if (!res.ok) return null;
    const data: any = await res.json().catch(() => ({}));
    return data?.data || data || null;
  }

  async healthCheck(): Promise<VideoHealthResult> {
    const apiKey = process.env.TELNYX_API_KEY || "";
    const enabled =
      (process.env.TELNYX_VIDEO_ENABLED || "").trim().toLowerCase();
    const isEnabled = enabled === "true" || enabled === "1" || enabled === "yes" || enabled === "on";

    if (!apiKey) {
      return {
        configured: false,
        reachable: false,
        roomsApiAvailable: false,
        blocker: "TELNYX_API_KEY is required for Video rooms.",
      };
    }

    if (!isEnabled) {
      return {
        configured: false,
        reachable: false,
        roomsApiAvailable: false,
        blocker:
          "Telnyx Video is not enabled. Confirm Video API access in the Telnyx portal, then set TELNYX_VIDEO_ENABLED=true.",
      };
    }

    // Probe the Rooms API (V2) to verify reachability
    try {
      const res = await fetch(`${this.videoBaseUrl}/rooms`, {
        method: "GET",
        headers: this.headers(),
        signal: AbortSignal.timeout(10000),
      });

      if (res.status === 401 || res.status === 403) {
        return {
          configured: true,
          reachable: false,
          roomsApiAvailable: false,
          blocker: "Telnyx API key lacks Video API permissions.",
        };
      }

      if (res.ok) {
        return {
          configured: true,
          reachable: true,
          roomsApiAvailable: true,
        };
      }

      return {
        configured: true,
        reachable: false,
        roomsApiAvailable: false,
        blocker: `Telnyx Video API returned ${res.status}.`,
      };
    } catch (err: any) {
      const msg = err?.message || String(err);
      return {
        configured: true,
        reachable: false,
        roomsApiAvailable: false,
        blocker: `Telnyx Video API unreachable: ${msg}`,
      };
    }
  }
}

export const telnyxVideo = new TelnyxVideoService();
