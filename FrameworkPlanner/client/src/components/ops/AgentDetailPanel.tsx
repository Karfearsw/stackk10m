import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Cpu, HardDrive, MemoryStick, Server, Shield } from "lucide-react";
import type { OpsAgent } from "./types";

function formatDate(value: string | null | undefined) {
  if (!value) return "Never";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Unknown";
  return date.toLocaleString();
}

function formatDuration(seconds: number | null | undefined) {
  if (typeof seconds !== "number" || !Number.isFinite(seconds)) return "--";
  const total = Math.max(0, Math.floor(seconds));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  return `${hours}h ${minutes}m`;
}

function percentOf(used: number | null | undefined, total: number | null | undefined) {
  if (typeof used !== "number" || typeof total !== "number" || !Number.isFinite(used) || !Number.isFinite(total) || total <= 0) return null;
  return Math.max(0, Math.min(100, Math.round((used / total) * 100)));
}

function statusClass(status: string) {
  if (status === "online") return "bg-emerald-500/15 text-emerald-600 border-emerald-500/20";
  if (status === "unhealthy") return "bg-amber-500/15 text-amber-600 border-amber-500/20";
  return "bg-rose-500/15 text-rose-600 border-rose-500/20";
}

export function AgentDetailPanel({
  agent,
  canRotateSecret,
  onRotateSecret,
  rotatingSecret,
  latestSecret,
}: {
  agent: OpsAgent;
  canRotateSecret: boolean;
  onRotateSecret: () => void;
  rotatingSecret: boolean;
  latestSecret: string | null;
}) {
  const metrics = agent.latestMetricsJson || {};
  const ramPercent = percentOf(metrics.ramUsedMb, metrics.ramTotalMb);
  const diskPercent = percentOf(metrics.diskUsedMb, metrics.diskTotalMb);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="gap-4 md:flex-row md:items-start md:justify-between">
          <div className="space-y-2">
            <div className="flex items-center gap-3">
              <CardTitle>{agent.displayName}</CardTitle>
              <Badge variant="outline" className={statusClass(agent.lastStatus)}>
                {agent.lastStatus}
              </Badge>
            </div>
            <p className="text-sm text-muted-foreground">
              {agent.slug} • {agent.teamName || "Unassigned team"}
            </p>
          </div>
          {canRotateSecret ? (
            <Button variant="outline" onClick={onRotateSecret} disabled={rotatingSecret}>
              {rotatingSecret ? "Rotating..." : "Rotate Secret"}
            </Button>
          ) : null}
        </CardHeader>
        <CardContent className="space-y-4">
          {latestSecret ? (
            <div className="rounded-lg border border-amber-500/20 bg-amber-500/10 p-4 text-sm">
              New heartbeat secret: <span className="font-mono break-all">{latestSecret}</span>
            </div>
          ) : null}

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <div className="rounded-lg border border-border/60 p-4">
              <div className="mb-2 flex items-center gap-2 text-xs text-muted-foreground">
                <Server className="h-4 w-4" />
                Model
              </div>
              <div className="text-lg font-semibold">{agent.model || metrics.model || "--"}</div>
            </div>
            <div className="rounded-lg border border-border/60 p-4">
              <div className="mb-2 flex items-center gap-2 text-xs text-muted-foreground">
                <Shield className="h-4 w-4" />
                Last heartbeat
              </div>
              <div className="text-lg font-semibold">{formatDate(agent.lastHeartbeatAt)}</div>
            </div>
            <div className="rounded-lg border border-border/60 p-4">
              <div className="mb-2 flex items-center gap-2 text-xs text-muted-foreground">
                <Server className="h-4 w-4" />
                Uptime
              </div>
              <div className="text-lg font-semibold">{formatDuration(metrics.uptimeSeconds)}</div>
            </div>
            <div className="rounded-lg border border-border/60 p-4">
              <div className="mb-2 flex items-center gap-2 text-xs text-muted-foreground">
                <Server className="h-4 w-4" />
                Latest task
              </div>
              <div className="text-lg font-semibold">{agent.lastTask || "--"}</div>
            </div>
          </div>

          <div className="grid gap-4 xl:grid-cols-3">
            <Card className="border-border/60">
              <CardHeader>
                <CardTitle className="text-base">CPU</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Cpu className="h-4 w-4" />
                  <span>{metrics.cpuPercent ?? "--"}%</span>
                </div>
              </CardContent>
            </Card>
            <Card className="border-border/60">
              <CardHeader>
                <CardTitle className="text-base">RAM</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <div className="flex items-center gap-2 text-muted-foreground">
                  <MemoryStick className="h-4 w-4" />
                  <span>{metrics.ramUsedMb ?? "--"} / {metrics.ramTotalMb ?? "--"} MB</span>
                </div>
                <Progress value={ramPercent || 0} className="h-2" />
              </CardContent>
            </Card>
            <Card className="border-border/60">
              <CardHeader>
                <CardTitle className="text-base">Disk</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <div className="flex items-center gap-2 text-muted-foreground">
                  <HardDrive className="h-4 w-4" />
                  <span>{metrics.diskUsedMb ?? "--"} / {metrics.diskTotalMb ?? "--"} MB</span>
                </div>
                <Progress value={diskPercent || 0} className="h-2" />
              </CardContent>
            </Card>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="rounded-lg border border-border/60 p-4">
              <div className="mb-2 text-xs text-muted-foreground">Hermes</div>
              <div className="text-lg font-semibold">{metrics.hermesStatus || "--"}</div>
            </div>
            <div className="rounded-lg border border-border/60 p-4">
              <div className="mb-2 text-xs text-muted-foreground">Ollama</div>
              <div className="text-lg font-semibold">{metrics.ollamaStatus || "--"}</div>
            </div>
          </div>

          {agent.lastError ? (
            <div className="rounded-lg border border-amber-500/20 bg-amber-500/10 p-4 text-sm text-amber-700">
              {agent.lastError}
            </div>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
