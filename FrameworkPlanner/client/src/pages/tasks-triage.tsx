import { Layout } from "@/components/layout/Layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/contexts/AuthContext";
import { apiRequest } from "@/lib/queryClient";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format, formatDistanceToNow } from "date-fns";
import { AlertTriangle, CheckCircle2, Clock, Loader2, Play, Plus, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

type OverdueTask = {
  id: number; title: string; description: string | null; type: string | null;
  relatedEntityType: string | null; relatedEntityId: number | null;
  dueAt: string | null; priority: string | null; status: string | null;
  assignedToUserId: number | null; triageStatus: string | null;
  escalatedAt: string | null; createdAt: string;
};
type UserOpt = { id: number; email: string; firstName?: string | null; lastName?: string | null };
type SlaRule = { id: number; name: string; taskType: string; slaHours: number; escalationUserId: number | null; isActive: boolean };

function userLabel(u: UserOpt) {
  const n = `${u.firstName || ""} ${u.lastName || ""}`.trim();
  return n || u.email;
}
function ageLabel(dueAt: string | null) {
  if (!dueAt) return "—";
  return formatDistanceToNow(new Date(dueAt), { addSuffix: true });
}

export default function TasksTriage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [tab, setTab] = useState("overdue");
  // filters
  const [fAssignee, setFAssignee] = useState("all");
  const [fType, setFType] = useState("all");
  const [fAge, setFAge] = useState("all");
  // bulk selection
  const [selected, setSelected] = useState<Set<number>>(new Set());
  // triage modal
  const [triageOpen, setTriageOpen] = useState(false);
  const [triageAction, setTriageAction] = useState<"complete" | "reschedule" | "cancel" | "merge" | "archive">("complete");
  const [triageReason, setTriageReason] = useState("");
  const [triageDue, setTriageDue] = useState("");
  const [triageMergeId, setTriageMergeId] = useState("");
  const [preview, setPreview] = useState<any>(null);
  const [confirmed, setConfirmed] = useState(false);
  // SLA rule editor
  const [ruleOpen, setRuleOpen] = useState(false);
  const [editingRule, setEditingRule] = useState<Partial<SlaRule> | null>(null);

  const isManager = !!user && (user.isSuperAdmin || ["admin", "manager", "owner"].includes(String(user.role || "").toLowerCase()));

  const overdueQuery = useQuery({
    queryKey: ["tasks-overdue", fAssignee, fType, fAge],
    queryFn: async () => {
      const p = new URLSearchParams();
      if (fAssignee !== "all") p.set("assignedToUserId", fAssignee);
      if (fType !== "all") p.set("type", fType);
      if (fAge === "1d") p.set("maxAgeDays", "1");
      if (fAge === "7d") { p.set("minAgeDays", "1"); p.set("maxAgeDays", "7"); }
      if (fAge === "30d") { p.set("minAgeDays", "7"); p.set("maxAgeDays", "30"); }
      if (fAge === "30plus") p.set("minAgeDays", "30");
      p.set("limit", "200");
      const res = await apiRequest("GET", `/api/tasks/overdue?${p.toString()}`);
      return res.json();
    },
  });
  const overdue: OverdueTask[] = overdueQuery.data?.items ?? [];
  const overdueTotal: number = overdueQuery.data?.total ?? 0;

  const usersQuery = useQuery({
    queryKey: ["users-list"],
    queryFn: async () => (await apiRequest("GET", "/api/users?limit=200")).json(),
  });
  const users: UserOpt[] = usersQuery.data?.items ?? usersQuery.data ?? [];
  const userMap = useMemo(() => new Map(users.map((u) => [u.id, userLabel(u)])), [users]);

  const dashQuery = useQuery({
    queryKey: ["tasks-sla-dashboard"],
    queryFn: async () => (await apiRequest("GET", "/api/tasks/sla-dashboard")).json(),
    enabled: tab === "dashboard",
  });
  const rulesQuery = useQuery({
    queryKey: ["tasks-sla-rules"],
    queryFn: async () => (await apiRequest("GET", "/api/tasks/sla-rules")).json(),
    enabled: tab === "rules",
  });
  const rules: SlaRule[] = rulesQuery.data?.items ?? [];

  const toggleSelect = (id: number) => {
    setSelected((prev) => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  };
  const toggleAll = () => {
    setSelected((prev) => prev.size === overdue.length ? new Set() : new Set(overdue.map((t) => t.id)));
  };

  const previewMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/tasks/bulk-triage", {
        taskIds: [...selected], action: triageAction, reason: triageReason || "preview",
        newDueAt: triageDue || undefined,
        mergeIntoTaskId: triageMergeId ? parseInt(triageMergeId) : undefined,
        preview: true,
      });
      return res.json();
    },
    onSuccess: (d) => { setPreview(d); setConfirmed(false); },
    onError: (e: any) => toast.error(e.message || "Preview failed"),
  });
  const triageMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/tasks/bulk-triage", {
        taskIds: [...selected], action: triageAction, reason: triageReason,
        newDueAt: triageDue || undefined,
        mergeIntoTaskId: triageMergeId ? parseInt(triageMergeId) : undefined,
        preview: false, confirm: true,
      });
      return res.json();
    },
    onSuccess: (d) => {
      toast.success(`Triaged ${d.processed} task(s): ${triageAction}`);
      setTriageOpen(false); setPreview(null); setConfirmed(false);
      setSelected(new Set()); setTriageReason(""); setTriageDue(""); setTriageMergeId("");
      queryClient.invalidateQueries({ queryKey: ["tasks-overdue"] });
      queryClient.invalidateQueries({ queryKey: ["tasks-sla-dashboard"] });
    },
    onError: (e: any) => toast.error(e.message || "Triage failed"),
  });
  const checkSlaMutation = useMutation({
    mutationFn: async () => (await apiRequest("POST", "/api/tasks/check-sla")).json(),
    onSuccess: (d) => {
      toast.success(`SLA check: ${d.checked} checked, ${d.escalated} escalated`);
      queryClient.invalidateQueries({ queryKey: ["tasks-overdue"] });
      queryClient.invalidateQueries({ queryKey: ["tasks-sla-dashboard"] });
    },
    onError: (e: any) => toast.error(e.message || "SLA check failed"),
  });
  const saveRuleMutation = useMutation({
    mutationFn: async (r: Partial<SlaRule>) => {
      const method = r.id ? "PUT" : "POST";
      const url = r.id ? `/api/tasks/sla-rules/${r.id}` : "/api/tasks/sla-rules";
      return (await apiRequest(method, url, r)).json();
    },
    onSuccess: () => {
      toast.success("Rule saved"); setRuleOpen(false); setEditingRule(null);
      queryClient.invalidateQueries({ queryKey: ["tasks-sla-rules"] });
    },
    onError: (e: any) => toast.error(e.message || "Save failed"),
  });
  const deleteRuleMutation = useMutation({
    mutationFn: async (id: number) => (await apiRequest("DELETE", `/api/tasks/sla-rules/${id}`)).json(),
    onSuccess: () => { toast.success("Rule deleted"); queryClient.invalidateQueries({ queryKey: ["tasks-sla-rules"] }); },
    onError: (e: any) => toast.error(e.message || "Delete failed"),
  });

  const openTriage = () => {
    if (!selected.size) { toast.error("Select at least one task"); return; }
    setPreview(null); setConfirmed(false); setTriageOpen(true);
  };

  return (
    <Layout>
      <div className="p-6 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <AlertTriangle className="h-6 w-6 text-amber-500" /> Task Triage & SLA
            </h1>
            <p className="text-sm text-muted-foreground">Bulk-triage overdue tasks, track SLAs, and configure escalation rules. Tasks on quarantined records are excluded.</p>
          </div>
          {isManager && (
            <Button onClick={() => checkSlaMutation.mutate()} disabled={checkSlaMutation.isPending} data-testid="button-run-sla-check">
              {checkSlaMutation.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Play className="h-4 w-4 mr-2" />}
              Run SLA Check
            </Button>
          )}
        </div>

        <Tabs value={tab} onValueChange={setTab}>
          <TabsList>
            <TabsTrigger value="overdue" data-testid="tab-overdue">Overdue ({overdueTotal})</TabsTrigger>
            <TabsTrigger value="dashboard" data-testid="tab-dashboard">SLA Dashboard</TabsTrigger>
            <TabsTrigger value="rules" data-testid="tab-rules">SLA Rules</TabsTrigger>
          </TabsList>

          <TabsContent value="overdue" className="mt-4 space-y-4">
            <Card>
              <CardHeader className="pb-3">
                <div className="flex flex-wrap items-center gap-3">
                  <Select value={fAssignee} onValueChange={setFAssignee}>
                    <SelectTrigger className="w-44" data-testid="filter-assignee"><SelectValue placeholder="Assignee" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All assignees</SelectItem>
                      {users.map((u) => <SelectItem key={u.id} value={String(u.id)}>{userLabel(u)}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <Select value={fType} onValueChange={setFType}>
                    <SelectTrigger className="w-36" data-testid="filter-type"><SelectValue placeholder="Type" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All types</SelectItem>
                      {["call", "sms", "email", "meeting", "general"].map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <Select value={fAge} onValueChange={setFAge}>
                    <SelectTrigger className="w-36" data-testid="filter-age"><SelectValue placeholder="Age" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Any age</SelectItem>
                      <SelectItem value="1d">0–1 day</SelectItem>
                      <SelectItem value="7d">2–7 days</SelectItem>
                      <SelectItem value="30d">8–30 days</SelectItem>
                      <SelectItem value="30plus">30+ days</SelectItem>
                    </SelectContent>
                  </Select>
                  <div className="ml-auto flex items-center gap-2">
                    <span className="text-sm text-muted-foreground">{selected.size} selected</span>
                    <Button onClick={openTriage} disabled={!selected.size} data-testid="button-bulk-triage">
                      <CheckCircle2 className="h-4 w-4 mr-2" /> Bulk Triage
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                {overdueQuery.isLoading ? (
                  <div className="py-8 text-center text-muted-foreground"><Loader2 className="h-6 w-6 mx-auto animate-spin" /></div>
                ) : overdue.length === 0 ? (
                  <div className="py-12 text-center text-muted-foreground">
                    <CheckCircle2 className="h-10 w-10 mx-auto mb-2 opacity-50" />
                    <p className="font-medium">No overdue tasks</p>
                    <p className="text-sm">Everything is on track.</p>
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-10"><Checkbox checked={selected.size === overdue.length && overdue.length > 0} onCheckedChange={toggleAll} data-testid="check-all" /></TableHead>
                        <TableHead>Task</TableHead>
                        <TableHead>Type</TableHead>
                        <TableHead>Assignee</TableHead>
                        <TableHead>Due</TableHead>
                        <TableHead>Age</TableHead>
                        <TableHead>Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {overdue.map((t) => (
                        <TableRow key={t.id} data-testid={`row-task-${t.id}`}>
                          <TableCell><Checkbox checked={selected.has(t.id)} onCheckedChange={() => toggleSelect(t.id)} data-testid={`check-task-${t.id}`} /></TableCell>
                          <TableCell className="font-medium">{t.title}</TableCell>
                          <TableCell><Badge variant="outline">{t.type || "general"}</Badge></TableCell>
                          <TableCell className="text-sm">{t.assignedToUserId ? userMap.get(t.assignedToUserId) || `#${t.assignedToUserId}` : "—"}</TableCell>
                          <TableCell className="text-sm">{t.dueAt ? format(new Date(t.dueAt), "PP p") : "—"}</TableCell>
                          <TableCell><Badge variant="destructive">{ageLabel(t.dueAt)}</Badge></TableCell>
                          <TableCell>
                            {t.escalatedAt
                              ? <Badge variant="secondary">Escalated</Badge>
                              : <Badge variant="outline">{t.triageStatus || "pending"}</Badge>}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="dashboard" className="mt-4">
            {dashQuery.isLoading ? (
              <div className="py-8 text-center text-muted-foreground"><Loader2 className="h-6 w-6 mx-auto animate-spin" /></div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Card>
                  <CardHeader><CardTitle className="text-base">Total Overdue</CardTitle></CardHeader>
                  <CardContent><p className="text-4xl font-bold">{dashQuery.data?.total ?? 0}</p></CardContent>
                </Card>
                <Card>
                  <CardHeader><CardTitle className="text-base flex items-center gap-2"><Clock className="h-4 w-4" /> Age Buckets</CardTitle></CardHeader>
                  <CardContent className="space-y-2">
                    {(dashQuery.data?.ageBuckets ?? []).map((b: any) => (
                      <div key={b.bucket} className="flex justify-between text-sm">
                        <span>{b.bucket} overdue</span><Badge>{b.count}</Badge>
                      </div>
                    ))}
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader><CardTitle className="text-base">By Assignee</CardTitle></CardHeader>
                  <CardContent className="space-y-2">
                    {(dashQuery.data?.byAssignee ?? []).map((r: any) => (
                      <div key={r.assignedToUserId ?? "un"} className="flex justify-between text-sm">
                        <span>{r.assignedToUserId ? userMap.get(r.assignedToUserId) || `#${r.assignedToUserId}` : "Unassigned"}</span>
                        <Badge variant={r.count > 10 ? "destructive" : "secondary"}>{r.count}</Badge>
                      </div>
                    ))}
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader><CardTitle className="text-base">By Type / Stage</CardTitle></CardHeader>
                  <CardContent className="space-y-2">
                    {(dashQuery.data?.byType ?? []).map((r: any) => (
                      <div key={r.type || "na"} className="flex justify-between text-sm">
                        <span>Type: {r.type || "—"}</span><Badge variant="outline">{r.count}</Badge>
                      </div>
                    ))}
                    {(dashQuery.data?.byStage ?? []).map((r: any) => (
                      <div key={r.stage || "na"} className="flex justify-between text-sm">
                        <span>Stage: {r.stage || "—"}</span><Badge variant="outline">{r.count}</Badge>
                      </div>
                    ))}
                  </CardContent>
                </Card>
              </div>
            )}
          </TabsContent>

          <TabsContent value="rules" className="mt-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-3">
                <CardTitle className="text-base">SLA Rules</CardTitle>
                {isManager && (
                  <Button size="sm" onClick={() => { setEditingRule({ name: "", taskType: "general", slaHours: 72, isActive: true }); setRuleOpen(true); }} data-testid="button-add-rule">
                    <Plus className="h-4 w-4 mr-1" /> Add Rule
                  </Button>
                )}
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow><TableHead>Name</TableHead><TableHead>Task Type</TableHead><TableHead>SLA (hrs)</TableHead><TableHead>Active</TableHead>{isManager && <TableHead className="w-24">Actions</TableHead>}</TableRow>
                  </TableHeader>
                  <TableBody>
                    {rules.map((r) => (
                      <TableRow key={r.id}>
                        <TableCell className="font-medium">{r.name}</TableCell>
                        <TableCell><Badge variant="outline">{r.taskType}</Badge></TableCell>
                        <TableCell>{r.slaHours}h</TableCell>
                        <TableCell>{r.isActive ? <Badge>On</Badge> : <Badge variant="secondary">Off</Badge>}</TableCell>
                        {isManager && (
                          <TableCell>
                            <div className="flex gap-1">
                              <Button size="sm" variant="ghost" onClick={() => { setEditingRule(r); setRuleOpen(true); }} data-testid={`edit-rule-${r.id}`}>Edit</Button>
                              <Button size="sm" variant="ghost" onClick={() => deleteRuleMutation.mutate(r.id)} data-testid={`delete-rule-${r.id}`}><Trash2 className="h-4 w-4" /></Button>
                            </div>
                          </TableCell>
                        )}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        {/* Triage modal: action -> preview -> reason -> confirm */}
        <Dialog open={triageOpen} onOpenChange={setTriageOpen}>
          <DialogContent className="max-w-lg" data-testid="dialog-triage">
            <DialogHeader><DialogTitle>Bulk Triage ({selected.size} tasks)</DialogTitle></DialogHeader>
            <div className="space-y-4">
              <div>
                <label className="text-sm font-medium">Action</label>
                <Select value={triageAction} onValueChange={(v: any) => { setTriageAction(v); setPreview(null); setConfirmed(false); }}>
                  <SelectTrigger data-testid="select-triage-action"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="complete">Mark complete</SelectItem>
                    <SelectItem value="reschedule">Reschedule</SelectItem>
                    <SelectItem value="cancel">Cancel</SelectItem>
                    <SelectItem value="merge">Merge into another task</SelectItem>
                    <SelectItem value="archive">Archive</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {triageAction === "reschedule" && (
                <div>
                  <label className="text-sm font-medium">New due date</label>
                  <Input type="datetime-local" value={triageDue} onChange={(e) => setTriageDue(e.target.value)} data-testid="input-triage-due" />
                </div>
              )}
              {triageAction === "merge" && (
                <div>
                  <label className="text-sm font-medium">Merge into task ID</label>
                  <Input value={triageMergeId} onChange={(e) => setTriageMergeId(e.target.value)} placeholder="Target task ID" data-testid="input-triage-merge" />
                </div>
              )}
              {!preview ? (
                <Button onClick={() => previewMutation.mutate()} disabled={previewMutation.isPending} className="w-full" data-testid="button-preview-triage">
                  {previewMutation.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null} Preview Impact
                </Button>
              ) : (
                <div className="rounded-md border p-3 text-sm space-y-1 max-h-48 overflow-y-auto" data-testid="triage-preview">
                  <p className="font-medium">Will {triageAction} {preview.taskCount} task(s):</p>
                  {preview.tasks.slice(0, 10).map((t: any) => (
                    <p key={t.id} className="text-muted-foreground">#{t.id} — {t.title}</p>
                  ))}
                  {preview.taskCount > 10 && <p className="text-muted-foreground">…and {preview.taskCount - 10} more</p>}
                </div>
              )}
              {preview && (
                <>
                  <div>
                    <label className="text-sm font-medium">Reason (required)</label>
                    <Textarea value={triageReason} onChange={(e) => setTriageReason(e.target.value)} placeholder="Why are you triaging these tasks?" data-testid="input-triage-reason" />
                  </div>
                  <label className="flex items-center gap-2 text-sm">
                    <Checkbox checked={confirmed} onCheckedChange={(v) => setConfirmed(!!v)} data-testid="check-triage-confirm" />
                    I confirm this bulk action and understand each task gets its own audit record.
                  </label>
                </>
              )}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setTriageOpen(false)}>Cancel</Button>
              <Button
                onClick={() => triageMutation.mutate()}
                disabled={!preview || !confirmed || triageReason.trim().length < 3 || triageMutation.isPending}
                data-testid="button-confirm-triage"
              >
                {triageMutation.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
                Apply to {selected.size} tasks
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* SLA rule editor */}
        <Dialog open={ruleOpen} onOpenChange={setRuleOpen}>
          <DialogContent data-testid="dialog-rule">
            <DialogHeader><DialogTitle>{editingRule?.id ? "Edit" : "Add"} SLA Rule</DialogTitle></DialogHeader>
            {editingRule && (
              <div className="space-y-3">
                <div><label className="text-sm font-medium">Name</label>
                  <Input value={editingRule.name || ""} onChange={(e) => setEditingRule({ ...editingRule, name: e.target.value })} data-testid="input-rule-name" /></div>
                <div><label className="text-sm font-medium">Task type</label>
                  <Select value={editingRule.taskType || "general"} onValueChange={(v) => setEditingRule({ ...editingRule, taskType: v })}>
                    <SelectTrigger data-testid="select-rule-type"><SelectValue /></SelectTrigger>
                    <SelectContent>{["general", "call", "sms", "email", "meeting"].map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
                  </Select></div>
                <div><label className="text-sm font-medium">SLA hours</label>
                  <Input type="number" min={1} value={editingRule.slaHours ?? 72} onChange={(e) => setEditingRule({ ...editingRule, slaHours: parseInt(e.target.value) || 72 })} data-testid="input-rule-hours" /></div>
                <label className="flex items-center gap-2 text-sm">
                  <Checkbox checked={editingRule.isActive ?? true} onCheckedChange={(v) => setEditingRule({ ...editingRule, isActive: !!v })} data-testid="check-rule-active" /> Active
                </label>
              </div>
            )}
            <DialogFooter>
              <Button variant="outline" onClick={() => setRuleOpen(false)}>Cancel</Button>
              <Button onClick={() => editingRule && saveRuleMutation.mutate(editingRule)} disabled={saveRuleMutation.isPending || !editingRule?.name?.trim()} data-testid="button-save-rule">
                {saveRuleMutation.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null} Save
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </Layout>
  );
}
