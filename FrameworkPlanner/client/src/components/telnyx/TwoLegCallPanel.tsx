import { useCallback, useEffect, useRef, useState } from "react";
import { Phone } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useTelephonyEvents, type TelephonySessionStateEvent } from "@/hooks/useTelephonyEvents";
import { apiRequest } from "@/lib/queryClient";

type CallMode = "human_first" | "ai_screen" | "ai_screen_handoff";

const MODES: { value: CallMode; label: string; hint: string }[] = [
  { value: "human_first", label: "Human call", hint: "Your phone rings first, then the lead. Both are bridged once the lead answers." },
  { value: "ai_screen", label: "AI screen", hint: "AI calls and screens the lead, auto-dispositions obvious outcomes, and creates a follow-up task." },
  { value: "ai_screen_handoff", label: "AI + handoff", hint: "AI screens; when the lead is qualified or asks for a human, your phone rings and you are bridged in." },
];

const HUMAN_FIRST_LABELS: Record<string, string> = {
  queued: "Preparing call",
  agent_dialing: "Calling you…",
  agent_ringing: "Waiting for you to answer…",
  agent_answered: "You're on — calling lead…",
  lead_dialing: "Calling lead…",
  lead_ringing: "Lead ringing…",
  bridging: "Bridging…",
  connected: "Connected",
  completed: "Call ended",
  failed: "Failed",
  cancelled: "Cancelled",
  validation_failed: "Validation failed",
};

const AI_LABELS: Record<string, string> = {
  queued: "Preparing call",
  lead_dialing: "AI calling lead…",
  lead_ringing: "Lead ringing…",
  ai_screening: "AI screening in progress…",
  handoff_requested: "Qualified — calling you…",
  handoff_agent_dialing: "Calling you for handoff…",
  bridging: "Bridging you in…",
  connected: "Connected — AI stays silent",
  completed: "Finished",
  failed: "Failed",
  cancelled: "Cancelled",
};

const DISPOSITIONS = [
  "connected", "qualified", "qualified_handoff", "callback_requested", "voicemail",
  "no_answer", "busy", "wrong_number_confirmed", "wrong_number_review", "not_interested",
  "do_not_call", "invalid_number", "failed", "abandoned", "agent_unavailable", "bridge_failed",
];

const ACTIVE = new Set([
  "queued", "agent_dialing", "agent_ringing", "agent_answered", "lead_dialing", "lead_ringing",
  "ai_screening", "handoff_requested", "handoff_agent_dialing", "bridging", "connected",
]);

export function TwoLegCallPanel({ leadId }: { leadId?: number | null }) {
  const [features, setFeatures] = useState<{ twoLeg: boolean; aiScreening: boolean; aiHandoff: boolean } | null>(null);
  const [agentPhone, setAgentPhone] = useState("");
  const [agentPhoneDraft, setAgentPhoneDraft] = useState("");
  const [editingPhone, setEditingPhone] = useState(false);
  const [mode, setMode] = useState<CallMode>("human_first");
  const [session, setSession] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [disposition, setDisposition] = useState("");
  const [note, setNote] = useState("");
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useTelephonyEvents({
    onSessionStateChanged: useCallback((evt: TelephonySessionStateEvent) => {
      setSession((prev: any) => {
        if (!prev || Number(evt.sessionId) !== Number(prev.id)) return prev;
        return { ...prev, status: evt.status, finalDisposition: evt.finalDisposition ?? prev.finalDisposition };
      });
    }, []),
  });

  const load = useCallback(async () => {
    try {
      const [fRes, pRes] = await Promise.all([
        apiRequest("GET", "/api/v1/telecom/features"),
        apiRequest("GET", "/api/v1/telecom/agent-phone"),
      ]);
      const f = await fRes.json();
      const p = await pRes.json();
      setFeatures(f);
      setAgentPhone(p.phoneE164 || "");
    } catch {
      // Non-fatal: panel still usable; agent phone will be requested at dial time.
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // Poll the active session every 2s so the UI stays truthful even if the WS drops.
  useEffect(() => {
    if (!session?.id || !ACTIVE.has(session.status)) {
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
      return;
    }
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = setInterval(async () => {
      try {
        const res = await apiRequest("GET", `/api/v1/telecom/call-sessions/${session.id}`);
        const data = await res.json();
        setSession(data.session);
      } catch {
        // transient — next tick will retry
      }
    }, 2000);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [session?.id, session?.status]);

  const active = ACTIVE.has(session?.status);
  const labels = mode === "human_first" ? HUMAN_FIRST_LABELS : AI_LABELS;
  const statusLabel = session ? labels[session.status] || session.status : "Idle";
  const mask = (p: string) => (p ? `${p.slice(0, 4)}•••${p.slice(-3)}` : "");

  const run = async (fn: () => Promise<any>) => {
    setBusy(true);
    setError("");
    try {
      await fn();
    } catch (e: any) {
      setError(String(e?.message || e || "Request failed"));
    } finally {
      setBusy(false);
    }
  };

  const start = () =>
    run(async () => {
      if (!leadId) throw new Error("Select a lead first");
      const res = await apiRequest("POST", "/api/v1/telecom/call-sessions", { leadId, mode });
      const data = await res.json();
      setSession(data.session);
      setDisposition("");
      setNote("");
    });

  const cancel = () =>
    run(async () => {
      const res = await apiRequest("POST", `/api/v1/telecom/call-sessions/${session.id}/cancel`);
      setSession((await res.json()).session);
    });

  const hangup = () =>
    run(async () => {
      const res = await apiRequest("POST", `/api/v1/telecom/call-sessions/${session.id}/hangup`);
      setSession((await res.json()).session);
    });

  const handoff = () =>
    run(async () => {
      const res = await apiRequest("POST", `/api/v1/telecom/call-sessions/${session.id}/request-human-handoff`);
      setSession((await res.json()).session);
    });

  const saveDisposition = () =>
    run(async () => {
      if (!disposition) throw new Error("Choose a disposition");
      const res = await apiRequest("POST", `/api/v1/telecom/call-sessions/${session.id}/disposition`, {
        disposition,
        note: note || undefined,
      });
      setSession((await res.json()).session);
    });

  const saveAgentPhone = () =>
    run(async () => {
      await apiRequest("PUT", "/api/v1/telecom/agent-phone", { phoneE164: agentPhoneDraft, defaultCallMode: mode });
      setAgentPhone(agentPhoneDraft);
      setEditingPhone(false);
    });

  if (features && !features.twoLeg) {
    return (
      <div className="rounded-md border border-dashed p-3 text-sm text-muted-foreground">
        Two-legged click-to-dial is disabled (ENABLE_TWO_LEG_CLICK_TO_DIAL).
      </div>
    );
  }

  return (
    <Card className="mt-3">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm">Two-Leg Call</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="space-y-1">
          <Label className="text-xs">Your phone</Label>
          {editingPhone ? (
            <div className="flex gap-2">
              <Input
                className="h-8"
                value={agentPhoneDraft}
                onChange={(e) => setAgentPhoneDraft(e.target.value)}
                placeholder="+15550000000"
              />
              <Button size="sm" onClick={saveAgentPhone} disabled={busy}>
                Save
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  setEditingPhone(false);
                  setAgentPhoneDraft(agentPhone);
                }}
              >
                Cancel
  
              </Button>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium">{agentPhone ? mask(agentPhone) : "Not set"}</span>
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  setAgentPhoneDraft(agentPhone);
                  setEditingPhone(true);
                }}
              >
                Edit
              </Button>
            </div>
          )}
          <p className="text-xs text-muted-foreground">Required for Human call and AI + handoff modes.</p>
        </div>

        <div className="space-y-1">
          <Label className="text-xs">Call mode</Label>
          <div className="grid grid-cols-3 gap-1">
            {MODES.map((m) => (
              <Button
                key={m.value}
                size="sm"
                variant={mode === m.value ? "default" : "outline"}
                disabled={active}
                onClick={() => setMode(m.value)}
                title={m.hint}
              >
                {m.label}
              </Button>
            ))}
          </div>
          <p className="text-xs text-muted-foreground">{MODES.find((m) => m.value === mode)?.hint}</p>
        </div>

        <div className="flex items-center justify-between rounded-md border p-2">
          <div className="text-sm">
            <span className="font-medium">{statusLabel}</span>
            {session?.finalDisposition ? (
              <span className="text-muted-foreground"> • {session.finalDisposition}</span>
            ) : null}
          </div>
          <Badge variant={active ? "default" : "secondary"}>
            {active ? "Live" : session ? "Done" : "Idle"}
          </Badge>
        </div>

        {error ? <div className="text-xs text-destructive">{error}</div> : null}

        <div className="flex flex-wrap gap-2">
          <Button size="sm" onClick={start} disabled={busy || active || !leadId}>
            <Phone className="w-4 h-4 mr-2" />
            Call
          </Button>
          {active && session?.status !== "connected" ? (
            <Button size="sm" variant="secondary" onClick={cancel} disabled={busy}>
              Cancel
            </Button>
          ) : null}
          {session?.status === "ai_screening" ? (
            <Button size="sm" onClick={handoff} disabled={busy}>
              Request human
            </Button>
          ) : null}
          {active && session?.status === "connected" ? (
            <Button size="sm" variant="destructive" onClick={hangup} disabled={busy}>
              Hang up
            </Button>
          ) : null}
        </div>

        {session ? (
          <div className="space-y-2 border-t pt-2">
            <Label className="text-xs">Disposition</Label>
            <div className="flex gap-2">
              <select
                className="h-8 flex-1 rounded-md border bg-background px-2 text-sm"
                value={disposition}
                onChange={(e) => setDisposition(e.target.value)}
              >
                <option value="">— select —</option>
                {DISPOSITIONS.map((d) => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
              </select>
              <Button size="sm" onClick={saveDisposition} disabled={busy || !disposition}>
                Save
              </Button>
            </div>
            <Input
              className="h-8"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Note (optional)"
            />
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
