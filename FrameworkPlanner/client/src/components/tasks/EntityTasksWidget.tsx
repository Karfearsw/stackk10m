import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { apiRequest } from "@/lib/queryClient";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { Loader2, Plus } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

type Task = {
  id: number;
  title: string;
  description: string | null;
  dueAt: string | null;
  status: string | null;
  priority: string | null;
  type: string | null;
};

type TaskListResponse = { items: Task[]; total: number };

function fmt(dueAt: string | null) {
  if (!dueAt) return "—";
  try {
    return format(new Date(dueAt), "PP p");
  } catch {
    return "—";
  }
}

function endpoint(entityType: "lead" | "opportunity" | "buyer" | "campaign", entityId: number) {
  if (entityType === "lead") return `/api/leads/${entityId}/tasks`;
  if (entityType === "opportunity") return `/api/opportunities/${entityId}/tasks`;
  if (entityType === "buyer") return `/api/buyers/${entityId}/tasks`;
  return `/api/campaigns/${entityId}/tasks`;
}

export function EntityTasksWidget(props: { entityType: "lead" | "opportunity" | "buyer" | "campaign"; entityId: number }) {
  const qc = useQueryClient();
  const url = useMemo(() => `${endpoint(props.entityType, props.entityId)}?includeCompleted=true&limit=50`, [props.entityId, props.entityType]);

  const { data, isLoading } = useQuery<TaskListResponse>({
    queryKey: [url],
    enabled: Number.isFinite(props.entityId) && props.entityId > 0,
  });

  const upcoming = useMemo(() => (data?.items || []).filter((t) => t.status !== "completed"), [data?.items]);
  const completed = useMemo(() => (data?.items || []).filter((t) => t.status === "completed"), [data?.items]);

  const completeMutation = useMutation({
    mutationFn: async (taskId: number) => {
      const res = await apiRequest("POST", `/api/tasks/${taskId}/complete`);
      return res.json();
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: [url] }),
    onError: (e: any) => toast.error(String(e?.message || e)),
  });

  const createMutation = useMutation({
    mutationFn: async (input: { title: string; dueAt?: string | null; priority: string; isPrivate: boolean }) => {
      const res = await apiRequest("POST", endpoint(props.entityType, props.entityId), {
        title: input.title,
        dueAt: input.dueAt ? new Date(input.dueAt).toISOString() : null,
        priority: input.priority,
        isPrivate: input.isPrivate,
        status: "open",
      });
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [url] });
      toast.success("Task added");
    },
    onError: (e: any) => toast.error(String(e?.message || e)),
  });

  const [title, setTitle] = useState("");
  const [dueAt, setDueAt] = useState("");
  const [priority, setPriority] = useState("medium");
  const [isPrivate, setIsPrivate] = useState(false);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <div>Tasks</div>
          <div className="text-sm text-muted-foreground">
            {upcoming.length} open / {completed.length} done
          </div>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <div className="flex gap-2">
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Quick add task" />
            <Button
              onClick={() => {
                const t = title.trim();
                if (!t) return;
                createMutation.mutate({ title: t, dueAt: dueAt || null, priority, isPrivate });
                setTitle("");
                setDueAt("");
                setPriority("medium");
                setIsPrivate(false);
              }}
              disabled={createMutation.isPending}
            >
              {createMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            </Button>
          </div>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            <Input value={dueAt} onChange={(e) => setDueAt(e.target.value)} type="datetime-local" />
            <Select value={priority} onValueChange={setPriority}>
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
              <Checkbox checked={isPrivate} onCheckedChange={(v) => setIsPrivate(Boolean(v))} />
              <div className="text-sm">Private</div>
            </div>
          </div>
        </div>

        {isLoading ? (
          <div className="flex items-center gap-2 text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading…
          </div>
        ) : (
          <div className="space-y-4">
            <div className="space-y-2">
              <div className="text-sm font-semibold">Upcoming</div>
              <div className="space-y-2">
                {upcoming.map((t) => (
                  <div key={t.id} className="rounded-md border border-border p-3">
                    <div className="flex items-center justify-between gap-2">
                      <div className="font-medium">{t.title}</div>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => completeMutation.mutate(t.id)}
                        disabled={completeMutation.isPending}
                      >
                        Complete
                      </Button>
                    </div>
                    <div className="text-xs text-muted-foreground mt-1">{fmt(t.dueAt)}</div>
                    {t.description ? <div className="text-xs text-muted-foreground mt-2 line-clamp-2">{t.description}</div> : null}
                  </div>
                ))}
                {upcoming.length === 0 ? <div className="text-sm text-muted-foreground">No upcoming tasks</div> : null}
              </div>
            </div>
            <div className="space-y-2">
              <div className="text-sm font-semibold">Completed</div>
              <div className="space-y-2">
                {completed.slice(0, 5).map((t) => (
                  <div key={t.id} className="rounded-md border border-border p-3 opacity-70">
                    <div className="font-medium">{t.title}</div>
                    <div className="text-xs text-muted-foreground mt-1">{fmt(t.dueAt)}</div>
                  </div>
                ))}
                {completed.length === 0 ? <div className="text-sm text-muted-foreground">No completed tasks</div> : null}
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

