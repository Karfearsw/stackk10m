import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  DISPO_STAGES,
  DISPO_STAGE_LABELS,
  filterDealsByDispoStage,
  type DispoStage,
} from "@shared/dispo-stages";
import { MetricsStrip } from "@/components/dispo/MetricsStrip";
import { DealDrawer, type DealCardData } from "@/components/dispo/DealDrawer";
import { BedDouble, Clock, Users } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

function money(n: number | null): string {
  if (n === null) return "—";
  return "$" + Math.round(n).toLocaleString("en-US");
}

function DealCard({
  deal,
  onOpen,
  onDragStart,
}: {
  deal: DealCardData;
  onOpen: () => void;
  onDragStart: (e: React.DragEvent) => void;
}) {
  return (
    <Card
      draggable
      onDragStart={onDragStart}
      onClick={onOpen}
      className="cursor-grab border-border/60 transition-shadow hover:shadow-md active:cursor-grabbing"
    >
      <CardContent className="space-y-2 p-3">
        {deal.image && (
          <img
            src={deal.image}
            alt={deal.address}
            className="h-24 w-full rounded-md object-cover"
            loading="lazy"
          />
        )}
        <div className="text-sm font-medium leading-tight">{deal.address}</div>
        <div className="text-xs text-muted-foreground">
          {deal.city}, {deal.state} {deal.zipCode}
        </div>
        <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
          <span className="inline-flex items-center gap-1">
            <BedDouble className="h-3 w-3" />
            {deal.beds ?? "—"}bd / {deal.baths ?? "—"}ba
          </span>
          <span className="inline-flex items-center gap-1">
            <Clock className="h-3 w-3" />
            {deal.daysInStage}d
          </span>
        </div>
        <div className="flex items-center justify-between pt-1">
          <div className="text-sm">
            <span className="font-semibold">{money(deal.askingPrice)}</span>
            {deal.assignmentFee !== null && (
              <span className="ml-1 text-[11px] text-[#D4AF37]">
                +{money(deal.assignmentFee)} fee
              </span>
            )}
          </div>
          {deal.matchCount > 0 && (
            <Badge
              variant="outline"
              className="inline-flex items-center gap-1 border-[#D4AF37]/40 text-[10px] text-[#D4AF37]"
            >
              <Users className="h-3 w-3" />
              {deal.matchCount}
            </Badge>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

export default function DispositionPage() {
  const queryClient = useQueryClient();
  const [openDeal, setOpenDeal] = useState<DealCardData | null>(null);
  const [dragOver, setDragOver] = useState<DispoStage | null>(null);

  const { data, isLoading, isError } = useQuery<{ deals: DealCardData[] }>({
    queryKey: ["disposition-deals"],
    queryFn: async () => {
      const res = await fetch("/api/disposition/deals", {
        credentials: "include",
      });
      if (!res.ok) throw new Error(`deals failed: ${res.status}`);
      return res.json();
    },
  });

  const moveStage = useMutation({
    mutationFn: ({ id, stage }: { id: number; stage: DispoStage }) =>
      apiRequest("PATCH", `/api/disposition/deals/${id}/stage`, { stage }),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ["disposition-deals"] }),
    onError: (e: any) =>
      toast.error(e?.message ?? "Could not move deal.", {
        description:
          "Dead deals are terminal — they leave the board only via a new record.",
      }),
  });

  const deals = data?.deals ?? [];

  const handleDrop = (e: React.DragEvent, stage: DispoStage) => {
    e.preventDefault();
    setDragOver(null);
    const raw = e.dataTransfer.getData("text/dispo-deal-id");
    const id = Number(raw);
    if (!Number.isFinite(id)) return;
    const deal = deals.find((d) => d.id === id);
    if (!deal || deal.stage === stage) return;
    moveStage.mutate({ id, stage });
  };

  return (
    <div className="space-y-4 p-4 lg:p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-serif text-2xl font-semibold">Disposition</h1>
          <p className="text-sm text-muted-foreground">
            Move contracted deals to buyers — drag cards between stages, open a
            deal to match, blast, and track offers.
          </p>
        </div>
      </div>

      <MetricsStrip />

      {isError && (
        <div className="rounded-lg border border-destructive/40 p-6 text-center text-sm text-muted-foreground">
          Could not load disposition deals.
        </div>
      )}

      <div className="grid auto-cols-[280px] grid-flow-col gap-3 overflow-x-auto pb-4 lg:grid-flow-col">
        {DISPO_STAGES.map((stage) => {
          const columnDeals = filterDealsByDispoStage(deals, stage);
          return (
            <div
              key={stage}
              onDragOver={(e) => {
                e.preventDefault();
                setDragOver(stage);
              }}
              onDragLeave={() => setDragOver(null)}
              onDrop={(e) => handleDrop(e, stage)}
              className={cn(
                "flex min-h-[420px] flex-col rounded-xl border border-border/60 bg-muted/30 p-2",
                dragOver === stage && "border-[#D4AF37] bg-[#D4AF37]/5",
              )}
            >
              <div className="flex items-center justify-between px-1 pb-2">
                <span className="text-sm font-medium">
                  {DISPO_STAGE_LABELS[stage]}
                </span>
                <Badge variant="secondary" className="text-[11px]">
                  {isLoading ? "…" : columnDeals.length}
                </Badge>
              </div>
              <div className="flex flex-1 flex-col gap-2">
                {isLoading &&
                  [0, 1].map((i) => <Skeleton key={i} className="h-36 w-full" />)}
                {!isLoading &&
                  columnDeals.map((deal) => (
                    <DealCard
                      key={deal.id}
                      deal={deal}
                      onOpen={() => setOpenDeal(deal)}
                      onDragStart={(e) => {
                        e.dataTransfer.setData(
                          "text/dispo-deal-id",
                          String(deal.id),
                        );
                        e.dataTransfer.effectAllowed = "move";
                      }}
                    />
                  ))}
                {!isLoading && columnDeals.length === 0 && (
                  <div className="rounded-lg border border-dashed p-4 text-center text-xs text-muted-foreground">
                    Drop deals here
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <DealDrawer deal={openDeal} onClose={() => setOpenDeal(null)} />
    </div>
  );
}
