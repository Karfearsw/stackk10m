import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Phone, PhoneOff, Mic, MicOff, Pause, Play,
  Loader2, WifiOff, AlertCircle, PhoneIncoming,
} from "lucide-react";
import { useTelnyxRTCCall, type RtcCallState } from "@/hooks/useTelnyxRTCCall";
import { useCallAudio } from "@/hooks/useCallAudio";

const KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "*", "0", "#"];

const STATE_LABEL: Record<RtcCallState, string> = {
  idle: "Idle",
  dialing: "Dialing…",
  ringing: "Ringing…",
  active: "Connected",
  held: "On hold",
  ended: "Ended",
  failed: "Failed",
};

function formatE164(raw: string) {
  const digits = raw.replace(/[^\d+]/g, "");
  if (digits.startsWith("+")) return digits;
  if (digits.length === 10) return "+1" + digits;
  return digits;
}

export function Softphone() {
  const rtc = useTelnyxRTCCall();
  const { startRingback, stopRingback, playConnectTone } = useCallAudio();
  const [number, setNumber] = useState("");
  const [timer, setTimer] = useState<number | null>(null);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [outputs, setOutputs] = useState<{ deviceId: string; label: string }[]>([]);
  const [speakerId, setSpeakerId] = useState("default");

  const formatted = useMemo(() => formatE164(number), [number]);
  const active = rtc.call && (rtc.call.state === "dialing" || rtc.call.state === "ringing" || rtc.call.state === "active" || rtc.call.state === "held");
  const durationLabel = useMemo(() => {
    const sec = Math.floor((elapsedMs || 0) / 1000);
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m}:${String(s).padStart(2, "0")}`;
  }, [elapsedMs]);

  const connectionBadge = () => {
    switch (rtc.connState) {
      case "ready": return <Badge>Browser line ready</Badge>;
      case "connecting": return <Badge variant="secondary"><Loader2 className="w-3 h-3 mr-1 animate-spin" /> Connecting…</Badge>;
      case "disabled": return <Badge variant="outline"><AlertCircle className="w-3 h-3 mr-1" /> Not enabled</Badge>;
      case "error": return <Badge variant="destructive"><WifiOff className="w-3 h-3 mr-1" /> Error</Badge>;
      default: return <Badge variant="secondary">Offline</Badge>;
    }
  };

  const call = async () => {
    if (!formatted || active) return;
    // Timer + audio feedback driven by local transitions from the hook.
    const started = await rtc.makeCall(formatted);
    if (started) {
      setTimer(window.setInterval(() => setElapsedMs((v) => v + 250), 250));
      startRingback();
    }
  };

  const hangup = async () => {
    await rtc.hangup();
    stopRingback();
    if (timer) window.clearInterval(timer);
    setTimer(null);
    setElapsedMs(0);
  };

  // Enumerate audio OUTPUT devices (speakers) once permission allows labels.
  useEffect(() => {
    let cancelled = false;
    const refresh = async () => {
      const devs = await rtc.enumerateAudioOutputs();
      if (!cancelled && devs.length > 0) setOutputs(devs);
    };
    refresh();
    const t = window.setTimeout(refresh, 1500);
    return () => { cancelled = true; window.clearTimeout(t); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Apply the selected speaker live to the active call when the device changes.
  useEffect(() => {
    if (speakerId && speakerId !== "default") rtc.setAudioOutputDevice(speakerId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [speakerId, rtc.call?.state]);

  // Watch the SDK call state: start/stop ringback + connect chime, and stop the
  // local timer when the call ends/fails (even if ended remotely).
  useEffect(() => {
    const st = rtc.call?.state;
    if (st === "active") { stopRingback(); playConnectTone(); }
    else if (st === "ended" || st === "failed") {
      stopRingback();
      if (timer) window.clearInterval(timer);
      setTimer(null);
      setElapsedMs(0);
    }
  }, [rtc.call?.state]);

  return (
    <Card className="min-w-0">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center justify-between gap-2 flex-wrap">
          <span>Browser Softphone</span>
          {connectionBadge()}
        </CardTitle>
        <CardDescription>Real in-browser audio over WebRTC. Mute, hold, and DTMF supported.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {rtc.connError ? (
          <div className="rounded-md border border-destructive/40 bg-destructive/10 p-2 text-xs text-destructive">
            {rtc.connError}
            {rtc.connState === "disabled" || rtc.connState === "error" ? (
              <Button size="sm" variant="outline" className="mt-2" onClick={() => rtc.connect()}>
                Reconnect
              </Button>
            ) : null}
          </div>
        ) : null}

        {rtc.incoming ? (
          <div className="rounded-md border border-primary/40 bg-primary/10 p-3 space-y-2">
            <div className="flex items-center gap-2 text-sm font-medium">
              <PhoneIncoming className="w-4 h-4" />
              Incoming call from {rtc.incoming.remoteNumber || "unknown"}
            </div>
            <div className="flex gap-2">
              <Button size="sm" onClick={rtc.answerIncoming}><Phone className="w-4 h-4 mr-2" /> Answer</Button>
              <Button size="sm" variant="destructive" onClick={rtc.rejectIncoming}><PhoneOff className="w-4 h-4 mr-2" /> Decline</Button>
            </div>
          </div>
        ) : null}

        <div className="grid gap-4 grid-cols-1 md:grid-cols-2">
          {/* Dialer + keypad */}
          <div className="space-y-3">
            <Label htmlFor="softphone-number">Number</Label>
            <div className="flex gap-2 items-center">
              <Input id="softphone-number" value={number} onChange={(e) => setNumber(e.target.value)} placeholder="Enter E.164 number" disabled={Boolean(active)} />
            </div>
            <div className="grid grid-cols-3 gap-2">
              {KEYS.map((k) => (
                <Button
                  key={k}
                  variant="outline"
                  className="h-10 sm:h-11 text-lg"
                  disabled={rtc.busy}
                  onClick={() => {
                    if (rtc.call?.state === "active") { rtc.sendDigits(k); return; }
                    setNumber((p) => p + k);
                  }}
                >
                  {k}
                </Button>
              ))}
            </div>
            <div className="flex flex-wrap gap-2">
              <Button onClick={call} disabled={!formatted || active || rtc.busy || rtc.connState !== "ready"}>
                <Phone className="w-4 h-4 mr-2" /> Call
              </Button>
              <Button variant="destructive" onClick={hangup} disabled={!active}>
                <PhoneOff className="w-4 h-4 mr-2" /> End
              </Button>
              <Button variant="outline" onClick={rtc.toggleMute} disabled={!active}>
                {rtc.call?.muted ? <MicOff className="w-4 h-4 mr-2" /> : <Mic className="w-4 h-4 mr-2" />}
                {rtc.call?.muted ? "Unmute" : "Mute"}
              </Button>
              <Button variant="outline" onClick={rtc.toggleHold} disabled={!active}>
                {rtc.call?.state === "held" ? <Play className="w-4 h-4 mr-2" /> : <Pause className="w-4 h-4 mr-2" />}
                {rtc.call?.state === "held" ? "Resume" : "Hold"}
              </Button>
            </div>
          </div>

          {/* Status */}
          <div className="space-y-3">
            <div className="rounded-md border p-3 text-sm">
              <div className="flex items-center justify-between gap-2">
                <Label htmlFor="softphone-speaker" className="text-xs text-muted-foreground">Speaker / audio out</Label>
                <select
                  id="softphone-speaker"
                  className="h-7 max-w-[55%] rounded-md border bg-background px-1 text-xs"
                  value={speakerId}
                  onChange={(e) => setSpeakerId(e.target.value)}
                >
                  <option value="default">Default</option>
                  {outputs.map((d) => (
                    <option key={d.deviceId} value={d.deviceId}>{d.label || "Speaker"}</option>
                  ))}
                </select>
              </div>
              <div className="flex items-center justify-between">
                <span className="font-medium">Status: {STATE_LABEL[rtc.call?.state ?? "idle"]}</span>
                {rtc.call?.state === "active" ? <span className="font-mono">{durationLabel}</span> : null}
              </div>
              <div className="text-xs text-muted-foreground mt-1 truncate">
                {rtc.call?.remoteNumber ? `Calling ${rtc.call.remoteNumber}` : "No active call"}
              </div>
              {rtc.call?.endReason || rtc.call?.sipCode ? (
                <div className="text-xs mt-1 text-destructive">
                  Ended: {rtc.call.endReason || `SIP ${rtc.call.sipCode}`}
                </div>
              ) : null}
            </div>
            <div className="text-xs text-muted-foreground space-y-1">
              <p>• Real WebRTC audio (no click-to-dial phone needed).</p>
              <p>• Keypad sends DTMF during an active call.</p>
              <p>• Requires a Telnyx WebRTC/SIP credential or login token configured in Settings → System.</p>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
