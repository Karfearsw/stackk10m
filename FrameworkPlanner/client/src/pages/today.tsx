import { Layout } from "@/components/layout/Layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/contexts/AuthContext";
import { apiRequest } from "@/lib/queryClient";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { endOfDay, format, startOfDay } from "date-fns";
import { CalendarCheck2, Loader2 } from "lucide-react";
import { useMemo } from "react";
import { toast } from "sonner";
import { useLocation } from "wouter";
import { getEntityFilterFromLocation, leadUrl, opportunityUrl } from "@/lib/deepLinks";
import type { TodayQueueResponse } from "@/components/today/types";
import { TodayGroups } from "@/components/today/TodayGroups";
import { TodayTaskRow } from "@/components/today/TodayTaskRow";

function isManager(user: any) {
  const role = String(user?.role || "").toLowerCase();
  return !!user?.isSuperAdmin || role === "admin" || role === "manager" || role === "owner";
}

function taskLink(t: { relatedEntityType: string | null; relatedEntityId: number | null }) {
  if (t.relatedEntityType === "lead" && t.relatedEntityId) return leadUrl(t.relatedEntityId);
  if (t.relatedEntityType === "opportunity" && t.relatedEntityId) return opportunityUrl(t.relatedEntityId);
  if (t.relatedEntityType === "buyer" && t.relatedEntityId) return `/buyers?buyerId=${t.relatedEntityId}`;
  if (t.relatedEntityType === "campaign" && t.relatedEntityId) return `/campaigns?campaignId=${t.relatedEntityId}`;
  return null;
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

export default function TodayPage() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [, setLocation] = useLocation();
  const entityFilter = useMemo(() => getEntityFilterFromLocation(), []);
  const manager = useMemo(() => isManager(user), [user]);

  const todayStart = useMemo(() => startOfDay(new Date()), []);
  const todayEnd = useMemo(() => endOfDay(new Date()), []);

  const listKey = useMemo(() => {
    const p = new URLSearchParams();
    p.set("start", todayStart.toISOString());
    p.set("end", todayEnd.toISOString());
    p.set("limit", "500");
    if (entityFilter.relatedEntityType && entityFilter.relatedEntityId) {
      p.set("relatedEntityType", entityFilter.relatedEntityType);
      p.set("relatedEntityId", String(entityFilter.relatedEntityId));
    }
    return `/api/today-queue?${p.toString()}`;
  }, [entityFilter.relatedEntityId, entityFilter.relatedEntityType, todayEnd, todayStart]);

  const { data, isLoading } = useQuery<TodayQueueResponse>({
    queryKey: [listKey],
    enabled: !!user,
  });

  const top = useMemo(() => data?.top || [], [data?.top]);
  const groups = useMemo(() => data?.groups || [], [data?.groups]);

  const completeMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await apiRequest("POST", `/api/tasks/${id}/complete`);
      return res.json();
    },
    onMutate: async (id: number) => {
      await qc.cancelQueries({ queryKey: [listKey] });
      const previous = qc.getQueryData<TodayQueueResponse>([listKey]);
      if (previous) {
        const nextTop = previous.top.filter((t) => t.id !== id);
        const nextGroups = previous.groups
          .map((g) => ({ ...g, items: g.items.filter((t) => t.id !== id) }))
          .filter((g) => g.items.length > 0)
          .map((g) => ({ ...g, count: g.items.length }));
        qc.setQueryData<TodayQueueResponse>([listKey], {
          ...previous,
          top: nextTop,
          groups: nextGroups,
          counts: {
            ...previous.counts,
            total: Math.max(0, Number(previous.counts.total || 0) - 1),
            overdue: Math.max(0, Number(previous.counts.overdue || 0) - (previous.top.find((t) => t.id === id)?.buckets.overdue ? 1 : 0)),
            dueToday: Math.max(0, Number(previous.counts.dueToday || 0) - (previous.top.find((t) => t.id === id)?.buckets.dueToday ? 1 : 0)),
          },
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
    mutationFn: async (input: { id: number; dueAt: Date; reason: string | null }) => {
      const payload: any = { dueAt: input.dueAt.toISOString() };
      if (input.reason) payload.reason = input.reason;
      const res = await apiRequest("POST", `/api/tasks/${input.id}/reschedule`, payload);
      return res.json();
    },
    onMutate: async (input) => {
      await qc.cancelQueries({ queryKey: [listKey] });
      const previous = qc.getQueryData<TodayQueueResponse>([listKey]);
      if (previous) {
        const dueAtIso = input.dueAt.toISOString();
        const shouldRemove = input.dueAt.getTime() > todayEnd.getTime();
        const patchItem = (t: any) => (t.id === input.id ? { ...t, dueAt: dueAtIso, status: "open" } : t);
        const nextTop = shouldRemove ? previous.top.filter((t) => t.id !== input.id) : previous.top.map(patchItem);
        const nextGroups = previous.groups
          .map((g) => ({
            ...g,
            items: shouldRemove ? g.items.filter((t) => t.id !== input.id) : g.items.map(patchItem),
          }))
          .filter((g) => g.items.length > 0)
          .map((g) => ({ ...g, count: g.items.length }));
        qc.setQueryData<TodayQueueResponse>([listKey], { ...previous, top: nextTop, groups: nextGroups });
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

  const bulkCompleteMutation = useMutation({
    mutationFn: async (ids: number[]) => {
      await runWithConcurrency(ids, 5, async (id) => {
        await apiRequest("POST", `/api/tasks/${id}/complete`);
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [listKey] });
      toast.success("Tasks completed");
    },
    onError: (e: any) => toast.error(String(e?.message || e)),
  });

  const bulkRescheduleMutation = useMutation({
    mutationFn: async (input: { ids: number[]; dueAt: Date; reason: string | null }) => {
      const payload: any = { dueAt: input.dueAt.toISOString() };
      if (input.reason) payload.reason = input.reason;
      await runWithConcurrency(input.ids, 5, async (id) => {
        await apiRequest("POST", `/api/tasks/${id}/reschedule`, payload);
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [listKey] });
      toast.success("Rescheduled");
    },
    onError: (e: any) => toast.error(String(e?.message || e)),
  });

  const disabled = completeMutation.isPending || rescheduleMutation.isPending || bulkCompleteMutation.isPending || bulkRescheduleMutation.isPending;

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
          <div className="space-y-6">
            <div className="flex flex-wrap gap-2">
              <Badge variant={data?.counts.overdue ? "destructive" : "secondary"}>Overdue {data?.counts.overdue ?? 0}</Badge>
              <Badge variant="secondary">Due today {data?.counts.dueToday ?? 0}</Badge>
              <Badge variant="secondary">Locked {data?.counts.snoozeBlocked ?? 0}</Badge>
              <Badge variant="secondary">Total {data?.counts.total ?? 0}</Badge>
            </div>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center justify-between">
                  <div>Do these first</div>
                  <Badge variant="secondary">{top.length}</Badge>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {top.map((t) => (
                  <TodayTaskRow
                    key={t.id}
                    item={t}
                    disabled={disabled}
                    isManager={manager}
                    onComplete={() => completeMutation.mutate(t.id)}
                    onOpen={() => {
                      const link = taskLink(t);
                      if (link) setLocation(link);
                    }}
                    onReschedule={(dueAt, reason) => rescheduleMutation.mutate({ id: t.id, dueAt, reason })}
                  />
                ))}
                {top.length === 0 ? <div className="text-sm text-muted-foreground">No tasks</div> : null}
              </CardContent>
            </Card>

            <TodayGroups
              title="Backlog triage"
              groups={groups}
              disabled={disabled}
              isManager={manager}
              onOpen={(t) => {
                const link = taskLink(t);
                if (link) setLocation(link);
              }}
              onComplete={(id) => completeMutation.mutate(id)}
              onReschedule={(id, dueAt, reason) => rescheduleMutation.mutate({ id, dueAt, reason })}
              onBulkComplete={(ids) => bulkCompleteMutation.mutate(ids)}
              onBulkReschedule={(ids, dueAt, reason) => bulkRescheduleMutation.mutate({ ids, dueAt, reason })}
            />
          </div>
        )}
      </div>
    </Layout>
  );
}
