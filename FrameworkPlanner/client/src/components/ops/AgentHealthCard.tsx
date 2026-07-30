import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Cpu, HardDrive, MemoryStick, Server } from "lucide-react";
import { Link } from "wouter";
import type { OpsAgent } from "./types";

function formatPercent(value: number | null | undefined) {
  return typeof value === "number" && Number.isFinite(value) ? `${Math.round(value)}%` : "--";
}

function percentOf(used: number | null | undefined, total: number | null | undefined) {
  if (typeof used !== "number" || typeof total !== "number" || !Number.isFinite(used) || !Number.isFinite(total) || total <= 0) return null;
  return Math.max(0, Math.min(100, Math.round((used / total) * 100)));
}

function formatHeartbeatAge(lastHeartbeatAt: string | null | undefined) {
  if (!lastHeartbeatAt) return "Never";
  const diffMs = Date.now() - new Date(lastHeartbeatAt).getTime();
  if (!Number.isFinite(diffMs)) return "Unknown";
  const seconds = Math.max(0, Math.floor(diffMs / 1000));
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ago`;
}

function statusClass(status: string) {
  if (status === "online") return "bg-emerald-500/15 text-emerald-600 border-emerald-500/20";
  if (status === "unhealthy") return "bg-amber-500/15 text-amber-600 border-amber-500/20";
  return "bg-rose-500/15 text-rose-600 border-rose-500/20";
}

export function AgentHealthCard({ agent }: { agent: OpsAgent }) {
  const metrics = agent.latestMetricsJson || {};
  const ramPercent = percentOf(metrics.ramUsedMb, metrics.ramTotalMb);
  const diskPercent = percentOf(metrics.diskUsedMb, metrics.diskTotalMb);

  return (
    <Link href={`/ops/agents/${agent.slug}`}>
      <Card className="h-full cursor-pointer border-border/60 transition-all hover:border-primary/40 hover:shadow-lg hover:shadow-primary/5">
        <CardHeader className="space-y-3">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <CardTitle className="truncate text-base">{agent.displayName}</CardTitle>
              <p className="truncate text-xs text-muted-foreground">{agent.slug}</p>
            </div>
            <Badge variant="outline" className={statusClass(agent.lastStatus)}>
              {agent.lastStatus}
            </Badge>
          </div>
          <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
            <span>{agent.teamName || "Unassigned team"}</span>
            <span>{agent.model || metrics.model || "Model unknown"}</span>
            <span>{formatHeartbeatAge(agent.lastHeartbeatAt)}</span>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-lg border border-border/60 bg-background/70 p-3">
              <div className="mb-2 flex items-center gap-2 text-xs text-muted-foreground">
                <Cpu className="h-4 w-4" />
                CPU
              </div>
              <div className="text-lg font-semibold">{formatPercent(metrics.cpuPercent)}</div>
            </div>
            <div className="rounded-lg border border-border/60 bg-background/70 p-3">
              <div className="mb-2 flex items-center gap-2 text-xs text-muted-foreground">
                <MemoryStick className="h-4 w-4" />
                RAM
              </div>
              <div className="text-lg font-semibold">{ramPercent === null ? "--" : `${ramPercent}%`}</div>
              <Progress className="mt-2 h-2" value={ramPercent || 0} />
            </div>
            <div className="rounded-lg border border-border/60 bg-background/70 p-3">
              <div className="mb-2 flex items-center gap-2 text-xs text-muted-foreground">
                <HardDrive className="h-4 w-4" />
                Disk
              </div>
              <div className="text-lg font-semibold">{diskPercent === null ? "--" : `${diskPercent}%`}</div>
              <Progress className="mt-2 h-2" value={diskPercent || 0} />
            </div>
          </div>

          <div className="grid gap-2 text-sm text-muted-foreground">
            <div className="flex items-center justify-between gap-3">
              <span className="inline-flex items-center gap-2">
                <Server className="h-4 w-4" />
                Hermes
              </span>
              <span className="font-medium text-foreground">{metrics.hermesStatus || "--"}</span>
            </div>
            <div className="flex items-center justify-between gap-3">
              <span className="inline-flex items-center gap-2">
                <Server className="h-4 w-4" />
                Ollama
              </span>
              <span className="font-medium text-foreground">{metrics.ollamaStatus || "--"}</span>
            </div>
          </div>

          {agent.lastError ? (
            <div className="rounded-lg border border-amber-500/20 bg-amber-500/10 p-3 text-sm text-amber-700">
              {agent.lastError}
            </div>
          ) : null}
        </CardContent>
      </Card>
    </Link>
  );
}
