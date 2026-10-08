import { useCallback, useEffect, useRef, useState } from "react";
import { apiRequest } from "@/lib/queryClient";
import { useTelnyxRTCCall } from "./useTelnyxRTCCall";

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
  // WebRTC-first: real browser audio (mic → Telnyx parked leg → PSTN bridge).
  // The PSTN click-to-dial below is the fallback when WebRTC isn't connected.
  const rtc = useTelnyxRTCCall();
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

      // ── WebRTC path (preferred): mic audio + parked-outbound bridge. ──
      // The server-side DNC/active-call gates inside rtc.makeCall surface
      // blocked dials here as a thrown error.
      if (rtc.connState === "ready") {
        const started = await rtc.makeCall(number);
        if (started?.call) {
          setConnectionState("ready");
          setCallBoth(() => ({
            id: String((started.call as any).id || Date.now()),
            remoteNumber: number,
            state: "ringing",
            muted: false,
          }));
          return { callControlId: null, callLogId: started.callLogId || null, transport: "webrtc" };
        }
        // WebRTC was ready but the call failed to start — surface the error.
        // Do NOT fall through to PSTN: the PSTN fallback dials the destination
        // without bridging the agent (lead hears silence). Fail fast instead.
        throw new Error("WebRTC call failed to start. Check your microphone and try again.");
      }

      // ── WebRTC not connected: fail fast with a clear message. ──
      // The old PSTN fallback has been removed (2026-10-08) because it placed
      // dead calls. The agent must connect their softphone first.
      throw new Error("Softphone not connected. Click the microphone icon to enable your softphone, then try again.");
    },
    [clearRingTimer, setCallBoth, rtc],
  );

  const endCall = useCallback(async () => {
    clearRingTimer();
    if (rtc.call) { await rtc.hangup().catch(() => {}); }
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
  // On the WebRTC path mute runs locally on the Call object (checklist #5).
  const toggleMute = useCallback(async () => {
    if (rtc.call) { await rtc.toggleMute(); setCallBoth((prev) => (prev ? { ...prev, muted: !prev.muted } : prev)); return; }
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
    if (rtc.call) { await rtc.toggleHold(); setCallBoth((prev) => (prev ? { ...prev, state: prev.state === "held" ? "active" : "held" } : prev)); return; }
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
    rtcConnState: rtc.connState,
    rtcError: rtc.connError,
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
    // CallBar support: DTMF + incoming-call answer/decline delegate straight
    // to the underlying WebRTC leg; dialing still goes through makeCall's
    // server-side DNC gates.
    sendDigits: rtc.sendDigits,
    incomingCall: rtc.incoming,
    answerIncoming: rtc.answerIncoming,
    rejectIncoming: rtc.rejectIncoming,
  };
}
