import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Activity, AlertTriangle, ServerCrash, ShieldCheck } from "lucide-react";
import { AgentHealthCard } from "./AgentHealthCard";
import { AgentRegistryDialog } from "./AgentRegistryDialog";
import type { OpsAgent, TeamOption } from "./types";

function countByStatus(items: OpsAgent[]) {
  return items.reduce(
    (acc, item) => {
      acc.total += 1;
      if (item.lastStatus === "online") acc.online += 1;
      else if (item.lastStatus === "unhealthy") acc.unhealthy += 1;
      else acc.offline += 1;
      return acc;
    },
    { total: 0, online: 0, unhealthy: 0, offline: 0 },
  );
}

export function AgentFleetOverview({
  items,
  total,
  q,
  status,
  onQChange,
  onStatusChange,
  onRefresh,
  isRefreshing,
  canRegister,
  teams,
  onCreated,
}: {
  items: OpsAgent[];
  total: number;
  q: string;
  status: string;
  onQChange: (value: string) => void;
  onStatusChange: (value: string) => void;
  onRefresh: () => void;
  isRefreshing: boolean;
  canRegister: boolean;
  teams: TeamOption[];
  onCreated: () => Promise<void> | void;
}) {
  const counts = countByStatus(items);
  const statCards = [
    { label: "Fleet", value: counts.total, icon: Activity },
    { label: "Online", value: counts.online, icon: ShieldCheck },
    { label: "Unhealthy", value: counts.unhealthy, icon: AlertTriangle },
    { label: "Offline", value: counts.offline, icon: ServerCrash },
  ];

  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {statCards.map((card) => {
          const Icon = card.icon;
          return (
            <Card key={card.label}>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">{card.label}</CardTitle>
                <Icon className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-semibold">{card.value}</div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Card>
        <CardHeader className="gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <CardTitle>Fleet Overview</CardTitle>
            <p className="text-sm text-muted-foreground">{total} registered agents in scope.</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Input
              value={q}
              onChange={(e) => onQChange(e.target.value)}
              placeholder="Search agent, team, host, model"
              className="w-[18rem]"
            />
            <select
              className="flex h-10 rounded-md border border-input bg-background px-3 py-2 text-sm"
              value={status}
              onChange={(e) => onStatusChange(e.target.value)}
            >
              <option value="all">All statuses</option>
              <option value="online">Online</option>
              <option value="unhealthy">Unhealthy</option>
              <option value="offline">Offline</option>
            </select>
            <Button variant="outline" onClick={onRefresh} disabled={isRefreshing}>
              {isRefreshing ? "Refreshing..." : "Refresh"}
            </Button>
            {canRegister ? <AgentRegistryDialog teams={teams} onCreated={onCreated} /> : null}
          </div>
        </CardHeader>
        <CardContent>
          {items.length ? (
            <div className="grid gap-4 xl:grid-cols-2">
              {items.map((agent) => (
                <AgentHealthCard key={agent.id} agent={agent} />
              ))}
            </div>
          ) : (
            <div className="rounded-lg border border-dashed border-border/60 p-8 text-center text-sm text-muted-foreground">
              No agents matched the current filters.
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
