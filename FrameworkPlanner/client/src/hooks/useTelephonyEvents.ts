import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";

type TelephonyEvent = { type: string; payload?: any; ts?: number };

type Subscriber = {
  onCallStateChanged?: (evt: TelephonyCallStateEvent) => void;
  onSessionStateChanged?: (evt: TelephonySessionStateEvent) => void;
  onInboundCall?: (evt: InboundCallEvent) => void;
};

export type InboundCallEvent = {
  callControlId: string;
  from?: string | null;
  maskedFrom?: string | null;
  leadId?: number | null;
  leadName?: string | null;
  leadPhone?: string | null;
  ts?: number;
  ended?: boolean;
  claimedBy?: number | null;
  declinedBy?: number | null;
};
export type TelephonySessionStateEvent = {
  sessionId: number;
  status: string;
  mode?: string | null;
  finalDisposition?: string | null;
};

export type TelephonyCallStateEvent = {
  callControlId: string;
  state: string;
  from?: string | null;
  to?: string | null;
};

// ---------------------------------------------------------------------------
// Singleton realtime manager: exactly ONE connection/poller for the whole app.
// - If a WS relay is reachable (wsBaseUrl from the server, or same-origin in
//   dev), it uses the WebSocket.
// - Otherwise it falls back to polling GET /api/telephony/events/latest.
// This removes the previous 404 retry-storm seen in production (the old code
// hammered a ws-token endpoint that the server never registered).
// ---------------------------------------------------------------------------

type Mode = "idle" | "ws" | "poll";

let mode: Mode = "idle";
let started = false;
let ws: WebSocket | null = null;
let wsAttempts = 0;
let pollTimer: ReturnType<typeof setTimeout> | null = null;
let lastTs = Date.now();
const subscribers = new Set<Subscriber>();
const ringSeen = new Set<string>();
const stateSeen = new Map<string, string>();
const sessionSeen = new Map<string, string>();

function resolveWsUrl(wsBaseUrl: string | null | undefined, pathWithQuery: string) {
  if (typeof window === "undefined") return "";
  if (wsBaseUrl) {
    try {
      return new URL(pathWithQuery, wsBaseUrl).toString();
    } catch {}
  }
  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  return `${protocol}//${window.location.host}${pathWithQuery}`;
}

function isLocalHost() {
  const h = typeof window !== "undefined" ? window.location.hostname : "";
  return h === "localhost" || h === "127.0.0.1" || h === "::1";
}

function applyEvent(evt: TelephonyEvent, queryClient: ReturnType<typeof useQueryClient>) {
  const t = String(evt.type || "");
  const p = evt.payload || {};
  const ts = Number(p.ts || evt.ts || Date.now());
  if (ts > lastTs) lastTs = ts;

  if (t === "call_state_changed") {
    const cid = String(p.callControlId || "");
    const state = String(p.state || "");
    const prev = stateSeen.get(cid);
    if (cid && prev !== state) {
      stateSeen.set(cid, state);
      if (["ended", "failed", "missed", "no-answer"].includes(state)) stateSeen.delete(cid);
      for (const s of subscribers) s.onCallStateChanged?.({ callControlId: cid, state, from: p.from || null, to: p.to || null });
    }
    return;
  }
  if (t === "inbound_call_ringing") {
    const cid = String(p.callControlId || "");
    if (!cid || ringSeen.has(cid)) return;
    ringSeen.add(cid);
    for (const s of subscribers)
      s.onInboundCall?.({
        callControlId: cid,
        from: p.from ?? null,
        maskedFrom: p.maskedFrom ?? null,
        leadId: p.leadId ?? null,
        leadName: p.leadName ?? null,
        leadPhone: p.leadPhone ?? null,
        ts: p.ts ?? Date.now(),
      });
    return;
  }
  if (t === "inbound_call_ended" || t === "inbound_call_claimed" || t === "inbound_call_declined") {
    const cid = String(p.callControlId || "");
    if (t === "inbound_call_ended") ringSeen.delete(cid);
    for (const s of subscribers)
      s.onInboundCall?.({
        callControlId: cid,
        from: p.from ?? null,
        maskedFrom: p.maskedFrom ?? null,
        leadId: p.leadId ?? null,
        leadName: p.leadName ?? null,
        leadPhone: p.leadPhone ?? null,
        ts: p.ts ?? Date.now(),
        ended: t === "inbound_call_ended" ? true : undefined,
        claimedBy: t === "inbound_call_claimed" ? Number(p.claimedBy) || null : undefined,
        declinedBy: t === "inbound_call_declined" ? Number(p.declinedBy) || null : undefined,
      });
    return;
  }
  if (t === "call_session_state_changed") {
    const sid = String(p.sessionId || "");
    const status = String(p.status || "");
    if (!sid || sessionSeen.get(sid) === status) return;
    sessionSeen.set(sid, status);
    if (["ended", "canceled", "failed"].includes(status)) sessionSeen.delete(sid);
    for (const s of subscribers)
      s.onSessionStateChanged?.({ sessionId: Number(p.sessionId), status, mode: p.mode || null, finalDisposition: p.finalDisposition || null });
    return;
  }
  if (t === "call_log_created" || t === "call_log_updated" || t === "spam_flag_updated") {
    queryClient.invalidateQueries({ queryKey: ["/api/telephony/history"] });
    queryClient.invalidateQueries({ queryKey: ["/api/telephony/voicemail", "50"] });
    queryClient.invalidateQueries({ queryKey: ["/api/telephony/analytics/summary", "30d"] });
    return;
  }
  if (t === "voicemail_updated" || t === "recording_ready") {
    queryClient.invalidateQueries({ queryKey: ["/api/telephony/voicemail", "50"] });
    return;
  }
  if (t === "analytics_updated") {
    queryClient.invalidateQueries({ queryKey: ["/api/telephony/analytics/summary", "30d"] });
  }
}

async function getWsToken(): Promise<{ token: string; expiresAt: string; wsBaseUrl?: string | null }> {
  const res = await fetch("/api/telephony/ws-token", { method: "POST", credentials: "include" });
  if (!res.ok) throw new Error("WS token unavailable");
  const body = await res.json();
  if (!body || typeof body.token !== "string") throw new Error("WS token unavailable");
  return body;
}

function stopPolling() {
  if (pollTimer) {
    clearTimeout(pollTimer);
    pollTimer = null;
  }
}

function startPolling(queryClient: ReturnType<typeof useQueryClient>, intervalMs: number) {
  if (mode === "poll" && pollTimer) return;
  mode = "poll";
  const tick = async () => {
    try {
      const res = await fetch(`/api/telephony/events/latest?sinceMs=${lastTs}`, { credentials: "include" });
      if (res.ok) {
        const body = await res.json();
        const interval = Number(body?.pollIntervalMs) > 0 ? Number(body.pollIntervalMs) : 8000;
        for (const evt of body?.events || []) applyEvent(evt, queryClient);
        if (mode === "poll") pollTimer = setTimeout(tick, interval);
      } else if (mode === "poll") {
        pollTimer = setTimeout(tick, 10000);
      }
    } catch {
      if (mode === "poll") pollTimer = setTimeout(tick, 10000);
    }
  };
  tick();
}

function closeSocket() {
  const current = ws;
  ws = null;
  if (current) {
    try {
      current.onopen = null;
      current.onclose = null;
      current.onerror = null;
      current.onmessage = null;
      current.close();
    } catch {}
  }
}

function startWs(url: string, queryClient: ReturnType<typeof useQueryClient>) {
  mode = "ws";
  wsAttempts = 0;
  let connectTimer: ReturnType<typeof setTimeout> | null = null;
  const failAttempt = () => {
    if (mode !== "ws") return;
    closeSocket();
    wsAttempts += 1;
    if (wsAttempts >= 3) {
      // Relay unreachable → degrade to polling instead of hammering.
      startPolling(queryClient, 8000);
      return;
    }
    connectTimer = setTimeout(connect, 2000);
  };
  const connect = () => {
    if (mode !== "ws") return;
    closeSocket();
    if (connectTimer) {
      clearTimeout(connectTimer);
      connectTimer = null;
    }
    try {
      const socket = new WebSocket(url);
      ws = socket;
      // Some servers (e.g. Vite middleware in dev) swallow the upgrade without
      // replying, leaving the socket stuck in CONNECTING forever. Time out and
      // fall back to polling so we never hang silently.
      connectTimer = setTimeout(() => {
        if (socket.readyState !== WebSocket.OPEN) failAttempt();
      }, 3000);
      socket.onopen = () => {
        if (connectTimer) {
          clearTimeout(connectTimer);
          connectTimer = null;
        }
        if (mode !== "ws") return;
        wsAttempts = 0;
      };
      socket.onclose = () => {
        if (connectTimer) {
          clearTimeout(connectTimer);
          connectTimer = null;
        }
        failAttempt();
      };
      socket.onerror = () => {
        if (mode !== "ws") return;
      };
      socket.onmessage = (msg) => {
        try {
          applyEvent(JSON.parse(String(msg.data || "{}")), queryClient);
        } catch {}
      };
    } catch {
      startPolling(queryClient, 8000);
    }
  };
  connect();
}

async function ensureStarted(queryClient: ReturnType<typeof useQueryClient>) {
  if (started) return;
  started = true;
  let tokenData: { token: string; wsBaseUrl?: string | null } | null = null;
  try {
    tokenData = await getWsToken();
  } catch {
    tokenData = null;
  }
  if (tokenData?.wsBaseUrl) {
    startWs(resolveWsUrl(tokenData.wsBaseUrl, `/ws/telephony?token=${encodeURIComponent(tokenData.token)}`), queryClient);
    return;
  }
  if (tokenData && isLocalHost()) {
    // Dev: try same-origin relay once; polling is the fallback.
    startWs(resolveWsUrl(null, `/ws/telephony?token=${encodeURIComponent(tokenData.token)}`), queryClient);
    return;
  }
  // Production without a relay → straight to polling (no 404/upgrade spam).
  startPolling(queryClient, 8000);
}

export function useTelephonyEvents(opts?: {
  enabled?: boolean;
  onCallStateChanged?: (evt: TelephonyCallStateEvent) => void;
  onSessionStateChanged?: (evt: TelephonySessionStateEvent) => void;
  onInboundCall?: (evt: InboundCallEvent) => void;
}) {
  const enabled = opts?.enabled ?? true;
  const queryClient = useQueryClient();
  const [connected, setConnected] = useState(false);
  const optsRef = useRef<Subscriber>({});
  optsRef.current.onCallStateChanged = opts?.onCallStateChanged;
  optsRef.current.onSessionStateChanged = opts?.onSessionStateChanged;
  optsRef.current.onInboundCall = opts?.onInboundCall;

  useEffect(() => {
    if (!enabled) return;
    const sub: Subscriber = {
      onCallStateChanged: (e) => optsRef.current.onCallStateChanged?.(e),
      onSessionStateChanged: (e) => optsRef.current.onSessionStateChanged?.(e),
      onInboundCall: (e) => optsRef.current.onInboundCall?.(e),
    };
    subscribers.add(sub);
    setConnected(mode === "ws");
    ensureStarted(queryClient);
    const interval = window.setInterval(() => setConnected(mode === "ws"), 3000);
    return () => {
      subscribers.delete(sub);
      window.clearInterval(interval);
    };
  }, [enabled, queryClient]);

  return { connected };
}
