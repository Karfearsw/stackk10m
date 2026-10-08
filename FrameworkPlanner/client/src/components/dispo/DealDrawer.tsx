import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { DISPO_STAGE_LABELS, type DispoStage } from "@shared/dispo-stages";
import { MatchedBuyersPanel } from "./MatchedBuyersPanel";
import { OffersTracker } from "./OffersTracker";
import { BroadcastComposer } from "./BroadcastComposer";
import { DocsPanel } from "./DocsPanel";
import { DispoScriptsPanel } from "./DispoScriptsPanel";
import { BedDouble, Bath, Ruler, MapPin, Phone, FileText, Calculator } from "lucide-react";

export interface DealCardData {
  id: number;
  address: string;
  city: string;
  state: string;
  zipCode: string;
  beds: number | null;
  baths: number | null;
  sqft: number | null;
  propertyType: string | null;
  image: string | null;
  stage: string;
  daysInStage: number;
  askingPrice: number | null;
  assignmentFee: number | null;
  matchCount: number;
}

function money(n: number | null): string {
  if (n === null) return "—";
  return "$" + Math.round(n).toLocaleString("en-US");
}

export function DealDrawer({
  deal,
  onClose,
}: {
  deal: DealCardData | null;
  onClose: () => void;
}) {
  const dealId = deal?.id ?? 0;
  const [, navigate] = useLocation();

  // Pre-warm the tabs' queries while the drawer is open.
  useQuery({
    queryKey: ["disposition-matches", dealId],
    enabled: dealId > 0,
    queryFn: async () => {
      const res = await fetch(`/api/disposition/deals/${dealId}/matches`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error(`matches failed: ${res.status}`);
      return res.json();
    },
  });

  const stageLabel =
    deal && (deal.stage as DispoStage) in DISPO_STAGE_LABELS
      ? DISPO_STAGE_LABELS[deal.stage as DispoStage]
      : deal?.stage;

  return (
    <Sheet open={deal !== null} onOpenChange={(open) => !open && onClose()}>
      <SheetContent className="w-full sm:max-w-xl">
        {!deal ? (
          <Skeleton className="h-24 w-full" />
        ) : (
          <>
            <SheetHeader className="pr-8 text-left">
              <SheetTitle className="font-serif">{deal.address}</SheetTitle>
              <SheetDescription>
                <span className="inline-flex items-center gap-1">
                  <MapPin className="h-3 w-3" />
                  {deal.city}, {deal.state} {deal.zipCode}
                </span>
              </SheetDescription>
              <div className="flex flex-wrap items-center gap-2 pt-1">
                <Badge variant="secondary">{stageLabel}</Badge>
                <Badge variant="outline">{deal.daysInStage}d in stage</Badge>
                {deal.matchCount > 0 && (
                  <Badge
                    variant="outline"
                    className="border-[#D4AF37]/40 text-[#D4AF37]"
                  >
                    {deal.matchCount} matches
                  </Badge>
                )}
              </div>
            </SheetHeader>

            <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
              <div className="rounded-lg border border-border/60 p-2.5">
                <div className="text-[11px] text-muted-foreground">Asking</div>
                <div className="font-semibold">{money(deal.askingPrice)}</div>
              </div>
              <div className="rounded-lg border border-border/60 p-2.5">
                <div className="text-[11px] text-muted-foreground">
                  Assignment fee
                </div>
                <div className="font-semibold text-[#D4AF37]">
                  {money(deal.assignmentFee)}
                </div>
              </div>
              <div className="col-span-2 flex items-center gap-4 rounded-lg border border-border/60 p-2.5 text-xs text-muted-foreground">
                <span className="inline-flex items-center gap-1">
                  <BedDouble className="h-3.5 w-3.5" /> {deal.beds ?? "—"} bd
                </span>
                <span className="inline-flex items-center gap-1">
                  <Bath className="h-3.5 w-3.5" /> {deal.baths ?? "—"} ba
                </span>
                <span className="inline-flex items-center gap-1">
                  <Ruler className="h-3.5 w-3.5" />{" "}
                  {deal.sqft ? deal.sqft.toLocaleString() : "—"} sqft
                </span>
                {deal.propertyType && <span>{deal.propertyType}</span>}
              </div>
            </div>

            <Tabs defaultValue="buyers" className="mt-4">
              <TabsList className="grid w-full grid-cols-5">
                <TabsTrigger value="buyers">Buyers</TabsTrigger>
                <TabsTrigger value="offers">Offers</TabsTrigger>
                <TabsTrigger value="broadcast">Broadcast</TabsTrigger>
                <TabsTrigger value="scripts">Scripts</TabsTrigger>
                <TabsTrigger value="docs">Docs</TabsTrigger>
              </TabsList>
              <div className="mt-3 flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="flex-1"
                  onClick={() => navigate(`/phone?dealId=${deal.id}`)}
                >
                  <Phone className="h-4 w-4 mr-2" /> Call
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="flex-1"
                  onClick={() => navigate(`/messages?dealId=${deal.id}`)}
                >
                  <FileText className="h-4 w-4 mr-2" /> Message
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="flex-1"
                  onClick={() => navigate(`/calculator?address=${encodeURIComponent([deal.address, deal.city, deal.state, deal.zipCode].filter(Boolean).join(", "))}`)}
                >
                  <Calculator className="h-4 w-4 mr-2" /> Calculator
                </Button>
              </div>
              <ScrollArea className="mt-3 h-[calc(100vh-430px)] pr-3">
                <TabsContent value="buyers">
                  <MatchedBuyersPanel dealId={deal.id} />
                </TabsContent>
                <TabsContent value="offers">
                  <OffersTracker dealId={deal.id} />
                </TabsContent>
                <TabsContent value="broadcast">
                  <BroadcastComposer dealId={deal.id} />
                </TabsContent>
                <TabsContent value="scripts">
                  <DispoScriptsPanel />
                </TabsContent>
                <TabsContent value="docs">
                  <DocsPanel dealId={deal.id} />
                </TabsContent>
              </ScrollArea>
            </Tabs>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
