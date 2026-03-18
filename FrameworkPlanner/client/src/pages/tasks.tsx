import { Layout } from "@/components/layout/Layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/contexts/AuthContext";
import { apiRequest } from "@/lib/queryClient";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { CheckSquare, Loader2, Plus, RefreshCw, UserPlus } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { useLocation } from "wouter";

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
  if (t.relatedEntityType === "lead" && t.relatedEntityId) return `/leads?leadId=${t.relatedEntityId}`;
  if (t.relatedEntityType === "opportunity" && t.relatedEntityId) return `/opportunities/${t.relatedEntityId}`;
  if (t.relatedEntityType === "buyer" && t.relatedEntityId) return `/buyers?buyerId=${t.relatedEntityId}`;
  if (t.relatedEntityType === "campaign" && t.relatedEntityId) return `/campaigns?campaignId=${t.relatedEntityId}`;
  return null;
}

export default function TasksPage() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const canBulkAssign = isManager(user);
  const [, setLocation] = useLocation();

  const [assignee, setAssignee] = useState<string>("all");
  const [status, setStatus] = useState<string>("open");
  const [type, setType] = useState<string>("all");
  const [priority, setPriority] = useState<string>("all");
  const [dueFrom, setDueFrom] = useState<string>("");
  const [dueTo, setDueTo] = useState<string>("");
  const [search, setSearch] = useState<string>("");

  const params = useMemo(() => {
    const p = new URLSearchParams();
    p.set("limit", "200");
    p.set("includeCompleted", status === "all" ? "true" : "false");
    if (assignee !== "all") p.set("assignedToUserId", assignee);
    if (status !== "all") p.set("status", status);
    if (type !== "all") p.set("type", type);
    if (priority !== "all") p.set("priority", priority);
    if (dueFrom) p.set("dueFrom", new Date(`${dueFrom}T00:00:00`).toISOString());
    if (dueTo) p.set("dueTo", new Date(`${dueTo}T23:59:59`).toISOString());
    return p;
  }, [assignee, dueFrom, dueTo, priority, status, type]);

  const listKey = useMemo(() => `/api/tasks?${params.toString()}`, [params]);

  const { data: list, isLoading, refetch, isFetching } = useQuery<TaskListResponse>({
    queryKey: [listKey],
    enabled: !!user,
  });

  const { data: users = [] } = useQuery<User[]>({
    queryKey: ["/api/users"],
    enabled: !!user,
  });

  const tasks = useMemo(() => {
    const items = list?.items || [];
    const q = search.trim().toLowerCase();
    if (!q) return items;
    return items.filter((t) => String(t.title || "").toLowerCase().includes(q) || String(t.description || "").toLowerCase().includes(q));
  }, [list?.items, search]);

  const [selected, setSelected] = useState<Record<number, boolean>>({});
  const selectedIds = useMemo(() => Object.keys(selected).filter((k) => selected[Number(k)]).map((k) => Number(k)), [selected]);
  const allSelected = tasks.length > 0 && selectedIds.length === tasks.length;

  const completeMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await apiRequest("POST", `/api/tasks/${id}/complete`);
      return res.json();
    },
    onMutate: async (id: number) => {
      await qc.cancelQueries({ queryKey: [listKey] });
      const previous = qc.getQueryData<TaskListResponse>([listKey]);
      if (previous?.items) {
        qc.setQueryData<TaskListResponse>([listKey], {
          ...previous,
          items: previous.items.filter((t) => t.id !== id),
          total: Math.max(0, Number(previous.total || 0) - 1),
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
        const kept = previous.items.filter((t) => !set.has(t.id));
        qc.setQueryData<TaskListResponse>([listKey], {
          ...previous,
          items: kept,
          total: Math.max(0, Number(previous.total || 0) - (previous.items.length - kept.length)),
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
            <CardTitle>Filters</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-1 gap-3 md:grid-cols-6">
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search title/description" className="md:col-span-2" />
            <Select value={assignee} onValueChange={setAssignee}>
              <SelectTrigger>
                <SelectValue placeholder="Assignee" />
              </SelectTrigger>
              <SelectContent>
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
                <SelectItem value="open">Open</SelectItem>
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
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              <div>Tasks</div>
              <div className="flex items-center gap-2">
                <Checkbox
                  checked={allSelected}
                  onCheckedChange={(v) => {
                    const checked = Boolean(v);
                    if (!checked) return setSelected({});
                    const next: Record<number, boolean> = {};
                    for (const t of tasks) next[t.id] = true;
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
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-10" />
                    <TableHead>Title</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Due</TableHead>
                    <TableHead>Priority</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {tasks.map((t) => (
                    <TableRow key={t.id}>
                      <TableCell>
                        <Checkbox
                          checked={!!selected[t.id]}
                          onCheckedChange={(v) => setSelected((s) => ({ ...s, [t.id]: Boolean(v) }))}
                        />
                      </TableCell>
                      <TableCell className="font-medium">
                        <div className="flex flex-col">
                          <div>{t.title}</div>
                          {t.description ? <div className="text-xs text-muted-foreground line-clamp-1">{t.description}</div> : null}
                        </div>
                      </TableCell>
                      <TableCell>{t.type || "general"}</TableCell>
                      <TableCell>{fmtDue(t.dueAt)}</TableCell>
                      <TableCell>{t.priority || "medium"}</TableCell>
                      <TableCell>{t.status || "open"}</TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          {taskLink(t) ? (
                            <Button size="sm" variant="outline" onClick={() => setLocation(taskLink(t) as string)}>
                              Open
                            </Button>
                          ) : null}
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={t.status === "completed" || completeMutation.isPending}
                            onClick={() => completeMutation.mutate(t.id)}
                          >
                            Complete
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                  {tasks.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center text-muted-foreground py-10">
                        No tasks found
                      </TableCell>
                    </TableRow>
                  ) : null}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
}
