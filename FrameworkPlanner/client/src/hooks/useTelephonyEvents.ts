import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";

type TelephonyEvent = { type: string; payload?: any; ts?: number };

function toWsUrl(pathWithQuery: string) {
  if (typeof window === "undefined") return "";
  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  return `${protocol}//${window.location.host}${pathWithQuery}`;
}

async function getWsToken() {
  const res = await fetch("/api/telephony/ws-token", { method: "POST" });
  if (!res.ok) throw new Error("WS token unavailable");
  return res.json() as Promise<{ token: string; expiresAt: string }>;
}

export function useTelephonyEvents(opts?: { enabled?: boolean }) {
  const enabled = opts?.enabled ?? true;
  const queryClient = useQueryClient();
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectRef = useRef<number>(0);
  const attemptsRef = useRef(0);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;

    const closeSocket = () => {
      const ws = wsRef.current;
      wsRef.current = null;
      if (ws) {
        try {
          ws.onopen = null;
          ws.onclose = null;
          ws.onerror = null;
          ws.onmessage = null;
          ws.close();
        } catch {}
      }
    };

    const scheduleReconnect = () => {
      if (cancelled) return;
      attemptsRef.current += 1;
      const delay = Math.min(10000, 500 + attemptsRef.current * 500);
      if (reconnectRef.current) window.clearTimeout(reconnectRef.current);
      reconnectRef.current = window.setTimeout(() => connect(), delay);
    };

    const handleEvent = (evt: TelephonyEvent) => {
      const t = String(evt.type || "");
      if (t === "call_log_created" || t === "call_log_updated") {
        queryClient.invalidateQueries({ queryKey: ["/api/telephony/history"] });
        queryClient.invalidateQueries({ queryKey: ["/api/telephony/voicemail", "50"] });
        return;
      }
      if (t === "voicemail_updated" || t === "recording_ready") {
        queryClient.invalidateQueries({ queryKey: ["/api/telephony/voicemail", "50"] });
        return;
      }
      if (t === "spam_flag_updated") {
        queryClient.invalidateQueries({ queryKey: ["/api/telephony/history"] });
        queryClient.invalidateQueries({ queryKey: ["/api/telephony/voicemail", "50"] });
        return;
      }
      if (t === "analytics_updated") {
        queryClient.invalidateQueries({ queryKey: ["/api/telephony/analytics/summary", "30d"] });
      }
    };

    const connect = async () => {
      if (cancelled) return;
      try {
        closeSocket();
        setConnected(false);
        const tokenData = await getWsToken();
        if (cancelled) return;
        const ws = new WebSocket(toWsUrl(`/ws/telephony?token=${encodeURIComponent(tokenData.token)}`));
        wsRef.current = ws;

        ws.onopen = () => {
          attemptsRef.current = 0;
          if (!cancelled) setConnected(true);
        };
        ws.onclose = () => {
          if (!cancelled) setConnected(false);
          scheduleReconnect();
        };
        ws.onerror = () => {
          if (!cancelled) setConnected(false);
        };
        ws.onmessage = (msg) => {
          try {
            const evt = JSON.parse(String(msg.data || "{}"));
            handleEvent(evt);
          } catch {}
        };
      } catch {
        scheduleReconnect();
      }
    };

    connect();
    return () => {
      cancelled = true;
      if (reconnectRef.current) window.clearTimeout(reconnectRef.current);
      closeSocket();
    };
  }, [enabled, queryClient]);

  return { connected };
}
