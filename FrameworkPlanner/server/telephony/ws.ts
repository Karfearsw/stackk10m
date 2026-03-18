import type { Server as HttpServer } from "http";
import { WebSocketServer } from "ws";
import { jwtVerify } from "jose";

export type TelephonyEvent =
  | { type: "call_log_created"; payload: any }
  | { type: "call_log_updated"; payload: any }
  | { type: "voicemail_updated"; payload: any }
  | { type: "spam_flag_updated"; payload: any }
  | { type: "recording_ready"; payload: any }
  | { type: "analytics_updated"; payload: any };

type UserSocket = { userId: number; ws: any };

let started = false;
let wss: WebSocketServer | null = null;
const socketsByUserId = new Map<number, Set<any>>();

function getSecret() {
  const secret = process.env.SESSION_SECRET || "";
  if (!secret) return null;
  return new TextEncoder().encode(secret);
}

async function authUserIdFromToken(token: string): Promise<number | null> {
  const secret = getSecret();
  if (!secret) return null;
  try {
    const verified = await jwtVerify(token, secret);
    const sub = verified.payload.sub;
    const userId = typeof sub === "string" ? parseInt(sub, 10) : NaN;
    if (!Number.isFinite(userId) || userId <= 0) return null;
    return userId;
  } catch {
    return null;
  }
}

function registerSocket({ userId, ws }: UserSocket) {
  const set = socketsByUserId.get(userId) || new Set<any>();
  set.add(ws);
  socketsByUserId.set(userId, set);
}

function unregisterSocket({ userId, ws }: UserSocket) {
  const set = socketsByUserId.get(userId);
  if (!set) return;
  set.delete(ws);
  if (set.size === 0) socketsByUserId.delete(userId);
}

export function initTelephonyWs(httpServer: HttpServer) {
  if (started) return;
  started = true;
  wss = new WebSocketServer({ server: httpServer, path: "/ws/telephony" });

  wss.on("connection", async (ws, req) => {
    try {
      const url = new URL(req.url || "", "http://localhost");
      const token = url.searchParams.get("token") || "";
      const userId = await authUserIdFromToken(token);
      if (!userId) {
        ws.close();
        return;
      }

      const userSocket = { userId, ws };
      registerSocket(userSocket);

      ws.on("close", () => unregisterSocket(userSocket));
      ws.on("error", () => unregisterSocket(userSocket));
    } catch {
      ws.close();
    }
  });
}

export function emitTelephonyEvent(userId: number, event: TelephonyEvent) {
  const set = socketsByUserId.get(userId);
  if (!set || set.size === 0) return;
  const msg = JSON.stringify({ ...event, ts: Date.now() });
  for (const ws of set) {
    try {
      ws.send(msg);
    } catch {}
  }
}

export function emitTelephonyEventToAll(event: TelephonyEvent) {
  const msg = JSON.stringify({ ...event, ts: Date.now() });
  for (const [, set] of socketsByUserId) {
    for (const ws of set) {
      try {
        ws.send(msg);
      } catch {}
    }
  }
}

