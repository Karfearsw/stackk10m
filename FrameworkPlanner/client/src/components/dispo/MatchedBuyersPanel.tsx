import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { RefreshCw, Phone, Mail, Ban } from "lucide-react";

interface MatchedBuyer {
  buyerId: number;
  name: string;
  company: string | null;
  phone: string | null;
  email: string | null;
  score: number;
  reasons: string[];
  computedAt: string | null;
  smsConsent: boolean | null;
  emailConsent: boolean | null;
  doNotCall: boolean;
}

export function MatchedBuyersPanel({ dealId }: { dealId: number }) {
  const queryClient = useQueryClient();
  const [recomputeMsg, setRecomputeMsg] = useState<string | null>(null);

  const { data, isLoading, isError } = useQuery<{ matches: MatchedBuyer[] }>({
    queryKey: ["disposition-matches", dealId],
    queryFn: async () => {
      const res = await fetch(`/api/disposition/deals/${dealId}/matches`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error(`matches failed: ${res.status}`);
      return res.json();
    },
  });

  // PR #27 contract: POST /api/opportunities/:id/buyer-matches/recompute
  // → { ok: true, count: number }; reasons are human-readable strings.
  const recompute = useMutation({
    mutationFn: () =>
      apiRequest(
        "POST",
        `/api/opportunities/${dealId}/buyer-matches/recompute`,
      ),
    onSuccess: async (res: Response) => {
      const body = (await res.json().catch(() => null)) as {
        ok?: boolean;
        count?: number;
      } | null;
      await queryClient.invalidateQueries({
        queryKey: ["disposition-matches", dealId],
      });
      await queryClient.invalidateQueries({ queryKey: ["disposition-deals"] });
      setRecomputeMsg(
        typeof body?.count === "number"
          ? `Matches recomputed — ${body.count} scored.`
          : "Matches recomputed.",
      );
    },
    onError: (e: any) => setRecomputeMsg(e?.message ?? "Recompute failed."),
  });

  if (isLoading) {
    return (
      <div className="space-y-3">
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-16 w-full" />
        ))}
      </div>
    );
  }

  if (isError) {
    return (
      <div className="text-sm text-muted-foreground">
        Could not load matched buyers.
      </div>
    );
  }

  const matches = data?.matches ?? [];

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="text-sm font-medium">
          Top matched buyers{" "}
          <span className="text-muted-foreground">({matches.length})</span>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            setRecomputeMsg(null);
            recompute.mutate();
          }}
          disabled={recompute.isPending}
        >
          <RefreshCw
            className={`mr-2 h-3.5 w-3.5 ${recompute.isPending ? "animate-spin" : ""}`}
          />
          Recompute
        </Button>
      </div>
      {recomputeMsg && (
        <div className="text-xs text-muted-foreground">{recomputeMsg}</div>
      )}
      {matches.length === 0 && (
        <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
          No buyer matches yet. Hit <strong>Recompute</strong> to score the
          buyer list against this deal.
        </div>
      )}
      {matches.map((m) => (
        <div
          key={m.buyerId}
          className="rounded-lg border border-border/60 p-3"
        >
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="truncate font-medium">{m.name}</span>
                {m.doNotCall && (
                  <Badge variant="destructive" className="shrink-0">
                    <Ban className="mr-1 h-3 w-3" /> DNC
                  </Badge>
                )}
              </div>
              {m.company && (
                <div className="truncate text-xs text-muted-foreground">
                  {m.company}
                </div>
              )}
            </div>
            <Badge
              variant="secondary"
              className="shrink-0 bg-[#D4AF37]/15 text-[#D4AF37]"
            >
              {m.score}
            </Badge>
          </div>
          <Progress value={m.score} className="mt-2 h-1.5" />
          {m.reasons.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1">
              {m.reasons.map((r, i) => (
                <Badge key={i} variant="outline" className="text-[11px]">
                  {r}
                </Badge>
              ))}
            </div>
          )}
          <div className="mt-2 flex items-center gap-3 text-[11px] text-muted-foreground">
            {m.phone && (
              <span className="inline-flex items-center gap-1">
                <Phone className="h-3 w-3" />
                {m.smsConsent ? "SMS ok" : "no SMS consent"}
              </span>
            )}
            {m.email && (
              <span className="inline-flex items-center gap-1">
                <Mail className="h-3 w-3" />
                {m.emailConsent ? "email ok" : "no email consent"}
              </span>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
