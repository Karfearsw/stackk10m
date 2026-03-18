import { Layout } from "@/components/layout/Layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/contexts/AuthContext";
import { useQuery } from "@tanstack/react-query";
import { addDays, endOfMonth, endOfWeek, format, isSameMonth, isToday, startOfMonth, startOfWeek } from "date-fns";
import { CalendarDays, ChevronLeft, ChevronRight, Loader2 } from "lucide-react";
import { useMemo, useState } from "react";
import { useLocation } from "wouter";

type Task = {
  id: number;
  title: string;
  type: string | null;
  relatedEntityType: string | null;
  relatedEntityId: number | null;
  dueAt: string | null;
  priority: string | null;
  status: string | null;
};

type TaskListResponse = { items: Task[]; total: number };

function dayKey(d: Date) {
  return format(d, "yyyy-MM-dd");
}

function rangeForMonth(cursor: Date) {
  const start = startOfWeek(startOfMonth(cursor), { weekStartsOn: 0 });
  const end = endOfWeek(endOfMonth(cursor), { weekStartsOn: 0 });
  return { start, end };
}

function taskLink(t: Task) {
  if (t.relatedEntityType === "lead" && t.relatedEntityId) return `/leads?leadId=${t.relatedEntityId}`;
  if (t.relatedEntityType === "opportunity" && t.relatedEntityId) return `/opportunities/${t.relatedEntityId}`;
  if (t.relatedEntityType === "buyer" && t.relatedEntityId) return `/buyers?buyerId=${t.relatedEntityId}`;
  if (t.relatedEntityType === "campaign" && t.relatedEntityId) return `/campaigns?campaignId=${t.relatedEntityId}`;
  return null;
}

export default function CalendarPage() {
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const [view, setView] = useState<"month" | "week" | "day">("month");
  const [cursor, setCursor] = useState<Date>(new Date());
  const [selectedDay, setSelectedDay] = useState<Date>(new Date());

  const range = useMemo(() => {
    if (view === "month") return rangeForMonth(cursor);
    if (view === "week") {
      const start = startOfWeek(cursor, { weekStartsOn: 0 });
      const end = endOfWeek(cursor, { weekStartsOn: 0 });
      return { start, end };
    }
    return { start: new Date(cursor), end: new Date(cursor) };
  }, [cursor, view]);

  const listKey = useMemo(() => {
    const p = new URLSearchParams();
    p.set("includeCompleted", "false");
    p.set("limit", "200");
    p.set("dueFrom", range.start.toISOString());
    p.set("dueTo", range.end.toISOString());
    return `/api/tasks?${p.toString()}`;
  }, [range.end, range.start]);

  const { data, isLoading } = useQuery<TaskListResponse>({
    queryKey: [listKey],
    enabled: !!user,
  });

  const tasksByDay = useMemo(() => {
    const map = new Map<string, Task[]>();
    for (const t of data?.items || []) {
      if (!t.dueAt) continue;
      const k = dayKey(new Date(t.dueAt));
      if (!map.has(k)) map.set(k, []);
      map.get(k)!.push(t);
    }
    return map;
  }, [data?.items]);

  const monthDays = useMemo(() => {
    const days: Date[] = [];
    let d = range.start;
    while (d <= range.end) {
      days.push(d);
      d = addDays(d, 1);
    }
    return days;
  }, [range.end, range.start]);

  const headerLabel = useMemo(() => {
    if (view === "month") return format(cursor, "MMMM yyyy");
    if (view === "week") return `${format(range.start, "PP")} – ${format(range.end, "PP")}`;
    return format(cursor, "PPPP");
  }, [cursor, range.end, range.start, view]);

  return (
    <Layout>
      <div className="p-6 space-y-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2">
            <CalendarDays className="h-5 w-5 text-primary" />
            <h1 className="text-2xl font-bold">Calendar</h1>
            <Badge variant="secondary">Internal</Badge>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={() => setCursor(new Date())}>
              Today
            </Button>
            <Button
              variant="outline"
              size="icon"
              onClick={() => setCursor((d) => addDays(d, view === "month" ? -30 : view === "week" ? -7 : -1))}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              size="icon"
              onClick={() => setCursor((d) => addDays(d, view === "month" ? 30 : view === "week" ? 7 : 1))}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>

        <Card>
          <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <CardTitle>{headerLabel}</CardTitle>
            <Tabs value={view} onValueChange={(v) => setView(v as any)}>
              <TabsList>
                <TabsTrigger value="day">Day</TabsTrigger>
                <TabsTrigger value="week">Week</TabsTrigger>
                <TabsTrigger value="month">Month</TabsTrigger>
              </TabsList>
            </Tabs>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="flex items-center gap-2 text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading…
              </div>
            ) : (
              <Tabs value={view} onValueChange={(v) => setView(v as any)}>
                <TabsContent value="month">
                  <div className="grid grid-cols-7 gap-2 text-xs text-muted-foreground mb-2">
                    {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
                      <div key={d} className="px-2">
                        {d}
                      </div>
                    ))}
                  </div>
                  <div className="grid grid-cols-7 gap-2">
                    {monthDays.map((d) => {
                      const k = dayKey(d);
                      const tasks = tasksByDay.get(k) || [];
                      const outside = !isSameMonth(d, cursor);
                      const selected = dayKey(selectedDay) === k;
                      return (
                        <button
                          key={k}
                          type="button"
                          onClick={() => setSelectedDay(d)}
                          className={`h-28 rounded-md border p-2 text-left transition-colors ${
                            selected ? "border-primary bg-primary/5" : "border-border hover:bg-accent/40"
                          } ${outside ? "opacity-50" : ""}`}
                        >
                          <div className="flex items-center justify-between">
                            <div className={`text-sm font-semibold ${isToday(d) ? "text-primary" : ""}`}>{format(d, "d")}</div>
                            {tasks.length ? <Badge variant="secondary">{tasks.length}</Badge> : null}
                          </div>
                          <div className="mt-2 space-y-1">
                            {tasks.slice(0, 3).map((t) => (
                              <div key={t.id} className="truncate text-xs text-muted-foreground">
                                {t.title}
                              </div>
                            ))}
                            {tasks.length > 3 ? <div className="text-xs text-muted-foreground">+{tasks.length - 3} more</div> : null}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                  <div className="mt-6">
                    <div className="text-sm font-semibold mb-2">Tasks on {format(selectedDay, "PPPP")}</div>
                    <div className="space-y-2">
                      {(tasksByDay.get(dayKey(selectedDay)) || []).map((t) => {
                        const link = taskLink(t);
                        return (
                          <button
                            key={t.id}
                            type="button"
                            onClick={() => (link ? setLocation(link) : null)}
                            className="w-full rounded-md border border-border p-3 text-left hover:bg-accent/40"
                          >
                            <div className="flex items-center justify-between gap-2">
                              <div className="font-medium">{t.title}</div>
                              <Badge variant="secondary">{t.type || "general"}</Badge>
                            </div>
                            <div className="text-xs text-muted-foreground mt-1">{t.dueAt ? format(new Date(t.dueAt), "p") : ""}</div>
                          </button>
                        );
                      })}
                      {(tasksByDay.get(dayKey(selectedDay)) || []).length === 0 ? (
                        <div className="text-sm text-muted-foreground">No tasks due</div>
                      ) : null}
                    </div>
                  </div>
                </TabsContent>
                <TabsContent value="week">
                  <div className="space-y-3">
                    {monthDays.map((d) => {
                      const k = dayKey(d);
                      const tasks = tasksByDay.get(k) || [];
                      return (
                        <div key={k} className="rounded-md border border-border p-3">
                          <div className="flex items-center justify-between">
                            <div className="font-semibold">{format(d, "EEE, PPP")}</div>
                            {tasks.length ? <Badge variant="secondary">{tasks.length}</Badge> : null}
                          </div>
                          <div className="mt-2 space-y-2">
                            {tasks.map((t) => {
                              const link = taskLink(t);
                              return (
                                <button
                                  key={t.id}
                                  type="button"
                                  onClick={() => (link ? setLocation(link) : null)}
                                  className="w-full rounded-md border border-border p-3 text-left hover:bg-accent/40"
                                >
                                  <div className="flex items-center justify-between gap-2">
                                    <div className="font-medium">{t.title}</div>
                                    <Badge variant="secondary">{t.type || "general"}</Badge>
                                  </div>
                                  <div className="text-xs text-muted-foreground mt-1">
                                    {t.dueAt ? format(new Date(t.dueAt), "p") : ""}
                                  </div>
                                </button>
                              );
                            })}
                            {tasks.length === 0 ? <div className="text-sm text-muted-foreground">No tasks</div> : null}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </TabsContent>
                <TabsContent value="day">
                  <div className="rounded-md border border-border p-3">
                    <div className="font-semibold">{format(cursor, "PPPP")}</div>
                    <div className="mt-3 space-y-2">
                      {(tasksByDay.get(dayKey(cursor)) || []).map((t) => {
                        const link = taskLink(t);
                        return (
                          <button
                            key={t.id}
                            type="button"
                            onClick={() => (link ? setLocation(link) : null)}
                            className="w-full rounded-md border border-border p-3 text-left hover:bg-accent/40"
                          >
                            <div className="flex items-center justify-between gap-2">
                              <div className="font-medium">{t.title}</div>
                              <Badge variant="secondary">{t.type || "general"}</Badge>
                            </div>
                            <div className="text-xs text-muted-foreground mt-1">{t.dueAt ? format(new Date(t.dueAt), "p") : ""}</div>
                          </button>
                        );
                      })}
                      {(tasksByDay.get(dayKey(cursor)) || []).length === 0 ? (
                        <div className="text-sm text-muted-foreground">No tasks due</div>
                      ) : null}
                    </div>
                  </div>
                </TabsContent>
              </Tabs>
            )}
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
}
