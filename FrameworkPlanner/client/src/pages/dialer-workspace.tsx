import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Layout } from "@/components/layout/Layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Phone, PhoneOff, Mic, MicOff, Pause, Play, Bot, PhoneForwarded, Loader2 } from "lucide-react";
import { DialerProvider, useDialer } from "@/contexts/DialerContext";
import { useSignalWire } from "@/hooks/useSignalWire";
import { useCallAudio } from "@/hooks/useCallAudio";
import { TwoLegCallPanel } from "@/components/telnyx/TwoLegCallPanel";
import { Softphone } from "@/components/telnyx/Softphone";
import { useTelephonyEvents } from "@/hooks/useTelephonyEvents";
import { TelnyxHealthStatus } from "@/components/telephony/TelnyxHealthStatus";
import { EntityActivity } from "@/components/activity/EntityActivity";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { toast } from "sonner";
import type { DialerQueueItem } from "@/lib/dialerTypes";

function formatE164(raw: string) {
  const digits = raw.replace(/[^\d+]/g, "");
  if (digits.startsWith("+")) return digits;
  if (digits.length === 10) return "+1" + digits;
  return digits;
}

function renderDialerScript(template: string, lead: any, fallback: any) {
  const ownerName = String(lead?.ownerName || fallback?.ownerName || "").trim();
  const parts = ownerName.split(/\s+/).filter(Boolean);
  const firstName = parts[0] || "";
  const lastName = parts.length > 1 ? parts.slice(1).join(" ") : "";
  const values: Record<string, string> = {
    ownerName,
    firstName,
    lastName,
    address: String(lead?.address || fallback?.address || ""),
    city: String(lead?.city || fallback?.city || ""),
    state: String(lead?.state || fallback?.state || ""),
    phone: String(lead?.ownerPhone || fallback?.ownerPhone || ""),
  };

  return String(template || "").replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_m, key) => {
    const k = String(key || "");
    return typeof values[k] === "string" ? values[k] : "";
  });
}

const KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "*", "0", "#"];

function DialerWorkspaceInner() {
  const { state, activeItem, setListId, setQueue, setActiveIndex, next } = useDialer();
  const {
    error: telnyxError,
    lastError,
    call: activeCall,
    callControlId,
    makeCall,
    endCall,
    updateCallState,
    toggleMute,
    toggleHold,
    transferCall,
    aiAssistantActive,
    startAiAssistant,
    stopAiAssistant,
  } = useSignalWire();
  const { connected: telephonyWsConnected } = useTelephonyEvents({
    enabled: true,
    onCallStateChanged: (evt) => {
      if (evt.callControlId && callControlId && evt.callControlId !== callControlId) return;
      if (evt.state) updateCallState(evt.state);
    },
    onSessionStateChanged: useCallback((evt: any) => {
      setSession((prev: any) => {
        if (!prev || Number(evt.sessionId) !== Number(prev.id)) return prev;
        return { ...prev, status: evt.status, finalDisposition: evt.finalDisposition ?? prev.finalDisposition };
      });
      const legacy = sessionStatusToLegacy(evt.status);
      setStatus(legacy);
      // start the call timer when the two-leg session actually connects
      if (evt.status === 'connected') setStartTs((prev) => prev ?? Date.now());
      if (legacy === 'ended' || legacy === 'failed') setStartTs(null);
    }, []),
  });
  const queryClient = useQueryClient();

  const { startRingback, stopRingback, playConnectTone } = useCallAudio();
  const [number, setNumber] = useState("");
  const [status, setStatus] = useState<"idle" | "dialing" | "ringing" | "connected" | "ended" | "failed">("idle");
  const [startTs, setStartTs] = useState<number | null>(null);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [queueLoading, setQueueLoading] = useState(false);
  const [callId, setCallId] = useState<number | null>(null);
  const wasConnectedRef = useRef(false);
  const callFailedRef = useRef(false);
  const lastPatchedStatusRef = useRef<string | null>(null);

  const [smsBody, setSmsBody] = useState("");
  const [disposition, setDisposition] = useState<string>("");
  const [note, setNote] = useState("");
  const [followUpAt, setFollowUpAt] = useState<string>("");
  const [tagInput, setTagInput] = useState("");
  const [powerMode, setPowerMode] = useState(false);
  const [autoAiAssistant, setAutoAiAssistant] = useState(false);
  const [aiAssistantBusy, setAiAssistantBusy] = useState(false);
  const [transferOpen, setTransferOpen] = useState(false);
  const [transferNumber, setTransferNumber] = useState("");
  const [transferBusy, setTransferBusy] = useState(false);
  const aiAutoStartedRef = useRef(false);
  const [saveLogPending, setSaveLogPending] = useState(false);
  const [logSaved, setLogSaved] = useState(false);
  const [session, setSession] = useState<any>(null);
  const [sessionBusy, setSessionBusy] = useState(false);
  const [sessionError, setSessionError] = useState("");
  const [sessionMuted, setSessionMuted] = useState(false);
  const [sessionHeld, setSessionHeld] = useState(false);
  const [sessionAiActive, setSessionAiActive] = useState(false);
  const [softphoneOpen, setSoftphoneOpen] = useState(false);

  const [scriptId, setScriptId] = useState<number | null>(null);
  const [scriptName, setScriptName] = useState("");
  const [scriptContent, setScriptContent] = useState("");
  const [scriptIsDefault, setScriptIsDefault] = useState(false);
  const [scriptSaving, setScriptSaving] = useState(false);

  const SESSION_LABELS: Record<string, string> = {
    queued: "Preparing call", agent_dialing: "Calling you…", agent_ringing: "Waiting for you to answer…",
    agent_answered: "You're on — calling lead…", lead_dialing: "Calling lead…", lead_ringing: "Lead ringing…",
    bridging: "Bridging…", connected: "Connected", completed: "Call ended", failed: "Failed",
    cancelled: "Cancelled", validation_failed: "Validation failed",
  };
  const ACTIVE_SESSION = new Set(["queued", "agent_dialing", "agent_ringing", "agent_answered", "lead_dialing", "lead_ringing", "bridging", "connected"]);
  const sessionStatusToLegacy = (s: string): "idle" | "dialing" | "ringing" | "connected" | "ended" | "failed" => {
    if (s === "connected") return "connected";
    if (s === "failed") return "failed";
    if (s === "completed" || s === "cancelled" || s === "validation_failed") return "ended";
    return "dialing";
  };

  const initial = useMemo(() => {
    if (typeof window === "undefined") return { leadId: null as number | null, propertyId: null as number | null, number: "" };
    const params = new URLSearchParams(window.location.search);
    const leadIdRaw = params.get("leadId");
    const propertyIdRaw = params.get("propertyId") || params.get("opportunityId");
    const n = params.get("number") || params.get("to") || "";
    const leadId = leadIdRaw ? parseInt(leadIdRaw, 10) : NaN;
    const propertyId = propertyIdRaw ? parseInt(propertyIdRaw, 10) : NaN;
    return {
      leadId: Number.isFinite(leadId) && leadId > 0 ? leadId : null,
      propertyId: Number.isFinite(propertyId) && propertyId > 0 ? propertyId : null,
      number: n,
    };
  }, []);

  useEffect(() => {
    if (initial.number) setNumber(initial.number);
  }, [initial.number]);

  useEffect(() => {
    if (!initial.leadId) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await apiRequest("GET", `/api/leads/${initial.leadId}`);
        const json = await res.json();
        if (cancelled) return;
        const lead = json?.lead || json;
        const item: DialerQueueItem = {
          leadId: Number(lead?.id || initial.leadId),
          ownerName: String(lead?.ownerName || ""),
          ownerPhone: String(lead?.ownerPhone || ""),
          address: String(lead?.address || ""),
          city: String(lead?.city || ""),
          state: String(lead?.state || ""),
          status: lead?.status ?? null,
          nextFollowUpAt: lead?.nextFollowUpAt ? new Date(lead.nextFollowUpAt).toISOString() : null,
          lastCallAt: null,
        };
        setQueue([item]);
        setActiveIndex(0);
        if (!initial.number && item.ownerPhone) setNumber(item.ownerPhone);
      } catch {}
    })();
    return () => {
      cancelled = true;
    };
  }, [initial.leadId, initial.number, setActiveIndex, setQueue]);

  useEffect(() => {
    if (activeItem?.ownerPhone) setNumber(activeItem.ownerPhone);
  }, [activeItem?.ownerPhone]);

  useEffect(() => {
    setSmsBody("");
    setDisposition("");
    setNote("");
    setFollowUpAt("");
    setTagInput("");
    setCallId(null);
    setStatus("idle");
    setStartTs(null);
    setElapsedMs(0);
    setLogSaved(false);
    setSession(null);
    setSessionError("");
    setSessionMuted(false);
    setSessionHeld(false);
    setSessionAiActive(false);
    wasConnectedRef.current = false;
    lastPatchedStatusRef.current = null;
    aiAutoStartedRef.current = false;
  }, [activeItem?.leadId]);

  const wrapUpValid = Boolean(disposition) && (disposition !== "call_back" || Boolean(followUpAt));

  const { data: lead } = useQuery<any>({
    queryKey: activeItem?.leadId ? [`/api/leads/${activeItem.leadId}`] : ["lead-none"],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/leads/${activeItem?.leadId}`);
      return res.json();
    },
    enabled: Boolean(activeItem?.leadId),
  });

  const { data: telnyxHealth, isLoading: healthLoading, refetch: healthRefetch } = useQuery({
    queryKey: ["/api/telephony/health"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/telephony/health");
      return await res.json();
    },
    refetchInterval: 30000,
    retry: 1,
  });

  const { data: scriptsData } = useQuery<any>({
    queryKey: ["/api/dialer/scripts", state.listId],
    queryFn: async () => {
      const qs = new URLSearchParams({ listId: state.listId });
      const res = await apiRequest("GET", `/api/dialer/scripts?${qs.toString()}`);
      return res.json();
    },
    enabled: Boolean(state.listId),
  });

  const scripts = Array.isArray(scriptsData?.items) ? scriptsData.items : [];

  useEffect(() => {
    const current = typeof scriptId === "number" ? scripts.find((s: any) => s?.id === scriptId) : null;
    if (current) {
      setScriptName(String(current.name || ""));
      setScriptContent(String(current.content || ""));
      setScriptIsDefault(Boolean(current.isDefault));
      return;
    }

    const picked = scripts.find((s: any) => Boolean(s?.isDefault)) || scripts[0];
    if (picked?.id) {
      setScriptId(Number(picked.id));
      setScriptName(String(picked.name || ""));
      setScriptContent(String(picked.content || ""));
      setScriptIsDefault(Boolean(picked.isDefault));
      return;
    }

    setScriptId(null);
    setScriptName("");
    setScriptContent("");
    setScriptIsDefault(false);
  }, [scriptId, scripts, state.listId]);

  const patchLead = useMutation({
    mutationFn: async (patch: any) => {
      if (!activeItem?.leadId) throw new Error("Missing leadId");
      const res = await apiRequest("PATCH", `/api/leads/${activeItem.leadId}`, patch);
      return await res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/leads/${activeItem?.leadId}`] });
      queryClient.invalidateQueries({ queryKey: ["/api/activity"] });
    },
  });


  const prevAudioStatus = useRef<string | null>(null);
  useEffect(() => {
    if (status === prevAudioStatus.current) return;
    prevAudioStatus.current = status;
    if (status === "dialing" || status === "ringing") {
      startRingback();
    } else if (status === "connected") {
      stopRingback();
      playConnectTone();
    } else if (status === "ended" || status === "failed" || status === "idle") {
      stopRingback();
    }
  }, [status, startRingback, stopRingback, playConnectTone]);

  const patchCallLog = async (id: number, patch: any) => {
    const res = await apiRequest("PATCH", `/api/telephony/calls/${id}`, patch);
    return await res.json();
  };

  const formatted = useMemo(() => formatE164(number), [number]);

  const startOutboundCall = useCallback(async () => {
    const effectiveLeadId = activeItem?.leadId ?? initial.leadId;
    if (effectiveLeadId) {
      // Two-legged click-to-dial: ring the agent's configured phone first, then
      // dial the lead only after the agent answers, then bridge both legs.
      // The session state machine is driven by signed Telnyx webhook events.
      setSessionBusy(true);
      setSessionError("");
      try {
        const res = await apiRequest("POST", "/api/v1/telecom/call-sessions", {
          leadId: effectiveLeadId,
          mode: "human_first",
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Failed to start call");
        setSession(data.session);
        setStatus(sessionStatusToLegacy(data.session.status));
        setCallId(null);
        setStartTs(null);
      } catch (e: any) {
        const msg = String(e?.message || e || "Failed to start call");
        setSessionError(msg);
        setStatus("failed");
        setCallId(null);
        setStartTs(null);
      } finally {
        setSessionBusy(false);
      }
      return;
    }
    if (!formatted) return;
    const data = await makeCall(formatted, {
      metadata: { propertyId: initial.propertyId || undefined },
    });
    setCallId(data.callLogId);
    setStatus("dialing");
    setStartTs(Date.now());
    wasConnectedRef.current = false;
    callFailedRef.current = false;
    lastPatchedStatusRef.current = "dialing";
  }, [activeItem?.leadId, formatted, initial.leadId, initial.propertyId, lastPatchedStatusRef, makeCall]);

  // Session controls (two-leg). Mute/hold/transfer run against the agent leg;
  // the AI Screener runs against the lead leg so it talks to the lead.
  const sessionLeg = session?.agentLegCallControlId || null;
  const sessionLeadLeg = session?.leadLegCallControlId || null;
  const sessionActive = Boolean(session && ACTIVE_SESSION.has(session.status));

  const toggleSessionMute = async () => {
    if (!sessionLeg) return;
    const target = !sessionMuted;
    try {
      await apiRequest("POST", `/api/telephony/outbound/${encodeURIComponent(sessionLeg)}/mute`, { muted: target });
      setSessionMuted(target);
    } catch (e: any) {
      toast.error(String(e?.message || e || "Mute failed"));
    }
  };

  const toggleSessionHold = async () => {
    if (!sessionLeg) return;
    const action = sessionHeld ? "unhold" : "hold";
    try {
      await apiRequest("POST", `/api/telephony/outbound/${encodeURIComponent(sessionLeg)}/hold`, { action });
      setSessionHeld(!sessionHeld);
    } catch (e: any) {
      toast.error(String(e?.message || e || "Hold failed"));
    }
  };

  const transferSession = async (to: string) => {
    if (!sessionLeg) throw new Error("No active call leg");
    await apiRequest("POST", `/api/telephony/outbound/${encodeURIComponent(sessionLeg)}/transfer`, { to });
  };

  const toggleSessionAi = async () => {
    if (!sessionLeadLeg) return;
    if (sessionAiActive) {
      try {
        await apiRequest("POST", `/api/telephony/outbound/${encodeURIComponent(sessionLeadLeg)}/ai-assistant`, { action: "stop" });
        setSessionAiActive(false);
      } catch (e: any) {
        toast.error(String(e?.message || e || "Failed to stop AI Screener"));
      }
      return;
    }
    try {
      const res = await apiRequest("POST", `/api/telephony/outbound/${encodeURIComponent(sessionLeadLeg)}/ai-assistant`, { action: "start", assistantId: null });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Failed to start AI Screener");
      setSessionAiActive(true);
    } catch (e: any) {
      toast.error(String(e?.message || e || "Failed to start AI Screener"));
    }
  };

  // Poll the active session so the UI stays truthful even if the WS drops.
  useEffect(() => {
    if (!session?.id || !ACTIVE_SESSION.has(session.status)) return;
    const handle = setInterval(async () => {
      try {
        const res = await apiRequest("GET", `/api/v1/telecom/call-sessions/${session.id}`);
        const data = await res.json();
        if (data?.session) {
          setSession(data.session);
          const legacy = sessionStatusToLegacy(data.session.status);
          setStatus(legacy);
          if (data.session.status === 'connected') setStartTs((prev) => prev ?? Date.now());
          if (legacy === 'ended' || legacy === 'failed') setStartTs(null);
        }
      } catch { /* transient — next tick retries */ }
    }, 2000);
    return () => clearInterval(handle);
  }, [session?.id, session?.status]);

  const sendSms = useMutation({
    mutationFn: async () => {
      const effectiveLeadId = activeItem?.leadId ?? initial.leadId;
      if (!effectiveLeadId) throw new Error("Select a lead");
      const to = formatE164(String(activeItem?.ownerPhone || number || ""));
      if (!to) throw new Error("Missing phone number");
      if (!smsBody.trim()) throw new Error("Message body is required");
      const res = await apiRequest("POST", "/api/telephony/sms", {
        to,
        body: smsBody,
        metadata: { leadId: effectiveLeadId, propertyId: initial.propertyId || undefined },
      });
      return await res.json();
    },
    onSuccess: () => {
      setSmsBody("");
      queryClient.invalidateQueries({ queryKey: ["/api/activity"] });
    },
    onError: (e: any) => {
      toast.error(e?.message || "Failed to send SMS");
    },
  });

  useEffect(() => {
    if (status !== "connected" || !startTs) return;
    setElapsedMs(Date.now() - startTs);
    const handle = setInterval(() => setElapsedMs(Date.now() - startTs), 250);
    return () => clearInterval(handle);
  }, [status, startTs]);

  // Opt-in: auto-start the AI Screener when the call is answered.
  useEffect(() => {
    if (!autoAiAssistant) return;
    if (activeCall?.state !== "active") return;
    if (aiAssistantActive || aiAssistantBusy || aiAutoStartedRef.current) return;
    if (!callControlId) return;
    aiAutoStartedRef.current = true;
    setAiAssistantBusy(true);
    startAiAssistant()
      .catch((e: any) => {
        console.error("Auto-start AI Screener failed:", e);
        toast.error(e?.message || "Failed to auto-start AI Screener");
      })
      .finally(() => setAiAssistantBusy(false));
  }, [autoAiAssistant, activeCall?.state, aiAssistantActive, aiAssistantBusy, callControlId, startAiAssistant]);

  useEffect(() => {
    if (!activeCall) return;
    if (activeCall.state === "ringing") setStatus("ringing");
    if (activeCall.state === "active") {
      setStatus("connected");
      if (!startTs) setStartTs(Date.now());
    }
    if (activeCall.state === "finished") setStatus("ended");
    if (activeCall.state === "held") setStatus("connected");
    if (activeCall.state === "failed") {
      callFailedRef.current = true;
      setStatus("failed");
    }
    if (!callId) return;

    const durationMs = startTs ? Date.now() - startTs : 0;

    if (activeCall.state === "ringing" && lastPatchedStatusRef.current !== "ringing") {
      lastPatchedStatusRef.current = "ringing";
      patchCallLog(callId, { status: "ringing" }).then(() => {
        queryClient.invalidateQueries({ queryKey: ["/api/activity"] });
      }).catch(() => {});
      return;
    }

    if (activeCall.state === "active") {
      wasConnectedRef.current = true;
      if (lastPatchedStatusRef.current !== "answered") {
        lastPatchedStatusRef.current = "answered";
        patchCallLog(callId, { status: "answered" }).then(() => {
          queryClient.invalidateQueries({ queryKey: ["/api/activity"] });
        }).catch(() => {});
      }
      return;
    }

    if (activeCall.state === "failed" && lastPatchedStatusRef.current !== "failed") {
      callFailedRef.current = true;
      lastPatchedStatusRef.current = "failed";
      patchCallLog(callId, { status: "failed", errorMessage: lastError || "Call failed", endedAt: new Date().toISOString(), durationMs }).then(() => {
        queryClient.invalidateQueries({ queryKey: ["/api/activity"] });
      }).catch(() => {});
      return;
    }

    if (activeCall.state === "finished") {
      const finalStatus = callFailedRef.current ? "failed" : wasConnectedRef.current ? "answered" : "missed";
      if (lastPatchedStatusRef.current !== finalStatus) {
        lastPatchedStatusRef.current = finalStatus;
        patchCallLog(callId, { status: finalStatus, endedAt: new Date().toISOString(), durationMs }).then(() => {
          queryClient.invalidateQueries({ queryKey: ["/api/activity"] });
        }).catch(() => {});
      }
    }
  }, [activeCall?.state, callId, lastError, queryClient, startTs]);

  useEffect(() => {
    if (!callId) return;
    if (activeCall) return;
    if (status === "idle" || status === "ended" || status === "failed") return;

    const durationMs = startTs ? Date.now() - startTs : 0;
    const finalStatus = callFailedRef.current ? "failed" : wasConnectedRef.current ? "answered" : "missed";
    if (lastPatchedStatusRef.current !== finalStatus) {
      lastPatchedStatusRef.current = finalStatus;
      patchCallLog(callId, { status: finalStatus, endedAt: new Date().toISOString(), durationMs }).then(() => {
        queryClient.invalidateQueries({ queryKey: ["/api/activity"] });
      }).catch(() => {});
    }
  }, [activeCall, callId, queryClient, startTs, status]);


  return (
    <Layout>
      <div className="mb-3 flex items-center gap-2 flex-wrap">
        <Button
          size="sm"
          variant={softphoneOpen ? "default" : "outline"}
          onClick={() => setSoftphoneOpen((v) => !v)}
        >
          <Phone className="w-4 h-4 mr-2" />
          {softphoneOpen ? "Browser Softphone On" : "Browser Softphone"}
        </Button>
        <span className="text-xs text-muted-foreground">Click to call real numbers from this browser with WebRTC audio (no phone needed).</span>
      </div>
      {softphoneOpen ? (
        <Softphone />
      ) : (
      <div className="grid gap-4 min-w-0 grid-cols-1 lg:grid-cols-[280px_minmax(0,1fr)] xl:grid-cols-[320px_minmax(0,1fr)_420px]">
        <Card>
          <CardHeader>
            <CardTitle>Queue</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex flex-wrap gap-2">
              <Button variant={state.listId === "new" ? "default" : "outline"} onClick={() => setListId("new")}>
                New
              </Button>
              <Button
                variant={state.listId === "followups_due" ? "default" : "outline"}
                onClick={() => setListId("followups_due")}
              >
                Follow-ups
              </Button>
              <Button variant={state.listId === "all_callable" ? "default" : "outline"} onClick={() => setListId("all_callable")}>
                All
              </Button>
            </div>

            <div className="flex flex-wrap gap-2">
              <Button
                variant="secondary"
                onClick={async () => {
                  try {
                    setQueueLoading(true);
                    const qs = new URLSearchParams({ listId: state.listId, limit: "50" });
                     const res = await apiRequest("GET", `/api/dialer/queue?${qs.toString()}`);
                     const data = await res.json();
                    setQueue(Array.isArray(data.items) ? data.items : []);
                  } finally {
                    setQueueLoading(false);
                  }
                }}
              >
                {queueLoading ? "Loading…" : "Start Session"}
              </Button>
              <Button
                variant="outline"
                onClick={next}
                disabled={
                  !state.queue.length ||
                  status === "dialing" ||
                  status === "ringing" ||
                  status === "connected" ||
                  (callId && !logSaved) ||
                  saveLogPending
                }
              >
                Next
              </Button>
            </div>

            <ScrollArea className="max-h-[40vh] sm:max-h-[50vh] lg:max-h-[60vh] min-h-[10rem] border rounded-md p-2">
              {!state.queue.length ? (
                <div className="text-sm text-muted-foreground">No queue loaded</div>
              ) : (
                <div className="space-y-2">
                  {state.queue.map((item, idx) => {
                    const isActive = idx === state.activeIndex;
                    return (
                      <button
                        key={item.leadId}
                        className={`w-full text-left rounded-md border p-2 ${isActive ? "border-primary bg-primary/10" : "border-border hover:bg-muted/40"}`}
                        onClick={() => setActiveIndex(idx)}
                      >
                        <div className="text-sm font-medium truncate">{item.ownerName}</div>
                        <div className="text-xs text-muted-foreground truncate">{item.address}</div>
                        <div className="text-xs text-muted-foreground truncate">{item.ownerPhone}</div>
                      </button>
                    );
                  })}
                </div>
              )}
            </ScrollArea>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Phone</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="text-sm text-muted-foreground space-y-1">
              <TelnyxHealthStatus health={telnyxHealth?.telnyx} loading={healthLoading} onRetry={() => healthRefetch()} />
              {telnyxError ? <div className="text-xs text-destructive"> • {telnyxError}</div> : null}
            </div>

            <div className="space-y-2">
              <Label htmlFor="dialer-number">Phone Number</Label>
              <Input id="dialer-number" value={number} onChange={(e) => setNumber(e.target.value)} placeholder="Enter number" />
              <div className="grid grid-cols-3 gap-2" role="group" aria-label="Dialer keypad">
                {KEYS.map((k) => (
                  <Button key={k} variant="outline" className="h-10 sm:h-12 text-lg sm:text-xl" onClick={() => setNumber((prev) => prev + k)} aria-label={`Key ${k}`}>
                    {k}
                  </Button>
                ))}
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              <Button
                onClick={async () => {
                  try {
                    await startOutboundCall();
                  } catch {
                    setStatus("failed");
                    setCallId(null);
                    setStartTs(null);
                  }
                }}
                disabled={(!formatted && !(activeItem?.leadId ?? initial.leadId)) || status === "dialing" || status === "ringing" || status === "connected" || sessionBusy}
              >
                <Phone className="w-4 h-4 mr-2" />
                {sessionBusy ? "Starting…" : "Call"}
              </Button>
              <Button
                variant="destructive"
                onClick={async () => {
                  if (session) {
                    setSessionBusy(true);
                    try {
                      const res = await apiRequest("POST", `/api/v1/telecom/call-sessions/${session.id}/hangup`);
                      const data = await res.json();
                      setSession(data?.session);
                      setStatus("ended");
                    } catch (e: any) {
                      toast.error(e?.message || "Failed to end call");
                    } finally {
                      setSessionBusy(false);
                    }
                    return;
                  }
                  const id = callId;
                  const durationMs = startTs ? Date.now() - startTs : 0;
                  const finalStatus = callFailedRef.current ? "failed" : wasConnectedRef.current ? "answered" : "missed";

                  try {
                    await endCall();
                  } catch {}

                  if (id) {
                    try {
                      await patchCallLog(id, {
                        status: finalStatus,
                        durationMs,
                        disposition: disposition || null,
                        note: note || null,
                        followUpAt: followUpAt ? new Date(followUpAt).toISOString() : null,
                      });
                    } catch {}
                  }
                  if (id && wrapUpValid) setLogSaved(true);

                  setStatus("ended");
                }}
                disabled={(!activeCall && !session) || sessionBusy}
              >
                <PhoneOff className="w-4 h-4 mr-2" />
                End
              </Button>
              {(activeCall || sessionActive) ? (
                <>
                  <Button variant="outline" onClick={activeCall ? toggleMute : toggleSessionMute}>
                    {(activeCall ? activeCall.muted : sessionMuted) ? <MicOff className="w-4 h-4 mr-2" /> : <Mic className="w-4 h-4 mr-2" />}
                    {(activeCall ? activeCall.muted : sessionMuted) ? "Unmute" : "Mute"}
                  </Button>
                  <Button variant="outline" onClick={activeCall ? toggleHold : toggleSessionHold}>
                    {(activeCall ? activeCall.state === "held" : sessionHeld) ? <Play className="w-4 h-4 mr-2" /> : <Pause className="w-4 h-4 mr-2" />}
                    {(activeCall ? activeCall.state === "held" : sessionHeld) ? "Resume" : "Hold"}
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => setTransferOpen((v) => !v)}
                    disabled={transferBusy}
                  >
                    <PhoneForwarded className="w-4 h-4 mr-2" />
                    Transfer
                  </Button>
                  <Button
                    variant="outline"
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
              ) : null}
              {transferOpen && (activeCall || sessionActive) && (
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
                <div className="text-xs text-muted-foreground">Auto-start High-Intent Lead Screener on answered calls</div>
              </div>
              <Switch checked={autoAiAssistant} onCheckedChange={setAutoAiAssistant} />
            </div>

            <div className="text-sm text-muted-foreground">
              Status: {session ? (SESSION_LABELS[session.status] || session.status) : status}
              {status === "connected" && startTs ? <span> • {Math.floor((elapsedMs || 0) / 1000)}s</span> : null}
              {(aiAssistantActive || sessionAiActive) ? <span className="text-primary"> • AI Screener on</span> : null}
              {sessionError ? <span className="block text-xs text-destructive"> • {sessionError}</span> : null}
            </div>
          </CardContent>
        </Card>

        <TwoLegCallPanel leadId={activeItem?.leadId} />

        <Card>
          <CardHeader>
            <CardTitle>Lead</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {!activeItem ? (
              <div className="space-y-4">
                <div className="text-sm text-muted-foreground">Select a lead from the queue</div>
                <div className="grid gap-2 opacity-50 pointer-events-none">
                  <Label>Script Preview</Label>
                  <div className="flex gap-2">
                    <select className="h-10 flex-1 rounded-md border border-input bg-background px-3 text-sm" disabled>
                      <option>Select a lead to view scripts</option>
                    </select>
                  </div>
                  <div className="rounded-md border border-border p-2 text-sm whitespace-pre-wrap min-h-[100px] flex items-center justify-center">
                    <span className="text-muted-foreground">Load queue and select a lead to see the script</span>
                  </div>
                </div>
              </div>
            ) : (
              <>
                <div>
                  <div className="text-lg font-semibold">{lead?.ownerName || activeItem.ownerName}</div>
                  <div className="text-sm text-muted-foreground">{lead?.address || activeItem.address}</div>
                  <div className="text-sm text-muted-foreground">{lead?.ownerPhone || activeItem.ownerPhone}</div>
                </div>

                <div className="grid gap-3">
                  <div className="grid gap-2">
                    <Label>Stage</Label>
                    <select
                      className="h-10 rounded-md border border-input bg-background px-3 text-sm"
                      value={String(lead?.status || "")}
                      onChange={(e) => patchLead.mutate({ status: e.target.value })}
                    >
                      {["new", "contacted", "qualified", "negotiation", "under_contract", "closed", "lost"].map((s) => (
                        <option key={s} value={s}>
                          {s}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="grid gap-2">
                    <Label>Flags</Label>
                    <div className="flex flex-col gap-2">
                      <label className="flex items-center gap-2 text-sm">
                        <input
                          type="checkbox"
                          checked={Boolean(lead?.doNotCall)}
                          onChange={(e) => patchLead.mutate({ doNotCall: e.target.checked })}
                        />
                        Do Not Call
                      </label>
                      <label className="flex items-center gap-2 text-sm">
                        <input
                          type="checkbox"
                          checked={Boolean(lead?.doNotText)}
                          onChange={(e) => patchLead.mutate({ doNotText: e.target.checked })}
                        />
                        Do Not Text
                      </label>
                    </div>
                  </div>

                  <div className="grid gap-2">
                    <Label>Tags</Label>
                    <div className="flex flex-wrap gap-2">
                      {(Array.isArray(lead?.tags) ? lead.tags : []).map((t: string) => (
                        <button
                          key={t}
                          className="rounded-md border px-2 py-1 text-xs hover:bg-muted/50"
                          onClick={() => {
                            const existing = Array.isArray(lead?.tags) ? lead.tags : [];
                            patchLead.mutate({ tags: existing.filter((x: string) => x !== t) });
                          }}
                        >
                          {t}
                        </button>
                      ))}
                      {!((Array.isArray(lead?.tags) ? lead.tags : []).length) ? (
                        <div className="text-sm text-muted-foreground">No tags</div>
                      ) : null}
                    </div>
                    <div className="flex gap-2">
                      <Input value={tagInput} onChange={(e) => setTagInput(e.target.value)} placeholder="Add tag" />
                      <Button
                        variant="secondary"
                        onClick={() => {
                          const next = String(tagInput || "").trim();
                          if (!next) return;
                          const existing = Array.isArray(lead?.tags) ? lead.tags : [];
                          const merged = Array.from(new Set([...existing, next]));
                          patchLead.mutate({ tags: merged });
                          setTagInput("");
                        }}
                      >
                        Add
                      </Button>
                    </div>
                  </div>

                  <div className="grid gap-2">
                    <Label>Script</Label>
                    <div className="flex gap-2">
                      <select
                        className="h-10 flex-1 rounded-md border border-input bg-background px-3 text-sm"
                        value={scriptId ? String(scriptId) : ""}
                        onChange={(e) => {
                          const raw = String(e.target.value || "").trim();
                          if (!raw) {
                            setScriptId(null);
                            setScriptName("");
                            setScriptContent("");
                            setScriptIsDefault(false);
                            return;
                          }
                          const nextId = parseInt(raw, 10);
                          if (!Number.isFinite(nextId)) return;
                          const next = scripts.find((s: any) => s?.id === nextId);
                          setScriptId(nextId);
                          setScriptName(String(next?.name || ""));
                          setScriptContent(String(next?.content || ""));
                          setScriptIsDefault(Boolean(next?.isDefault));
                        }}
                      >
                        <option value="">New script</option>
                        {scripts.map((s: any) => (
                          <option key={s.id} value={String(s.id)}>
                            {String(s.name || "Untitled")}
                            {s.isDefault ? " (default)" : ""}
                          </option>
                        ))}
                      </select>
                      <Button
                        variant="secondary"
                        onClick={() => {
                          setScriptId(null);
                          setScriptName("");
                          setScriptContent("");
                          setScriptIsDefault(false);
                        }}
                      >
                        New
                      </Button>
                    </div>
                    <Input value={scriptName} onChange={(e) => setScriptName(e.target.value)} placeholder="Script name" />
                    <label className="flex items-center gap-2 text-sm">
                      <input type="checkbox" checked={scriptIsDefault} onChange={(e) => setScriptIsDefault(e.target.checked)} />
                      Default for this list
                    </label>
                    <Textarea
                      value={scriptContent}
                      onChange={(e) => setScriptContent(e.target.value)}
                      placeholder="Use {{firstName}}, {{ownerName}}, {{address}}, {{city}}, {{state}}, {{phone}}"
                    />
                    <div className="flex flex-wrap gap-2">
                      <Button
                        variant="secondary"
                        onClick={async () => {
                          if (scriptSaving) return;
                          const name = String(scriptName || "").trim();
                          if (!name) return;
                          setScriptSaving(true);
                          try {
                            if (typeof scriptId === "number") {
                              await apiRequest("PATCH", `/api/dialer/scripts/${scriptId}`, {
                                name,
                                content: String(scriptContent || ""),
                                listId: state.listId,
                                isDefault: Boolean(scriptIsDefault),
                              }).then((r) => r.json());
                            } else {
                              const created = await apiRequest("POST", `/api/dialer/scripts`, {
                                name,
                                content: String(scriptContent || ""),
                                listId: state.listId,
                                isDefault: Boolean(scriptIsDefault),
                              }).then((r) => r.json());
                              if (created?.id) setScriptId(Number(created.id));
                            }
                            queryClient.invalidateQueries({ queryKey: ["/api/dialer/scripts", state.listId] });
                          } finally {
                            setScriptSaving(false);
                          }
                        }}
                        disabled={!String(scriptName || "").trim() || scriptSaving}
                      >
                        {scriptSaving ? "Saving…" : "Save Script"}
                      </Button>
                      {typeof scriptId === "number" ? (
                        <Button
                          variant="outline"
                          onClick={async () => {
                            if (!confirm("Delete this script?")) return;
                            try {
                              await apiRequest("DELETE", `/api/dialer/scripts/${scriptId}`);
                            } catch {
                              return;
                            }
                            setScriptId(null);
                            setScriptName("");
                            setScriptContent("");
                            setScriptIsDefault(false);
                            queryClient.invalidateQueries({ queryKey: ["/api/dialer/scripts", state.listId] });
                          }}
                        >
                          Delete
                        </Button>
                      ) : null}
                      <Button
                        variant="outline"
                        onClick={async () => {
                          const rendered = renderDialerScript(scriptContent, lead, activeItem);
                          const text = String(rendered || "").trim();
                          if (!text) return;
                          try {
                            await navigator.clipboard.writeText(text);
                          } catch {}
                        }}
                        disabled={!String(scriptContent || "").trim()}
                      >
                        Copy
                      </Button>
                      <Button
                        variant="outline"
                        onClick={() => {
                          const rendered = renderDialerScript(scriptContent, lead, activeItem);
                          const text = String(rendered || "").trim();
                          if (!text) return;
                          setNote((prev) => (prev ? `${prev}\n\n${text}` : text));
                        }}
                        disabled={!String(scriptContent || "").trim()}
                      >
                        Insert into Note
                      </Button>
                    </div>
                    <div className="rounded-md border border-border p-2 text-sm whitespace-pre-wrap">
                      {renderDialerScript(scriptContent, lead, activeItem) || <span className="text-muted-foreground">Script preview</span>}
                    </div>
                  </div>

                  <div className="grid gap-2">
                    <Label>SMS</Label>
                    <div className="flex flex-wrap gap-2">
                      <Button
                        variant="outline"
                        onClick={() => setSmsBody(`Hi ${lead?.ownerName || activeItem.ownerName}, are you open to an offer on ${lead?.address || activeItem.address}?`)}
                      >
                        Intro
                      </Button>
                      <Button
                        variant="outline"
                        onClick={() => setSmsBody(`Following up on ${lead?.address || activeItem.address}. Is this a good time to chat?`)}
                      >
                        Follow-up
                      </Button>
                      <Button
                        variant="outline"
                        onClick={() => setSmsBody(`Thanks for your time. If you’re open to it, I can put together an offer for ${lead?.address || activeItem.address}.`)}
                      >
                        Offer
                      </Button>
                    </div>
                    <Textarea value={smsBody} onChange={(e) => setSmsBody(e.target.value)} placeholder="Write a text…" />
                    <Button onClick={() => sendSms.mutate()} disabled={!smsBody.trim() || sendSms.isPending || Boolean(lead?.doNotText)}>
                      Send SMS
                    </Button>
                  </div>

                  <div className="grid gap-2">
                    <Label>Call Log</Label>
                    <select
                      className="h-10 rounded-md border border-input bg-background px-3 text-sm"
                      value={disposition}
                      onChange={(e) => setDisposition(e.target.value)}
                    >
                      <option value="">Select disposition</option>
                      {["answered", "no_answer", "wrong_number", "call_back", "do_not_call"].map((d) => (
                        <option key={d} value={d}>
                          {d}
                        </option>
                      ))}
                    </select>
                    <Textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="Notes (optional)" />
                    <div className="grid gap-1">
                      <Label>Follow-up date</Label>
                      <Input type="date" value={followUpAt} onChange={(e) => setFollowUpAt(e.target.value)} />
                    </div>
                    <Button
                      variant="secondary"
                      onClick={async () => {
                        if (!callId) return;
                        if (saveLogPending) return;
                        if (!wrapUpValid) return;
                        setSaveLogPending(true);
                        try {
                          await patchCallLog(callId, {
                            disposition: disposition || null,
                            note: note || null,
                            followUpAt: followUpAt ? new Date(followUpAt).toISOString() : null,
                          });
                          queryClient.invalidateQueries({ queryKey: ["/api/activity"] });
                          setLogSaved(true);
                          if (powerMode) next();
                        } finally {
                          setSaveLogPending(false);
                        }
                      }}
                      disabled={!callId || saveLogPending || !wrapUpValid}
                    >
                      Save Log
                    </Button>
                    {callId && !wrapUpValid ? (
                      <div className="text-xs text-muted-foreground">
                        {disposition ? "Follow-up date required for call_back." : "Select a disposition to save the log."}
                      </div>
                    ) : null}
                    {callId && !logSaved ? (
                      <div className="text-xs text-muted-foreground">Save the log before moving to the next lead.</div>
                    ) : null}
                  </div>
                </div>

                <EntityActivity leadId={activeItem.leadId} />
              </>
            )}
          </CardContent>
        </Card>
      </div>
      )}
    </Layout>
  );
}

export default function DialerWorkspace() {
  return (
    <DialerProvider>
      <DialerWorkspaceInner />
    </DialerProvider>
  );
}
