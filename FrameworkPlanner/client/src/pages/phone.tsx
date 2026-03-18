import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "wouter";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Layout } from "@/components/layout/Layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Phone, PhoneOff, Plus, Search, Clock, Voicemail, Mic, MicOff, Pause, Play } from "lucide-react";
import { useSignalWire } from "@/hooks/useSignalWire";
import { useTelephonyEvents } from "@/hooks/useTelephonyEvents";
import { ContactsManager } from "@/components/contacts/ContactsManager";

function formatE164(raw: string) {
  const digits = raw.replace(/[^\d+]/g, "");
  if (digits.startsWith("+")) return digits;
  if (digits.length === 10) return "+1" + digits;
  return digits;
}

const KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "*", "0", "#"];
type TabKey = "dial" | "contacts" | "history" | "voicemail" | "analytics";

function getTabFromLocation(): TabKey {
  if (typeof window === "undefined") return "dial";
  const params = new URLSearchParams(window.location.search);
  const raw = (params.get("tab") || "").toLowerCase();
  if (raw === "contacts") return "contacts";
  if (raw === "history") return "history";
  if (raw === "voicemail") return "voicemail";
  if (raw === "analytics") return "analytics";
  return "dial";
}

export default function PhoneWorkspace() {
  const queryClient = useQueryClient();
  const [, navigate] = useLocation();
  const { connected: telephonyWsConnected } = useTelephonyEvents({ enabled: true });

  const [tab, setTab] = useState<TabKey>(() => getTabFromLocation());
  const setTabAndUrl = (next: TabKey) => {
    setTab(next);
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    params.set("tab", next);
    navigate(`/phone?${params.toString()}`);
  };

  const [number, setNumber] = useState("");
  const [status, setStatus] = useState<"idle" | "dialing" | "ringing" | "connected" | "ended" | "failed">("idle");
  const [callId, setCallId] = useState<number | null>(null);
  const [startTs, setStartTs] = useState<number | null>(null);
  const timerRef = useRef<number>(0);
  const wasConnectedRef = useRef(false);
  const lastPatchedStatusRef = useRef<string | null>(null);

  const { ready: signalWireReady, call: activeCall, makeCall, endCall: endSignalWireCall, toggleMute, toggleHold } = useSignalWire();

  const initialNumber = useMemo(() => {
    if (typeof window === "undefined") return "";
    const params = new URLSearchParams(window.location.search);
    return params.get("number") || params.get("to") || "";
  }, []);

  const initialMetadata = useMemo(() => {
    if (typeof window === "undefined") return null;
    const params = new URLSearchParams(window.location.search);
    const leadIdRaw = params.get("leadId");
    const propertyIdRaw = params.get("propertyId");
    const leadId = leadIdRaw ? parseInt(leadIdRaw, 10) : 0;
    const propertyId = propertyIdRaw ? parseInt(propertyIdRaw, 10) : 0;
    const meta: any = {};
    if (leadId) meta.leadId = leadId;
    if (propertyId) meta.propertyId = propertyId;
    return Object.keys(meta).length ? meta : null;
  }, []);

  const callMetadataRef = useRef<any>(initialMetadata);

  useEffect(() => {
    if (!initialNumber) return;
    setNumber(initialNumber);
  }, [initialNumber]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    setTab(getTabFromLocation());
  }, []);

  const historyInterval = useMemo(() => {
    if (typeof document !== "undefined" && document.visibilityState === "hidden") return false as any;
    if (status === "connected") return 300;
    if (status === "ringing" || status === "dialing") return 1500;
    if (status === "idle" || status === "ended" || status === "failed") return 25000;
    return 10000;
  }, [status]);

  const formatted = useMemo(() => formatE164(number), [number]);

  const patchCallLog = async (id: number, patch: any) => {
    try {
      const res = await fetch(`/api/telephony/calls/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      if (!res.ok) throw new Error(await res.text());
      return await res.json();
    } catch {
      return null;
    }
  };

  const createCall = useMutation({
    mutationFn: async ({ direction, number }: { direction: "outbound" | "inbound"; number: string }) => {
      const res = await fetch(`/api/telephony/calls`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          direction,
          number: String(number),
          status: "dialing",
          startedAt: new Date().toISOString(),
          metadata: callMetadataRef.current,
        }),
      });
      if (!res.ok) throw new Error(await res.text());
      const log = await res.json();

      if (direction === "outbound") {
        try {
          await makeCall(number);
        } catch (error) {
          await patchCallLog(log.id, { status: "failed", endedAt: new Date().toISOString() });
          throw error;
        }
      }

      return log;
    },
    onSuccess: (log) => {
      setCallId(log.id);
      setStatus("dialing");
      setStartTs(Date.now());
      wasConnectedRef.current = false;
      lastPatchedStatusRef.current = "dialing";
      queryClient.invalidateQueries({ queryKey: ["/api/telephony/history"] });
    },
  });

  const endCall = useMutation({
    mutationFn: async ({ id, succeeded }: { id: number; succeeded: boolean }) => {
      if (activeCall) {
        try {
          await endSignalWireCall();
        } catch {}
      }
      const durationMs = startTs ? Date.now() - startTs : 0;
      const nextStatus = succeeded ? (wasConnectedRef.current ? "answered" : "missed") : "failed";
      lastPatchedStatusRef.current = nextStatus;
      return await patchCallLog(id, { status: nextStatus, endedAt: new Date().toISOString(), durationMs });
    },
    onSuccess: () => {
      setStatus("ended");
      setCallId(null);
      setStartTs(null);
      wasConnectedRef.current = false;
      queryClient.invalidateQueries({ queryKey: ["/api/telephony/history"] });
    },
  });

  useEffect(() => {
    let handle: any;
    if (status === "connected" && startTs) {
      handle = setInterval(() => {
        timerRef.current = Date.now() - startTs;
      }, 200);
    }
    return () => handle && clearInterval(handle);
  }, [status, startTs]);

  useEffect(() => {
    if (!activeCall) return;
    if (activeCall.state === "ringing") setStatus("ringing");
    if (activeCall.state === "active") setStatus("connected");
    if (activeCall.state === "finished") setStatus("ended");
  }, [activeCall?.state]);

  useEffect(() => {
    if (!callId) return;
    if (!activeCall) return;

    const durationMs = startTs ? Date.now() - startTs : 0;

    if (activeCall.state === "ringing" && lastPatchedStatusRef.current !== "ringing") {
      lastPatchedStatusRef.current = "ringing";
      patchCallLog(callId, { status: "ringing" }).then(() => {
        queryClient.invalidateQueries({ queryKey: ["/api/telephony/history"] });
      });
      return;
    }

    if (activeCall.state === "active") {
      wasConnectedRef.current = true;
      if (lastPatchedStatusRef.current !== "answered") {
        lastPatchedStatusRef.current = "answered";
        patchCallLog(callId, { status: "answered" }).then(() => {
          queryClient.invalidateQueries({ queryKey: ["/api/telephony/history"] });
        });
      }
      return;
    }

    if (activeCall.state === "finished") {
      const finalStatus = wasConnectedRef.current ? "answered" : "missed";
      if (lastPatchedStatusRef.current !== finalStatus) {
        lastPatchedStatusRef.current = finalStatus;
        patchCallLog(callId, { status: finalStatus, endedAt: new Date().toISOString(), durationMs }).then(() => {
          queryClient.invalidateQueries({ queryKey: ["/api/telephony/history"] });
        });
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
        queryClient.invalidateQueries({ queryKey: ["/api/telephony/history"] });
      });
    }
  }, [activeCall, callId, queryClient, startTs, status]);

  const [contactQuery, setContactQuery] = useState("");
  const { data: contacts = [], isLoading: contactsLoading } = useQuery({
    queryKey: ["/api/telephony/contacts", contactQuery],
    queryFn: async () => {
      const res = await fetch(`/api/telephony/contacts?query=${encodeURIComponent(contactQuery)}`);
      if (!res.ok) throw new Error("Failed to fetch contacts");
      const json = await res.json();
      return json.items || [];
    },
  });

  const { data: history = [], isLoading: historyLoading } = useQuery({
    queryKey: ["/api/telephony/history"],
    queryFn: async () => {
      const res = await fetch(`/api/telephony/history?limit=100`);
      if (!res.ok) throw new Error("Failed to fetch history");
      return res.json();
    },
    refetchInterval: historyInterval as any,
  });

  const { data: voicemails = [], isLoading: voicemailLoading } = useQuery({
    queryKey: ["/api/telephony/voicemail", "50"],
    queryFn: async () => {
      const res = await fetch(`/api/telephony/voicemail?limit=50`);
      if (!res.ok) throw new Error("Failed to fetch voicemail");
      return res.json();
    },
    refetchInterval: 30000,
  });

  const parseAudio = (meta?: string) => {
    try {
      const m = meta ? JSON.parse(meta) : {};
      return m.audioUrl || m.RecordingUrl || null;
    } catch {
      return null;
    }
  };

  const durationLabel = useMemo(() => {
    const ms = timerRef.current;
    const sec = Math.floor(ms / 1000);
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m}:${String(s).padStart(2, "0")}`;
  }, [status, startTs, activeCall?.state]);

  return (
    <Layout>
      <div className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle>Phone</CardTitle>
            <CardDescription>Unified dialing, history, voicemail, and analytics</CardDescription>
          </CardHeader>
          <CardContent>
            <Tabs value={tab} onValueChange={(v) => setTabAndUrl(v as TabKey)}>
              <TabsList className="grid w-full grid-cols-5">
                <TabsTrigger value="dial">Dial</TabsTrigger>
                <TabsTrigger value="contacts">Contacts</TabsTrigger>
                <TabsTrigger value="history">History</TabsTrigger>
                <TabsTrigger value="voicemail">Voicemail</TabsTrigger>
                <TabsTrigger value="analytics">Analytics</TabsTrigger>
              </TabsList>

              <TabsContent value="dial">
                <div className="grid gap-4 md:grid-cols-2">
                  <Card>
                    <CardHeader>
                      <CardTitle>Dialer</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-3">
                        <Label htmlFor="dialer-number">Phone Number</Label>
                        <div className="flex gap-2 items-center">
                          <Input id="dialer-number" value={number} onChange={(e) => setNumber(e.target.value)} placeholder="Enter number" aria-label="Dialer number input" />
                          <Button variant="secondary" onClick={() => setNumber((prev) => prev + "+")} aria-label="Add plus">
                            <Plus className="w-4 h-4" />
                          </Button>
                        </div>
                        <div className="grid grid-cols-3 gap-2 mt-3" role="group" aria-label="Dialer keypad">
                          {KEYS.map((k) => (
                            <Button key={k} variant="outline" className="h-12 text-xl" onClick={() => setNumber((prev) => prev + k)} aria-label={`Key ${k}`}>
                              {k}
                            </Button>
                          ))}
                        </div>

                        <div className="flex flex-wrap gap-2 mt-4">
                          <Button onClick={() => createCall.mutate({ direction: "outbound", number: formatted })} disabled={!formatted || status === "dialing" || status === "connected"} aria-label="Call">
                            <Phone className="w-4 h-4 mr-2" /> Call
                          </Button>
                          <Button variant="destructive" onClick={() => callId && endCall.mutate({ id: callId, succeeded: true })} disabled={!callId} aria-label="End Call">
                            <PhoneOff className="w-4 h-4 mr-2" /> End
                          </Button>
                          {activeCall && (
                            <>
                              <Button variant="outline" onClick={toggleMute} aria-label="Mute">
                                {activeCall.muted ? <MicOff className="w-4 h-4 mr-2" /> : <Mic className="w-4 h-4 mr-2" />}
                                {activeCall.muted ? "Unmute" : "Mute"}
                              </Button>
                              <Button variant="outline" onClick={toggleHold} aria-label="Hold">
                                {activeCall.state === "held" ? <Play className="w-4 h-4 mr-2" /> : <Pause className="w-4 h-4 mr-2" />}
                                {activeCall.state === "held" ? "Resume" : "Hold"}
                              </Button>
                            </>
                          )}
                        </div>

                        <div className="text-sm text-muted-foreground mt-2" aria-live="polite">
                          Status: {status} {status === "connected" ? `• ${durationLabel}` : ""} • SignalWire: {signalWireReady ? "Connected" : "Connecting…"} • Live: {telephonyWsConnected ? "On" : "Off"}
                        </div>
                      </div>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader>
                      <CardTitle>Quick Search</CardTitle>
                      <CardDescription>Search contacts and click to dial</CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="flex items-center gap-2 mb-2">
                        <Search className="w-4 h-4 text-muted-foreground" />
                        <Input placeholder="Search contacts" value={contactQuery} onChange={(e) => setContactQuery(e.target.value)} />
                      </div>
                      <ScrollArea className="h-64 border rounded-md p-2">
                        {contactsLoading ? (
                          <div className="text-sm text-muted-foreground">Loading…</div>
                        ) : (
                          contacts.map((c: any) => (
                            <div key={c.id} className="flex items-center justify-between py-2">
                              <div>
                                <div className="font-medium">{c.name || "Unknown"}</div>
                                <div className="text-sm text-muted-foreground">{c.numbers?.[0] || "N/A"}</div>
                              </div>
                              <Button
                                size="sm"
                                variant="secondary"
                                onClick={() => {
                                  const next = String(c.numbers?.[0] || "").replace(/[^\d+]/g, "");
                                  setNumber(next);
                                  setTabAndUrl("dial");
                                }}
                              >
                                Dial
                              </Button>
                            </div>
                          ))
                        )}
                      </ScrollArea>
                    </CardContent>
                  </Card>
                </div>
              </TabsContent>

              <TabsContent value="contacts">
                <ContactsManager
                  mode="phone"
                  onDial={(phone) => {
                    setNumber(phone);
                    setTabAndUrl("dial");
                  }}
                />
              </TabsContent>

              <TabsContent value="history">
                <Card>
                  <CardHeader>
                    <CardTitle>Call History</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ScrollArea className="h-[28rem] border rounded-md p-2">
                      {historyLoading ? (
                        <div className="text-sm text-muted-foreground">Loading…</div>
                      ) : (
                        history.map((h: any) => (
                          <div key={h.id} className="flex items-center justify-between py-2">
                            <div className="flex items-center gap-2">
                              <Clock className="w-4 h-4 text-muted-foreground" />
                              <div>
                                <div className="font-medium flex items-center gap-2">
                                  <span>{h.number}</span>
                                  {h.spamLabel ? <Badge variant="destructive">Spam</Badge> : null}
                                </div>
                                <div className="text-xs text-muted-foreground">
                                  {h.direction} • {h.status} • {h.startedAt ? new Date(h.startedAt).toLocaleString() : ""}
                                </div>
                              </div>
                            </div>
                            <div className="flex items-center gap-2">
                              <div className="text-xs text-muted-foreground">{h.durationMs ? Math.round(h.durationMs / 1000) + "s" : ""}</div>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => {
                                  setNumber(String(h.number || ""));
                                  setTabAndUrl("dial");
                                }}
                              >
                                Dial
                              </Button>
                            </div>
                          </div>
                        ))
                      )}
                    </ScrollArea>
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="voicemail">
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Voicemail className="h-4 w-4" /> Voicemail
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ScrollArea className="h-[28rem] border rounded-md p-2">
                      {voicemailLoading ? (
                        <div className="text-sm text-muted-foreground">Loading…</div>
                      ) : (
                        voicemails.map((v: any) => {
                          const audio = v.audioUrl || parseAudio(v.metadata);
                          const number = v.e164 || v.number || "";
                          const ts = v.createdAt || v.startedAt || null;
                          return (
                            <div key={v.id} className="space-y-1 py-2">
                              <div className="flex items-center justify-between">
                                <div>
                                  <div className="font-medium">{number}</div>
                                  <div className="text-xs text-muted-foreground">{ts ? new Date(ts).toLocaleString() : ""}</div>
                                </div>
                                {v.spamLabel ? <Badge variant="destructive">Spam</Badge> : null}
                              </div>
                              {audio ? <audio controls src={audio} className="w-full" /> : <p className="text-xs text-muted-foreground">No recording available</p>}
                            </div>
                          );
                        })
                      )}
                      {!voicemailLoading && voicemails.length === 0 ? <p className="text-sm text-muted-foreground">No voicemails</p> : null}
                    </ScrollArea>
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="analytics">
                <Card>
                  <CardHeader>
                    <CardTitle>Phone Analytics</CardTitle>
                    <CardDescription>Volume, answer rate, and talk time</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <PhoneAnalyticsPanel />
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
}

function PhoneAnalyticsPanel() {
  const { data, isLoading, error } = useQuery({
    queryKey: ["/api/telephony/analytics/summary", "30d"],
    queryFn: async () => {
      const params = new URLSearchParams();
      params.set("rangeDays", "30");
      const res = await fetch(`/api/telephony/analytics/summary?${params.toString()}`);
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
    refetchInterval: 60000,
  });

  if (isLoading) return <div className="text-sm text-muted-foreground">Loading…</div>;
  if (error) return <div className="text-sm text-muted-foreground">Analytics unavailable</div>;

  const answered = Number(data?.answered || 0);
  const missed = Number(data?.missed || 0);
  const failed = Number(data?.failed || 0);
  const total = Number(data?.total || 0);
  const talkSeconds = Number(data?.talkSeconds || 0);
  const answerRate = total > 0 ? Math.round((answered / total) * 100) : 0;

  return (
    <div className="grid gap-3 md:grid-cols-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Total Calls</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-semibold">{total}</div>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Answer Rate</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-semibold">{answerRate}%</div>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Missed</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-semibold">{missed}</div>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Talk Time</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-semibold">{Math.round(talkSeconds / 60)}m</div>
        </CardContent>
      </Card>
      <div className="md:col-span-4 text-xs text-muted-foreground">
        Answered: {answered} • Failed: {failed}
      </div>
    </div>
  );
}
