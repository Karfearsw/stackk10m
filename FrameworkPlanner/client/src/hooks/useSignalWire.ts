import { useCallback, useEffect, useRef, useState } from "react";
import * as SignalWire from "@signalwire/js";

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
  const relayRef = useRef<any>(null);
  const sessionRef = useRef<any>(null);
  const connectPromiseRef = useRef<Promise<void> | null>(null);
  const didRetryRef = useRef(false);

  const getToken = useCallback(async (to: string) => {
    const response = await fetch("/api/telephony/signalwire/token", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ to: String(to) }),
    });

    if (!response.ok) {
      const message = response.status === 401 ? "Unauthorized" : "Failed to get SignalWire token";
      throw new Error(message);
    }

    return await response.json();
  }, []);

  const connect = useCallback(
    async (tokenData: any) => {
      if (relayRef.current && connectionState === "ready") return;
      if (connectPromiseRef.current) return await connectPromiseRef.current;

      setConnectionState("connecting");
      setError(null);

      const connectPromise = (async () => {
        const client: any = await (SignalWire as any).createClient({ token: tokenData.token });

        client.on("signalwire.ready", () => {
          relayRef.current = client;
          setConnectionState("ready");
        });

        client.on("signalwire.error", (e: any) => {
          setConnectionState("error");
          setError(String(e?.message || e || "SignalWire error"));
        });

        client.on("call.received", (incoming: any) => {
          setCall({
            id: incoming.id,
            remoteNumber: incoming.peer?.number || "unknown",
            state: "ringing",
            muted: false,
          });
        });

        client.on("call.state", (updated: any) => {
          setCall((prev) => {
            if (!prev || prev.id !== updated.id) return prev;
            return { ...prev, state: updated.state };
          });
        });

        await client.connect();
        relayRef.current = client;
        setConnectionState("ready");
        didRetryRef.current = false;
      })();

      connectPromiseRef.current = connectPromise;

      try {
        await connectPromise;
      } catch (e: any) {
        connectPromiseRef.current = null;
        setConnectionState("error");
        setError(String(e?.message || e || "Failed to connect"));

        if (!didRetryRef.current) {
          didRetryRef.current = true;
          try {
            setConnectionState("connecting");
            await new Promise((r) => setTimeout(r, 750));
            const client: any = await (SignalWire as any).createClient({ token: tokenData.token });
            client.on("signalwire.ready", () => {
              relayRef.current = client;
              setConnectionState("ready");
            });
            client.on("signalwire.error", (err: any) => {
              setConnectionState("error");
              setError(String(err?.message || err || "SignalWire error"));
            });
            await client.connect();
            relayRef.current = client;
            setConnectionState("ready");
            setError(null);
            return;
          } catch {}
        }

        throw e;
      } finally {
        connectPromiseRef.current = null;
      }
    },
    [connectionState],
  );

  const makeCall = useCallback(
    async (number: string) => {
      const tokenData = await getToken(number);
      await connect(tokenData);

      if (!relayRef.current) {
        throw new Error("SignalWire not ready");
      }

      const client = relayRef.current as any;
      const dial = typeof client.dialPhone === "function" ? client.dialPhone : client?.voice?.dialPhone;
      if (typeof dial !== "function") throw new Error("SignalWire dial unavailable");

      const session = await dial.call(client, { to: number, from: tokenData.from });

      setCall({
        id: session.callId || session.id || "unknown",
        remoteNumber: number,
        state: "active",
        muted: false,
      });

      sessionRef.current = session;
      return session;
    },
    [connect, getToken],
  );

  const endCall = useCallback(async () => {
    if (!sessionRef.current) return;
    
    await sessionRef.current.hangup();
    setCall(null);
    sessionRef.current = null;
  }, []);

  const toggleMute = useCallback(async () => {
    if (!sessionRef.current || !call) return;

    if (call.muted) await sessionRef.current.unmute();
    else await sessionRef.current.mute();

    setCall((prev) => (prev ? { ...prev, muted: !prev.muted } : null));
  }, [call]);

  const toggleHold = useCallback(async () => {
    if (!sessionRef.current || !call) return;

    if (call.state === "held") {
      await sessionRef.current.unhold();
      setCall((prev) => (prev ? { ...prev, state: "active" } : null));
      return;
    }

    await sessionRef.current.hold();
    setCall((prev) => (prev ? { ...prev, state: "held" } : null));
  }, [call]);

  useEffect(() => {
    return () => {
      try {
        const client = relayRef.current as any;
        if (client && typeof client.disconnect === "function") client.disconnect();
      } catch {}
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
