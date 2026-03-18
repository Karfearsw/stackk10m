import { Layout } from "@/components/layout/Layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/contexts/AuthContext";
import { apiRequest } from "@/lib/queryClient";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { addDays, endOfDay, format, startOfDay } from "date-fns";
import { CalendarCheck2, Loader2 } from "lucide-react";
import { useMemo, useRef, useState } from "react";
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
  priority: string | null;
  status: string | null;
};

type TaskListResponse = { items: Task[]; total: number };

function taskLink(t: Task) {
  if (t.relatedEntityType === "lead" && t.relatedEntityId) return `/leads?leadId=${t.relatedEntityId}`;
  if (t.relatedEntityType === "opportunity" && t.relatedEntityId) return `/opportunities/${t.relatedEntityId}`;
  if (t.relatedEntityType === "buyer" && t.relatedEntityId) return `/buyers?buyerId=${t.relatedEntityId}`;
  if (t.relatedEntityType === "campaign" && t.relatedEntityId) return `/campaigns?campaignId=${t.relatedEntityId}`;
  return null;
}

function isOverdue(t: Task, todayStart: Date) {
  if (!t.dueAt) return false;
  return new Date(t.dueAt).getTime() < todayStart.getTime();
}

function isDueToday(t: Task, todayStart: Date, todayEnd: Date) {
  if (!t.dueAt) return false;
  const ts = new Date(t.dueAt).getTime();
  return ts >= todayStart.getTime() && ts <= todayEnd.getTime();
}

function formatTime(dueAt: string | null) {
  if (!dueAt) return "";
  try {
    return format(new Date(dueAt), "p");
  } catch {
    return "";
  }
}

function SwipeRow(props: { task: Task; onComplete: () => void; onOpen: () => void; disabled?: boolean }) {
  const startX = useRef<number | null>(null);
  const [dx, setDx] = useState(0);

  const onTouchStart = (e: React.TouchEvent) => {
    if (props.disabled) return;
    startX.current = e.touches[0]?.clientX ?? null;
    setDx(0);
  };
  const onTouchMove = (e: React.TouchEvent) => {
    if (props.disabled) return;
    if (startX.current === null) return;
    const x = e.touches[0]?.clientX ?? startX.current;
    const delta = x - startX.current;
    setDx(Math.max(0, Math.min(140, delta)));
  };
  const onTouchEnd = () => {
    if (props.disabled) return;
    if (dx > 90) props.onComplete();
    startX.current = null;
    setDx(0);
  };

  return (
    <div className="relative overflow-hidden rounded-md border border-border">
      <div className="absolute inset-0 flex items-center justify-end bg-primary/10 pr-4">
        <div className="text-sm font-semibold text-primary">Complete</div>
      </div>
      <button
        type="button"
        disabled={props.disabled}
        onClick={props.onOpen}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        className="relative w-full bg-background p-3 text-left transition-transform disabled:opacity-60 disabled:pointer-events-none"
        style={{ transform: `translateX(${dx}px)` }}
      >
        <div className="flex items-center justify-between gap-2">
          <div className="font-medium truncate">{props.task.title}</div>
          <div className="text-xs text-muted-foreground">{formatTime(props.task.dueAt)}</div>
        </div>
        {props.task.description ? <div className="text-xs text-muted-foreground mt-1 line-clamp-1">{props.task.description}</div> : null}
      </button>
    </div>
  );
}

export default function TodayPage() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [, setLocation] = useLocation();

  const todayStart = useMemo(() => startOfDay(new Date()), []);
  const todayEnd = useMemo(() => endOfDay(new Date()), []);

  const listKey = useMemo(() => {
    const p = new URLSearchParams();
    p.set("includeCompleted", "false");
    p.set("limit", "200");
    p.set("dueTo", todayEnd.toISOString());
    return `/api/tasks?${p.toString()}`;
  }, [todayEnd]);

  const { data, isLoading } = useQuery<TaskListResponse>({
    queryKey: [listKey],
    enabled: !!user,
  });

  const tasks = useMemo(() => data?.items || [], [data?.items]);
  const overdue = useMemo(() => tasks.filter((t) => isOverdue(t, todayStart)), [tasks, todayStart]);
  const today = useMemo(() => tasks.filter((t) => isDueToday(t, todayStart, todayEnd)), [tasks, todayEnd, todayStart]);

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

  const rescheduleMutation = useMutation({
    mutationFn: async (input: { id: number; dueAt: Date }) => {
      const res = await apiRequest("PATCH", `/api/tasks/${input.id}`, { dueAt: input.dueAt.toISOString(), status: "open" });
      return res.json();
    },
    onMutate: async (input) => {
      await qc.cancelQueries({ queryKey: [listKey] });
      const previous = qc.getQueryData<TaskListResponse>([listKey]);
      if (previous?.items) {
        const dueAtIso = input.dueAt.toISOString();
        const shouldRemove = input.dueAt.getTime() > todayEnd.getTime();
        qc.setQueryData<TaskListResponse>([listKey], {
          ...previous,
          items: shouldRemove
            ? previous.items.filter((t) => t.id !== input.id)
            : previous.items.map((t) => (t.id === input.id ? { ...t, dueAt: dueAtIso, status: "open" } : t)),
        });
      }
      return { previous };
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [listKey] });
      toast.success("Rescheduled");
    },
    onError: (e: any, _input: any, ctx: any) => {
      if (ctx?.previous) qc.setQueryData([listKey], ctx.previous);
      toast.error(String(e?.message || e));
    },
  });

  const [rescheduleDate, setRescheduleDate] = useState("");

  return (
    <Layout>
      <div className="p-6 space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CalendarCheck2 className="h-5 w-5 text-primary" />
            <h1 className="text-2xl font-bold">Today</h1>
          </div>
          <Badge variant="secondary">{format(new Date(), "PP")}</Badge>
        </div>

        {isLoading ? (
          <div className="flex items-center gap-2 text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading…
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center justify-between">
                  <div>Overdue</div>
                  <Badge variant={overdue.length ? "destructive" : "secondary"}>{overdue.length}</Badge>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {overdue.map((t) => (
                  <div key={t.id} className="space-y-2">
                    <SwipeRow
                      task={t}
                      disabled={completeMutation.isPending || rescheduleMutation.isPending}
                      onComplete={() => completeMutation.mutate(t.id)}
                      onOpen={() => {
                        const link = taskLink(t);
                        if (link) setLocation(link);
                      }}
                    />
                    <div className="flex flex-wrap gap-2">
                      <Button size="sm" variant="outline" disabled={rescheduleMutation.isPending || completeMutation.isPending} onClick={() => rescheduleMutation.mutate({ id: t.id, dueAt: addDays(new Date(), 1) })}>
                        Tomorrow
                      </Button>
                      <Button size="sm" variant="outline" disabled={rescheduleMutation.isPending || completeMutation.isPending} onClick={() => rescheduleMutation.mutate({ id: t.id, dueAt: addDays(new Date(), 7) })}>
                        Next week
                      </Button>
                      <Dialog>
                        <DialogTrigger asChild>
                          <Button size="sm" variant="outline" disabled={rescheduleMutation.isPending || completeMutation.isPending}>
                            Pick date
                          </Button>
                        </DialogTrigger>
                        <DialogContent>
                          <DialogHeader>
                            <DialogTitle>Reschedule</DialogTitle>
                          </DialogHeader>
                          <Input type="date" value={rescheduleDate} onChange={(e) => setRescheduleDate(e.target.value)} />
                          <DialogFooter>
                            <Button
                              disabled={!rescheduleDate || rescheduleMutation.isPending || completeMutation.isPending}
                              onClick={() => {
                                const d = rescheduleDate ? new Date(`${rescheduleDate}T09:00:00`) : null;
                                if (!d) return;
                                rescheduleMutation.mutate({ id: t.id, dueAt: d });
                                setRescheduleDate("");
                              }}
                            >
                              Save
                            </Button>
                          </DialogFooter>
                        </DialogContent>
                      </Dialog>
                    </div>
                  </div>
                ))}
                {overdue.length === 0 ? <div className="text-sm text-muted-foreground">No overdue tasks</div> : null}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center justify-between">
                  <div>Due Today</div>
                  <Badge variant="secondary">{today.length}</Badge>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {today.map((t) => (
                  <div key={t.id} className="space-y-2">
                    <SwipeRow
                      task={t}
                      disabled={completeMutation.isPending || rescheduleMutation.isPending}
                      onComplete={() => completeMutation.mutate(t.id)}
                      onOpen={() => {
                        const link = taskLink(t);
                        if (link) setLocation(link);
                      }}
                    />
                    <div className="flex flex-wrap gap-2">
                      <Button size="sm" variant="outline" disabled={rescheduleMutation.isPending || completeMutation.isPending} onClick={() => rescheduleMutation.mutate({ id: t.id, dueAt: addDays(new Date(), 1) })}>
                        Tomorrow
                      </Button>
                      <Button size="sm" variant="outline" disabled={rescheduleMutation.isPending || completeMutation.isPending} onClick={() => rescheduleMutation.mutate({ id: t.id, dueAt: addDays(new Date(), 7) })}>
                        Next week
                      </Button>
                    </div>
                  </div>
                ))}
                {today.length === 0 ? <div className="text-sm text-muted-foreground">No tasks due today</div> : null}
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </Layout>
  );
}
