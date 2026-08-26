import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Layout } from "@/components/layout/Layout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { toast } from "sonner";
import {
  Search, Phone, PhoneOff, Mic, MicOff, Pause, Play, Bot, PhoneForwarded,
  Loader2, MessageSquare, Video, Send, StickyNote, CalendarClock, Clock, Plus, Users,
} from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/contexts/AuthContext";
import { useSignalWire } from "@/hooks/useSignalWire";
import { useTelephonyEvents } from "@/hooks/useTelephonyEvents";
import { VideoCallDialog } from "@/components/video/VideoCallDialog";

function formatE164(raw: string) {
  const digits = raw.replace(/[^\d+]/g, "");
  if (digits.startsWith("+")) return digits;
  if (digits.length === 10) return "+1" + digits;
  return digits;
}

function timeAgo(iso: string | null | undefined): string {
  if (!iso) return "";
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return "";
  const s = Math.max(0, Math.floor((Date.now() - t) / 1000));
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

type LeftFilter = "leads" | "calls" | "sms" | "meetings";
type CenterTab = "dialer" | "sms" | "video" | "timeline" | "notes";

export default function CommunicationsWorkspace() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [, setLocation] = useLocation();

  const {
    call: activeCall,
    error: telnyxError,
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

  const initialLeadId = useMemo(() => {
    if (typeof window === "undefined") return null;
    const raw = new URLSearchParams(window.location.search).get("leadId");
    const n = raw ? parseInt(raw, 10) : NaN;
    return Number.isFinite(n) && n > 0 ? n : null;
  }, []);

  const [leftFilter, setLeftFilter] = useState<LeftFilter>("leads");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedLeadId, setSelectedLeadId] = useState<number | null>(initialLeadId);
  const [selectedThreadPhone, setSelectedThreadPhone] = useState<string | null>(null);
  const [centerTab, setCenterTab] = useState<CenterTab>("dialer");

  // Dialer
  const [number, setNumber] = useState("");
  const [callStatus, setCallStatus] = useState<"idle" | "dialing" | "ringing" | "connected" | "ended" | "failed">("idle");
  const [elapsedMs, setElapsedMs] = useState(0);
  const [transferOpen, setTransferOpen] = useState(false);
  const [transferNumber, setTransferNumber] = useState("");
  const [transferBusy, setTransferBusy] = useState(false);
  const [aiAssistantBusy, setAiAssistantBusy] = useState(false);
  const startTsRef = useRef<number | null>(null);

  // SMS
  const [smsBody, setSmsBody] = useState("");
  const [noteBody, setNoteBody] = useState("");
  const [taskTitle, setTaskTitle] = useState("");
  const [taskDue, setTaskDue] = useState("");

  // Video
  const [videoOpen, setVideoOpen] = useState(false);
  const [videoRoomId, setVideoRoomId] = useState("");
  const [videoRoomName, setVideoRoomName] = useState("");
  const [videoBusy, setVideoBusy] = useState(false);

  const selectedLead = useQuery<any>({
    queryKey: ["/api/leads", selectedLeadId],
    enabled: !!selectedLeadId,
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/leads/${selectedLeadId}`);
      return await res.json();
    },
  });

  const lead = selectedLead.data;
  const leadPhone = lead?.ownerPhone || selectedThreadPhone || "";
  const effectivePhone = number || leadPhone;

  // Sync dialer number when a lead/thread is selected
  useEffect(() => {
    if (lead?.ownerPhone) setNumber(lead.ownerPhone);
    else if (selectedThreadPhone) setNumber(selectedThreadPhone);
    else setNumber("");
  }, [lead?.ownerPhone, selectedThreadPhone]);

  // Elapsed timer for the active call
  useEffect(() => {
    if (callStatus !== "connected") return;
    const iv = window.setInterval(() => {
      if (startTsRef.current) setElapsedMs(Date.now() - startTsRef.current);
    }, 500);
    return () => window.clearInterval(iv);
  }, [callStatus]);

  // Live provider call-state events
  useTelephonyEvents({
    enabled: true,
    onCallStateChanged: (evt) => {
      if (evt.callControlId && callControlId && evt.callControlId !== callControlId) return;
      if (!evt.state) return;
      updateCallState(evt.state);
      const s = String(evt.state).toLowerCase();
      if (s === "answered" || s === "active" || s === "in_progress") {
        setCallStatus("connected");
        if (!startTsRef.current) startTsRef.current = Date.now();
      } else if (s === "ringing" || s === "dialing") {
        setCallStatus("ringing");
      } else if (s === "ended" || s === "completed" || s === "finished" || s === "hangup" || s === "no_answer" || s === "missed") {
        setCallStatus("ended");
        startTsRef.current = null;
        setElapsedMs(0);
      } else if (s === "failed" || s === "busy" || s === "rejected") {
        setCallStatus("failed");
        startTsRef.current = null;
        setElapsedMs(0);
      }
      if (selectedLeadId) queryClient.invalidateQueries({ queryKey: ["/api/activity"] });
    },
  });

  // ── Left panel data ────────────────────────────────────────────────
  const leadsQuery = useQuery<any>({
    queryKey: ["/api/leads", "workspace", searchQuery],
    queryFn: async () => {
      const q = searchQuery.trim();
      const url = q ? `/api/leads?q=${encodeURIComponent(q)}&limit=25` : "/api/leads?limit=25";
      const res = await apiRequest("GET", url);
      const json = await res.json();
      return Array.isArray(json) ? json : json?.items || [];
    },
  });

  const callsQuery = useQuery<any[]>({
    queryKey: ["/api/telephony/history", "workspace"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/telephony/history?limit=15");
      const json = await res.json();
      return Array.isArray(json) ? json : [];
    },
  });

  const threadsQuery = useQuery<any>({
    queryKey: ["/api/telephony/sms/threads"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/telephony/sms/threads?limit=15");
      const json = await res.json();
      return json?.threads || [];
    },
  });

  const meetingsQuery = useQuery<any>({
    queryKey: ["/api/video/rooms", "workspace"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/video/rooms?limit=10");
      const json = await res.json();
      return json?.rooms || [];
    },
  });

  const threadMessages = useQuery<any>({
    queryKey: ["/api/telephony/sms/threads", selectedThreadPhone, "messages"],
    enabled: !!selectedThreadPhone,
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/telephony/sms/threads/${encodeURIComponent(selectedThreadPhone!)}/messages?limit=100`);
      const json = await res.json();
      return json?.messages || [];
    },
  });

  const activityQuery = useQuery<any[]>({
    queryKey: ["/api/activity", selectedLeadId],
    enabled: !!selectedLeadId,
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/activity?leadId=${selectedLeadId}&limit=50`);
      const json = await res.json();
      return Array.isArray(json) ? json : [];
    },
  });

  const notesQuery = useQuery<any>({
    queryKey: ["/api/leads", selectedLeadId, "notes"],
    enabled: !!selectedLeadId,
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/leads/${selectedLeadId}/notes?limit=30`);
      const json = await res.json();
      return json?.items || [];
    },
  });

  // ── Actions ────────────────────────────────────────────────────────
  const handleDial = async (to: string) => {
    if (!to.trim()) return;
    setCallStatus("dialing");
    startTsRef.current = null;
    setElapsedMs(0);
    try {
      await makeCall(formatE164(to), {
        metadata: selectedLeadId ? { leadId: selectedLeadId } : null,
      });
      setCallStatus("ringing");
    } catch (e: any) {
      setCallStatus("failed");
      toast.error(e?.message || "Call failed");
    }
  };

  const handleEnd = async () => {
    setCallStatus("ended");
    startTsRef.current = null;
    setElapsedMs(0);
    try {
      await endCall();
    } catch {}
  };

  const sendSms = useMutation({
    mutationFn: async ({ to, body }: { to: string; body: string }) => {
      const res = await apiRequest("POST", "/api/telephony/sms", {
        to: formatE164(to),
        body,
        metadata: selectedLeadId ? { leadId: selectedLeadId } : { threadPhone: to },
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || "SMS send failed");
      return json;
    },
    onSuccess: () => {
      toast.success("SMS sent");
      setSmsBody("");
      if (selectedThreadPhone) queryClient.invalidateQueries({ queryKey: ["/api/telephony/sms/threads"] });
      if (selectedLeadId) queryClient.invalidateQueries({ queryKey: ["/api/activity"] });
    },
    onError: (e: any) => toast.error(e?.message || "SMS send failed"),
  });

  const addNote = useMutation({
    mutationFn: async (body: string) => {
      const res = await apiRequest("POST", `/api/leads/${selectedLeadId}/notes`, { body });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.message || "Failed to add note");
      return json;
    },
    onSuccess: () => {
      toast.success("Note added");
      setNoteBody("");
      queryClient.invalidateQueries({ queryKey: ["/api/leads", selectedLeadId, "notes"] });
      queryClient.invalidateQueries({ queryKey: ["/api/activity"] });
    },
    onError: (e: any) => toast.error(e?.message || "Failed to add note"),
  });

  const createTask = useMutation({
    mutationFn: async (input: { title: string; dueDate?: string }) => {
      const res = await apiRequest("POST", "/api/tasks", {
        title: input.title,
        type: "follow_up",
        priority: "normal",
        relatedEntityType: "lead",
        relatedEntityId: selectedLeadId,
        dueDate: input.dueDate ? new Date(input.dueDate).toISOString() : null,
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.message || "Failed to create task");
      return json;
    },
    onSuccess: () => {
      toast.success("Task created");
      setTaskTitle("");
      setTaskDue("");
      queryClient.invalidateQueries({ queryKey: ["/api/activity"] });
    },
    onError: (e: any) => toast.error(e?.message || "Failed to create task"),
  });

  const createMeeting = async () => {
    if (!selectedLeadId && !selectedThreadPhone) return;
    setVideoBusy(true);
    try {
      const res = await apiRequest("POST", "/api/video/rooms", {
        name: lead?.ownerName ? `Meeting with ${lead.ownerName}` : `Meeting with ${selectedThreadPhone || ""}`,
        maxParticipants: 4,
        propertyId: undefined,
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || "Failed to create meeting");
      const room = json?.room || json;
      const roomId = room?.room_id || room?.roomId || room?.id;
      if (!roomId) throw new Error("No room id returned");
      setVideoRoomId(roomId);
      setVideoRoomName(room?.name || "Meeting");
      setVideoOpen(true);
      toast.success("Meeting created");
    } catch (e: any) {
      toast.error(e?.message || "Failed to create meeting");
    } finally {
      setVideoBusy(false);
    }
  };

  const handleTransfer = async () => {
    setTransferBusy(true);
    try {
      await transferCall(formatE164(transferNumber));
      toast.success("Call transferred");
      setTransferOpen(false);
      setTransferNumber("");
    } catch (e: any) {
      toast.error(e?.message || "Transfer failed");
    } finally {
      setTransferBusy(false);
    }
  };

  const selectLead = (id: number) => {
    setSelectedLeadId(id);
    setSelectedThreadPhone(null);
    setLocation(`/workspace/communications?leadId=${id}`, { replace: true });
  };

  const selectThread = (phone: string) => {
    setSelectedThreadPhone(phone);
    setSelectedLeadId(null);
    setCenterTab("sms");
  };

  const selectCall = (c: any) => {
    if (c?.leadId) {
      selectLead(Number(c.leadId));
    } else if (c?.number) {
      setSelectedThreadPhone(String(c.number));
      setSelectedLeadId(null);
    }
  };

  const isConnected = callStatus === "connected" || callStatus === "ringing" || callStatus === "dialing";

  return (
    <Layout>
      <div className="container mx-auto p-4 md:p-6 space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div>
            <h1 className="text-2xl font-bold">Communications Workspace</h1>
            <p className="text-sm text-muted-foreground">Calls, SMS, video meetings, and history for your leads — all in one place.</p>
          </div>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <span className="flex items-center gap-1"><span className={`w-2 h-2 rounded-full ${callStatus === "connected" ? "bg-green-500 animate-pulse" : callStatus === "ringing" || callStatus === "dialing" ? "bg-amber-500 animate-pulse" : "bg-gray-300"}`} /> {callStatus}</span>
            {callStatus === "connected" ? <span>• {Math.floor(elapsedMs / 1000)}s</span> : null}
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 min-h-[70vh]">
          {/* ── LEFT PANEL ── */}
          <Card className="lg:col-span-3 min-w-0">
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Queue & History</CardTitle>
              <CardDescription>Search leads or browse recent activity</CardDescription>
              <div className="flex items-center gap-2 mt-1">
                <Search className="w-4 h-4 text-muted-foreground shrink-0" />
                <Input
                  value={searchQuery}
                  onChange={(e) => {
                    setSearchQuery(e.target.value);
                    if (e.target.value) setLeftFilter("leads");
                  }}
                  placeholder="Search leads…"
                  className="h-8 text-sm"
                />
              </div>
              <div className="flex flex-wrap gap-1 pt-1">
                {(["leads", "calls", "sms", "meetings"] as LeftFilter[]).map((f) => (
                  <Button key={f} size="sm" variant={leftFilter === f ? "secondary" : "ghost"} className="h-7 px-2 text-xs capitalize" onClick={() => setLeftFilter(f)}>
                    {f}
                  </Button>
                ))}
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <ScrollArea className="h-[62vh]">
                {leftFilter === "leads" && (
                  <div className="divide-y divide-border">
                    {leadsQuery.isLoading && <p className="p-3 text-sm text-muted-foreground">Loading…</p>}
                    {!leadsQuery.isLoading && (leadsQuery.data || []).length === 0 && <p className="p-3 text-sm text-muted-foreground">No leads found.</p>}
                    {(leadsQuery.data || []).map((l: any) => (
                      <button key={l.id} onClick={() => selectLead(Number(l.id))} className={`w-full text-left px-3 py-2 hover:bg-muted/50 transition-colors ${selectedLeadId === Number(l.id) ? "bg-primary/10" : ""}`}>
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-sm font-medium truncate">{l.ownerName || "Unnamed"}</span>
                          <Badge variant="secondary" className="text-[10px] shrink-0">{l.status || "new"}</Badge>
                        </div>
                        <div className="text-xs text-muted-foreground truncate">{l.address}, {l.city} {l.state}</div>
                        <div className="text-xs text-muted-foreground truncate">{l.ownerPhone || "—"}</div>
                      </button>
                    ))}
                  </div>
                )}
                {leftFilter === "calls" && (
                  <div className="divide-y divide-border">
                    {(callsQuery.data || []).length === 0 && <p className="p-3 text-sm text-muted-foreground">No recent calls.</p>}
                    {(callsQuery.data || []).map((c: any) => (
                      <button key={c.id} onClick={() => selectCall(c)} className="w-full text-left px-3 py-2 hover:bg-muted/50 transition-colors">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-sm font-medium truncate">{c.number || "—"}</span>
                          <Badge variant={c.status === "answered" ? "secondary" : c.status === "failed" ? "destructive" : "outline"} className="text-[10px] shrink-0">{c.status || "—"}</Badge>
                        </div>
                        <div className="text-xs text-muted-foreground truncate">{c.direction} • {timeAgo(c.createdAt || c.startedAt)}</div>
                      </button>
                    ))}
                  </div>
                )}
                {leftFilter === "sms" && (
                  <div className="divide-y divide-border">
                    {(threadsQuery.data || []).length === 0 && <p className="p-3 text-sm text-muted-foreground">No SMS conversations yet.</p>}
                    {(threadsQuery.data || []).map((t: any) => (
                      <button key={t.id || t.fromNumber} onClick={() => selectThread(String(t.fromNumber || t.toNumber))} className="w-full text-left px-3 py-2 hover:bg-muted/50 transition-colors">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-sm font-medium truncate">{t.fromNumber || t.toNumber}</span>
                          <span className="text-[10px] text-muted-foreground shrink-0">{t.messageCount} msgs</span>
                        </div>
                        <div className="text-xs text-muted-foreground truncate">{t.body || "…"}</div>
                      </button>
                    ))}
                  </div>
                )}
                {leftFilter === "meetings" && (
                  <div className="divide-y divide-border">
                    {(meetingsQuery.data || []).length === 0 && <p className="p-3 text-sm text-muted-foreground">No meetings.</p>}
                    {(meetingsQuery.data || []).map((m: any) => (
                      <div key={m.id} className="px-3 py-2">
                        <div className="text-sm font-medium truncate">{m.name || "Meeting"}</div>
                        <div className="text-xs text-muted-foreground truncate">{timeAgo(m.created_at || m.createdAt)}</div>
                        {m.room_id && (
                          <Button size="sm" variant="outline" className="mt-1 h-7 text-xs" onClick={() => { setVideoRoomId(String(m.room_id)); setVideoRoomName(m.name || "Meeting"); setVideoOpen(true); }}>
                            <Video className="w-3 h-3 mr-1" /> Join
                          </Button>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </ScrollArea>
            </CardContent>
          </Card>

          {/* ── CENTER PANEL ── */}
          <Card className="lg:col-span-6 min-w-0">
            <CardHeader className="pb-3">
              {lead ? (
                <div className="flex items-start justify-between gap-2 flex-wrap">
                  <div>
                    <CardTitle className="text-lg">{lead.ownerName || "Unnamed lead"}</CardTitle>
                    <CardDescription className="text-xs">{lead.address}, {lead.city} {lead.state} {lead.zipCode}</CardDescription>
                  </div>
                  <div className="text-right text-xs text-muted-foreground space-y-0.5">
                    <div>{lead.ownerPhone || "—"}</div>
                    <div>{lead.ownerEmail || "—"}</div>
                    <div className="flex items-center justify-end gap-2">
                      <Badge variant="secondary" className="text-[10px]">{lead.status || "new"}</Badge>
                      {lead.motivation ? <Badge variant="outline" className="text-[10px]">{lead.motivation}</Badge> : null}
                    </div>
                  </div>
                </div>
              ) : selectedThreadPhone ? (
                <div>
                  <CardTitle className="text-lg">{selectedThreadPhone}</CardTitle>
                  <CardDescription className="text-xs">SMS conversation — no linked lead</CardDescription>
                </div>
              ) : (
                <div>
                  <CardTitle className="text-lg">Select a lead or conversation</CardTitle>
                  <CardDescription className="text-xs">Pick an item from the left panel to load the workspace.</CardDescription>
                </div>
              )}
            </CardHeader>
            <CardContent>
              {!lead && !selectedThreadPhone ? (
                <div className="flex flex-col items-center justify-center py-24 text-muted-foreground">
                  <Phone className="w-10 h-10 mb-2 opacity-40" />
                  <p className="text-sm">Nothing selected yet</p>
                </div>
              ) : (
                <Tabs value={centerTab} onValueChange={(v) => setCenterTab(v as CenterTab)}>
                  <TabsList className="w-full justify-start overflow-x-auto">
                    <TabsTrigger value="dialer"><Phone className="w-3.5 h-3.5 mr-1" /> Dialer</TabsTrigger>
                    <TabsTrigger value="sms"><MessageSquare className="w-3.5 h-3.5 mr-1" /> SMS</TabsTrigger>
                    <TabsTrigger value="video"><Video className="w-3.5 h-3.5 mr-1" /> Video</TabsTrigger>
                    <TabsTrigger value="timeline"><Clock className="w-3.5 h-3.5 mr-1" /> Timeline</TabsTrigger>
                    <TabsTrigger value="notes"><StickyNote className="w-3.5 h-3.5 mr-1" /> Notes</TabsTrigger>
                  </TabsList>

                  <TabsContent value="dialer" className="space-y-3 mt-3">
                    <div className="space-y-1">
                      <Label htmlFor="workspace-dial-number">Number</Label>
                      <div className="flex gap-2">
                        <Input id="workspace-dial-number" value={number} onChange={(e) => setNumber(e.target.value)} placeholder="+1 (321) 294-0738" className="font-mono" />
                        <Button onClick={() => handleDial(number)} disabled={!number.trim() || (isConnected && !activeCall)}>
                          <Phone className="w-4 h-4 mr-2" /> Call
                        </Button>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Button variant="destructive" onClick={handleEnd} disabled={!isConnected && !activeCall}>
                        <PhoneOff className="w-4 h-4 mr-2" /> End
                      </Button>
                      {activeCall && (
                        <>
                          <Button variant="outline" onClick={toggleMute}>
                            {activeCall.muted ? <MicOff className="w-4 h-4 mr-2" /> : <Mic className="w-4 h-4 mr-2" />}
                            {activeCall.muted ? "Unmute" : "Mute"}
                          </Button>
                          <Button variant="outline" onClick={toggleHold}>
                            {activeCall.state === "held" ? <Play className="w-4 h-4 mr-2" /> : <Pause className="w-4 h-4 mr-2" />}
                            {activeCall.state === "held" ? "Resume" : "Hold"}
                          </Button>
                          <Button variant="outline" onClick={() => setTransferOpen((v) => !v)} disabled={transferBusy}>
                            <PhoneForwarded className="w-4 h-4 mr-2" /> Transfer
                          </Button>
                          <Button
                            variant="outline"
                            onClick={() => {
                              if (aiAssistantBusy) return;
                              setAiAssistantBusy(true);
                              const done = () => setAiAssistantBusy(false);
                              if (aiAssistantActive) stopAiAssistant().finally(done);
                              else startAiAssistant().catch((e: any) => toast.error(e?.message || "Failed to start AI Screener")).finally(done);
                            }}
                            disabled={aiAssistantBusy}
                          >
                            <Bot className="w-4 h-4 mr-2" />
                            {aiAssistantActive ? "Stop AI Screener" : "Start AI Screener"}
                          </Button>
                        </>
                      )}
                    </div>
                    {transferOpen && (
                      <div className="flex items-center gap-2">
                        <Input value={transferNumber} onChange={(e) => setTransferNumber(e.target.value)} placeholder="Destination (E.164)" className="font-mono text-sm" aria-label="Transfer destination number" />
                        <Button variant="secondary" onClick={handleTransfer} disabled={transferBusy || !transferNumber.trim()}>
                          {transferBusy ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <PhoneForwarded className="w-4 h-4 mr-1" />} Confirm
                        </Button>
                      </div>
                    )}
                    <div className="text-sm text-muted-foreground">
                      Status: {callStatus} {callStatus === "connected" ? `• ${Math.floor(elapsedMs / 1000)}s` : ""}
                      {aiAssistantActive ? <span className="text-primary"> • AI Screener on</span> : null}
                      {telnyxError ? <span className="text-destructive"> • {telnyxError}</span> : null}
                    </div>
                  </TabsContent>

                  <TabsContent value="sms" className="mt-3">
                    <ScrollArea className="h-[34vh] border rounded-md p-3 space-y-2">
                      {selectedThreadPhone && (threadMessages.data || []).length === 0 && <p className="text-sm text-muted-foreground">No messages in this thread yet.</p>}
                      {(threadMessages.data || []).map((m: any) => (
                        <div key={m.id} className={`flex ${m.direction === "outbound" ? "justify-end" : "justify-start"}`}>
                          <div className={`max-w-[75%] rounded-lg px-3 py-2 text-sm ${m.direction === "outbound" ? "bg-primary text-primary-foreground" : "bg-muted"}`}>
                            <p className="whitespace-pre-wrap break-words">{m.body}</p>
                            <div className="text-[10px] opacity-70 mt-1 flex items-center gap-2">
                              <span>{timeAgo(m.created_at || m.createdAt)}</span>
                              <span>{m.status || ""}</span>
                            </div>
                          </div>
                        </div>
                      ))}
                      {!selectedThreadPhone && <p className="text-sm text-muted-foreground">Pick an SMS thread from the left, or send to the lead's number below.</p>}
                    </ScrollArea>
                    <div className="mt-3 space-y-2">
                      <Textarea value={smsBody} onChange={(e) => setSmsBody(e.target.value)} placeholder="Write a message…" rows={3} />
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-muted-foreground">{smsBody.length} / 160 chars</span>
                        <Button onClick={() => sendSms.mutate({ to: effectivePhone, body: smsBody })} disabled={!effectivePhone || !smsBody.trim() || sendSms.isPending}>
                          {sendSms.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Send className="w-4 h-4 mr-2" />} Send
                        </Button>
                      </div>
                    </div>
                  </TabsContent>

                  <TabsContent value="video" className="space-y-3 mt-3">
                    <div className="rounded-md border p-4 text-sm space-y-2">
                      <p className="font-medium flex items-center gap-2"><Video className="w-4 h-4" /> Video Meeting</p>
                      <p className="text-xs text-muted-foreground">
                        Creates a secure Telnyx room. Join with a short-lived token — no API keys are exposed to the browser.
                      </p>
                      <Button onClick={createMeeting} disabled={videoBusy || (!selectedLeadId && !selectedThreadPhone)}>
                        {videoBusy ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Video className="w-4 h-4 mr-2" />}
                        {selectedLeadId ? `Create meeting with ${lead?.ownerName || "lead"}` : "Create meeting"}
                      </Button>
                    </div>
                  </TabsContent>

                  <TabsContent value="timeline" className="mt-3">
                    <ScrollArea className="h-[42vh]">
                      {(activityQuery.data || []).length === 0 && <p className="text-sm text-muted-foreground">No activity yet for this lead.</p>}
                      <div className="space-y-2">
                        {(activityQuery.data || []).map((a: any) => (
                          <div key={a.id} className="rounded-md border p-2.5 text-sm">
                            <div className="flex items-center justify-between gap-2">
                              <span className="font-mono text-[10px] text-muted-foreground">{a.action}</span>
                              <span className="text-[10px] text-muted-foreground shrink-0">{timeAgo(a.createdAt)}</span>
                            </div>
                            <p className="mt-1 text-xs">{a.description || ""}</p>
                          </div>
                        ))}
                      </div>
                    </ScrollArea>
                  </TabsContent>

                  <TabsContent value="notes" className="mt-3">
                    <div className="space-y-2">
                      <Textarea value={noteBody} onChange={(e) => setNoteBody(e.target.value)} placeholder="Add a note…" rows={3} />
                      <div className="flex justify-end">
                        <Button onClick={() => addNote.mutate(noteBody)} disabled={!noteBody.trim() || addNote.isPending}>
                          {addNote.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <StickyNote className="w-4 h-4 mr-2" />} Add Note
                        </Button>
                      </div>
                    </div>
                    <ScrollArea className="h-[30vh] mt-3">
                      <div className="space-y-2">
                        {(notesQuery.data || []).length === 0 && <p className="text-sm text-muted-foreground">No notes yet.</p>}
                        {(notesQuery.data || []).map((n: any) => (
                          <div key={n.id} className="rounded-md border p-2.5 text-sm">
                            <p className="text-xs whitespace-pre-wrap">{n.body || n.content || ""}</p>
                            <div className="text-[10px] text-muted-foreground mt-1">{timeAgo(n.createdAt)}</div>
                          </div>
                        ))}
                      </div>
                    </ScrollArea>
                  </TabsContent>
                </Tabs>
              )}
            </CardContent>
          </Card>

          {/* ── RIGHT PANEL ── */}
          <Card className="lg:col-span-3 min-w-0">
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Timeline & Actions</CardTitle>
              <CardDescription>Recent activity and quick actions</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {selectedLeadId ? (
                <>
                  <div className="rounded-md border p-3 space-y-2">
                    <p className="text-xs font-medium text-muted-foreground uppercase">Quick actions</p>
                    <div className="space-y-2">
                      <div className="space-y-1">
                        <Label htmlFor="quick-task-title" className="text-xs">Task title</Label>
                        <div className="flex gap-1">
                          <Input id="quick-task-title" value={taskTitle} onChange={(e) => setTaskTitle(e.target.value)} placeholder="Follow up with seller" className="h-8 text-xs" />
                          <Button size="sm" variant="secondary" className="h-8 shrink-0" onClick={() => taskTitle.trim() && createTask.mutate({ title: taskTitle.trim() })} disabled={createTask.isPending || !taskTitle.trim()}>
                            <Plus className="w-3 h-3" />
                          </Button>
                        </div>
                      </div>
                      <div className="flex items-center gap-1">
                        <Input type="datetime-local" value={taskDue} onChange={(e) => setTaskDue(e.target.value)} className="h-8 text-xs" aria-label="Follow-up due date" />
                        <Button size="sm" className="h-8 shrink-0" onClick={() => createTask.mutate({ title: `Follow-up: ${lead?.ownerName || "lead"}`, dueDate: taskDue })} disabled={!taskDue || createTask.isPending}>
                          <CalendarClock className="w-3 h-3 mr-1" /> Schedule
                        </Button>
                      </div>
                    </div>
                  </div>
                  <ScrollArea className="h-[46vh]">
                    <div className="space-y-2">
                      {(activityQuery.data || []).length === 0 && <p className="text-sm text-muted-foreground">No activity yet.</p>}
                      {(activityQuery.data || []).map((a: any) => (
                        <div key={a.id} className="rounded-md border p-2.5 text-sm">
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-mono text-[10px] text-muted-foreground">{a.action}</span>
                            <span className="text-[10px] text-muted-foreground shrink-0">{timeAgo(a.createdAt)}</span>
                          </div>
                          <p className="mt-1 text-xs">{a.description || ""}</p>
                        </div>
                      ))}
                    </div>
                  </ScrollArea>
                </>
              ) : (
                <div className="text-sm text-muted-foreground">Select a lead to see its timeline and quick actions.</div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      <VideoCallDialog
        open={videoOpen}
        onOpenChange={setVideoOpen}
        roomId={videoRoomId}
        roomName={videoRoomName}
        participantName={`${user?.firstName || ""} ${user?.lastName || ""}`.trim() || user?.email || "Agent"}
      />
    </Layout>
  );
}
