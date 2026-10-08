import { Layout } from "@/components/layout/Layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import {
  Loader2, RefreshCw, XCircle, RotateCcw, Trash2,
  Inbox, Play, CheckCircle2, AlertTriangle, Ban, Skull, TriangleAlert,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface JobHealth {
  counts: Record<string, number>;
  vitals: { oldestQueuedAgeMs: number | null; lastSuccessAt: string | null };
  alerts: Array<{ kind: string; message: string }>;
}

interface Job {
  id: number;
  type: string;
  status: string;
  priority: number;
  scheduled_at: string;
  attempts: number;
  max_attempts: number;
  created_at: string;
  updated_at: string;
}

interface DeadLetter {
  id: number;
  job_id: number | null;
  job_type: string | null;
  failed_at: string;
  error: string | null;
  attempts: number;
}

const STATUS_META: Record<string, { label: string; icon: any; className: string }> = {
  queued: { label: "Queued", icon: Inbox, className: "bg-blue-600 text-white" },
  active: { label: "Active", icon: Play, className: "bg-amber-500 text-white" },
  succeeded: { label: "Succeeded", icon: CheckCircle2, className: "bg-green-600 text-white" },
  failed: { label: "Failed", icon: AlertTriangle, className: "bg-red-600 text-white" },
  cancelled: { label: "Cancelled", icon: Ban, className: "bg-gray-500 text-white" },
  dead_lettered: { label: "Dead-lettered", icon: Skull, className: "bg-purple-700 text-white" },
};

function StatusBadge({ status }: { status: string }) {
  const meta = STATUS_META[status] || STATUS_META.queued;
  const Icon = meta.icon;
  return (
    <Badge className={meta.className}>
      <Icon className="h-3 w-3 mr-1" /> {meta.label}
    </Badge>
  );
}

function fmtDate(s: string | null | undefined) {
  if (!s) return "—";
  try {
    return new Date(s).toLocaleString();
  } catch {
    return s;
  }
}

export default function JobsPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [statusFilter, setStatusFilter] = useState<string>("");

  const { data: health, isLoading: healthLoading, refetch: refetchHealth } = useQuery<JobHealth>({
    queryKey: ["/api/jobs/health"],
    queryFn: async () => {
      const res = await fetch("/api/jobs/health", { credentials: "include" });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
    refetchInterval: 15000,
  });

  const { data: jobsData, isLoading: jobsLoading, refetch: refetchJobs } = useQuery<{ jobs: Job[]; total: number }>({
    queryKey: ["/api/jobs", statusFilter],
    queryFn: async () => {
      const params = new URLSearchParams({ limit: "50" });
      if (statusFilter) params.set("status", statusFilter);
      const res = await fetch(`/api/jobs?${params}`, { credentials: "include" });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
    refetchInterval: 15000,
  });

  const { data: dlqData, refetch: refetchDlq } = useQuery<{ records: DeadLetter[]; total: number }>({
    queryKey: ["/api/jobs/dead-letters"],
    queryFn: async () => {
      const res = await fetch("/api/jobs/dead-letters?limit=25", { credentials: "include" });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
    refetchInterval: 15000,
  });

  const mutate = useMutation({
    mutationFn: async ({ url, method }: { url: string; method: string }) => {
      const res = await fetch(url, { method, credentials: "include" });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/jobs"] });
      queryClient.invalidateQueries({ queryKey: ["/api/jobs/health"] });
      queryClient.invalidateQueries({ queryKey: ["/api/jobs/dead-letters"] });
    },
    onError: (e: any) => toast({ title: "Action failed", description: String(e?.message || e), variant: "destructive" }),
  });

  const refreshAll = () => {
    refetchHealth();
    refetchJobs();
    refetchDlq();
  };

  const counts = health?.counts || {};
  const cards: Array<{ key: string; count: number }> = [
    { key: "queued", count: counts.queued || 0 },
    { key: "active", count: counts.active || 0 },
    { key: "succeeded", count: counts.succeeded || 0 },
    { key: "failed", count: counts.failed || 0 },
    { key: "dead_lettered", count: counts.dead_lettered || 0 },
  ];

  return (
    <Layout>
      <div className="flex items-center justify-between mb-6">
        <div className="space-y-1">
          <h1 className="text-3xl font-bold tracking-tight">Job Queue</h1>
          <p className="text-muted-foreground">
            Background job health, recent jobs, and the dead-letter queue.
          </p>
        </div>
        <Button variant="outline" onClick={refreshAll} data-testid="button-refresh-jobs">
          <RefreshCw className="h-4 w-4 mr-2" /> Refresh
        </Button>
      </div>

      {health?.alerts && health.alerts.length > 0 && (
        <div className="space-y-2 mb-6">
          {health.alerts.map((a, i) => (
            <Card key={i} className="border-amber-500/50 bg-amber-500/10">
              <CardContent className="p-4 flex items-center gap-3">
                <TriangleAlert className="h-5 w-5 text-amber-500 shrink-0" />
                <p className="text-sm">{a.message}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {healthLoading ? (
        <div className="flex items-center justify-center h-32">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">
          {cards.map((c) => {
            const meta = STATUS_META[c.key];
            const Icon = meta.icon;
            return (
              <Card key={c.key} className="cursor-pointer hover:border-primary/50" onClick={() => setStatusFilter(statusFilter === c.key ? "" : c.key)}>
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-1">
                    <Icon className="h-4 w-4 text-muted-foreground" />
                    <p className="text-xs text-muted-foreground">{meta.label}</p>
                  </div>
                  <p className="text-2xl font-bold" data-testid={`count-jobs-${c.key}`}>{c.count}</p>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <Card className="mb-6">
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Recent Jobs {statusFilter && <span className="text-sm font-normal text-muted-foreground">(filtered: {statusFilter})</span>}</CardTitle>
            {statusFilter && (
              <Button variant="ghost" size="sm" onClick={() => setStatusFilter("")}>
                <XCircle className="h-4 w-4 mr-1" /> Clear filter
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {jobsLoading ? (
            <div className="flex items-center justify-center h-24">
              <Loader2 className="w-6 h-6 animate-spin text-primary" />
            </div>
          ) : !jobsData || jobsData.jobs.length === 0 ? (
            <p className="text-center text-sm text-muted-foreground py-8">No jobs found.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-muted-foreground">
                    <th className="p-2">ID</th>
                    <th className="p-2">Type</th>
                    <th className="p-2">Status</th>
                    <th className="p-2">Attempts</th>
                    <th className="p-2">Scheduled</th>
                    <th className="p-2">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {jobsData.jobs.map((j) => (
                    <tr key={j.id} className="border-b last:border-0 hover:bg-muted/30">
                      <td className="p-2 font-mono">#{j.id}</td>
                      <td className="p-2 font-medium">{j.type}</td>
                      <td className="p-2"><StatusBadge status={j.status} /></td>
                      <td className="p-2">{j.attempts}/{j.max_attempts}</td>
                      <td className="p-2 text-muted-foreground">{fmtDate(j.scheduled_at)}</td>
                      <td className="p-2">
                        <div className="flex gap-1">
                          {(j.status === "failed" || j.status === "dead_lettered" || j.status === "cancelled") && (
                            <Button
                              variant="outline" size="sm"
                              onClick={() => mutate.mutate({ url: `/api/jobs/${j.id}/retry`, method: "POST" })}
                              data-testid={`button-retry-job-${j.id}`}
                            >
                              <RotateCcw className="h-3 w-3 mr-1" /> Retry
                            </Button>
                          )}
                          {(j.status === "queued" || j.status === "active") && (
                            <Button
                              variant="outline" size="sm"
                              onClick={() => mutate.mutate({ url: `/api/jobs/${j.id}/cancel`, method: "POST" })}
                              data-testid={`button-cancel-job-${j.id}`}
                            >
                              <XCircle className="h-3 w-3 mr-1" /> Cancel
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Dead-Letter Queue {dlqData && dlqData.total > 0 && <span className="text-sm font-normal text-muted-foreground">({dlqData.total} records)</span>}</CardTitle>
        </CardHeader>
        <CardContent>
          {!dlqData || dlqData.records.length === 0 ? (
            <p className="text-center text-sm text-muted-foreground py-8">No dead-lettered jobs. Failed jobs that exhaust retries land here.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-muted-foreground">
                    <th className="p-2">Job</th>
                    <th className="p-2">Type</th>
                    <th className="p-2">Error</th>
                    <th className="p-2">Failed</th>
                    <th className="p-2">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {dlqData.records.map((r) => (
                    <tr key={r.id} className="border-b last:border-0 hover:bg-muted/30">
                      <td className="p-2 font-mono">#{r.job_id ?? "—"}</td>
                      <td className="p-2 font-medium">{r.job_type || "—"}</td>
                      <td className="p-2 text-muted-foreground max-w-xs truncate" title={r.error || ""}>{r.error || "—"}</td>
                      <td className="p-2 text-muted-foreground">{fmtDate(r.failed_at)}</td>
                      <td className="p-2">
                        <div className="flex gap-1">
                          {r.job_id != null && (
                            <Button
                              variant="outline" size="sm"
                              onClick={() => mutate.mutate({ url: `/api/jobs/dead-letters/${r.id}/retry`, method: "POST" })}
                            >
                              <RotateCcw className="h-3 w-3 mr-1" /> Retry
                            </Button>
                          )}
                          <Button
                            variant="outline" size="sm"
                            onClick={() => mutate.mutate({ url: `/api/jobs/dead-letters/${r.id}`, method: "DELETE" })}
                          >
                            <Trash2 className="h-3 w-3 mr-1" /> Purge
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </Layout>
  );
}
