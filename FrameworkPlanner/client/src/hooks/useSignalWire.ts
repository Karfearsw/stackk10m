import { useCallback, useEffect, useRef, useState } from "react";

interface Call {
  id: string;
  remoteNumber: string;
  state: "new" | "ringing" | "active" | "held" | "finished";
  muted: boolean;
}

export function useSignalWire() {
  const [connectionState, setConnectionState] = useState<"idle" | "connecting" | "ready" | "error">("idle");
  const [error, setError] = useState<string | null>(null);
  const [call, setCall] = useState<Call | null>(null);
  const callControlIdRef = useRef<string | null>(null);
  const didRetryRef = useRef(false);

  const makeCall = useCallback(async (number: string, fromNumber?: string) => {
    setError(null);
    setConnectionState("connecting");

    try {
      const res = await fetch("/api/telephony/outbound/dispatch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ toNumber: number, fromNumber: fromNumber || null }),
      });

      if (!res.ok) {
        const message = await res.text().catch(() => "Telnyx call failed");
        throw new Error(message);
      }

      const data = await res.json();
      const callControlId = data.callControlId;
      if (!callControlId) throw new Error("Missing callControlId from server");

      callControlIdRef.current = callControlId;
      setCall({
        id: callControlId,
        remoteNumber: number,
        state: "ringing",
        muted: false,
      });
      setConnectionState("ready");
      return data;
    } catch (e: any) {
      setConnectionState("error");
      setError(String(e?.message || e || "Telnyx call failed"));
      throw e;
    }
  }, []);

  const endCall = useCallback(async () => {
    const callControlId = callControlIdRef.current;
    if (!callControlId) return;

    try {
      const res = await fetch(`/api/telephony/outbound/${encodeURIComponent(callControlId)}/hangup`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
      });

      if (!res.ok) {
        const message = await res.text().catch(() => "Telnyx hangup failed");
        throw new Error(message);
      }
    } catch (e: any) {
      console.error("Telnyx hangup failed:", e);
    } finally {
      setCall((prev) => prev ? { ...prev, state: "finished" } : null);
      callControlIdRef.current = null;
    }
  }, []);

  const toggleMute = useCallback(async () => {
    // Mute/hold are client-side only in REST mode; Telnyx requires separate control APIs
    setCall((prev) => (prev ? { ...prev, muted: !prev.muted } : null));
  }, []);

  const toggleHold = useCallback(async () => {
    setCall((prev) => {
      if (!prev) return prev;
      const next = prev.state === "held" ? "active" : "held";
      return { ...prev, state: next };
    });
  }, []);

  useEffect(() => {
    return () => {
      // No persistent WebSocket connection to clean up
    };
  }, []);

  return {
    ready: connectionState === "ready",
    connectionState,
    error,
    call,
    makeCall,
    endCall,
    toggleMute,
    toggleHold,
  };
}
