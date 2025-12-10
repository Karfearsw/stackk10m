import { useEffect, useRef, useState } from "react";

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
        body: JSON.stringify({ to, from }),
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
      const SW = await import("@signalwire/js");
      const SignalWire = (SW as any)?.SignalWire;
      if (typeof SignalWire !== "function") {
        throw new Error("SignalWire client unavailable");
      }
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
      // Get token from server
      const tokenData = await getToken(number);
      setToken(tokenData.token);
      
      // Connect with token if not already connected
      if (!ready) {
        await connectWithToken(tokenData);
      }
      
      if (!relayRef.current) {
        throw new Error("SignalWire not ready");
      }
      
      const dial = (relayRef.current as any)?.dial;
      if (typeof dial !== "function") {
        throw new Error("SignalWire dial unavailable");
      }
      const session = await dial.call(relayRef.current, {
        to: number,
        from: tokenData.from || tokenData.project,
      });

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
