import { useQuery } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Phone, PhoneIncoming, PhoneOutgoing, FileText } from "lucide-react";
import { formatDisposition } from "@/lib/dispositions";

type BuyerCallSession = {
  id: number;
  direction?: string | null;
  session_provider?: string | null;
  sessionProvider?: string | null;
  occurred_at?: string | null;
  occurredAt?: string | null;
  created_at?: string | null;
  createdAt?: string | null;
  duration_seconds?: number | null;
  durationSeconds?: number | null;
  final_disposition?: string | null;
  finalDisposition?: string | null;
  note?: string | null;
  agent_first_name?: string | null;
  agent_last_name?: string | null;
  agent_email?: string | null;
};

function pick<T>(...vals: (T | null | undefined)[]): T | null {
  for (const v of vals) if (v !== null && v !== undefined) return v;
  return null;
}

function formatDuration(totalSeconds: number | null): string {
  if (totalSeconds === null || totalSeconds === undefined) return "—";
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  if (m === 0) return `${s}s`;
  return `${m}m ${s}s`;
}

/**
 * BuyerCallHistory — shows every logged call for a buyer with its note,
 * mirroring how lead notes/activity are visible. The note lives on the
 * call session (single source of truth, migration 0096).
 */
export function BuyerCallHistory({ buyerId }: { buyerId: number }) {
  const { data: calls = [], isLoading, error } = useQuery<BuyerCallSession[]>({
    queryKey: [`/api/buyers/${buyerId}/call-logs`],
    queryFn: async () => {
      const res = await fetch(`/api/buyers/${buyerId}/call-logs`, { credentials: "include" });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
    enabled: Boolean(buyerId),
  });

  if (isLoading) {
    return <div className="text-sm text-muted-foreground py-6 text-center">Loading call history…</div>;
  }

  if (error) {
    return <div className="text-sm text-destructive py-6 text-center">Failed to load call history</div>;
  }

  if (!calls.length) {
    return (
      <div className="flex flex-col items-center justify-center py-10 text-muted-foreground">
        <Phone className="h-10 w-10 mb-3 opacity-40" />
        <p className="font-medium text-sm">No calls logged yet</p>
        <p className="text-xs mt-1">Use Quick Log Call to record a call with this buyer</p>
      </div>
    );
  }

  return (
    <ScrollArea className="h-[420px] pr-2">
      <div className="space-y-3">
        {calls.map((call) => {
          const direction = pick(call.direction) || "outbound";
          const when = pick(call.occurred_at, call.occurredAt, call.created_at, call.createdAt);
          const duration = pick(call.duration_seconds, call.durationSeconds);
          const disposition = pick(call.final_disposition, call.finalDisposition);
          const note = pick(call.note);
          const agentName =
            [call.agent_first_name, call.agent_last_name].filter(Boolean).join(" ") ||
            call.agent_email ||
            "Unknown agent";
          const provider = pick(call.session_provider, call.sessionProvider);
          const DirectionIcon = direction === "inbound" ? PhoneIncoming : PhoneOutgoing;

          return (
            <Card key={call.id} className="p-3 sm:p-4">
              <div className="flex items-start justify-between gap-2 flex-wrap">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10">
                    <DirectionIcon className="h-4 w-4 text-primary" aria-hidden />
                  </span>
                  <div className="min-w-0">
                    <div className="text-sm font-medium capitalize">
                      {direction} call
                      {provider ? <span className="text-muted-foreground font-normal"> · {provider.replace(/_/g, " ")}</span> : null}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {when ? new Date(when).toLocaleString() : "—"} · {agentName}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {disposition ? (
                    <Badge variant="secondary">{formatDisposition(disposition)}</Badge>
                  ) : null}
                  <Badge variant="outline">{formatDuration(duration ?? null)}</Badge>
                </div>
              </div>
              {note ? (
                <div className="mt-3 rounded-md bg-muted/60 p-3">
                  <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground mb-1.5">
                    <FileText className="h-3.5 w-3.5" aria-hidden />
                    Call note
                  </div>
                  <p className="text-sm whitespace-pre-wrap break-words">{note}</p>
                </div>
              ) : (
                <p className="mt-2 text-xs text-muted-foreground italic">No note recorded</p>
              )}
            </Card>
          );
        })}
      </div>
    </ScrollArea>
  );
}
