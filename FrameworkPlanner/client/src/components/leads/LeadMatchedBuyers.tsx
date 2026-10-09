import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Users, RefreshCw, Phone } from "lucide-react";

type MatchedBuyer = {
  buyerId: number;
  buyerName: string;
  score: number;
  reasons: string[];
};

function scoreColor(score: number): string {
  if (score >= 70) return "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300";
  if (score >= 50) return "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300";
  return "bg-muted text-muted-foreground";
}

/**
 * LeadMatchedBuyers — shows buyers whose buy-box matches this seller lead,
 * with a recompute button. Mirrors the opportunity MatchedBuyersPanel.
 */
export function LeadMatchedBuyers({ leadId }: { leadId: number }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [expanded, setExpanded] = useState<number | null>(null);

  const { data, isLoading, error } = useQuery<{ items: MatchedBuyer[] }>({
    queryKey: [`/api/leads/${leadId}/buyer-matches`],
    queryFn: async () => {
      const res = await fetch(`/api/leads/${leadId}/buyer-matches`, { credentials: "include" });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
    enabled: Boolean(leadId),
  });

  const recompute = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/leads/${leadId}/buyer-matches/recompute`, {});
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.message || "Recompute failed");
      return json;
    },
    onSuccess: (json: any) => {
      queryClient.invalidateQueries({ queryKey: [`/api/leads/${leadId}/buyer-matches`] });
      toast({ title: "Matching complete", description: `${json.count ?? 0} buyers match this lead.` });
    },
    onError: (e: any) => toast({ title: "Match failed", description: e?.message, variant: "destructive" }),
  });

  const matches = data?.items || [];

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold flex items-center gap-1.5">
          <Users className="h-4 w-4" aria-hidden />
          Matched Buyers
          {matches.length > 0 && (
            <Badge variant="secondary" className="ml-1">{matches.length}</Badge>
          )}
        </h3>
        <Button
          variant="outline"
          size="sm"
          onClick={() => recompute.mutate()}
          disabled={recompute.isPending}
        >
          <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${recompute.isPending ? "animate-spin" : ""}`} aria-hidden />
          {recompute.isPending ? "Matching…" : "Find Buyers"}
        </Button>
      </div>

      {isLoading ? (
        <p className="text-xs text-muted-foreground py-3 text-center">Loading matches…</p>
      ) : error ? (
        <p className="text-xs text-destructive py-3 text-center">Could not load matches</p>
      ) : matches.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="py-5 text-center">
            <Users className="h-7 w-7 mx-auto mb-2 opacity-40" aria-hidden />
            <p className="text-xs font-medium">No buyer matches yet</p>
            <p className="text-[11px] text-muted-foreground mt-1">Tap "Find Buyers" to score your buyer list against this lead.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {matches.slice(0, 8).map((m) => (
            <Card key={m.buyerId}>
              <CardContent className="p-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium truncate">{m.buyerName}</p>
                    <button
                      type="button"
                      onClick={() => setExpanded(expanded === m.buyerId ? null : m.buyerId)}
                      className="text-[11px] text-primary hover:underline mt-0.5"
                    >
                      {expanded === m.buyerId ? "Hide why" : "Why this match"}
                    </button>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className={`text-xs font-bold px-2 py-1 rounded-full ${scoreColor(m.score)}`}>
                      {m.score}
                    </span>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      aria-label={`Call ${m.buyerName}`}
                      onClick={() => window.open(`/buyers?highlight=${m.buyerId}`, "_blank")}
                    >
                      <Phone className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
                {expanded === m.buyerId && m.reasons.length > 0 && (
                  <ul className="mt-2 space-y-1 border-t pt-2">
                    {m.reasons.map((r, i) => (
                      <li key={i} className="text-[11px] text-muted-foreground flex gap-1.5">
                        <span aria-hidden>·</span> {r}
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
          ))}
          {matches.length > 8 && (
            <p className="text-[11px] text-muted-foreground text-center">+{matches.length - 8} more matches</p>
          )}
        </div>
      )}
    </div>
  );
}
