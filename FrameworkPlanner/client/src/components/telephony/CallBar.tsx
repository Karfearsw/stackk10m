import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  PhoneOff,
  Mic,
  MicOff,
  Pause,
  Play,
  PhoneIncoming,
  PhoneOutgoing,
  Hash,
} from "lucide-react";

/**
 * CallBar — one shared call-control surface for every dialer page.
 *
 * Adopted from the simplicity of the Telnyx webrtc-demo-js (one call bar, one
 * state machine) without touching the call engine: it is purely presentational
 * and delegates every action to the page's existing handlers. Because dialing
 * itself always flows through the page's existing `makeCall` / session paths,
 * the server-side DNC gates (POST /api/telephony/webrtc/calls registration,
 * call-sessions create) stay exactly where they were — the bar can never
 * bypass them because it never dials.
 */

export type CallBarCallState =
  | "idle"
  | "new"
  | "dialing"
  | "ringing"
  | "active"
  | "held"
  | "transferring"
  | "finished"
  | "failed";

/** Minimal shape every call engine already provides (SignalWire / Telnyx RTC). */
export interface CallBarCall {
  state: CallBarCallState;
  muted: boolean;
  remoteNumber: string;
}

/** Two-leg click-to-dial sessions expose a different state vocabulary. */
export interface CallBarSession {
  status: string;
  muted: boolean;
  held: boolean;
  remoteNumber?: string;
}

export interface IncomingCallInfo {
  remoteNumber: string;
  callerName?: string;
  onAnswer: () => void;
  onDecline: () => void;
}

export interface CallBarProps {
  /** WebRTC/SignalWire call, or null when no WebRTC call is active. */
  call: CallBarCall | null;
  /** Two-leg server-anchored session alternative to `call`. */
  session?: CallBarSession | null;
  incoming?: IncomingCallInfo | null;
  /** Name shown above the number (lead owner, contact, …). */
  contactName?: string;
  /** Number to display when no call object exists yet (dialed digits). */
  displayNumber?: string;
  /** Session-specific status text, e.g. "Calling lead…". */
  statusText?: string;
  /** Elapsed milliseconds of the connected call (pages already track this). */
  elapsedMs?: number | null;
  /** Local mic stream for the level meter; null for PSTN-anchored calls. */
  micStream?: MediaStream | null;
  onMute: () => void;
  onHold: () => void;
  onHangup: () => void;
  onDTMF: (digit: string) => void;
  /** Extra page-specific controls (transfer, AI screener, …). */
  extraControls?: React.ReactNode;
  testId?: string;
}

const DTMF_KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "*", "0", "#"];

export function formatCallElapsed(ms: number | null | undefined): string {
  const sec = Math.max(0, Math.floor((ms || 0) / 1000));
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

/** Maps a two-leg session into the unified call-bar vocabulary. */
export function sessionToCallBarCall(
  session: { status: string } | null | undefined,
  opts: { muted?: boolean; held?: boolean; remoteNumber?: string } = {},
): CallBarCall | null {
  if (!session) return null;
  const s = String(session.status || "").toLowerCase();
  let state: CallBarCallState;
  if (s === "connected") state = opts.held ? "held" : "active";
  else if (["queued", "agent_dialing", "agent_ringing", "agent_answered", "lead_dialing", "lead_ringing", "bridging"].includes(s))
    state = "dialing";
  else if (s === "failed" || s === "validation_failed") state = "failed";
  else state = "finished";
  return {
    state,
    muted: Boolean(opts.muted),
    remoteNumber: opts.remoteNumber || "",
  };
}

/**
 * Mic-level meter adopted from the Telnyx webrtc-demo-js audio visualization:
 * an AnalyserNode on the local mic stream drives a row of bars. When no stream
 * is available (PSTN-anchored calls carry no browser audio) it renders an idle
 * placeholder so the bar layout stays identical everywhere.
 */
export function MicLevelMeter({ stream, bars = 16 }: { stream?: MediaStream | null; bars?: number }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [live, setLive] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !stream) {
      setLive(false);
      return;
    }
    let ctx: AudioContext | null = null;
    let analyser: AnalyserNode | null = null;
    let src: MediaStreamAudioSourceNode | null = null;
    let raf = 0;
    let cancelled = false;
    try {
      const AC = window.AudioContext || (window as any).webkitAudioContext;
      if (!AC) return;
      ctx = new AC();
      analyser = ctx.createAnalyser();
      analyser.fftSize = 64;
      src = ctx.createMediaStreamSource(stream);
      src.connect(analyser);
      const data = new Uint8Array(analyser.frequencyBinCount);
      const g = canvas.getContext("2d");
      setLive(true);
      const draw = () => {
        if (cancelled) return;
        raf = requestAnimationFrame(draw);
        if (!g || !analyser) return;
        analyser.getByteFrequencyData(data);
        const w = canvas.width;
        const h = canvas.height;
        g.clearRect(0, 0, w, h);
        const n = bars;
        const bw = w / n;
        for (let i = 0; i < n; i++) {
          const v = data[Math.floor((i / n) * data.length)] / 255;
          const bh = Math.max(2, v * h);
          g.fillStyle = v > 0.75 ? "#ef4444" : v > 0.4 ? "#d4af37" : "#22c55e";
          g.fillRect(i * bw + 1, h - bh, bw - 2, bh);
        }
      };
      draw();
    } catch {
      setLive(false);
    }
    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
      try {
        src?.disconnect();
        analyser?.disconnect();
        void ctx?.close();
      } catch {}
      setLive(false);
    };
  }, [stream, bars]);

  if (!stream || !live) {
    return (
      <div
        className="flex h-8 items-end gap-[3px] opacity-30"
        aria-label="Microphone level (unavailable)"
        title={stream ? "Starting mic meter…" : "No browser audio on this call"}
      >
        {Array.from({ length: bars }).map((_, i) => (
          <div key={i} className="w-[3px] rounded-sm bg-muted-foreground" style={{ height: 3 }} />
        ))}
      </div>
    );
  }
  return <canvas ref={canvasRef} width={bars * 5} height={32} className="h-8" aria-label="Microphone level" />;
}

export function CallBar({
  call,
  session,
  incoming,
  contactName,
  displayNumber,
  statusText,
  elapsedMs,
  micStream,
  onMute,
  onHold,
  onHangup,
  onDTMF,
  extraControls,
  testId = "call-bar",
}: CallBarProps) {
  const [keypadOpen, setKeypadOpen] = useState(false);

  // Incoming-call variant: answer / decline with caller info.
  if (incoming) {
    return (
      <div
        data-testid={testId}
        className="flex items-center justify-between gap-3 rounded-lg border border-primary/40 bg-primary/5 p-3"
      >
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/15">
            <PhoneIncoming className="h-5 w-5 animate-pulse text-primary" />
          </span>
          <div className="min-w-0">
            <div className="truncate text-sm font-semibold">
              {incoming.callerName || "Incoming call"}
            </div>
            <div className="truncate font-mono text-xs text-muted-foreground">{incoming.remoteNumber}</div>
          </div>
        </div>
        <div className="flex shrink-0 gap-2">
          <Button size="sm" onClick={incoming.onAnswer} data-testid={`${testId}-answer`}>
            <PhoneOutgoing className="mr-1 h-4 w-4" /> Answer
          </Button>
          <Button size="sm" variant="destructive" onClick={incoming.onDecline} data-testid={`${testId}-decline`}>
            <PhoneOff className="mr-1 h-4 w-4" /> Decline
          </Button>
        </div>
      </div>
    );
  }

  const sessionCall = session ? sessionToCallBarCall(session, { muted: session.muted, held: session.held, remoteNumber: session.remoteNumber }) : null;
  const active = call && call.state !== "finished" && call.state !== "failed" ? call : sessionCall;
  // Terminal states (failed/finished) still show their label, without buttons.
  const state: CallBarCallState = active?.state || call?.state || "idle";
  const inCall = state === "dialing" || state === "ringing" || state === "active" || state === "held" || state === "transferring";
  const muted = Boolean(active?.muted);
  const held = state === "held";
  const number = active?.remoteNumber || displayNumber || "";
  const label =
    statusText ||
    (state === "dialing"
      ? "Dialing…"
      : state === "ringing"
        ? "Ringing…"
        : state === "active"
          ? "Connected"
          : state === "held"
            ? "On hold"
            : state === "failed"
              ? "Call failed"
              : state === "finished"
                ? "Call ended"
                : "Ready");

  return (
    <div data-testid={testId} className="rounded-lg border border-border bg-card p-3">
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <span
            className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${
              state === "active" ? "bg-green-500/15" : state === "failed" ? "bg-destructive/15" : "bg-muted"
            }`}
          >
            <span
              className={`h-2.5 w-2.5 rounded-full ${
                state === "active" ? "bg-green-500" : state === "failed" ? "bg-destructive" : state === "idle" ? "bg-muted-foreground/40" : "bg-amber-500 animate-pulse"
              }`}
              aria-hidden
            />
          </span>
          <div className="min-w-0">
            <div className="truncate text-sm font-semibold">{contactName || number || "No call"}</div>
            <div className="truncate font-mono text-xs text-muted-foreground">
              {number}
              {state === "active" && elapsedMs != null ? ` • ${formatCallElapsed(elapsedMs)}` : ""}
            </div>
            <div className="text-xs text-muted-foreground" aria-live="polite">
              {label}
              {held ? " • held" : ""}
              {muted && inCall ? " • muted" : ""}
            </div>
          </div>
        </div>
        <MicLevelMeter stream={inCall ? micStream ?? null : null} />
      </div>

      {inCall ? (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Button size="sm" variant="outline" onClick={onMute} data-testid={`${testId}-mute`} aria-label={muted ? "Unmute" : "Mute"}>
            {muted ? <MicOff className="mr-1 h-4 w-4" /> : <Mic className="mr-1 h-4 w-4" />}
            {muted ? "Unmute" : "Mute"}
          </Button>
          <Button size="sm" variant="outline" onClick={onHold} data-testid={`${testId}-hold`} aria-label={held ? "Resume" : "Hold"}>
            {held ? <Play className="mr-1 h-4 w-4" /> : <Pause className="mr-1 h-4 w-4" />}
            {held ? "Resume" : "Hold"}
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => setKeypadOpen((v) => !v)}
            data-testid={`${testId}-keypad-toggle`}
            aria-label="Keypad"
            aria-expanded={keypadOpen}
          >
            <Hash className="mr-1 h-4 w-4" /> Keypad
          </Button>
          {extraControls}
          <Button size="sm" variant="destructive" onClick={onHangup} data-testid={`${testId}-hangup`} aria-label="End call">
            <PhoneOff className="mr-1 h-4 w-4" /> End
          </Button>
        </div>
      ) : null}

      {inCall && keypadOpen ? (
        <div className="mt-3 grid grid-cols-3 gap-2" role="group" aria-label="DTMF keypad" data-testid={`${testId}-keypad`}>
          {DTMF_KEYS.map((k) => (
            <Button
              key={k}
              variant="outline"
              className="h-10 text-lg"
              onClick={() => onDTMF(k)}
              aria-label={`DTMF ${k}`}
              data-testid={`${testId}-dtmf-${k}`}
            >
              {k}
            </Button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
