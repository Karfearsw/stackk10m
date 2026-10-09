import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Layout } from "@/components/layout/Layout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Plus, Trash2, Play, Pause, XCircle, MessageSquare, Mail, Phone,
  Clock, Users, FileText, ChevronRight, Zap, ShieldCheck,
} from "lucide-react";
import { toast } from "sonner";

type Channel = "sms" | "email" | "call_task";

interface StepDraft {
  channel: Channel;
  delay_hours: number;
  subject: string;
  body: string;
}

interface Sequence {
  id: number;
  name: string;
  description: string | null;
  trigger_stage: string | null;
  is_active: boolean;
  active_enrollments: number;
  total_enrollments: number;
  step_count: number;
  steps?: any[];
}

const CHANNEL_META: Record<Channel, { label: string; icon: any; color: string }> = {
  sms: { label: "SMS", icon: MessageSquare, color: "bg-blue-100 text-blue-800" },
  email: { label: "Email", icon: Mail, color: "bg-purple-100 text-purple-800" },
  call_task: { label: "Call Task", icon: Phone, color: "bg-green-100 text-green-800" },
};

function emptyStep(): StepDraft {
  return { channel: "sms", delay_hours: 24, subject: "", body: "" };
}

function SequencesPageInner() {
  const queryClient = useQueryClient();
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [builderOpen, setBuilderOpen] = useState(false);
  const [enrollOpen, setEnrollOpen] = useState(false);
  const [detailTab, setDetailTab] = useState("steps");

  // Builder state
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [triggerStage, setTriggerStage] = useState("");
  const [steps, setSteps] = useState<StepDraft[]>([emptyStep()]);
  const [enrollLeadId, setEnrollLeadId] = useState("");

  const { data, isLoading } = useQuery<{ items: Sequence[] }>({
    queryKey: ["/api/sequences"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/sequences");
      return res.json();
    },
  });

  const { data: detail } = useQuery<any>({
    queryKey: ["/api/sequences", selectedId],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/sequences/${selectedId}`);
      return res.json();
    },
    enabled: selectedId !== null,
  });

  const { data: enrollments } = useQuery<any>({
    queryKey: ["/api/sequences", selectedId, "enrollments"],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/sequences/${selectedId}/enrollments`);
      return res.json();
    },
    enabled: selectedId !== null && detailTab === "enrollments",
  });

  const { data: logs } = useQuery<any>({
    queryKey: ["/api/sequences", selectedId, "logs"],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/sequences/${selectedId}/logs`);
      return res.json();
    },
    enabled: selectedId !== null && detailTab === "logs",
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/sequences", {
        name, description, trigger_stage: triggerStage || null, steps,
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed to create");
      return json;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/sequences"] });
      setBuilderOpen(false);
      setName(""); setDescription(""); setTriggerStage(""); setSteps([emptyStep()]);
      toast.success("Sequence created");
    },
    onError: (e: any) => toast.error(e.message || "Failed to create sequence"),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await apiRequest("DELETE", `/api/sequences/${id}`);
      if (!res.ok) throw new Error("Failed to deactivate");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/sequences"] });
      setSelectedId(null);
      toast.success("Sequence deactivated");
    },
    onError: () => toast.error("Failed to deactivate sequence"),
  });

  const enrollMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/sequences/${selectedId}/enroll`, { lead_id: Number(enrollLeadId) });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed to enroll");
      return json;
    },
    onSuccess: (json: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/sequences"] });
      queryClient.invalidateQueries({ queryKey: ["/api/sequences", selectedId, "enrollments"] });
      setEnrollOpen(false); setEnrollLeadId("");
      toast.success(json.deduped ? "Lead already enrolled" : "Lead enrolled");
    },
    onError: (e: any) => toast.error(e.message || "Failed to enroll lead"),
  });

  const enrollmentAction = useMutation({
    mutationFn: async ({ eid, action }: { eid: number; action: string }) => {
      const res = await apiRequest("POST", `/api/sequences/enrollments/${eid}/${action}`);
      if (!res.ok) throw new Error("Failed");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/sequences", selectedId, "enrollments"] });
      toast.success("Updated");
    },
    onError: () => toast.error("Action failed"),
  });

  const processMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/sequences/process", { limit: 100 });
      return res.json();
    },
    onSuccess: (json: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/sequences"] });
      toast.success(`Processed ${json.processed}: ${json.sent} sent, ${json.skipped} skipped, ${json.suppressed} suppressed, ${json.failed} failed`);
    },
    onError: () => toast.error("Processing failed"),
  });

  const addStep = () => setSteps([...steps, emptyStep()]);
  const removeStep = (i: number) => setSteps(steps.filter((_, idx) => idx !== i));
  const updateStep = (i: number, patch: Partial<StepDraft>) =>
    setSteps(steps.map((s, idx) => (idx === i ? { ...s, ...patch } : s)));

  const sequences = data?.items ?? [];
  const selected = sequences.find((s) => s.id === selectedId);

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Follow-up Sequences</h1>
          <p className="text-sm text-muted-foreground">
            Stage-aware automated follow-ups with quiet hours, consent checks, and opt-out handling.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => processMutation.mutate()} disabled={processMutation.isPending}>
            <Zap className="h-4 w-4 mr-2" /> {processMutation.isPending ? "Processing…" : "Process Due Now"}
          </Button>
          <Button onClick={() => setBuilderOpen(true)}>
            <Plus className="h-4 w-4 mr-2" /> New Sequence
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Sequence list */}
        <div className="lg:col-span-1 space-y-3">
          {isLoading ? (
            <><Skeleton className="h-24 w-full" /><Skeleton className="h-24 w-full" /></>
          ) : sequences.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center text-muted-foreground">
                <FileText className="h-10 w-10 mx-auto mb-3 opacity-50" />
                <p className="font-medium">No sequences yet</p>
                <p className="text-sm">Create your first follow-up sequence to stop leads going cold.</p>
              </CardContent>
            </Card>
          ) : (
            sequences.map((s) => (
              <Card
                key={s.id}
                className={`cursor-pointer transition-colors ${selectedId === s.id ? "border-primary bg-primary/5" : "hover:bg-muted/50"}`}
                onClick={() => { setSelectedId(s.id); setDetailTab("steps"); }}
              >
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <p className="font-medium">{s.name}</p>
                    <Badge variant={s.is_active ? "default" : "secondary"}>
                      {s.is_active ? "Active" : "Inactive"}
                    </Badge>
                  </div>
                  {s.trigger_stage && (
                    <p className="text-xs text-muted-foreground mt-1">Trigger: {s.trigger_stage}</p>
                  )}
                  <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1"><Clock className="h-3 w-3" /> {s.step_count} steps</span>
                    <span className="flex items-center gap-1"><Users className="h-3 w-3" /> {s.active_enrollments} active</span>
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </div>

        {/* Detail panel */}
        <div className="lg:col-span-2">
          {!selected ? (
            <Card>
              <CardContent className="py-16 text-center text-muted-foreground">
                <ChevronRight className="h-10 w-10 mx-auto mb-3 opacity-50" />
                <p>Select a sequence to view steps, enrollments, and logs.</p>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle>{selected.name}</CardTitle>
                    {selected.description && <CardDescription>{selected.description}</CardDescription>}
                  </div>
                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" onClick={() => setEnrollOpen(true)}>
                      <Plus className="h-4 w-4 mr-1" /> Enroll Lead
                    </Button>
                    <Button
                      size="sm" variant="destructive"
                      onClick={() => { if (confirm(`Deactivate "${selected.name}"? Active enrollments will be cancelled.`)) deleteMutation.mutate(selected.id); }}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <Tabs value={detailTab} onValueChange={setDetailTab}>
                  <TabsList>
                    <TabsTrigger value="steps">Steps</TabsTrigger>
                    <TabsTrigger value="enrollments">Enrollments</TabsTrigger>
                    <TabsTrigger value="logs">Execution Log</TabsTrigger>
                  </TabsList>

                  <TabsContent value="steps" className="mt-4">
                    {!detail ? (
                      <Skeleton className="h-32 w-full" />
                    ) : (
                      <div className="space-y-3">
                        {(detail.steps || []).map((st: any, i: number) => {
                          const meta = CHANNEL_META[st.channel as Channel] || CHANNEL_META.sms;
                          const Icon = meta.icon;
                          return (
                            <div key={st.id} className="flex gap-3 items-start rounded-lg border p-3">
                              <div className="flex flex-col items-center">
                                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-primary-foreground text-sm font-medium">
                                  {i + 1}
                                </div>
                                {i < detail.steps.length - 1 && <div className="w-px h-6 bg-border mt-1" />}
                              </div>
                              <div className="flex-1">
                                <div className="flex items-center gap-2">
                                  <Badge className={meta.color}><Icon className="h-3 w-3 mr-1" />{meta.label}</Badge>
                                  <span className="text-xs text-muted-foreground">
                                    {st.delay_hours === 0 ? "immediately" : `after ${st.delay_hours}h`}
                                  </span>
                                </div>
                                {st.subject && <p className="text-sm font-medium mt-1">{st.subject}</p>}
                                <p className="text-sm text-muted-foreground whitespace-pre-wrap mt-1">{st.body}</p>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                    <div className="mt-4 flex items-center gap-2 text-xs text-muted-foreground rounded-lg bg-muted/50 p-3">
                      <ShieldCheck className="h-4 w-4 shrink-0" />
                      Quiet hours (9pm–8am lead local), consent checks, frequency caps (3/24h), and
                      idempotent sends are enforced automatically on every step.
                    </div>
                  </TabsContent>

                  <TabsContent value="enrollments" className="mt-4">
                    {!enrollments ? (
                      <Skeleton className="h-32 w-full" />
                    ) : enrollments.items.length === 0 ? (
                      <p className="text-sm text-muted-foreground text-center py-8">No enrollments yet.</p>
                    ) : (
                      <ScrollArea className="h-[400px]">
                        <div className="space-y-2">
                          {enrollments.items.map((e: any) => (
                            <div key={e.id} className="flex items-center justify-between rounded-lg border p-3">
                              <div>
                                <p className="text-sm font-medium">
                                  {[e.first_name, e.last_name].filter(Boolean).join(" ") || `Lead #${e.lead_id}`}
                                </p>
                                <p className="text-xs text-muted-foreground">
                                  Step {e.current_step + 1} · {e.steps_sent} sent · {e.status}
                                  {e.next_step_due_at && e.status === "active" ? ` · next due ${new Date(e.next_step_due_at).toLocaleString()}` : ""}
                                </p>
                              </div>
                              <div className="flex gap-1">
                                {e.status === "active" && (
                                  <Button size="sm" variant="outline" onClick={() => enrollmentAction.mutate({ eid: e.id, action: "pause" })}>
                                    <Pause className="h-3 w-3" />
                                  </Button>
                                )}
                                {e.status === "paused" && (
                                  <Button size="sm" variant="outline" onClick={() => enrollmentAction.mutate({ eid: e.id, action: "resume" })}>
                                    <Play className="h-3 w-3" />
                                  </Button>
                                )}
                                {(e.status === "active" || e.status === "paused") && (
                                  <Button size="sm" variant="outline" onClick={() => enrollmentAction.mutate({ eid: e.id, action: "cancel" })}>
                                    <XCircle className="h-3 w-3" />
                                  </Button>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      </ScrollArea>
                    )}
                  </TabsContent>

                  <TabsContent value="logs" className="mt-4">
                    {!logs ? (
                      <Skeleton className="h-32 w-full" />
                    ) : logs.items.length === 0 ? (
                      <p className="text-sm text-muted-foreground text-center py-8">No executions logged yet.</p>
                    ) : (
                      <ScrollArea className="h-[400px]">
                        <div className="space-y-2">
                          {logs.items.map((l: any) => (
                            <div key={l.id} className="rounded-lg border p-3 text-sm">
                              <div className="flex items-center justify-between">
                                <Badge variant={l.status === "sent" ? "default" : l.status === "failed" ? "destructive" : "secondary"}>
                                  {l.status}
                                </Badge>
                                <span className="text-xs text-muted-foreground">
                                  {new Date(l.executed_at).toLocaleString()}
                                </span>
                              </div>
                              <p className="text-xs text-muted-foreground mt-1">
                                {l.channel} · Lead #{l.lead_id}{l.error ? ` · ${l.error}` : ""}
                              </p>
                            </div>
                          ))}
                        </div>
                      </ScrollArea>
                    )}
                  </TabsContent>
                </Tabs>
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      {/* Builder dialog */}
      <Dialog open={builderOpen} onOpenChange={setBuilderOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>New Follow-up Sequence</DialogTitle>
            <DialogDescription>
              Define the steps agents' leads will receive. Use {"{{firstName}}"}, {"{{address}}"}, {"{{city}}"} as placeholders.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Name</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. New Lead Nurture — 7 Day" />
            </div>
            <div>
              <Label>Description</Label>
              <Textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What is this sequence for?" />
            </div>
            <div>
              <Label>Trigger stage (optional)</Label>
              <Input value={triggerStage} onChange={(e) => setTriggerStage(e.target.value)} placeholder="e.g. new_lead" />
            </div>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label>Steps</Label>
                <Button size="sm" variant="outline" onClick={addStep}><Plus className="h-3 w-3 mr-1" /> Add step</Button>
              </div>
              {steps.map((st, i) => (
                <Card key={i}>
                  <CardContent className="p-3 space-y-2">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-muted-foreground">#{i + 1}</span>
                      <Select value={st.channel} onValueChange={(v) => updateStep(i, { channel: v as Channel })}>
                        <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="sms">SMS</SelectItem>
                          <SelectItem value="email">Email</SelectItem>
                          <SelectItem value="call_task">Call Task</SelectItem>
                        </SelectContent>
                      </Select>
                      <div className="flex items-center gap-1">
                        <Input
                          type="number" min={0} value={st.delay_hours}
                          onChange={(e) => updateStep(i, { delay_hours: Number(e.target.value) })}
                          className="w-20"
                        />
                        <span className="text-xs text-muted-foreground">hrs after prev</span>
                      </div>
                      <Button size="sm" variant="ghost" className="ml-auto" onClick={() => removeStep(i)}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                    {st.channel === "email" && (
                      <Input value={st.subject} onChange={(e) => updateStep(i, { subject: e.target.value })} placeholder="Email subject" />
                    )}
                    {st.channel !== "call_task" ? (
                      <Textarea value={st.body} onChange={(e) => updateStep(i, { body: e.target.value })} placeholder={st.channel === "sms" ? "SMS message…" : "Email body…"} />
                    ) : (
                      <Textarea value={st.body} onChange={(e) => updateStep(i, { body: e.target.value })} placeholder="Call instructions for the agent…" />
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBuilderOpen(false)}>Cancel</Button>
            <Button onClick={() => createMutation.mutate()} disabled={createMutation.isPending || !name.trim()}>
              {createMutation.isPending ? "Creating…" : "Create Sequence"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Enroll dialog */}
      <Dialog open={enrollOpen} onOpenChange={setEnrollOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Enroll Lead</DialogTitle>
            <DialogDescription>Enter the lead ID to enroll in "{selected?.name}".</DialogDescription>
          </DialogHeader>
          <Input
            type="number" value={enrollLeadId}
            onChange={(e) => setEnrollLeadId(e.target.value)}
            placeholder="Lead ID"
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setEnrollOpen(false)}>Cancel</Button>
            <Button onClick={() => enrollMutation.mutate()} disabled={enrollMutation.isPending || !enrollLeadId}>
              Enroll
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}


export default function SequencesPage() {
  return (
    <Layout>
      <SequencesPageInner />
    </Layout>
  );
}
