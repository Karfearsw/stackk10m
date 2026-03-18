import { useEffect, useMemo, useRef, useState } from "react";
import { Layout } from "@/components/layout/Layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Phone, PhoneOff, Mic, MicOff, Pause, Play } from "lucide-react";
import { DialerProvider, useDialer } from "@/contexts/DialerContext";
import { useSignalWire } from "@/hooks/useSignalWire";
import { EntityActivity } from "@/components/activity/EntityActivity";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

function formatE164(raw: string) {
  const digits = raw.replace(/[^\d+]/g, "");
  if (digits.startsWith("+")) return digits;
  if (digits.length === 10) return "+1" + digits;
  return digits;
}

const KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "*", "0", "#"];

function DialerWorkspaceInner() {
  const { state, activeItem, setListId, setQueue, setActiveIndex, next } = useDialer();
  const { ready, connectionState, error, call: activeCall, makeCall, endCall, toggleMute, toggleHold } = useSignalWire();
  const queryClient = useQueryClient();

  const [number, setNumber] = useState("");
  const [status, setStatus] = useState<"idle" | "dialing" | "ringing" | "connected" | "ended" | "failed">("idle");
  const [startTs, setStartTs] = useState<number | null>(null);
  const timerRef = useRef<number>(0);
  const [queueLoading, setQueueLoading] = useState(false);
  const [callId, setCallId] = useState<number | null>(null);
  const wasConnectedRef = useRef(false);
  const lastPatchedStatusRef = useRef<string | null>(null);

  const [smsBody, setSmsBody] = useState("");
  const [disposition, setDisposition] = useState<string>("");
  const [note, setNote] = useState("");
  const [followUpAt, setFollowUpAt] = useState<string>("");
  const [tagInput, setTagInput] = useState("");
  const [powerMode, setPowerMode] = useState(false);
  const [saveLogPending, setSaveLogPending] = useState(false);

  const initial = useMemo(() => {
    if (typeof window === "undefined") return { leadId: null as number | null, number: "" };
    const params = new URLSearchParams(window.location.search);
    const leadIdRaw = params.get("leadId");
    const n = params.get("number") || params.get("to") || "";
    const leadId = leadIdRaw ? parseInt(leadIdRaw, 10) : NaN;
    return { leadId: Number.isFinite(leadId) ? leadId : null, number: n };
  }, []);

  useEffect(() => {
    if (initial.number) setNumber(initial.number);
  }, [initial.number]);

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
    wasConnectedRef.current = false;
    lastPatchedStatusRef.current = null;
  }, [activeItem?.leadId]);

  const { data: lead } = useQuery<any>({
    queryKey: activeItem?.leadId ? [`/api/leads/${activeItem.leadId}`] : ["lead-none"],
    queryFn: async () => {
      const res = await fetch(`/api/leads/${activeItem?.leadId}`, { credentials: "include" });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
    enabled: Boolean(activeItem?.leadId),
  });

  const patchLead = useMutation({
    mutationFn: async (patch: any) => {
      if (!activeItem?.leadId) throw new Error("Missing leadId");
      const res = await fetch(`/api/leads/${activeItem.leadId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
        credentials: "include",
      });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/leads/${activeItem?.leadId}`] });
      queryClient.invalidateQueries({ queryKey: ["/api/activity"] });
    },
  });

  const patchCallLog = async (id: number, patch: any) => {
    const res = await fetch(`/api/telephony/calls/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
      credentials: "include",
    });
    if (!res.ok) throw new Error(await res.text());
    return res.json();
  };

  const createCallLog = useMutation({
    mutationFn: async () => {
      if (!activeItem?.leadId) throw new Error("Select a lead");
      const res = await fetch(`/api/telephony/calls`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          direction: "outbound",
          number: formatted,
          status: "dialing",
          startedAt: new Date().toISOString(),
          leadId: activeItem.leadId,
          metadata: { leadId: activeItem.leadId },
        }),
        credentials: "include",
      });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
    onSuccess: (log) => {
      setCallId(log.id);
      setStatus("dialing");
      setStartTs(Date.now());
      wasConnectedRef.current = false;
      lastPatchedStatusRef.current = "dialing";
    },
  });

  const sendSms = useMutation({
    mutationFn: async () => {
      if (!activeItem?.leadId) throw new Error("Select a lead");
      const to = formatE164(activeItem.ownerPhone || "");
      const res = await fetch(`/api/telephony/sms`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ to, body: smsBody, metadata: { leadId: activeItem.leadId } }),
        credentials: "include",
      });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
    onSuccess: () => {
      setSmsBody("");
      queryClient.invalidateQueries({ queryKey: ["/api/activity"] });
    },
  });

  useEffect(() => {
    let handle: any;
    if (status === "connected" && startTs) {
      handle = setInterval(() => {
        timerRef.current = Date.now() - startTs;
      }, 250);
    }
    return () => handle && clearInterval(handle);
  }, [status, startTs]);

  useEffect(() => {
    if (!activeCall) return;
    if (activeCall.state === "ringing") setStatus("ringing");
    if (activeCall.state === "active") {
      setStatus("connected");
      if (!startTs) setStartTs(Date.now());
    }
    if (activeCall.state === "finished") setStatus("ended");
    if (activeCall.state === "held") setStatus("connected");
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

    if (activeCall.state === "finished") {
      const finalStatus = wasConnectedRef.current ? "answered" : "missed";
      if (lastPatchedStatusRef.current !== finalStatus) {
        lastPatchedStatusRef.current = finalStatus;
        patchCallLog(callId, { status: finalStatus, endedAt: new Date().toISOString(), durationMs }).then(() => {
          queryClient.invalidateQueries({ queryKey: ["/api/activity"] });
        }).catch(() => {});
      }
    }
  }, [activeCall?.state, callId, queryClient, startTs]);

  useEffect(() => {
    if (!callId) return;
    if (activeCall) return;
    if (status === "idle" || status === "ended" || status === "failed") return;

    const durationMs = startTs ? Date.now() - startTs : 0;
    const finalStatus = wasConnectedRef.current ? "answered" : "missed";
    if (lastPatchedStatusRef.current !== finalStatus) {
      lastPatchedStatusRef.current = finalStatus;
      patchCallLog(callId, { status: finalStatus, endedAt: new Date().toISOString(), durationMs }).then(() => {
        queryClient.invalidateQueries({ queryKey: ["/api/activity"] });
      }).catch(() => {});
    }
  }, [activeCall, callId, queryClient, startTs, status]);

  const formatted = useMemo(() => formatE164(number), [number]);

  return (
    <Layout>
      <div className="grid gap-4 xl:grid-cols-[320px_minmax(0,1fr)_420px]">
        <Card>
          <CardHeader>
            <CardTitle>Queue</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex gap-2">
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

            <div className="flex gap-2">
              <Button
                variant="secondary"
                onClick={async () => {
                  try {
                    setQueueLoading(true);
                    const qs = new URLSearchParams({ listId: state.listId, limit: "50" });
                    const res = await fetch(`/api/dialer/queue?${qs.toString()}`, { credentials: "include" });
                    if (!res.ok) throw new Error(await res.text());
                    const data = await res.json();
                    setQueue(Array.isArray(data.items) ? data.items : []);
                  } finally {
                    setQueueLoading(false);
                  }
                }}
              >
                {queueLoading ? "Loading…" : "Start Session"}
              </Button>
              <Button variant="outline" onClick={next} disabled={!state.queue.length}>
                Next
              </Button>
            </div>

            <ScrollArea className="h-[560px] border rounded-md p-2">
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
            <div className="text-sm text-muted-foreground">
              SignalWire: {ready ? "Connected" : connectionState === "connecting" ? "Connecting…" : connectionState}
              {error ? <span className="text-destructive"> • {error}</span> : null}
            </div>

            <div className="space-y-2">
              <Label htmlFor="dialer-number">Phone Number</Label>
              <Input id="dialer-number" value={number} onChange={(e) => setNumber(e.target.value)} placeholder="Enter number" />
              <div className="grid grid-cols-3 gap-2" role="group" aria-label="Dialer keypad">
                {KEYS.map((k) => (
                  <Button key={k} variant="outline" className="h-12 text-xl" onClick={() => setNumber((prev) => prev + k)} aria-label={`Key ${k}`}>
                    {k}
                  </Button>
                ))}
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              <Button
                onClick={async () => {
                  if (!activeItem?.leadId) return;
                  if (!formatted) return;
                  try {
                    const log = await createCallLog.mutateAsync();
                    try {
                      await makeCall(formatted);
                      setCallId(log.id);
                    } catch (e: any) {
                      try {
                        await patchCallLog(log.id, { status: "failed", errorMessage: String(e?.message || e || "Call failed") });
                      } catch {}
                      setStatus("failed");
                      setCallId(null);
                    }
                  } catch {
                    setStatus("failed");
                    setCallId(null);
                  }
                }}
                disabled={!formatted || status === "dialing" || status === "connected" || createCallLog.isPending}
              >
                <Phone className="w-4 h-4 mr-2" />
                Call
              </Button>
              <Button
                variant="destructive"
                onClick={async () => {
                  const id = callId;
                  const durationMs = startTs ? Date.now() - startTs : 0;
                  const finalStatus = wasConnectedRef.current ? "answered" : "missed";

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

                  setStatus("ended");
                }}
                disabled={!activeCall}
              >
                <PhoneOff className="w-4 h-4 mr-2" />
                End
              </Button>
              {activeCall ? (
                <>
                  <Button variant="outline" onClick={toggleMute}>
                    {activeCall.muted ? <MicOff className="w-4 h-4 mr-2" /> : <Mic className="w-4 h-4 mr-2" />}
                    {activeCall.muted ? "Unmute" : "Mute"}
                  </Button>
                  <Button variant="outline" onClick={toggleHold}>
                    {activeCall.state === "held" ? <Play className="w-4 h-4 mr-2" /> : <Pause className="w-4 h-4 mr-2" />}
                    {activeCall.state === "held" ? "Resume" : "Hold"}
                  </Button>
                </>
              ) : null}
              <Button variant="outline" onClick={next} disabled={!state.queue.length}>
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

            <div className="text-sm text-muted-foreground">
              Status: {status}
              {status === "connected" && startTs ? <span> • {Math.floor((timerRef.current || 0) / 1000)}s</span> : null}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Lead</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {!activeItem ? (
              <div className="text-sm text-muted-foreground">Select a lead from the queue</div>
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
                        setSaveLogPending(true);
                        try {
                          await patchCallLog(callId, {
                            disposition: disposition || null,
                            note: note || null,
                            followUpAt: followUpAt ? new Date(followUpAt).toISOString() : null,
                          });
                          queryClient.invalidateQueries({ queryKey: ["/api/activity"] });
                          if (powerMode) next();
                        } finally {
                          setSaveLogPending(false);
                        }
                      }}
                      disabled={!callId || saveLogPending}
                    >
                      Save Log
                    </Button>
                  </div>
                </div>

                <EntityActivity leadId={activeItem.leadId} />
              </>
            )}
          </CardContent>
        </Card>
      </div>
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
