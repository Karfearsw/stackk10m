import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Layout } from "@/components/layout/Layout";
import { Card, CardContent } from "@/components/ui/card";
import { AlertTriangle, Loader2 } from "lucide-react";
import { fetchJson } from "@/lib/fetchJson";
import { useAuth } from "@/contexts/AuthContext";
import { AgentFleetOverview } from "@/components/ops/AgentFleetOverview";
import type { OpsAgentListResponse, TeamOption } from "@/components/ops/types";

function canViewOps(user: { isSuperAdmin?: boolean; role?: string } | null) {
  if (!user) return false;
  const role = String(user.role || "").trim().toLowerCase();
  return Boolean(user.isSuperAdmin) || role === "admin" || role === "manager" || role === "owner" || role === "team_leader";
}

export default function OpsAgentsPage() {
  const { user } = useAuth();
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("all");
  const viewer = canViewOps(user);

  const listUrl = useMemo(() => {
    const params = new URLSearchParams({ limit: "200" });
    if (q.trim()) params.set("q", q.trim());
    if (status !== "all") params.set("status", status);
    return `/api/ops/agents?${params.toString()}`;
  }, [q, status]);

  const agentsQuery = useQuery<OpsAgentListResponse>({
    queryKey: [listUrl],
    queryFn: () => fetchJson<OpsAgentListResponse>(listUrl),
    enabled: viewer,
    refetchInterval: 30000,
  });

  const teamsQuery = useQuery<TeamOption[]>({
    queryKey: ["/api/teams"],
    queryFn: () => fetchJson<TeamOption[]>("/api/teams"),
    enabled: Boolean(user?.isSuperAdmin),
  });

  return (
    <Layout>
      <div className="space-y-1">
        <h1 className="text-3xl font-bold tracking-tight">Agent Control Plane</h1>
        <p className="text-muted-foreground">
          Fleet observability for Hermes and Ollama without SSH access.
        </p>
      </div>

      <Card className="border-amber-500/20 bg-amber-500/10">
        <CardContent className="flex gap-3 p-4 text-sm text-amber-700">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <p>
            Keep one VPS stable for 24 hours first. Run only a small local model, keep swap enabled, and let this control plane confirm heartbeat freshness before onboarding more agents.
          </p>
        </CardContent>
      </Card>

      {!viewer ? (
        <Card>
          <CardContent className="p-6 text-sm text-muted-foreground">
            You do not have access to the Agent Control Plane.
          </CardContent>
        </Card>
      ) : agentsQuery.isLoading ? (
        <div className="flex h-64 items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : agentsQuery.error ? (
        <Card>
          <CardContent className="p-6 text-sm text-destructive">
            {String((agentsQuery.error as Error)?.message || "Failed to load agent fleet")}
          </CardContent>
        </Card>
      ) : (
        <AgentFleetOverview
          items={agentsQuery.data?.items || []}
          total={agentsQuery.data?.total || 0}
          q={q}
          status={status}
          onQChange={setQ}
          onStatusChange={setStatus}
          onRefresh={() => void agentsQuery.refetch()}
          isRefreshing={agentsQuery.isFetching}
          canRegister={Boolean(user?.isSuperAdmin)}
          teams={teamsQuery.data || []}
          onCreated={async () => {
            await agentsQuery.refetch();
          }}
        />
      )}
    </Layout>
  );
}
