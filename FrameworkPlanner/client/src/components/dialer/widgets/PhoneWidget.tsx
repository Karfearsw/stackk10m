import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Phone, Bot, PhoneForwarded, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { CallBar } from "@/components/telephony/CallBar";
import { TelnyxHealthStatus } from "@/components/telephony/TelnyxHealthStatus";
import { TwoLegCallPanel } from "@/components/telnyx/TwoLegCallPanel";
import { useDialerWorkspace } from "./DialerWorkspaceContext";
import { DIALER_KEYS } from "./dialerUtils";

/**
 * PhoneWidget — dialpad + the unified <CallBar/> + two-leg panel.
 *
 * The old inline mute/hold/keypad/hangup controls are gone: the single shared
 * CallBar drives the same handlers (toggleMute/toggleHold/handleHangup/DTMF),
 * so call UX is identical to the /phone softphone. Dialing still flows through
 * startOutboundCall → the server-side DNC gates; the bar itself never dials.
 */
export function PhoneWidget() {
  const {
    telnyxHealth, healthLoading, healthRefetch, telnyxError,
    number, setNumber,
    session, SESSION_LABELS, status, elapsedMs, sessionError,
    aiAssistantActive, sessionAiActive,
    recordCall, setRecordCall, sessionBusy,
    formatted, activeItem, initial,
    activeCall, sessionActive,
    toggleMute, toggleSessionMute, toggleHold, toggleSessionHold,
    sessionMuted, sessionHeld,
    transferOpen, setTransferOpen, transferNumber, setTransferNumber, transferBusy, setTransferBusy,
    transferCall, transferSession,
    aiAssistantBusy, setAiAssistantBusy, startAiAssistant, stopAiAssistant, toggleSessionAi,
    autoAiAssistant,
    next, powerMode, setPowerMode,
    sendSessionDtmf, sendDigits,
    incomingCall, answerIncoming, rejectIncoming,
    lead,
    handleCall, handleHangup,
    state, callId, logSaved, saveLogPending, buyerMode,
  } = useDialerWorkspace();

  const showCallControls = Boolean(activeCall || sessionActive);

  return (
    <div className="h-full overflow-auto rounded-lg border border-border bg-card">
      <div className="dialer-widget-drag-handle flex cursor-move items-center justify-between border-b border-border px-3 py-2">
        <span className="text-sm font-semibold">Phone</span>
      </div>
      <div className="space-y-3 p-3">
        <div className="space-y-1 text-sm text-muted-foreground">
          <TelnyxHealthStatus health={telnyxHealth?.telnyx} loading={healthLoading} onRetry={() => healthRefetch()} />
          {telnyxError ? <div className="text-xs text-destructive"> • {telnyxError}</div> : null}
        </div>

        <div className="space-y-2">
          <Label htmlFor="dialer-number">Phone Number</Label>
          <Input id="dialer-number" value={number} onChange={(e) => setNumber(e.target.value)} placeholder="Enter number" />
          <div className="grid grid-cols-3 gap-2" role="group" aria-label="Dialer keypad">
            {DIALER_KEYS.map((k) => (
              <Button key={k} variant="outline" className="h-10 sm:h-12 text-lg sm:text-xl" onClick={() => { if (sessionActive) { void sendSessionDtmf(k); } else { setNumber((prev) => prev + k); } }} aria-label={sessionActive ? `Send ${k}` : `Key ${k}`}>
                {k}
              </Button>
            ))}
          </div>
        </div>

        <CallBar
          call={activeCall}
          session={session ? { status: session.status, muted: sessionMuted, held: sessionHeld, remoteNumber: number } : null}
          incoming={incomingCall ? { remoteNumber: incomingCall.remoteNumber, onAnswer: answerIncoming, onDecline: rejectIncoming } : null}
          contactName={lead?.ownerName || activeItem?.ownerName || undefined}
          displayNumber={formatted || number}
          statusText={session ? SESSION_LABELS[session.status] || session.status : undefined}
          elapsedMs={elapsedMs}
          onMute={activeCall ? toggleMute : toggleSessionMute}
          onHold={activeCall ? toggleHold : toggleSessionHold}
          onHangup={handleHangup}
          onDTMF={(d) => {
            if (sessionActive) void sendSessionDtmf(d);
            else if (activeCall) sendDigits(d);
            else setNumber((prev) => prev + d);
          }}
          extraControls={showCallControls ? (
            <>
              <Button variant="outline" size="sm" onClick={() => setTransferOpen((v) => !v)} disabled={transferBusy}>
                <PhoneForwarded className="w-4 h-4 mr-2" />
                Transfer
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  if (aiAssistantBusy) return;
                  setAiAssistantBusy(true);
                  if (activeCall) {
                    if (aiAssistantActive) {
                      stopAiAssistant().finally(() => setAiAssistantBusy(false));
                    } else {
                      startAiAssistant()
                        .catch((e: any) => toast.error(e?.message || "Failed to start AI Screener"))
                        .finally(() => setAiAssistantBusy(false));
                    }
                  } else {
                    toggleSessionAi().finally(() => setAiAssistantBusy(false));
                  }
                }}
                disabled={aiAssistantBusy}
              >
                <Bot className="w-4 h-4 mr-2" />
                {(aiAssistantActive || sessionAiActive) ? "Stop AI Screener" : "Start AI Screener"}
              </Button>
            </>
          ) : undefined}
        />
        {transferOpen && showCallControls && (
          <div className="flex items-center gap-2 w-full">
            <Input
              value={transferNumber}
              onChange={(e) => setTransferNumber(e.target.value)}
              placeholder="Destination number (E.164, e.g. +13215550123)"
              className="font-mono text-sm"
              aria-label="Transfer destination number"
            />
            <Button
              variant="secondary"
              disabled={transferBusy || !transferNumber.trim()}
              onClick={async () => {
                setTransferBusy(true);
                try {
                  await (activeCall ? transferCall(transferNumber.trim()) : transferSession(transferNumber.trim()));
                  toast.success("Call transferred");
                  setTransferOpen(false);
                  setTransferNumber("");
                } catch (e: any) {
                  toast.error(e?.message || "Transfer failed");
                } finally {
                  setTransferBusy(false);
                }
              }}
            >
              {transferBusy ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <PhoneForwarded className="w-4 h-4 mr-1" />}
              Confirm
            </Button>
          </div>
        )}

        <div className="flex flex-wrap gap-2">
          <label className="flex items-center gap-1.5 text-xs text-muted-foreground" title="Record this call (account master switch must be on; consent beep plays)">
            <input
              type="checkbox"
              className="accent-primary"
              checked={recordCall}
              disabled={sessionBusy || status === "dialing" || status === "ringing" || status === "connected"}
              onChange={(e) => setRecordCall(e.target.checked)}
            />
            Record
          </label>
          <Button
            onClick={handleCall}
            disabled={(!formatted && !(activeItem?.leadId ?? initial.leadId)) || status === "dialing" || status === "ringing" || status === "connected" || sessionBusy}
          >
            <Phone className="w-4 h-4 mr-2" />
            {sessionBusy ? "Starting…" : "Call"}
          </Button>
          <Button variant="outline" onClick={next} disabled={!state.queue.length || (callId && !logSaved) || saveLogPending}>
            Next Lead
          </Button>
        </div>

        <div className="flex items-center justify-between rounded-md border border-border p-3">
          <div className="space-y-1">
            <div className="text-sm font-medium">Power Dialer</div>
            <div className="text-xs text-muted-foreground">Auto-advance after saving log</div>
          </div>
          <Switch checked={powerMode} onCheckedChange={setPowerMode} />
        </div>

        <div className="flex items-center justify-between rounded-md border border-border p-3">
          <div className="space-y-1">
            <div className="text-sm font-medium">AI Screener</div>
            <div className="text-xs text-muted-foreground">
              {autoAiAssistant
                ? "On (set in Settings → System) — auto-starts on answered calls"
                : "Off (set in Settings → System)"}
            </div>
          </div>
          <div className="flex items-center gap-2" data-testid="ai-screener-state">
            <Switch checked={autoAiAssistant} disabled title="Managed in Settings → System" />
            <a href="/settings?tab=system" className="text-xs text-primary underline underline-offset-2">Configure</a>
          </div>
        </div>

        {(aiAssistantActive || sessionAiActive || sessionError) ? (
          <div className="text-sm text-muted-foreground">
            {(aiAssistantActive || sessionAiActive) ? <span className="text-primary">AI Screener on</span> : null}
            {sessionError ? <span className="block text-xs text-destructive">{sessionError}</span> : null}
          </div>
        ) : null}

        {buyerMode ? null : <TwoLegCallPanel leadId={activeItem?.leadId} />}
      </div>
    </div>
  );
}
