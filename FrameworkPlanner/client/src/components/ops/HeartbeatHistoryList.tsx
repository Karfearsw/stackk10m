import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { OpsAgentHeartbeat } from "./types";

function formatDate(value: string | null | undefined) {
  if (!value) return "--";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "--";
  return date.toLocaleString();
}

function statusClass(status: string) {
  if (status === "online") return "bg-emerald-500/15 text-emerald-600 border-emerald-500/20";
  if (status === "unhealthy") return "bg-amber-500/15 text-amber-600 border-amber-500/20";
  return "bg-rose-500/15 text-rose-600 border-rose-500/20";
}

export function HeartbeatHistoryList({ heartbeats }: { heartbeats: OpsAgentHeartbeat[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Recent Heartbeats</CardTitle>
      </CardHeader>
      <CardContent>
        {heartbeats.length ? (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Received</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>CPU</TableHead>
                <TableHead>RAM</TableHead>
                <TableHead>Disk</TableHead>
                <TableHead>Task</TableHead>
                <TableHead>Error</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {heartbeats.map((heartbeat) => (
                <TableRow key={heartbeat.id}>
                  <TableCell>{formatDate(heartbeat.receivedAt)}</TableCell>
                  <TableCell>
                    <Badge variant="outline" className={statusClass(heartbeat.status)}>
                      {heartbeat.status}
                    </Badge>
                  </TableCell>
                  <TableCell>{heartbeat.cpuPercent ?? "--"}%</TableCell>
                  <TableCell>
                    {heartbeat.ramUsedMb ?? "--"} / {heartbeat.ramTotalMb ?? "--"} MB
                  </TableCell>
                  <TableCell>
                    {heartbeat.diskUsedMb ?? "--"} / {heartbeat.diskTotalMb ?? "--"} MB
                  </TableCell>
                  <TableCell>{heartbeat.latestTask || "--"}</TableCell>
                  <TableCell className="max-w-[24rem] truncate">{heartbeat.lastError || "--"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        ) : (
          <div className="rounded-lg border border-dashed border-border/60 p-6 text-sm text-muted-foreground">
            No heartbeats recorded yet.
          </div>
        )}
      </CardContent>
    </Card>
  );
}
