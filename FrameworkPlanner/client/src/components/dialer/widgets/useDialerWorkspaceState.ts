import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useDialer } from "@/contexts/DialerContext";
import { useSignalWire } from "@/hooks/useSignalWire";
import { useCallAudio } from "@/hooks/useCallAudio";
import { useTelephonyEvents } from "@/hooks/useTelephonyEvents";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { BUYER_DISPOSITIONS_REQUIRE_NEXT_ACTION } from "@/lib/dispositions";
import { toast } from "sonner";
import type { DialerQueueItem } from "@/lib/dialerTypes";
import { formatE164 } from "./dialerUtils";

/**
 * All state + behavior of the power-dialer workspace, extracted from the page
 * so each panel can become an independent draggable widget. The page provides
 * the returned value through DialerWorkspaceContext; widgets consume it with
 * useDialerWorkspace(). Behavior is unchanged — this is a pure move.
 */
export function useDialerWorkspaceState() {
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
    sendDigits,
    incomingCall,
    answerIncoming,
    rejectIncoming,
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
  const [nextAction, setNextAction] = useState("");
  const [nextActionAt, setNextActionAt] = useState("");
  const [tagInput, setTagInput] = useState("");
  const [powerMode, setPowerMode] = useState(false);
  // M38: Settings → System is the single source of truth for the AI Screener.
  // The dialer only reflects that state — it no longer keeps its own toggle,
  // which previously showed the opposite of the system setting.
  const { data: aiAssistantConfig } = useQuery<any>({
    queryKey: ["/api/settings/telecom/ai-assistant"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/settings/telecom/ai-assistant");
      return await res.json();
    },
    refetchInterval: 30000,
  });
  const autoAiAssistant = Boolean(aiAssistantConfig?.enabled);
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
  const [recordCall, setRecordCall] = useState(false);
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
    if (typeof window === "undefined") return { leadId: null as number | null, buyerId: null as number | null, propertyId: null as number | null, number: "" };
    const params = new URLSearchParams(window.location.search);
    const leadIdRaw = params.get("leadId");
    const buyerIdRaw = params.get("buyer") || params.get("buyerId");
    const propertyIdRaw = params.get("propertyId") || params.get("opportunityId");
    const n = params.get("number") || params.get("to") || "";
    const leadId = leadIdRaw ? parseInt(leadIdRaw, 10) : NaN;
    const buyerId = buyerIdRaw ? parseInt(buyerIdRaw, 10) : NaN;
    const propertyId = propertyIdRaw ? parseInt(propertyIdRaw, 10) : NaN;
    return {
      leadId: Number.isFinite(leadId) && leadId > 0 ? leadId : null,
      buyerId: Number.isFinite(buyerId) && buyerId > 0 ? buyerId : null,
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

  // Buyer mode: opened from the buyer page (/dialer?buyer=<id>). Loads the
  // buyer as a single-item queue; the two-leg dialer and wrap-up then target
  // the buyer record instead of a lead.
  const { data: buyerCtx } = useQuery<any>({
    queryKey: initial.buyerId ? [`/api/buyers/${initial.buyerId}`] : ["buyer-none"],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/buyers/${initial.buyerId}`);
      return res.json();
    },
    enabled: Boolean(initial.buyerId),
  });
  const buyerMode = Boolean(initial.buyerId && buyerCtx?.id);
  const buyerDnc = Boolean(buyerCtx?.doNotCall || buyerCtx?.buyerStatus === "do_not_contact");

  useEffect(() => {
    if (!buyerMode) return;
    const phone = String(buyerCtx?.phone || "").trim();
    if (phone) setNumber(phone);
  }, [buyerMode, buyerCtx?.phone]);

  useEffect(() => {
    setSmsBody("");
    setDisposition("");
    setNote("");
    setFollowUpAt("");
    setNextAction("");
    setNextActionAt("");
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

  // C8/M5: one disposition taxonomy shared with Call Audit and the call-sessions
  // service (ALLOWED_DISPOSITIONS). Dialer-only legacy values (answered/call_back)
  // could never be filtered in Call Audit, making manual dispositions un-auditable.
  const DISPOSITIONS = [
    "connected", "qualified", "qualified_handoff", "callback_requested", "voicemail",
    "no_answer", "busy", "wrong_number_confirmed", "wrong_number_review", "not_interested",
    "do_not_call", "invalid_number", "failed", "abandoned", "agent_unavailable", "bridge_failed",
    // Buyer outcomes — available when the session targets a buyer record.
    ...(buyerMode ? (["send_deal", "offer_expected", "offer_submitted", "criteria_mismatch", "qualified_buyer", "needs_info"] as const) : []),
  ];
  const needsNextAction = buyerMode && BUYER_DISPOSITIONS_REQUIRE_NEXT_ACTION.has(disposition);
  const wrapUpValid = Boolean(disposition)
    && (disposition !== "callback_requested" || Boolean(followUpAt))
    && (!needsNextAction || Boolean(nextAction && nextActionAt));

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

  // M40: queue filters now load immediately instead of silently doing nothing
  // until "Start Session" is pressed.
  const loadQueue = useCallback(async (listId: string) => {
    try {
      setQueueLoading(true);
      const qs = new URLSearchParams({ listId, limit: "50" });
      const res = await apiRequest("GET", `/api/dialer/queue?${qs.toString()}`);
      const data = await res.json();
      setQueue(Array.isArray(data.items) ? data.items : []);
      setActiveIndex(0);
    } catch {
      /* keep previous queue on failure */
    } finally {
      setQueueLoading(false);
    }
  }, [setQueue, setActiveIndex]);

  const formatted = useMemo(() => formatE164(number), [number]);

  const startOutboundCall = useCallback(async () => {
    // Buyer two-leg session: same Telnyx state machine, buyer-targeted.
    if (buyerMode && initial.buyerId) {
      setSessionBusy(true);
      setSessionError("");
      try {
        const res = await apiRequest("POST", `/api/v1/telecom/buyers/${initial.buyerId}/call-sessions`, {
          mode: "human_first",
          record: recordCall,
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
          record: recordCall,
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
  }, [activeItem?.leadId, buyerMode, initial.leadId, initial.buyerId, formatted, initial.propertyId, lastPatchedStatusRef, makeCall]);

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

  // Keypad: during an active two-leg session, digits go out as real DTMF on
  // the agent leg (IVR navigation). Otherwise they type into the number field
  // like a desk phone.
  const [dtmfBusy, setDtmfBusy] = useState(false);
  const sendSessionDtmf = async (digit: string) => {
    if (!session || !sessionActive || !sessionLeadLeg) return;
    setDtmfBusy(true);
    try {
      const res = await apiRequest("POST", `/api/v1/telecom/call-sessions/${session.id}/dtmf`, { digits: digit });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || "DTMF failed");
    } catch (e: any) {
      toast.error(String(e?.message || e || "DTMF failed"));
    } finally {
      setDtmfBusy(false);
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



  // Named handlers extracted from the old inline call controls so the shared
  // <CallBar/> (and both pages) can drive the exact same behavior.
  const handleCall = useCallback(async () => {
    try {
      await startOutboundCall();
    } catch {
      setStatus("failed");
      setCallId(null);
      setStartTs(null);
    }
  }, [startOutboundCall]);

  const handleHangup = useCallback(async () => {
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
  }, [session, callId, startTs, endCall, patchCallLog, disposition, note, followUpAt, wrapUpValid]);

  const handleSaveLog = useCallback(async () => {
    if (saveLogPending) return;
    if (!wrapUpValid) return;
    // Buyer two-leg session: the disposition endpoint drives
    // buyer pipeline automations (next-action task, status,
    // DNC). No separate call-log row exists.
    if (session && buyerMode && initial.buyerId) {
      setSaveLogPending(true);
      try {
        const res = await apiRequest("POST", `/api/v1/telecom/call-sessions/${session.id}/disposition`, {
          disposition,
          note: note || undefined,
          nextAction: nextAction || undefined,
          nextActionAt: nextActionAt ? new Date(nextActionAt).toISOString() : undefined,
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || "Failed to save disposition");
        setLogSaved(true);
        if (powerMode) next();
      } catch (e: any) {
        toast.error(e?.message || "Failed to save disposition");
      } finally {
        setSaveLogPending(false);
      }
      return;
    }
    const leadId = activeItem?.leadId ?? null;
    if (!callId && !leadId) return;
    setSaveLogPending(true);
    try {
      const patch = {
        disposition: disposition || null,
        note: note || null,
        followUpAt: followUpAt ? new Date(followUpAt).toISOString() : null,
      };
      if (callId) {
        await patchCallLog(callId, patch);
      } else {
        // M4: manual/offline disposition logging — create a
        // completed call-log row when no call was placed.
        const res = await apiRequest("POST", "/api/telephony/calls", {
          direction: "outbound",
          number: number || activeItem?.ownerPhone || "",
          leadId,
          status: "ended",
          startedAt: new Date().toISOString(),
          metadata: { manualLog: true },
        });
        const log = await res.json();
        await patchCallLog(log.id, patch);
      }
      queryClient.invalidateQueries({ queryKey: ["/api/activity"] });
      setLogSaved(true);
      if (powerMode) next();
    } finally {
      setSaveLogPending(false);
    }
  }, [saveLogPending, wrapUpValid, session, buyerMode, initial.buyerId, activeItem?.leadId, callId,
      disposition, note, nextAction, nextActionAt, followUpAt, number, powerMode, next,
      patchCallLog, queryClient]);


  return {
    state,
    activeItem,
    setListId,
    setQueue,
    setActiveIndex,
    next,
    telnyxError,
    lastError,
    activeCall,
    callControlId,
    makeCall,
    endCall,
    updateCallState,
    toggleMute,
    toggleHold,
    transferCall,
    sendDigits,
    incomingCall,
    answerIncoming,
    rejectIncoming,
    aiAssistantActive,
    startAiAssistant,
    stopAiAssistant,
    telephonyWsConnected,
    queryClient,
    startRingback,
    stopRingback,
    playConnectTone,
    number,
    setNumber,
    status,
    setStatus,
    startTs,
    setStartTs,
    elapsedMs,
    setElapsedMs,
    queueLoading,
    setQueueLoading,
    callId,
    setCallId,
    wasConnectedRef,
    callFailedRef,
    lastPatchedStatusRef,
    smsBody,
    setSmsBody,
    disposition,
    setDisposition,
    note,
    setNote,
    followUpAt,
    setFollowUpAt,
    nextAction,
    setNextAction,
    nextActionAt,
    setNextActionAt,
    tagInput,
    setTagInput,
    powerMode,
    setPowerMode,
    aiAssistantConfig,
    autoAiAssistant,
    aiAssistantBusy,
    setAiAssistantBusy,
    transferOpen,
    setTransferOpen,
    transferNumber,
    setTransferNumber,
    transferBusy,
    setTransferBusy,
    aiAutoStartedRef,
    saveLogPending,
    setSaveLogPending,
    logSaved,
    setLogSaved,
    session,
    setSession,
    sessionBusy,
    setSessionBusy,
    sessionError,
    setSessionError,
    recordCall,
    setRecordCall,
    sessionMuted,
    setSessionMuted,
    sessionHeld,
    setSessionHeld,
    sessionAiActive,
    setSessionAiActive,
    softphoneOpen,
    setSoftphoneOpen,
    scriptId,
    setScriptId,
    scriptName,
    setScriptName,
    scriptContent,
    setScriptContent,
    scriptIsDefault,
    setScriptIsDefault,
    scriptSaving,
    setScriptSaving,
    SESSION_LABELS,
    ACTIVE_SESSION,
    sessionStatusToLegacy,
    initial,
    buyerCtx,
    buyerMode,
    buyerDnc,
    DISPOSITIONS,
    needsNextAction,
    wrapUpValid,
    lead,
    telnyxHealth,
    healthLoading,
    healthRefetch,
    scriptsData,
    scripts,
    patchLead,
    prevAudioStatus,
    patchCallLog,
    loadQueue,
    formatted,
    startOutboundCall,
    sessionLeg,
    sessionLeadLeg,
    sessionActive,
    toggleSessionMute,
    toggleSessionHold,
    transferSession,
    toggleSessionAi,
    dtmfBusy,
    setDtmfBusy,
    sendSessionDtmf,
    sendSms,
    handleCall,
    handleHangup,
    handleSaveLog,
  };
}
