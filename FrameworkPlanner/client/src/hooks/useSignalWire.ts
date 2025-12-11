import { useEffect, useRef, useState } from "react";
import { SignalWire } from "@signalwire/js";

interface SignalWireConfig {
  host: string;
  project: string;
  token: string;
}

interface Call {
  id: string;
  remoteNumber: string;
  state: "new" | "ringing" | "active" | "held" | "finished";
  muted: boolean;
}

export function useSignalWire() {
  const [ready, setReady] = useState(false);
  const [call, setCall] = useState<Call | null>(null);
  const relayRef = useRef<any>(null);
  const sessionRef = useRef<any>(null);
  const [token, setToken] = useState<string | null>(null);

  const getToken = async (to: string, from?: string) => {
    try {
      const response = await fetch("/api/telephony/signalwire/token", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ to: String(to), from: from ? String(from) : undefined }),
      });
      
      if (!response.ok) {
        throw new Error("Failed to get SignalWire token");
      }
      
      const data = await response.json();
      return data;
    } catch (error) {
      console.error("Failed to get SignalWire token:", error);
      throw error;
    }
  };

  const connectWithToken = async (tokenData: any) => {
    try {
      // const host = (tokenData.space || "").replace(/^wss:\/\//, "");
      const client: any = await SignalWire({ token: tokenData.token });
      setReady(true);
      relayRef.current = client;
      return () => {
        const disconnect = (client as any)?.disconnect || (client as any)?.offline;
        if (typeof disconnect === "function") disconnect.call(client);
      };
    } catch (error) {
      console.error("Failed to connect to SignalWire:", error);
      throw error;
    }
  };

  const makeCall = async (number: string) => {
    try {
      console.log("[SW-Diag] makeCall invoked for:", number);
      // Get token from server
      const tokenData = await getToken(number, "+12314060943");
      setToken(tokenData.token);
      
      // Connect with token if not already connected
      if (!ready) {
        console.log("[SW-Diag] Client not ready, connecting...");
        await connectWithToken(tokenData);
      }
      
      if (!relayRef.current) {
        console.error("[SW-Diag] relayRef is null after connection attempt");
        throw new Error("SignalWire not ready");
      }
      
      const client = relayRef.current as any;
      const dialMethod = client?.voice?.dialPhone || client?.calling?.dialPhone || client?.dial;
      console.log("[SW-Diag] Checking dial method. Type:", typeof dialMethod);
      
      if (typeof dialMethod !== "function") {
        console.error("[SW-Diag] dial method missing on client:", relayRef.current);
        throw new Error("SignalWire dial unavailable");
      }
      
      console.log("[SW-Diag] Calling dial...");
      const session = await dialMethod.call(relayRef.current, {
        to: number,
        from: "+12314060943",
      });
      console.log("[SW-Diag] Dial successful. Session ID:", session.callId || session.id);

      setCall({
        id: session.callId || session.id || "unknown",
        remoteNumber: number,
        state: "active",
        muted: false,
      });

      sessionRef.current = session;
      return session;
    } catch (error) {
      console.error("Failed to make call:", error);
      throw error;
    }
  };

  const endCall = async () => {
    if (!sessionRef.current) return;
    
    try {
      await sessionRef.current.hangup();
      setCall(null);
      sessionRef.current = null;
    } catch (error) {
      console.error("Failed to end call:", error);
      throw error;
    }
  };

  const toggleMute = async () => {
    if (!sessionRef.current || !call) return;

    try {
      if (call.muted) {
        await sessionRef.current.unmute();
      } else {
        await sessionRef.current.mute();
      }
      
      setCall(prev => prev ? { ...prev, muted: !prev.muted } : null);
    } catch (error) {
      console.error("Failed to toggle mute:", error);
      throw error;
    }
  };

  const toggleHold = async () => {
    if (!sessionRef.current || !call) return;

    try {
      if (call.state === "held") {
        await sessionRef.current.unhold();
        setCall(prev => prev ? { ...prev, state: "active" } : null);
      } else {
        await sessionRef.current.hold();
        setCall(prev => prev ? { ...prev, state: "held" } : null);
      }
    } catch (error) {
      console.error("Failed to toggle hold:", error);
      throw error;
    }
  };

  return {
    ready,
    call,
    makeCall,
    endCall,
    toggleMute,
    toggleHold,
  };
}
