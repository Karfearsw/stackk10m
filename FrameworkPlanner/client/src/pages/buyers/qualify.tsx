import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  UserCheck, PhoneCall, MessageSquare, TrendingUp, AlertTriangle,
  CheckCircle2, XCircle, GitMerge, MapPin, Flame, Users,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

const STAGES = [
  { value: "new", label: "New", color: "bg-slate-500" },
  { value: "contacted", label: "Contacted", color: "bg-blue-500" },
  { value: "responded", label: "Responded", color: "bg-amber-500" },
  { value: "qualified", label: "Qualified", color: "bg-emerald-500" },
  { value: "deal_ready", label: "Deal Ready", color: "bg-primary" },
  { value: "inactive", label: "Inactive", color: "bg-zinc-400" },
] as const;

interface DashboardData {
  byStage: Record<string, number>;
  gaps: { unassigned: number; no_next_action: number; overdue_actions: number };
  markets: { market: string; covered: boolean; qualifiedCount: number }[];
  velocity: { last7: number; last30: number };
}

function Funnel({ byStage }: { byStage: Record<string, number> }) {
  const max = Math.max(1, ...STAGES.map((s) => byStage[s.value] ?? 0));
  return (
    <div className="space-y-2">
      {STAGES.map((s) => {
        const n = byStage[s.value] ?? 0;
        const pct = Math.round((n / max) * 100);
        return (
          <div key={s.value} className="flex items-center gap-3">
            <span className="w-24 text-sm font-medium">{s.label}</span>
            <div className="h-6 flex-1 rounded-md bg-muted">
              <div
                className={cn("flex h-6 items-center justify-end rounded-md pr-2 text-xs font-semibold text-white transition-all", s.color)}
                style={{ width: `${Math.max(pct, n > 0 ? 8 : 0)}%` }}
              >
                {n > 0 ? n : ""}
              </div>
            </div>
            <span className="w-10 text-right text-sm text-muted-foreground">{n}</span>
          </div>
        );
      })}
    </div>
  );
}

function DashboardTab() {
  const { data, isLoading } = useQuery<DashboardData>({
    queryKey: ["buyer-qual-dashboard"],
    queryFn: async () => {
      const res = await fetch("/api/buyers/qualification/dashboard", { credentials: "include" });
      if (!res.ok) throw new Error("dashboard failed");
      return res.json();
    },
  });

  if (isLoading) {
    return (
      <div className="grid gap-4 md:grid-cols-2">
        <Skeleton className="h-64" />
        <Skeleton className="h-64" />
      </div>
    );
  }
  if (!data) return <p className="text-sm text-muted-foreground">Could not load dashboard.</p>;

  const total = STAGES.reduce((a, s) => a + (data.byStage[s.value] ?? 0), 0);
  const worked = total - (data.byStage.new ?? 0) - (data.byStage.inactive ?? 0);
  const gaps = [
    { label: "Unassigned owners", value: data.gaps.unassigned, icon: Users },
    { label: "No next action", value: data.gaps.no_next_action, icon: AlertTriangle },
    { label: "Overdue actions", value: data.gaps.overdue_actions, icon: Flame },
  ];

  return (
    <div className="space-y-4">
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">Buyers in funnel</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">{total}</p>
            <p className="text-xs text-muted-foreground">{worked} worked · {data.byStage.new ?? 0} untouched</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">Outreach velocity</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">{data.velocity.last7}</p>
            <p className="text-xs text-muted-foreground">attempts last 7 days · {data.velocity.last30} last 30</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">Deal-ready buyers</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold text-primary">{data.byStage.deal_ready ?? 0}</p>
            <p className="text-xs text-muted-foreground">{data.byStage.qualified ?? 0} qualified behind them</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <TrendingUp className="h-4 w-4" /> Qualification funnel
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Funnel byStage={data.byStage} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <AlertTriangle className="h-4 w-4" /> Actionability gaps
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {gaps.map((g) => (
              <div key={g.label} className="flex items-center justify-between rounded-lg border p-3">
                <span className="flex items-center gap-2 text-sm">
                  <g.icon className="h-4 w-4 text-muted-foreground" /> {g.label}
                </span>
                <Badge variant={g.value > 0 ? "destructive" : "secondary"}>{g.value}</Badge>
              </div>
            ))}
            <p className="text-xs text-muted-foreground">
              Every active buyer needs one owner and one next action. Clear these gaps before any outreach push.
            </p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <MapPin className="h-4 w-4" /> Market coverage
          </CardTitle>
        </CardHeader>
        <CardContent>
          {data.markets.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No buy-box markets recorded yet. Qualify buyers and capture their markets to see coverage gaps here.
            </p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {data.markets.map((m) => (
                <Badge
                  key={m.market}
                  variant={m.covered ? "default" : "outline"}
                  className={cn(!m.covered && "border-destructive/50 text-destructive")}
                  title={m.covered ? `${m.qualifiedCount} qualified buyer(s)` : "No qualified buyers in this market"}
                >
                  {m.market} · {m.qualifiedCount}
                  {!m.covered && " — gap"}
                </Badge>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

interface ReviewItem {
  id: number;
  name: string;
  company: string | null;
  email: string | null;
  phone: string | null;
  created_at: string;
  duplicate_of: number | null;
  duplicate_of_name: string | null;
  outreach_count: number;
}

function ReviewQueueTab() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data, isLoading } = useQuery<ReviewItem[]>({
    queryKey: ["buyer-review-queue"],
    queryFn: async () => {
      const res = await fetch("/api/buyers/review-queue", { credentials: "include" });
      if (!res.ok) throw new Error("review queue failed");
      return res.json();
    },
  });

  const review = useMutation({
    mutationFn: ({ id, decision }: { id: number; decision: string }) =>
      apiRequest("POST", `/api/buyers/${id}/review`, { decision }),
    onSuccess: (_d, v) => {
      queryClient.invalidateQueries({ queryKey: ["buyer-review-queue"] });
      toast({ title: `Buyer ${v.decision}` });
    },
    onError: (e: any) => toast({ title: "Review failed", description: e.message, variant: "destructive" }),
  });

  if (isLoading) return <Skeleton className="h-48" />;
  const items = data ?? [];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <AlertTriangle className="h-4 w-4" /> Review queue
          <Badge variant="secondary">{items.length}</Badge>
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          Suspected test entries and duplicates must be reviewed BEFORE any outreach. Approve legitimate buyers,
          reject test data, or merge duplicates into the original record.
        </p>
      </CardHeader>
      <CardContent>
        {items.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            <CheckCircle2 className="mx-auto mb-2 h-8 w-8 text-emerald-500" />
            Queue is clear — every buyer has been reviewed.
          </p>
        ) : (
          <div className="space-y-3">
            {items.map((b) => (
              <div key={b.id} className="rounded-lg border p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="font-medium">{b.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {[b.company, b.email, b.phone].filter(Boolean).join(" · ") || "no contact info"}
                    </p>
                    {b.duplicate_of ? (
                      <Badge variant="outline" className="mt-1">
                        <GitMerge className="mr-1 h-3 w-3" />
                        Possible duplicate of #{b.duplicate_of} {b.duplicate_of_name ? `(${b.duplicate_of_name})` : ""}
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="mt-1">Suspected test entry</Badge>
                    )}
                    {b.outreach_count > 0 && (
                      <Badge variant="secondary" className="ml-1 mt-1">{b.outreach_count} outreach logged</Badge>
                    )}
                  </div>
                  <div className="flex gap-2">
                    <Button
                      size="sm" variant="outline"
                      disabled={review.isPending}
                      onClick={() => review.mutate({ id: b.id, decision: "approved" })}
                      title="Legitimate buyer — clear the flag"
                    >
                      <CheckCircle2 className="mr-1 h-4 w-4" /> Approve
                    </Button>
                    {b.duplicate_of && (
                      <Button
                        size="sm" variant="outline"
                        disabled={review.isPending}
                        onClick={() => review.mutate({ id: b.id, decision: "merged" })}
                        title={`Fold into #${b.duplicate_of}`}
                      >
                        <GitMerge className="mr-1 h-4 w-4" /> Merge
                      </Button>
                    )}
                    <Button
                      size="sm" variant="destructive"
                      disabled={review.isPending}
                      onClick={() => review.mutate({ id: b.id, decision: "rejected" })}
                      title="Confirmed test data — keep flagged, out of outreach"
                    >
                      <XCircle className="mr-1 h-4 w-4" /> Reject
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

interface DealReadyBuyer {
  id: number;
  name: string;
  company: string | null;
  email: string | null;
  phone: string | null;
  markets: string[];
  asset_types: string[];
  min_price: string | null;
  max_price: string | null;
  strategy: string | null;
  proof_of_funds_verified: boolean;
  relationship_stage: string | null;
  owner_user_id: number | null;
  first_name: string | null;
  last_name: string | null;
}

function DealReadyTab() {
  const [market, setMarket] = useState<string>("");
  const [maxPrice, setMaxPrice] = useState<string>("");
  const { data, isLoading } = useQuery<DealReadyBuyer[]>({
    queryKey: ["buyer-deal-ready", market, maxPrice],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (market) params.set("market", market);
      if (maxPrice) params.set("max_price", maxPrice);
      const res = await fetch(`/api/buyers/deal-ready?${params.toString()}`, { credentials: "include" });
      if (!res.ok) throw new Error("deal-ready failed");
      return res.json();
    },
  });
  const buyers = data ?? [];
  const allMarkets = [...new Set(buyers.flatMap((b) => b.markets ?? []))].sort();

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Flame className="h-4 w-4" /> Deal-ready buyers
          <Badge variant="secondary">{buyers.length}</Badge>
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          Deal alerts go ONLY to these buyers — confirmed buy-box, no test entries, no DNC.
          Never blast the full list.
        </p>
        <div className="flex flex-wrap gap-2 pt-2">
          <Select value={market || "__all"} onValueChange={(v) => setMarket(v === "__all" ? "" : v)}>
            <SelectTrigger className="w-48">
              <SelectValue placeholder="Filter by market" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all">All markets</SelectItem>
              {allMarkets.map((m) => (
                <SelectItem key={m} value={m}>{m}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Input
            className="w-48"
            placeholder="Deal price e.g. 150000"
            value={maxPrice}
            onChange={(e) => setMaxPrice(e.target.value.replace(/[^0-9]/g, ""))}
          />
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <Skeleton className="h-48" />
        ) : buyers.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            No deal-ready buyers match. Qualify buyers and confirm their buy-box to build this list.
          </p>
        ) : (
          <div className="space-y-3">
            {buyers.map((b) => (
              <div key={b.id} className="rounded-lg border p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="font-medium">
                      {b.name}
                      {b.proof_of_funds_verified && (
                        <Badge className="ml-2" variant="default">POF verified</Badge>
                      )}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {[b.company, b.phone, b.email].filter(Boolean).join(" · ")}
                    </p>
                    <div className="mt-1 flex flex-wrap gap-1">
                      {(b.markets ?? []).map((m) => (
                        <Badge key={m} variant="secondary" className="text-[10px]">{m}</Badge>
                      ))}
                      {(b.asset_types ?? []).map((a) => (
                        <Badge key={a} variant="outline" className="text-[10px]">{a}</Badge>
                      ))}
                      {b.strategy && <Badge variant="outline" className="text-[10px]">{b.strategy}</Badge>}
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Range: {b.min_price ? `$${Number(b.min_price).toLocaleString()}` : "—"} –{" "}
                      {b.max_price ? `$${Number(b.max_price).toLocaleString()}` : "—"}
                      {b.owner_user_id && ` · Owner: ${b.first_name ?? ""} ${b.last_name ?? ""}`.trim()}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" asChild>
                      <a href={`tel:${b.phone ?? ""}`}><PhoneCall className="mr-1 h-4 w-4" /> Call</a>
                    </Button>
                    <Button size="sm" variant="outline" asChild>
                      <a href={`/buyers?select=${b.id}`}><MessageSquare className="mr-1 h-4 w-4" /> Open</a>
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default function BuyerQualifyPage() {
  return (
    <div className="space-y-4 p-4 lg:p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-serif text-2xl font-semibold">Buyer Qualification</h1>
          <p className="text-sm text-muted-foreground">
            Turn the cold list into a qualified buyers list — owners, stages, outreach, buy-box, and a review queue for test data.
          </p>
        </div>
        <Badge variant="outline" className="flex items-center gap-1">
          <UserCheck className="h-3 w-3" /> Ticket 17
        </Badge>
      </div>

      <Tabs defaultValue="dashboard">
        <TabsList className="w-full">
          <TabsTrigger value="dashboard" className="flex-1">Dashboard</TabsTrigger>
          <TabsTrigger value="review" className="flex-1">Review Queue</TabsTrigger>
          <TabsTrigger value="dealready" className="flex-1">Deal-Ready</TabsTrigger>
        </TabsList>
        <TabsContent value="dashboard" className="mt-4">
          <DashboardTab />
        </TabsContent>
        <TabsContent value="review" className="mt-4">
          <ReviewQueueTab />
        </TabsContent>
        <TabsContent value="dealready" className="mt-4">
          <DealReadyTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
