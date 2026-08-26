import { useCallback, useState } from "react";
import { Phone, PhoneIncoming } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useTelephonyEvents, type InboundCallEvent } from "@/hooks/useTelephonyEvents";
import { apiRequest } from "@/lib/queryClient";

type Ringing = InboundCallEvent & { ts: number };

function maskTail(n: string | null | undefined): string {
  const s = String(n || "").trim();
  if (s.length <= 4) return s || "Unknown number";
  return `•••${s.slice(-4)}`;
}

export function InboundCallToast() {
  const [calls, setCalls] = useState<Record<string, Ringing>>({});
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState("");

  useTelephonyEvents({
    onInboundCall: useCallback((evt: InboundCallEvent) => {
      setCalls((prev) => {
        const id = evt.callControlId;
        if (!id) return prev;
        if (evt.ended || evt.claimedBy != null || evt.declinedBy != null) {
          const next = { ...prev };
          delete next[id];
          return next;
        }
        const existing = prev[id];
        // Refresh name/lead info without re-triggering (keep the newest ts).
        return { ...prev, [id]: { ...evt, ts: evt.ts ?? existing?.ts ?? Date.now() } as Ringing };
      });
    }, []),
  });

  const act = async (id: string, action: "accept" | "decline") => {
    setBusyId(id);
    setError("");
    try {
      await apiRequest("POST", `/api/telephony/inbound/${encodeURIComponent(id)}/${action}`);
      setCalls((prev) => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
    } catch (e: any) {
      setError(String(e?.message || e || "Request failed"));
    } finally {
      setBusyId(null);
    }
  };

  const entries = Object.values(calls).sort((a, b) => a.ts - b.ts);
  if (!entries.length) return null;

  return (
    <div className="fixed bottom-4 right-4 z-50 w-80 space-y-2">
      {error ? (
        <div className="rounded-md border border-destructive/40 bg-background p-2 text-xs text-destructive">{error}</div>
      ) : null}
      {entries.map((c) => (
        <Card key={c.callControlId} className="p-3 shadow-lg">
          <div className="flex items-start gap-2">
            <PhoneIncoming className="mt-0.5 h-4 w-4 text-primary" />
            <div className="min-w-0 flex-1">
              <div className="text-sm font-medium">Incoming call</div>
              <div className="truncate text-xs text-muted-foreground">{c.maskedFrom || c.from || "Unknown number"}</div>
              {c.leadName ? (
                <div className="truncate text-xs text-primary">
                  {c.leadName}
                  {c.leadPhone ? ` • ${maskTail(c.leadPhone)}` : ""}
                </div>
              ) : null}
            </div>
          </div>
          <div className="mt-2 flex gap-2">
            <Button size="sm" className="flex-1" disabled={busyId === c.callControlId} onClick={() => act(c.callControlId, "accept")}>
              <Phone className="mr-1 h-3 w-3" />
              Accept
            </Button>
            <Button size="sm" variant="outline" className="flex-1" disabled={busyId === c.callControlId} onClick={() => act(c.callControlId, "decline")}>
              Decline
            </Button>
          </div>
        </Card>
      ))}
    </div>
  );
}
