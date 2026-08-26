import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { RefreshCw, ShieldAlert } from "lucide-react";

const CALL_STATUSES = ["ringing", "answered", "ended", "missed", "failed", "transferring"];
const DISPOSITIONS = ["connected", "qualified", "qualified_handoff", "callback_requested", "voicemail", "no_answer", "busy", "wrong_number_confirmed", "wrong_number_review", "not_interested", "do_not_call", "invalid_number", "failed", "abandoned", "agent_unavailable", "bridge_failed"];

function fmtDate(v: string | Date | null | undefined): string {
  if (!v) return "—";
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString();
}
function fmtDur(ms: number | null | undefined, sec: number | null | undefined): string {
  const s = typeof sec === "number" ? sec : ms != null ? Math.round(ms / 1000) : 0;
  if (!s) return "—";
  return `${Math.floor(s / 60)}m ${s % 60}s`;
}
function agentName(r: any): string {
  const a = [r.user_first_name, r.user_last_name].filter(Boolean).join(" ") || r.user_email;
  const b = [r.agent_first_name, r.agent_last_name].filter(Boolean).join(" ") || r.agent_email;
  return a || b || "—";
}

export function CallAuditContent() {
  const [userId, setUserId] = useState("");
  const [status, setStatus] = useState("");
  const [disposition, setDisposition] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [applied, setApplied] = useState(0);

  const params = useMemo(() => {
    const p = new URLSearchParams({ limit: "200" });
    if (userId) p.set("userId", userId);
    if (status) p.set("status", status);
    if (disposition) p.set("disposition", disposition);
    if (from) p.set("from", from);
    if (to) p.set("to", to);
    return p.toString();
  }, [userId, status, disposition, from, to, applied]);

  const { data: calls, isLoading: callsLoading, isError: callsError, refetch: refetchCalls } = useQuery<any[]>({
    queryKey: ["/api/telephony/admin/calls", params],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/telephony/admin/calls?${params}`);
      return res.json();
    },
    enabled: applied > 0,
  });
  const { data: sessions, isLoading: sessionsLoading, isError: sessionsError, refetch: refetchSessions } = useQuery<any[]>({
    queryKey: ["/api/v1/telecom/call-sessions", params],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/v1/telecom/call-sessions?${params}`);
      return res.json();
    },
    enabled: applied > 0,
  });

  const { data: users } = useQuery<any[]>({
    queryKey: ["/api/users"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/users?limit=500");
      return res.json();
    },
  });

  const apply = () => setApplied((n) => n + 1);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Filters</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap items-end gap-3">
          <div className="space-y-1">
            <Label className="text-xs">Agent</Label>
            <Select value={userId} onValueChange={setUserId}>
              <SelectTrigger className="w-48 h-9"><SelectValue placeholder="All agents" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All agents</SelectItem>
                {(users || []).map((u: any) => (
                  <SelectItem key={u.id} value={String(u.id)}>
                    {[u.firstName, u.lastName].filter(Boolean).join(" ") || u.email}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Status</Label>
            <Select value={status} onValueChange={(v) => setStatus(v === "all" ? "" : v)}>
              <SelectTrigger className="w-40 h-9"><SelectValue placeholder="Any status" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Any status</SelectItem>
                {CALL_STATUSES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Disposition</Label>
            <Select value={disposition} onValueChange={(v) => setDisposition(v === "all" ? "" : v)}>
              <SelectTrigger className="w-48 h-9"><SelectValue placeholder="Any disposition" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Any disposition</SelectItem>
                {DISPOSITIONS.map((d) => <SelectItem key={d} value={d}>{d}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">From</Label>
            <Input type="date" className="h-9 w-40" value={from} onChange={(e) => setFrom(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">To</Label>
            <Input type="date" className="h-9 w-40" value={to} onChange={(e) => setTo(e.target.value)} />
          </div>
          <Button size="sm" onClick={apply}>Apply</Button>
          <Button size="sm" variant="outline" onClick={() => { refetchCalls(); refetchSessions(); }}>
            <RefreshCw className="mr-1 h-3 w-3" /> Refresh
          </Button>
        </CardContent>
      </Card>

      {applied === 0 ? (
        <div className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
          Select filters and press <span className="font-medium">Apply</span> to review team calls and sessions.
        </div>
      ) : null}

      {(callsError || sessionsError) ? (
        <div className="flex items-center gap-2 rounded-md border border-destructive/40 p-3 text-sm text-destructive">
          <ShieldAlert className="h-4 w-4" />
          Call audit is available to admins only (or the data could not be loaded).
        </div>
      ) : null}

      {applied > 0 ? (
        <>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Team Calls ({callsLoading ? "…" : calls?.length ?? 0})</CardTitle>
            </CardHeader>
            <CardContent className="p-0 overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>When</TableHead>
                    <TableHead>Agent</TableHead>
                    <TableHead>Dir</TableHead>
                    <TableHead>Number</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Disposition</TableHead>
                    <TableHead>Duration</TableHead>
                    <TableHead>Note</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(calls || []).length === 0 ? (
                    <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground">No calls match the filters</TableCell></TableRow>
                  ) : (
                    (calls || []).map((c: any) => (
                      <TableRow key={c.id}>
                        <TableCell className="whitespace-nowrap text-xs">{fmtDate(c.started_at)}</TableCell>
                        <TableCell className="text-xs">{agentName(c)}</TableCell>
                        <TableCell className="text-xs">{c.direction}</TableCell>
                        <TableCell className="text-xs font-mono">{c.number}</TableCell>
                        <TableCell className="text-xs">{c.status}</TableCell>
                        <TableCell className="text-xs">{c.disposition || "—"}</TableCell>
                        <TableCell className="whitespace-nowrap text-xs">{fmtDur(c.duration_ms, null)}</TableCell>
                        <TableCell className="max-w-[180px] truncate text-xs" title={c.note || ""}>{c.note || "—"}</TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Call Sessions ({sessionsLoading ? "…" : sessions?.length ?? 0})</CardTitle>
            </CardHeader>
            <CardContent className="p-0 overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Created</TableHead>
                    <TableHead>Agent</TableHead>
                    <TableHead>Mode</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Disposition</TableHead>
                    <TableHead>Duration</TableHead>
                    <TableHead>AI</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(sessions || []).length === 0 ? (
                    <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground">No sessions match the filters</TableCell></TableRow>
                  ) : (
                    (sessions || []).map((s: any) => (
                      <TableRow key={s.id}>
                        <TableCell className="whitespace-nowrap text-xs">{fmtDate(s.created_at)}</TableCell>
                        <TableCell className="text-xs">{agentName(s)}</TableCell>
                        <TableCell className="text-xs">{s.mode}</TableCell>
                        <TableCell className="text-xs">{s.status}</TableCell>
                        <TableCell className="text-xs">{s.final_disposition || "—"}</TableCell>
                        <TableCell className="whitespace-nowrap text-xs">{fmtDur(null, s.duration_seconds)}</TableCell>
                        <TableCell className="text-xs">
                          {s.ai_qualification_score != null ? `${s.ai_qualification_score} score` : s.ai_leg_call_control_id ? "AI used" : "—"}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </>
      ) : null}
    </div>
  );
}
