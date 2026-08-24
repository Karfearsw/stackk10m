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
};

export type VideoHealthResult = {
  configured: boolean;
  reachable: boolean;
  roomsApiAvailable: boolean;
  blocker?: string;
};

// ── Video Service ──────────────────────────────────────────────────────────

class TelnyxVideoService {
  private readonly videoBaseUrl = "https://api.telnyx.com/v1/video";

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

  async createRoom(input: CreateRoomInput): Promise<CreateRoomResult> {
    this.requireConfigured();

    const body: Record<string, unknown> = {
      name: input.name,
      type: "group",
    };
    if (input.maxParticipants) {
      body.max_participants = input.maxParticipants;
    }

    const res = await fetch(`${this.videoBaseUrl}/rooms`, {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15000),
    });

    const data: any = await res.json().catch(() => ({}));
    if (!res.ok) {
      const msg =
        data?.errors?.[0]?.title ||
        data?.error ||
        data?.message ||
        `Telnyx video room creation failed (${res.status})`;
      throw new Error(msg);
    }

    const room = data?.data || data;
    return {
      roomId: String(room?.id || ""),
      roomSid: String(room?.room_sid || room?.sid || ""),
      name: String(room?.name || input.name),
      maxParticipants: Number(room?.max_participants || input.maxParticipants || 2),
    };
  }

  async getJoinToken(
    roomId: string,
    identity: string,
  ): Promise<JoinTokenResult> {
    this.requireConfigured();

    const body = {
      room_id: roomId,
      identity,
    };

    const res = await fetch(`${this.videoBaseUrl}/rooms/${encodeURIComponent(roomId)}/tokens`, {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15000),
    });

    const data: any = await res.json().catch(() => ({}));
    if (!res.ok) {
      const msg =
        data?.errors?.[0]?.title ||
        data?.error ||
        data?.message ||
        `Telnyx join token creation failed (${res.status})`;
      throw new Error(msg);
    }

    return {
      token: String(data?.data?.token || data?.token || ""),
      roomId,
      identity,
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
      const msg =
        data?.errors?.[0]?.title ||
        data?.error ||
        data?.message ||
        `Telnyx room end failed (${res.status})`;
      throw new Error(msg);
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

    // Probe the rooms endpoint to verify reachability
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
