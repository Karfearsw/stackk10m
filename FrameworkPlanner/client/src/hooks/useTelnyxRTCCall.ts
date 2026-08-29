import { useCallback, useEffect, useRef, useState } from "react";
import { apiRequest } from "@/lib/queryClient";

/**
 * Browser softphone backed by the Telnyx WebRTC SDK (@telnyx/webrtc).
 *
 * Carries real browser audio via WebRTC. The SDK authenticates over WebSocket
 * using SIP credentials / login_token fetched from the authenticated backend
 * endpoint, so TELNYX_API_KEY never reaches the browser.
 */

export type RtcConnectionState =
  | "idle"
  | "disabled"
  | "loading_config"
  | "connecting"
  | "ready"
  | "error";

export type RtcCallState =
  | "idle"
  | "dialing"
  | "ringing"
  | "active"
  | "held"
  | "ended"
  | "failed";

export type RtcCall = {
  id: string;
  remoteNumber: string;
  state: RtcCallState;
  muted: boolean;
  /** Human/short cause when a call fails or hangs up (from the SDK). */
  endReason?: string | null;
  /** SIP response code when a call fails (e.g. 403, 487). */
  sipCode?: number | null;
};

export type RtcIncoming = {
  call: any;
  remoteNumber: string;
};

type TelnyxRtcModule = {
  TelnyxRTC: new (opts: Record<string, any>) => any;
};

function mapSdkState(raw: string | undefined): RtcCallState {
  switch (String(raw || "").toLowerCase().replace(/[^a-z]/g, "")) {
    case "new":
    case "requesting":
    case "trying":
      return "dialing";
    case "ringing":
    case "answering":
    case "early":
      return "ringing";
    case "active":
      return "active";
    case "held":
      return "held";
    case "hangup":
    case "destroy":
    case "purge":
      return "ended";
    default:
      return "dialing";
  }
}

export type TelnyxRtcOptions = {
  defaultFromNumber?: string;
  onIncoming?: (incoming: RtcIncoming) => boolean | void;
};

export function useTelnyxRTCCall(opts?: TelnyxRtcOptions) {
  const [connState, setConnState] = useState<RtcConnectionState>("idle");
  const [connError, setConnError] = useState<string | null>(null);
  const [call, setCall] = useState<RtcCall | null>(null);
  const [incoming, setIncoming] = useState<RtcIncoming | null>(null);
  const [busy, setBusy] = useState(false);

  const clientRef = useRef<any>(null);
  const callRef = useRef<any>(null);
  const defaultFromRef = useRef<string | null>(null);
  const onIncomingRef = useRef(opts?.onIncoming);
  onIncomingRef.current = opts?.onIncoming;

  const setCallState = useCallback((state: RtcCallState) => {
    setCall((prev) => (prev ? { ...prev, state } : prev));
  }, []);

  const syncFromSdkCall = useCallback((sdkCall: any) => {
    if (!sdkCall) return;
    const state = mapSdkState(sdkCall.state);
    const remote = String(sdkCall.remotePartyNumber || sdkCall.callerIdNumber || sdkCall.destinationNumber || "") || "";
    const ended = state === "ended" || state === "failed";
    const endReason = ended
      ? String(sdkCall.sipReason || sdkCall.cause || sdkCall.causeCode || "").trim() || null
      : null;
    const sipCode = ended ? (Number(sdkCall.sipCode) || null) : null;
    if (ended && (endReason || sipCode)) {
      console.warn("[useTelnyxRTCCall] call ended " + JSON.stringify({ remote, state, sipCode, endReason }));
    }
    setCall((prev) => {
      const next: RtcCall = {
        id: String(sdkCall.id || prev?.id || remote || Date.now()),
        remoteNumber: remote || prev?.remoteNumber || "",
        state,
        muted: Boolean(sdkCall.isAudioMuted ?? prev?.muted),
        endReason: endReason || prev?.endReason || null,
        sipCode: sipCode ?? prev?.sipCode ?? null,
      };
      if (state === "active") {
        sdkCall.stopRingback?.();
      }
      return prev && state === "ended" && (prev.state === "ended" || prev.state === "failed") ? prev : next;
    });
  }, []);

  const disconnect = useCallback(async () => {
    const client = clientRef.current;
    clientRef.current = null;
    callRef.current = null;
    setCall(null);
    setIncoming(null);
    if (client) {
      try {
        await client.disconnect();
      } catch (e) {
        console.error("Telnyx WebRTC disconnect failed:", e);
      }
    }
  }, []);

  const connect = useCallback(async () => {
    if (connState === "ready" || connState === "connecting") return;
    setConnState("loading_config");
    setConnError(null);

    let config: any;
    try {
      const res = await apiRequest("GET", "/api/telephony/webrtc/config");
      config = await res.json();
    } catch (e: any) {
      setConnState("error");
      setConnError("Could not load WebRTC settings. " + String(e?.message || e));
      return;
    }

    if (!config?.enabled) {
      setConnState("disabled");
      setConnError(config?.message || "WebRTC softphone is not enabled. Configure it in Settings -> System.");
      return;
    }
    if (config.defaultFromNumber) defaultFromRef.current = String(config.defaultFromNumber).trim();

    if (!config.loginToken && (!config.login || !config.password)) {
      setConnState("disabled");
      setConnError("WebRTC credentials are not configured. Set a login_token or SIP credentials in Settings -> System.");
      return;
    }

    setConnState("connecting");
    try {
      const mod: TelnyxRtcModule = await import("@telnyx/webrtc");
      const copts: Record<string, any> = {};
      if (config.loginToken) copts.login_token = config.loginToken;
      else { copts.login = config.login; copts.password = config.password; }
      copts.autoReconnect = true;
      copts.hangupOnBeforeUnload = true;
      if (config.defaultFromNumber) copts.callerNumber = config.defaultFromNumber;

      const client = new mod.TelnyxRTC(copts);
      clientRef.current = client;

      client.on("telnyx.ready", () => {
        setConnState("ready");
        setConnError(null);
      });
      client.on("telnyx.error", (err: any) => {
        setConnError(String(err?.message || err?.code || err || "Telnyx connection error"));
        setConnState((prev) => (prev === "ready" ? prev : "error"));
      });
      client.on("telnyx.notification", (ntf: any) => {
        const type = ntf?.type;
        const sdkCall = ntf?.call;
        if (!sdkCall) return;
        if (type === "conferenceUpdate") { if (sdkCall.state == null) return; syncFromSdkCall(sdkCall); return; }
        if (sdkCall.direction === "inbound" && mapSdkState(sdkCall.state) === "ringing") {
          const evt: RtcIncoming = { call: sdkCall, remoteNumber: String(sdkCall.remotePartyNumber || sdkCall.callerIdNumber || "") || "" };
          setIncoming(evt);
          const accepted = onIncomingRef.current?.(evt);
          if (accepted) { setIncoming(null); callRef.current = sdkCall; sdkCall.answer?.().catch(() => {}); }
          return;
        }
        if (callRef.current && sdkCall.id === callRef.current.id) {
          syncFromSdkCall(sdkCall);
          if (mapSdkState(sdkCall.state) === "ended") callRef.current = null;
        } else if (!callRef.current) {
          callRef.current = sdkCall;
          syncFromSdkCall(sdkCall);
        }
      });

      await client.connect();
    } catch (e: any) {
      console.error("Telnyx WebRTC connect failed:", e);
      setConnState("error");
      setConnError(String(e?.message || e || "Failed to connect Telnyx softphone"));
    }
  }, [connState, syncFromSdkCall]);

  useEffect(() => {
    connect();
    return () => {
      const client = clientRef.current;
      clientRef.current = null;
      callRef.current = null;
      if (client) client.disconnect().catch(() => {});
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const makeCall = useCallback(async (destinationNumber: string) => {
    const client = clientRef.current;
    if (!client || connState !== "ready") {
      setConnError("Softphone is not connected yet. Try again in a moment.");
      return null;
    }
    setBusy(true);
    setIncoming(null);
    try {
      const sdkCall = client.newCall({
        destinationNumber,
        audio: true,
        ...(defaultFromRef.current ? { callerNumber: defaultFromRef.current } : {}),
      });
      callRef.current = sdkCall;
      const remote = String(destinationNumber || "") || "";
      setCall({ id: String(sdkCall.id || Date.now()), remoteNumber: remote, state: "dialing", muted: sdkCall.isAudioMuted ?? false });
      sdkCall.playRingback?.();
      return sdkCall;
    } catch (e: any) {
      setConnError(String(e?.message || e || "Failed to place call"));
      return null;
    } finally { setBusy(false); }
  }, [connState]);

  const hangup = useCallback(async () => {
    const sdkCall = callRef.current;
    callRef.current = null;
    setCall((prev) => (prev ? { ...prev, state: "ended" } : null));
    if (sdkCall) { try { await sdkCall.hangup(); } catch (e) { console.error("Softphone hangup failed:", e); } }
  }, []);

  const answerIncoming = useCallback(() => {
    const inc = incoming;
    if (!inc) return;
    setIncoming(null);
    callRef.current = inc.call;
    syncFromSdkCall(inc.call);
    inc.call.answer?.().catch(() => {});
  }, [incoming, syncFromSdkCall]);

  const rejectIncoming = useCallback(() => {
    const inc = incoming;
    setIncoming(null);
    if (inc?.call) inc.call.hangup?.().catch(() => {});
  }, [incoming]);

  const toggleMute = useCallback(async () => {
    const sdkCall = callRef.current;
    if (!sdkCall) return;
    const target = !(call?.muted ?? false);
    try {
      if (target) sdkCall.muteAudio?.(); else sdkCall.unmuteAudio?.();
      setCall((prev) => (prev ? { ...prev, muted: target } : prev));
    } catch (e: any) { setConnError(String(e?.message || e || "Mute failed")); }
  }, [call?.muted]);

  const toggleHold = useCallback(async () => {
    const sdkCall = callRef.current;
    if (!sdkCall) return;
    try {
      if (call?.state === "held") { await sdkCall.unhold?.(); setCallState("active"); }
      else { await sdkCall.hold?.(); setCallState("held"); }
    } catch (e: any) { setConnError(String(e?.message || e || "Hold failed")); }
  }, [call?.state, setCallState]);

  const sendDigits = useCallback((digits: string) => {
    const sdkCall = callRef.current;
    if (!sdkCall || call?.state !== "active") return;
    try { sdkCall.dtmf?.(digits); } catch (e) { console.error("DTMF failed:", e); }
  }, [call?.state]);


  /** List available audio OUTPUT devices (speakers). Requires permission to enumerate. */
  const enumerateAudioOutputs = useCallback(async (): Promise<{ deviceId: string; label: string }[]> => {
    if (typeof navigator === "undefined" || !navigator.mediaDevices?.enumerateDevices) return [];
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      return devices
        .filter((d) => d.kind === "audiooutput")
        .map((d) => ({ deviceId: d.deviceId, label: d.label || "Speaker" }));
    } catch (e) {
      console.error("enumerateDevices (audiooutput) failed:", e);
      return [];
    }
  }, []);

  /**
   * Route call audio to a chosen speaker/output device. Applied live to the
   * active SDK call when possible; also passed to the next call as speakerId.
   */
  const setAudioOutputDevice = useCallback(async (deviceId: string) => {
    const sdkCall = callRef.current;
    if (sdkCall && typeof sdkCall.setAudioOutDevice === "function") {
      try { await sdkCall.setAudioOutDevice(deviceId); } catch (e) { console.error("setAudioOutDevice failed:", e); }
    }
  }, []);

  return {
    connState, connError, call, incoming, busy,
    connect, disconnect,
    makeCall, hangup, answerIncoming, rejectIncoming,
    toggleMute, toggleHold, sendDigits,
    enumerateAudioOutputs, setAudioOutputDevice,
  };

}
