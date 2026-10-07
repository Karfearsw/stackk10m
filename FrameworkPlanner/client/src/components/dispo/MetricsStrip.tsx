import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Briefcase, Clock, DollarSign, MessageSquareReply } from "lucide-react";

interface DispoMetrics {
  activeDeals: number;
  avgDaysToAssign: number;
  assignmentRevenueMTD: number;
  blastResponseRate: number | null;
  blastsSent30d: number;
}

function money(n: number): string {
  return "$" + Math.round(n).toLocaleString("en-US");
}

export function MetricsStrip() {
  const { data, isLoading, isError } = useQuery<DispoMetrics>({
    queryKey: ["disposition-metrics"],
    queryFn: async () => {
      const res = await fetch("/api/disposition/metrics", {
        credentials: "include",
      });
      if (!res.ok) throw new Error(`metrics failed: ${res.status}`);
      return res.json();
    },
  });

  const cards = [
    {
      label: "Active Deals",
      value: data ? String(data.activeDeals) : "—",
      sub: "under contract → reserved",
      icon: Briefcase,
    },
    {
      label: "Avg Days to Assign",
      value: data ? `${data.avgDaysToAssign}d` : "—",
      sub: "in dispo stages",
      icon: Clock,
    },
    {
      label: "Assignment Revenue MTD",
      value: data ? money(data.assignmentRevenueMTD) : "—",
      sub: "payouts received",
      icon: DollarSign,
    },
    {
      label: "Blast Response Rate",
      value:
        data && data.blastResponseRate !== null
          ? `${data.blastResponseRate}%`
          : "—",
      sub:
        data && data.blastsSent30d > 0
          ? `${data.blastsSent30d} blasts · 30d`
          : "no blasts yet · 30d",
      icon: MessageSquareReply,
    },
  ];

  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {cards.map((c) => (
        <Card key={c.label} className="border-border/60">
          <CardContent className="flex items-center gap-3 p-4">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[#D4AF37]/10 text-[#D4AF37]">
              <c.icon className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <div className="text-xs text-muted-foreground">{c.label}</div>
              {isLoading ? (
                <Skeleton className="mt-1 h-6 w-16" />
              ) : (
                <div className="truncate font-serif text-xl font-semibold">
                  {isError ? "—" : c.value}
                </div>
              )}
              <div className="truncate text-[11px] text-muted-foreground">
                {c.sub}
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
