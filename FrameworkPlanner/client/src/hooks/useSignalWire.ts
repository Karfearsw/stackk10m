import { useCallback, useEffect, useRef, useState } from "react";
import { apiRequest } from "@/lib/queryClient";

export interface SignalWireCall {
  id: string;
  remoteNumber: string;
  state: "new" | "ringing" | "active" | "held" | "transferring" | "finished" | "failed";
  muted: boolean;
}

export type MakeCallOptions = {
  fromNumber?: string;
  metadata?: Record<string, unknown> | null;
  ringingTimeoutMs?: number;
};

const DEFAULT_RINGING_TIMEOUT_MS = 60_000;

function mapExternalState(raw: string): SignalWireCall["state"] | null {
  const s = String(raw || "").trim().toLowerCase();
  if (s === "answered" || s === "active" || s === "in_progress") return "active";
  if (s === "ringing" || s === "dialing") return "ringing";
  if (s === "failed" || s === "busy" || s === "rejected") return "failed";
  if (s === "ended" || s === "completed" || s === "finished" || s === "no_answer" || s === "missed" || s === "hangup") return "finished";
  return null;
}

export function useSignalWire() {
  const [connectionState, setConnectionState] = useState<"idle" | "connecting" | "ready" | "error">("idle");
  const [error, setError] = useState<string | null>(null);
  const [lastError, setLastError] = useState<string | null>(null);
  const [call, setCall] = useState<SignalWireCall | null>(null);
  const [aiAssistantActive, setAiAssistantActive] = useState(false);
  const callRef = useRef<SignalWireCall | null>(null);
  const callControlIdRef = useRef<string | null>(null);
  const ringTimerRef = useRef<number | null>(null);

  const clearRingTimer = useCallback(() => {
    if (ringTimerRef.current !== null) {
      window.clearTimeout(ringTimerRef.current);
      ringTimerRef.current = null;
    }
  }, []);

  const setCallBoth = useCallback((fn: (prev: SignalWireCall | null) => SignalWireCall | null) => {
    setCall((prev) => {
      const next = fn(prev);
      callRef.current = next;
      return next;
    });
  }, []);

  const makeCall = useCallback(
    async (number: string, opts?: MakeCallOptions) => {
      setError(null);
      setLastError(null);
      setConnectionState("connecting");
      clearRingTimer();

      try {
        const res = await apiRequest("POST", "/api/telephony/outbound/dispatch", {
          toNumber: number,
          fromNumber: opts?.fromNumber || null,
          metadata: opts?.metadata || null,
        });

        const data = await res.json();
        const callControlId = data.callControlId;
        if (!callControlId) throw new Error("Missing callControlId from server");

        callControlIdRef.current = callControlId;
        setAiAssistantActive(false);
        setCallBoth((prev) => {
          const next: SignalWireCall = {
            id: callControlId,
            remoteNumber: number,
            state: "ringing",
            muted: false,
          };
          return prev && (prev.state === "active" || prev.state === "held") ? prev : next;
        });
        setConnectionState("ready");

        // Safety net: never leave the UI stuck on "ringing" if the provider never
        // reports an answer, hangup, or failure (no webhook / WS available).
        const timeoutMs = opts?.ringingTimeoutMs ?? DEFAULT_RINGING_TIMEOUT_MS;
        ringTimerRef.current = window.setTimeout(() => {
          ringTimerRef.current = null;
          const current = callRef.current;
          if (!current || current.state === "active" || current.state === "held" || current.state === "finished" || current.state === "failed") return;
          const ccId = callControlIdRef.current;
          setCallBoth((prev) => (prev && (prev.state === "ringing" || prev.state === "new") ? { ...prev, state: "failed" } : prev));
          const msg = `Call timed out while ringing after ${Math.round(timeoutMs / 1000)}s`;
          setError(msg);
          setLastError(msg);
          if (ccId) {
            apiRequest("POST", `/api/telephony/outbound/${encodeURIComponent(ccId)}/hangup`).catch(() => {});
          }
          callControlIdRef.current = null;
        }, timeoutMs);

        return data;
      } catch (e: any) {
        clearRingTimer();
        setConnectionState("error");
        const msg = String(e?.message || e || "Telnyx call failed");
        setError(msg);
        setLastError(msg);
        throw e;
      }
    },
    [clearRingTimer, setCallBoth],
  );

  const endCall = useCallback(async () => {
    clearRingTimer();
    const callControlId = callControlIdRef.current;
    callControlIdRef.current = null;
    setCallBoth((prev) => (prev ? { ...prev, state: "finished" } : null));
    if (!callControlId) return;
    try {
      await apiRequest("POST", `/api/telephony/outbound/${encodeURIComponent(callControlId)}/hangup`);
    } catch (e: any) {
      console.error("Telnyx hangup failed:", e);
    }
  }, [clearRingTimer, setCallBoth]);

  const updateCallState = useCallback(
    (rawState: string) => {
      const next = mapExternalState(rawState);
      if (!next) return;
      setCallBoth((prev) => {
        if (!prev) return prev;
        if (next === "finished" && prev.state === "failed") return prev; // never downgrade a recorded failure
        return { ...prev, state: next };
      });
      if (next === "active" || next === "finished" || next === "failed") clearRingTimer();
      if (next === "finished" || next === "failed") setAiAssistantActive(false);
    },
    [clearRingTimer, setCallBoth],
  );

  // Server-confirmed mute: flip local state only after the provider accepts
  // the command, so the UI never shows a mute that Telnyx rejected.
  const toggleMute = useCallback(async () => {
    const ccId = callControlIdRef.current;
    if (!ccId) return;
    const target = !(callRef.current?.muted ?? false);
    try {
      await apiRequest("POST", `/api/telephony/outbound/${encodeURIComponent(ccId)}/mute`, { muted: target });
      setCallBoth((prev) => (prev ? { ...prev, muted: target } : prev));
    } catch (e: any) {
      const msg = String(e?.message || e || "Mute failed");
      console.error("Telnyx mute failed:", msg);
      setError(msg);
      setLastError(msg);
    }
  }, [setCallBoth]);

  // Server-confirmed hold/unhold.
  const toggleHold = useCallback(async () => {
    const ccId = callControlIdRef.current;
    if (!ccId) return;
    const next = callRef.current?.state === "held" ? "active" : "held";
    const action = next === "held" ? "hold" : "unhold";
    try {
      await apiRequest("POST", `/api/telephony/outbound/${encodeURIComponent(ccId)}/hold`, { action });
      setCallBoth((prev) => (prev ? { ...prev, state: next } : prev));
    } catch (e: any) {
      const msg = String(e?.message || e || "Hold failed");
      console.error(`Telnyx ${action} failed:`, msg);
      setError(msg);
      setLastError(msg);
    }
  }, [setCallBoth]);

  // Server-confirmed blind transfer to a destination number.
  const transferCall = useCallback(
    async (to: string) => {
      const ccId = callControlIdRef.current;
      if (!ccId) return;
      try {
        await apiRequest("POST", `/api/telephony/outbound/${encodeURIComponent(ccId)}/transfer`, { to });
        setCallBoth((prev) => (prev ? { ...prev, state: "transferring" } : prev));
        return true;
      } catch (e: any) {
        const msg = String(e?.message || e || "Transfer failed");
        console.error("Telnyx transfer failed:", msg);
        setError(msg);
        setLastError(msg);
        throw e;
      }
    },
    [setCallBoth],
  );

  const startAiAssistant = useCallback(async (assistantId?: string) => {
    const ccId = callControlIdRef.current;
    if (!ccId) return;
    const res = await apiRequest("POST", `/api/telephony/outbound/${encodeURIComponent(ccId)}/ai-assistant`, {
      action: "start",
      assistantId: assistantId || null,
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data?.error || "Failed to start AI assistant");
    setAiAssistantActive(true);
    return data;
  }, []);

  const stopAiAssistant = useCallback(async () => {
    const ccId = callControlIdRef.current;
    setAiAssistantActive(false);
    if (!ccId) return;
    try {
      await apiRequest("POST", `/api/telephony/outbound/${encodeURIComponent(ccId)}/ai-assistant`, { action: "stop" });
    } catch (e: any) {
      console.error("Telnyx AI assistant stop failed:", e);
    }
  }, []);

  useEffect(() => {
    return () => clearRingTimer();
  }, [clearRingTimer]);

  return {
    ready: connectionState === "ready",
    connectionState,
    error,
    lastError,
    call,
    callControlId: callControlIdRef.current,
    makeCall,
    endCall,
    updateCallState,
    toggleMute,
    toggleHold,
    transferCall,
    aiAssistantActive,
    startAiAssistant,
    stopAiAssistant,
  };
}
