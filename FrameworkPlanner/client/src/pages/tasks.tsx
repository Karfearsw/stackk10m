import { Layout } from "@/components/layout/Layout";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { useAuth } from "@/contexts/AuthContext";
import { apiRequest } from "@/lib/queryClient";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { addDays, endOfDay, format, startOfDay } from "date-fns";
import { CheckSquare, Loader2, Plus, RefreshCw, UserPlus } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { useLocation } from "wouter";
import { getEntityFilterFromLocation, leadUrl, opportunityUrl } from "@/lib/deepLinks";

type Task = {
  id: number;
  title: string;
  description: string | null;
  type: string | null;
  relatedEntityType: string | null;
  relatedEntityId: number | null;
  dueAt: string | null;
  completedAt: string | null;
  priority: string | null;
  status: string | null;
  assignedToUserId: number | null;
  isRecurring: boolean;
  recurrenceRule: string | null;
  createdBy: number;
  isPrivate: boolean;
  createdAt: string;
  updatedAt: string;
};

type TaskListResponse = { items: Task[]; total: number };

type User = { id: number; email: string; firstName?: string | null; lastName?: string | null; role?: string | null; isSuperAdmin?: boolean | null };

function isManager(user: any) {
  const role = String(user?.role || "").toLowerCase();
  return !!user?.isSuperAdmin || role === "admin" || role === "manager" || role === "owner";
}

function userLabel(u: User) {
  const name = `${String(u.firstName || "").trim()} ${String(u.lastName || "").trim()}`.trim();
  return name ? name : u.email;
}

function fmtDue(dueAt: string | null) {
  if (!dueAt) return "—";
  try {
    return format(new Date(dueAt), "PP p");
  } catch {
    return "—";
  }
}

function dueInputValue(dueAt: string | null) {
  if (!dueAt) return "";
  try {
    return format(new Date(dueAt), "yyyy-MM-dd'T'HH:mm");
  } catch {
    return "";
  }
}

function parseDueInput(v: string) {
  const raw = String(v || "").trim();
  if (!raw) return null;
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

function isOverdue(dueAt: string | null, todayStart: Date) {
  if (!dueAt) return false;
  return new Date(dueAt).getTime() < todayStart.getTime();
}

function isDueToday(dueAt: string | null, todayStart: Date, todayEnd: Date) {
  if (!dueAt) return false;
  const ts = new Date(dueAt).getTime();
  return ts >= todayStart.getTime() && ts <= todayEnd.getTime();
}

function isDueNextDays(dueAt: string | null, todayEndPlusN: Date) {
  if (!dueAt) return false;
  const ts = new Date(dueAt).getTime();
  return ts > Date.now() && ts <= todayEndPlusN.getTime();
}

function isFollowUpTask(t: Task) {
  const type = String(t.type || "").trim().toLowerCase();
  return type === "follow_up" || type === "call";
}

function openLabelForTask(t: Task) {
  if (t.relatedEntityType === "lead") return "Open Lead";
  if (t.relatedEntityType === "opportunity") return "Open Opportunity";
  if (t.relatedEntityType === "buyer") return "Open Buyer";
  if (t.relatedEntityType === "campaign") return "Open Campaign";
  return "Open";
}

function entityLabelForTask(t: Task) {
  if (!t.relatedEntityType || !t.relatedEntityId) return "—";
  const type = String(t.relatedEntityType || "").trim().toLowerCase();
  if (type === "lead") return `Lead #${t.relatedEntityId}`;
  if (type === "opportunity") return `Opportunity #${t.relatedEntityId}`;
  if (type === "buyer") return `Buyer #${t.relatedEntityId}`;
  if (type === "campaign") return `Campaign #${t.relatedEntityId}`;
  return `${t.relatedEntityType} #${t.relatedEntityId}`;
}

async function runWithConcurrency<T>(items: T[], limit: number, fn: (item: T) => Promise<void>) {
  const max = Math.max(1, Math.floor(limit));
  const queue = [...items];
  const workers = Array.from({ length: Math.min(max, queue.length || 1) }, async () => {
    while (queue.length) {
      const next = queue.shift()!;
      await fn(next);
    }
  });
  await Promise.all(workers);
}

function taskLink(t: Task) {
  if (t.relatedEntityType === "lead" && t.relatedEntityId) return leadUrl(t.relatedEntityId);
  if (t.relatedEntityType === "opportunity" && t.relatedEntityId) return opportunityUrl(t.relatedEntityId);
  if (t.relatedEntityType === "buyer" && t.relatedEntityId) return `/buyers?buyerId=${t.relatedEntityId}`;
  if (t.relatedEntityType === "campaign" && t.relatedEntityId) return `/campaigns?campaignId=${t.relatedEntityId}`;
  return null;
}

const TAB_VALUES = ["overdue", "today", "next7", "followups", "admin", "completed", "all"] as const;
type QueueTab = (typeof TAB_VALUES)[number];

function parseTabFromLocation(loc: string): QueueTab {
  const idx = String(loc || "").indexOf("?");
  if (idx === -1) return "overdue";
  const sp = new URLSearchParams(String(loc || "").slice(idx + 1));
  const raw = String(sp.get("tab") || "").trim().toLowerCase();
  return (TAB_VALUES as readonly string[]).includes(raw) ? (raw as QueueTab) : "overdue";
}

function setTabInLocation(loc: string, tab: QueueTab) {
  const [path, qs] = String(loc || "").split("?");
  const sp = new URLSearchParams(qs || "");
  sp.set("tab", tab);
  const next = sp.toString();
  return next ? `${path}?${next}` : path;
}

export default function TasksPage() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const canBulkAssign = isManager(user);
  const [location, setLocation] = useLocation();
  const entityFilter = useMemo(() => getEntityFilterFromLocation(), [location]);

  const [tab, setTab] = useState<QueueTab>(() => parseTabFromLocation(location));
  const [assignee, setAssignee] = useState<string>("me");
  const [status, setStatus] = useState<string>("active");
  const [type, setType] = useState<string>("all");
  const [priority, setPriority] = useState<string>("all");
  const [dueFrom, setDueFrom] = useState<string>("");
  const [dueTo, setDueTo] = useState<string>("");
  const [search, setSearch] = useState<string>("");
  const [grouping, setGrouping] = useState<"off" | "followups">("followups");

  useEffect(() => {
    const next = parseTabFromLocation(location);
    if (next !== tab) setTab(next);
  }, [location, tab]);

  useEffect(() => {
    const desired = setTabInLocation(location, tab);
    if (desired !== location) setLocation(desired);
  }, [location, setLocation, tab]);

  const params = useMemo(() => {
    const p = new URLSearchParams();
    p.set("limit", "200");
    p.set("includeCompleted", "true");
    if (assignee === "me" && typeof user?.id === "number") p.set("assignedToUserId", String(user.id));
    if (assignee !== "all" && assignee !== "me") p.set("assignedToUserId", assignee);
    if (status !== "all" && status !== "active") p.set("status", status);
    if (type !== "all") p.set("type", type);
    if (priority !== "all") p.set("priority", priority);
    if (dueFrom) p.set("dueFrom", new Date(`${dueFrom}T00:00:00`).toISOString());
    if (dueTo) p.set("dueTo", new Date(`${dueTo}T23:59:59`).toISOString());
    if (entityFilter.relatedEntityType && entityFilter.relatedEntityId) {
      p.set("relatedEntityType", entityFilter.relatedEntityType);
      p.set("relatedEntityId", String(entityFilter.relatedEntityId));
    }
    return p;
  }, [assignee, dueFrom, dueTo, entityFilter.relatedEntityId, entityFilter.relatedEntityType, priority, status, type, user?.id]);

  const listKey = useMemo(() => `/api/tasks?${params.toString()}`, [params]);

  const { data: list, isLoading, refetch, isFetching } = useQuery<TaskListResponse>({
    queryKey: [listKey],
    enabled: !!user,
  });

  const { data: activeTeamResp } = useQuery<any>({
    queryKey: ["/api/teams/active"],
    enabled: !!user,
  });

  const activeTeamId = typeof activeTeamResp?.teamId === "number" ? activeTeamResp.teamId : null;

  const { data: teamMembers = [] } = useQuery<any[]>({
    queryKey: ["/api/teams", activeTeamId, "members"],
    enabled: !!activeTeamId,
  });

  const users = useMemo(() => (Array.isArray(teamMembers) ? teamMembers.map((m: any) => m?.user).filter(Boolean) : []), [teamMembers]);

  const baseTasks = useMemo(() => {
    const items = list?.items || [];
    const q = search.trim().toLowerCase();
    const terminal = new Set(["completed", "canceled"]);
    return items.filter((t) => {
      if (status === "active") {
        const s = String(t.status || "open").trim().toLowerCase();
        if (terminal.has(s)) return false;
      }
      if (q) {
        const ok =
          String(t.title || "").toLowerCase().includes(q) ||
          String(t.description || "").toLowerCase().includes(q);
        if (!ok) return false;
      }
      return true;
    });
  }, [list?.items, search, status]);

  const todayStart = useMemo(() => startOfDay(new Date()), []);
  const todayEnd = useMemo(() => endOfDay(new Date()), []);
  const next7End = useMemo(() => endOfDay(addDays(new Date(), 7)), []);

  const tasksForTab = useMemo(() => {
    if (tab === "all") return baseTasks;
    if (tab === "completed") return baseTasks.filter((t) => String(t.status || "").toLowerCase() === "completed");
    if (tab === "admin") return baseTasks.filter((t) => !t.relatedEntityType || !t.relatedEntityId);
    if (tab === "followups") return baseTasks.filter((t) => isFollowUpTask(t));
    if (tab === "overdue") return baseTasks.filter((t) => isOverdue(t.dueAt, todayStart));
    if (tab === "today") return baseTasks.filter((t) => isDueToday(t.dueAt, todayStart, todayEnd));
    return baseTasks.filter((t) => isDueNextDays(t.dueAt, next7End));
  }, [baseTasks, next7End, tab, todayEnd, todayStart]);

  const [selected, setSelected] = useState<Record<number, boolean>>({});
  const selectedIds = useMemo(() => Object.keys(selected).filter((k) => selected[Number(k)]).map((k) => Number(k)), [selected]);

  const completeMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await apiRequest("POST", `/api/tasks/${id}/complete`);
      return res.json();
    },
    onMutate: async (id: number) => {
      await qc.cancelQueries({ queryKey: [listKey] });
      const previous = qc.getQueryData<TaskListResponse>([listKey]);
      if (previous?.items) {
        const nowIso = new Date().toISOString();
        qc.setQueryData<TaskListResponse>([listKey], {
          ...previous,
          items: previous.items.map((t) => (t.id === id ? { ...t, status: "completed", completedAt: nowIso } : t)),
        });
      }
      return { previous };
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [listKey] });
      toast.success("Task completed");
    },
    onError: (e: any, _id: number, ctx: any) => {
      if (ctx?.previous) qc.setQueryData([listKey], ctx.previous);
      toast.error(String(e?.message || e));
    },
  });

  const bulkCompleteMutation = useMutation({
    mutationFn: async (ids: number[]) => {
      await runWithConcurrency(ids, 5, async (id) => {
        await apiRequest("POST", `/api/tasks/${id}/complete`);
      });
    },
    onMutate: async (ids: number[]) => {
      await qc.cancelQueries({ queryKey: [listKey] });
      const previous = qc.getQueryData<TaskListResponse>([listKey]);
      if (previous?.items) {
        const set = new Set(ids);
        const nowIso = new Date().toISOString();
        qc.setQueryData<TaskListResponse>([listKey], {
          ...previous,
          items: previous.items.map((t) => (set.has(t.id) ? { ...t, status: "completed", completedAt: nowIso } : t)),
        });
      }
      return { previous };
    },
    onSuccess: () => {
      setSelected({});
      qc.invalidateQueries({ queryKey: [listKey] });
      toast.success("Tasks completed");
    },
    onError: (e: any, _ids: number[], ctx: any) => {
      if (ctx?.previous) qc.setQueryData([listKey], ctx.previous);
      toast.error(String(e?.message || e));
    },
  });

  const assignMutation = useMutation({
    mutationFn: async (input: { ids: number[]; assignedToUserId: number }) => {
      await runWithConcurrency(input.ids, 5, async (id) => {
        await apiRequest("PATCH", `/api/tasks/${id}`, { assignedToUserId: input.assignedToUserId });
      });
    },
    onMutate: async (input) => {
      await qc.cancelQueries({ queryKey: [listKey] });
      const previous = qc.getQueryData<TaskListResponse>([listKey]);
      if (previous?.items) {
        const set = new Set(input.ids);
        qc.setQueryData<TaskListResponse>([listKey], {
          ...previous,
          items: previous.items.map((t) => (set.has(t.id) ? { ...t, assignedToUserId: input.assignedToUserId } : t)),
        });
      }
      return { previous };
    },
    onSuccess: () => {
      setSelected({});
      qc.invalidateQueries({ queryKey: [listKey] });
      toast.success("Tasks reassigned");
    },
    onError: (e: any, _input: any, ctx: any) => {
      if (ctx?.previous) qc.setQueryData([listKey], ctx.previous);
      toast.error(String(e?.message || e));
    },
  });

  const createMutation = useMutation({
    mutationFn: async (input: { title: string; dueAt?: string | null; priority?: string; isPrivate?: boolean }) => {
      const res = await apiRequest("POST", "/api/tasks", {
        title: input.title,
        dueAt: input.dueAt ? new Date(input.dueAt).toISOString() : null,
        priority: input.priority || "medium",
        isPrivate: !!input.isPrivate,
        status: "open",
      });
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [listKey] });
      toast.success("Task created");
    },
    onError: (e: any) => toast.error(String(e?.message || e)),
  });

  const [newTitle, setNewTitle] = useState("");
  const [newDue, setNewDue] = useState("");
  const [newPriority, setNewPriority] = useState("medium");
  const [newPrivate, setNewPrivate] = useState(false);

  const [assignTo, setAssignTo] = useState<string>("");

  const updateMutation = useMutation({
    mutationFn: async (input: { id: number; patch: Record<string, any> }) => {
      const res = await apiRequest("PATCH", `/api/tasks/${input.id}`, input.patch);
      return res.json();
    },
    onMutate: async (input) => {
      await qc.cancelQueries({ queryKey: [listKey] });
      const previous = qc.getQueryData<TaskListResponse>([listKey]);
      if (previous?.items) {
        qc.setQueryData<TaskListResponse>([listKey], {
          ...previous,
          items: previous.items.map((t) => (t.id === input.id ? { ...t, ...input.patch } : t)),
        });
      }
      return { previous };
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [listKey] });
    },
    onError: (e: any, _input: any, ctx: any) => {
      if (ctx?.previous) qc.setQueryData([listKey], ctx.previous);
      toast.error(String(e?.message || e));
    },
  });

  const counts = useMemo(() => {
    const items = list?.items || [];
    const active = items.filter((t) => {
      const s = String(t.status || "open").trim().toLowerCase();
      return s !== "completed" && s !== "canceled";
    });
    const noDue = active.filter((t) => !t.dueAt).length;
    return {
      overdue: active.filter((t) => isOverdue(t.dueAt, todayStart)).length,
      today: active.filter((t) => isDueToday(t.dueAt, todayStart, todayEnd)).length,
      next7: active.filter((t) => isDueNextDays(t.dueAt, next7End)).length,
      followups: active.filter((t) => isFollowUpTask(t)).length,
      admin: active.filter((t) => !t.relatedEntityType || !t.relatedEntityId).length,
      noDue,
      completed: items.filter((t) => String(t.status || "").trim().toLowerCase() === "completed").length,
      all: items.length,
    };
  }, [list?.items, next7End, todayEnd, todayStart]);

  const visibleTaskIds = useMemo(() => tasksForTab.map((t) => t.id), [tasksForTab]);
  const allSelected = visibleTaskIds.length > 0 && visibleTaskIds.every((id) => !!selected[id]);

  return (
    <Layout>
      <div className="p-6 space-y-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2">
            <CheckSquare className="h-5 w-5 text-primary" />
            <h1 className="text-2xl font-bold">Tasks</h1>
            <Badge variant="secondary">{list?.total ?? 0}</Badge>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={() => refetch()} disabled={isFetching}>
              <RefreshCw className={`h-4 w-4 mr-2 ${isFetching ? "animate-spin" : ""}`} />
              Refresh
            </Button>
            <Dialog>
              <DialogTrigger asChild>
                <Button>
                  <Plus className="h-4 w-4 mr-2" />
                  New Task
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Quick add task</DialogTitle>
                </DialogHeader>
                <div className="space-y-3">
                  <Input value={newTitle} onChange={(e) => setNewTitle(e.target.value)} placeholder="Title" />
                  <Input value={newDue} onChange={(e) => setNewDue(e.target.value)} placeholder="Due (optional)" type="datetime-local" />
                  <Select value={newPriority} onValueChange={setNewPriority}>
                    <SelectTrigger>
                      <SelectValue placeholder="Priority" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="low">Low</SelectItem>
                      <SelectItem value="medium">Medium</SelectItem>
                      <SelectItem value="high">High</SelectItem>
                      <SelectItem value="urgent">Urgent</SelectItem>
                    </SelectContent>
                  </Select>
                  <div className="flex items-center gap-2">
                    <Checkbox checked={newPrivate} onCheckedChange={(v) => setNewPrivate(Boolean(v))} />
                    <div className="text-sm">Private</div>
                  </div>
                </div>
                <DialogFooter>
                  <Button
                    onClick={() => {
                      const title = newTitle.trim();
                      if (!title) return;
                      createMutation.mutate({ title, dueAt: newDue || null, priority: newPriority, isPrivate: newPrivate });
                      setNewTitle("");
                      setNewDue("");
                      setNewPriority("medium");
                      setNewPrivate(false);
                    }}
                    disabled={createMutation.isPending}
                  >
                    {createMutation.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
                    Create
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div>Queue</div>
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant={counts.overdue ? "destructive" : "secondary"}>Overdue {counts.overdue}</Badge>
                <Badge variant={counts.today ? "default" : "secondary"}>Today {counts.today}</Badge>
                <Badge variant={counts.next7 ? "default" : "secondary"}>Next 7 {counts.next7}</Badge>
                <Badge variant="secondary">No due {counts.noDue}</Badge>
              </div>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <Tabs value={tab} onValueChange={(v) => setTab(v as QueueTab)}>
              <TabsList className="w-full">
                <TabsTrigger value="overdue">Overdue ({counts.overdue})</TabsTrigger>
                <TabsTrigger value="today">Today ({counts.today})</TabsTrigger>
                <TabsTrigger value="next7">Next 7 ({counts.next7})</TabsTrigger>
                <TabsTrigger value="followups">Follow-ups ({counts.followups})</TabsTrigger>
                <TabsTrigger value="admin">Admin ({counts.admin})</TabsTrigger>
                <TabsTrigger value="completed">Completed ({counts.completed})</TabsTrigger>
                <TabsTrigger value="all">All ({counts.all})</TabsTrigger>
              </TabsList>
              <TabsContent value={tab} />
            </Tabs>

            <div className="grid grid-cols-1 gap-3 md:grid-cols-6">
              <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search title/description" className="md:col-span-2" />
              <Select value={assignee} onValueChange={setAssignee}>
                <SelectTrigger>
                  <SelectValue placeholder="Assignee" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="me">Me</SelectItem>
                  <SelectItem value="all">All assignees</SelectItem>
                  {users.map((u) => (
                    <SelectItem key={u.id} value={String(u.id)}>
                      {userLabel(u)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={status} onValueChange={setStatus}>
                <SelectTrigger>
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="open">Open</SelectItem>
                  <SelectItem value="in_progress">In progress</SelectItem>
                  <SelectItem value="blocked">Blocked</SelectItem>
                  <SelectItem value="waiting">Waiting</SelectItem>
                  <SelectItem value="completed">Completed</SelectItem>
                  <SelectItem value="canceled">Canceled</SelectItem>
                  <SelectItem value="all">All</SelectItem>
                </SelectContent>
              </Select>
              <Select value={priority} onValueChange={setPriority}>
                <SelectTrigger>
                  <SelectValue placeholder="Priority" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All</SelectItem>
                  <SelectItem value="low">Low</SelectItem>
                  <SelectItem value="medium">Medium</SelectItem>
                  <SelectItem value="high">High</SelectItem>
                  <SelectItem value="urgent">Urgent</SelectItem>
                </SelectContent>
              </Select>
              <Select value={type} onValueChange={setType}>
                <SelectTrigger>
                  <SelectValue placeholder="Type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All</SelectItem>
                  <SelectItem value="general">General</SelectItem>
                  <SelectItem value="follow_up">Follow up</SelectItem>
                  <SelectItem value="call">Call</SelectItem>
                  <SelectItem value="workflow">Workflow</SelectItem>
                  <SelectItem value="appointment">Appointment</SelectItem>
                  <SelectItem value="contract">Contract</SelectItem>
                </SelectContent>
              </Select>
              <Input value={dueFrom} onChange={(e) => setDueFrom(e.target.value)} type="date" className="md:col-span-2" />
              <Input value={dueTo} onChange={(e) => setDueTo(e.target.value)} type="date" className="md:col-span-2" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              <div>Tasks</div>
              <div className="flex items-center gap-2">
                {tab === "followups" ? (
                  <ToggleGroup type="single" value={grouping} onValueChange={(v) => setGrouping((v as any) || "off")}>
                    <ToggleGroupItem value="followups" aria-label="Group follow-ups">
                      Group
                    </ToggleGroupItem>
                    <ToggleGroupItem value="off" aria-label="Ungroup">
                      Flat
                    </ToggleGroupItem>
                  </ToggleGroup>
                ) : null}
                <Checkbox
                  checked={allSelected}
                  onCheckedChange={(v) => {
                    const checked = Boolean(v);
                    if (!checked) return setSelected({});
                    const next: Record<number, boolean> = {};
                    for (const id of visibleTaskIds) next[id] = true;
                    setSelected(next);
                  }}
                />
                <div className="text-sm text-muted-foreground">Select all</div>
                <Button
                  variant="outline"
                  disabled={selectedIds.length === 0 || bulkCompleteMutation.isPending}
                  onClick={() => bulkCompleteMutation.mutate(selectedIds)}
                >
                  Complete selected
                </Button>
                <Dialog>
                  <DialogTrigger asChild>
                    <Button variant="outline" disabled={!canBulkAssign || selectedIds.length === 0}>
                      <UserPlus className="h-4 w-4 mr-2" />
                      Assign
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Assign selected tasks</DialogTitle>
                    </DialogHeader>
                    <Select value={assignTo} onValueChange={setAssignTo}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select user" />
                      </SelectTrigger>
                      <SelectContent>
                        {users.map((u) => (
                          <SelectItem key={u.id} value={String(u.id)}>
                            {userLabel(u)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <DialogFooter>
                      <Button
                        disabled={!assignTo || assignMutation.isPending}
                        onClick={() => assignMutation.mutate({ ids: selectedIds, assignedToUserId: Number(assignTo) })}
                      >
                        Assign
                      </Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
              </div>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="flex items-center gap-2 text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading…
              </div>
            ) : (
              <div className="space-y-3">
                {tab === "followups" && grouping !== "off" ? (
                  <Accordion type="multiple" className="w-full">
                    {(() => {
                      const groups: Array<{ key: string; title: string; type: string; tasks: Task[] }> = [];
                      const byKey = new Map<string, Task[]>();
                      for (const t of tasksForTab) {
                        const key = `${String(t.type || "general")}:${String(t.title || "")}`;
                        const list = byKey.get(key) || [];
                        list.push(t);
                        byKey.set(key, list);
                      }
                      for (const [key, items] of byKey.entries()) {
                        if (items.length <= 1) continue;
                        const first = items[0]!;
                        groups.push({ key, title: String(first.title || ""), type: String(first.type || "general"), tasks: items });
                      }
                      groups.sort((a, b) => b.tasks.length - a.tasks.length);
                      return groups.map((g) => {
                        const overdueCount = g.tasks.filter((t) => isOverdue(t.dueAt, todayStart)).length;
                        const earliest = g.tasks
                          .map((t) => (t.dueAt ? new Date(t.dueAt).getTime() : Number.POSITIVE_INFINITY))
                          .reduce((a, b) => Math.min(a, b), Number.POSITIVE_INFINITY);
                        const earliestLabel = Number.isFinite(earliest) ? fmtDue(new Date(earliest).toISOString()) : "—";
                        const groupAll = g.tasks.every((t) => !!selected[t.id]);
                        const groupSome = !groupAll && g.tasks.some((t) => !!selected[t.id]);
                        return (
                          <AccordionItem key={g.key} value={g.key}>
                            <AccordionTrigger>
                              <div className="flex w-full items-center justify-between gap-3 pr-2">
                                <div className="flex min-w-0 items-center gap-2">
                                  <Checkbox
                                    checked={groupAll ? true : groupSome ? ("indeterminate" as any) : false}
                                    onCheckedChange={(v) => {
                                      const checked = Boolean(v);
                                      setSelected((s) => {
                                        const next = { ...s };
                                        for (const t of g.tasks) next[t.id] = checked;
                                        return next;
                                      });
                                    }}
                                    onClick={(e) => e.stopPropagation()}
                                  />
                                  <div className="min-w-0">
                                    <div className="truncate font-medium">{g.title}</div>
                                    <div className="text-xs text-muted-foreground">{g.type}</div>
                                  </div>
                                </div>
                                <div className="flex shrink-0 items-center gap-2">
                                  {overdueCount ? <Badge variant="destructive">Overdue {overdueCount}</Badge> : <Badge variant="secondary">Overdue 0</Badge>}
                                  <Badge variant="secondary">{g.tasks.length} tasks</Badge>
                                  <Badge variant="secondary">Earliest {earliestLabel}</Badge>
                                </div>
                              </div>
                            </AccordionTrigger>
                            <AccordionContent>
                              <Table>
                                <TableHeader>
                                  <TableRow>
                                    <TableHead className="w-10" />
                                    <TableHead>Title</TableHead>
                                    <TableHead>Linked</TableHead>
                                    <TableHead>Type</TableHead>
                                    <TableHead>Due</TableHead>
                                    <TableHead>Priority</TableHead>
                                    <TableHead>Status</TableHead>
                                    <TableHead>Assignee</TableHead>
                                    <TableHead className="text-right">Actions</TableHead>
                                  </TableRow>
                                </TableHeader>
                                <TableBody>
                                  {g.tasks.map((t) => (
                                    <TableRow key={t.id}>
                                      <TableCell>
                                        <Checkbox checked={!!selected[t.id]} onCheckedChange={(v) => setSelected((s) => ({ ...s, [t.id]: Boolean(v) }))} />
                                      </TableCell>
                                      <TableCell className="font-medium">
                                        <div className="flex flex-col">
                                          <div>{t.title}</div>
                                          {t.description ? <div className="text-xs text-muted-foreground line-clamp-1">{t.description}</div> : null}
                                        </div>
                                      </TableCell>
                                      <TableCell>
                                        <div className="flex items-center gap-2">
                                          <Badge variant="secondary">{entityLabelForTask(t)}</Badge>
                                          {taskLink(t) ? (
                                            <Button size="sm" variant="outline" onClick={() => setLocation(taskLink(t) as string)}>
                                              {openLabelForTask(t)}
                                            </Button>
                                          ) : null}
                                        </div>
                                      </TableCell>
                                      <TableCell>{t.type || "general"}</TableCell>
                                      <TableCell>
                                        <Dialog>
                                          <DialogTrigger asChild>
                                            <Button size="sm" variant="outline">
                                              {fmtDue(t.dueAt)}
                                            </Button>
                                          </DialogTrigger>
                                          <DialogContent>
                                            <DialogHeader>
                                              <DialogTitle>Update due date</DialogTitle>
                                            </DialogHeader>
                                            <Input
                                              type="datetime-local"
                                              defaultValue={dueInputValue(t.dueAt)}
                                              onBlur={(e) => {
                                                const iso = parseDueInput(e.target.value);
                                                updateMutation.mutate({ id: t.id, patch: { dueAt: iso } });
                                              }}
                                            />
                                          </DialogContent>
                                        </Dialog>
                                      </TableCell>
                                      <TableCell>
                                        <Select
                                          value={String(t.priority || "medium")}
                                          onValueChange={(v) => updateMutation.mutate({ id: t.id, patch: { priority: v } })}
                                        >
                                          <SelectTrigger className="h-8 w-[120px]">
                                            <SelectValue />
                                          </SelectTrigger>
                                          <SelectContent>
                                            <SelectItem value="low">Low</SelectItem>
                                            <SelectItem value="medium">Medium</SelectItem>
                                            <SelectItem value="high">High</SelectItem>
                                            <SelectItem value="urgent">Urgent</SelectItem>
                                          </SelectContent>
                                        </Select>
                                      </TableCell>
                                      <TableCell>
                                        <Select
                                          value={String(t.status || "open")}
                                          onValueChange={(v) => {
                                            if (v === "completed") return completeMutation.mutate(t.id);
                                            return updateMutation.mutate({ id: t.id, patch: { status: v } });
                                          }}
                                        >
                                          <SelectTrigger className="h-8 w-[140px]">
                                            <SelectValue />
                                          </SelectTrigger>
                                          <SelectContent>
                                            <SelectItem value="open">Open</SelectItem>
                                            <SelectItem value="in_progress">In progress</SelectItem>
                                            <SelectItem value="blocked">Blocked</SelectItem>
                                            <SelectItem value="waiting">Waiting</SelectItem>
                                            <SelectItem value="completed">Completed</SelectItem>
                                            <SelectItem value="canceled">Canceled</SelectItem>
                                          </SelectContent>
                                        </Select>
                                      </TableCell>
                                      <TableCell>
                                        {canBulkAssign ? (
                                          <Select
                                            value={t.assignedToUserId ? String(t.assignedToUserId) : ""}
                                            onValueChange={(v) => updateMutation.mutate({ id: t.id, patch: { assignedToUserId: v ? Number(v) : null } })}
                                          >
                                            <SelectTrigger className="h-8 w-[180px]">
                                              <SelectValue placeholder="Unassigned" />
                                            </SelectTrigger>
                                            <SelectContent>
                                              {users.map((u) => (
                                                <SelectItem key={u.id} value={String(u.id)}>
                                                  {userLabel(u)}
                                                </SelectItem>
                                              ))}
                                            </SelectContent>
                                          </Select>
                                        ) : (
                                          <div className="text-sm text-muted-foreground">
                                            {(() => {
                                              const u = t.assignedToUserId ? users.find((x) => x.id === t.assignedToUserId) : null;
                                              return u ? userLabel(u) : "Unassigned";
                                            })()}
                                          </div>
                                        )}
                                      </TableCell>
                                      <TableCell className="text-right">
                                        <div className="flex justify-end gap-2">
                                          <Button size="sm" variant="outline" disabled={t.status === "completed" || completeMutation.isPending} onClick={() => completeMutation.mutate(t.id)}>
                                            Complete
                                          </Button>
                                        </div>
                                      </TableCell>
                                    </TableRow>
                                  ))}
                                </TableBody>
                              </Table>
                            </AccordionContent>
                          </AccordionItem>
                        );
                      });
                    })()}
                  </Accordion>
                ) : null}

                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-10" />
                      <TableHead>Title</TableHead>
                      <TableHead>Linked</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Due</TableHead>
                      <TableHead>Priority</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Assignee</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(tab === "followups" && grouping !== "off"
                      ? tasksForTab.filter((t) => {
                          const key = `${String(t.type || "general")}:${String(t.title || "")}`;
                          const count = tasksForTab.filter((x) => `${String(x.type || "general")}:${String(x.title || "")}` === key).length;
                          return count <= 1;
                        })
                      : tasksForTab
                    ).map((t) => (
                      <TableRow key={t.id}>
                        <TableCell>
                          <Checkbox checked={!!selected[t.id]} onCheckedChange={(v) => setSelected((s) => ({ ...s, [t.id]: Boolean(v) }))} />
                        </TableCell>
                        <TableCell className="font-medium">
                          <div className="flex flex-col">
                            <div>{t.title}</div>
                            {t.description ? <div className="text-xs text-muted-foreground line-clamp-1">{t.description}</div> : null}
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <Badge variant="secondary">{entityLabelForTask(t)}</Badge>
                            {taskLink(t) ? (
                              <Button size="sm" variant="outline" onClick={() => setLocation(taskLink(t) as string)}>
                                {openLabelForTask(t)}
                              </Button>
                            ) : null}
                          </div>
                        </TableCell>
                        <TableCell>{t.type || "general"}</TableCell>
                        <TableCell>
                          <Dialog>
                            <DialogTrigger asChild>
                              <Button size="sm" variant="outline">
                                {fmtDue(t.dueAt)}
                              </Button>
                            </DialogTrigger>
                            <DialogContent>
                              <DialogHeader>
                                <DialogTitle>Update due date</DialogTitle>
                              </DialogHeader>
                              <Input
                                type="datetime-local"
                                defaultValue={dueInputValue(t.dueAt)}
                                onBlur={(e) => {
                                  const iso = parseDueInput(e.target.value);
                                  updateMutation.mutate({ id: t.id, patch: { dueAt: iso } });
                                }}
                              />
                            </DialogContent>
                          </Dialog>
                        </TableCell>
                        <TableCell>
                          <Select value={String(t.priority || "medium")} onValueChange={(v) => updateMutation.mutate({ id: t.id, patch: { priority: v } })}>
                            <SelectTrigger className="h-8 w-[120px]">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="low">Low</SelectItem>
                              <SelectItem value="medium">Medium</SelectItem>
                              <SelectItem value="high">High</SelectItem>
                              <SelectItem value="urgent">Urgent</SelectItem>
                            </SelectContent>
                          </Select>
                        </TableCell>
                        <TableCell>
                          <Select
                            value={String(t.status || "open")}
                            onValueChange={(v) => {
                              if (v === "completed") return completeMutation.mutate(t.id);
                              return updateMutation.mutate({ id: t.id, patch: { status: v } });
                            }}
                          >
                            <SelectTrigger className="h-8 w-[140px]">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="open">Open</SelectItem>
                              <SelectItem value="in_progress">In progress</SelectItem>
                              <SelectItem value="blocked">Blocked</SelectItem>
                              <SelectItem value="waiting">Waiting</SelectItem>
                              <SelectItem value="completed">Completed</SelectItem>
                              <SelectItem value="canceled">Canceled</SelectItem>
                            </SelectContent>
                          </Select>
                        </TableCell>
                        <TableCell>
                          {canBulkAssign ? (
                            <Select
                              value={t.assignedToUserId ? String(t.assignedToUserId) : ""}
                              onValueChange={(v) => updateMutation.mutate({ id: t.id, patch: { assignedToUserId: v ? Number(v) : null } })}
                            >
                              <SelectTrigger className="h-8 w-[180px]">
                                <SelectValue placeholder="Unassigned" />
                              </SelectTrigger>
                              <SelectContent>
                                {users.map((u) => (
                                  <SelectItem key={u.id} value={String(u.id)}>
                                    {userLabel(u)}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          ) : (
                            <div className="text-sm text-muted-foreground">
                              {(() => {
                                const u = t.assignedToUserId ? users.find((x) => x.id === t.assignedToUserId) : null;
                                return u ? userLabel(u) : "Unassigned";
                              })()}
                            </div>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-2">
                            <Button size="sm" variant="outline" disabled={t.status === "completed" || completeMutation.isPending} onClick={() => completeMutation.mutate(t.id)}>
                              Complete
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                    {tasksForTab.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={9} className="text-center text-muted-foreground py-10">
                          No tasks found
                        </TableCell>
                      </TableRow>
                    ) : null}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
}
