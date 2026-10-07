import { useEffect, useState } from "react";
import { Link } from "wouter";
import { Loader2, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { investorApi, money, InvestorApiError, type OfferRow } from "./api";
import { InvestorPage, RequireInvestor } from "./InvestorLayout";

const STATUS_STYLE: Record<string, string> = {
  submitted: "bg-sky-500/15 text-sky-300",
  under_review: "bg-amber-500/15 text-amber-300",
  accepted: "bg-emerald-500/15 text-emerald-300",
  countered: "bg-purple-500/15 text-purple-300",
  dead: "bg-red-500/15 text-red-300",
};

export function OffersPage() {
  return (
    <RequireInvestor>
      <OffersBody />
    </RequireInvestor>
  );
}

function OffersBody() {
  const { toast } = useToast();
  const [offers, setOffers] = useState<OfferRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    investorApi.offers()
      .then((r) => setOffers(r.offers))
      .catch((e) => toast({ title: "Couldn't load offers", description: e instanceof InvestorApiError ? e.message : "Try again.", variant: "destructive" }))
      .finally(() => setLoading(false));
  }, []);

  return (
    <InvestorPage title="My offers" subtitle="Offer → LOI → accepted / countered / dead. Each offer drafts an LOI for the dispo team.">
      {loading ? (
        <div className="flex min-h-[40vh] items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-[#D4AF37]" /></div>
      ) : offers.length === 0 ? (
        <Card className="border-white/10 bg-[#121212]">
          <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
            <FileText className="h-10 w-10 text-neutral-700" />
            <p className="text-neutral-400">No offers yet. Find a deal you love in Discover and hit "Make offer".</p>
            <Link href="/investor/discover"><Button className="bg-[#D4AF37] font-semibold text-black hover:bg-[#c19b2e]">Discover deals</Button></Link>
          </CardContent>
        </Card>
      ) : (
        <div className="flex flex-col gap-3">
          {offers.map((o) => (
            <Card key={o.id} className="border-white/10 bg-[#121212]">
              <CardContent className="flex flex-wrap items-center justify-between gap-4 p-4">
                <div>
                  <div className="font-medium text-white">{o.address ?? `Deal #${o.propertyId}`}</div>
                  <div className="mt-0.5 text-xs text-neutral-500">
                    {o.createdAt ? new Date(o.createdAt).toLocaleDateString() : ""} · Offer #{o.id}
                    {o.loiId ? ` · LOI #${o.loiId}${o.loiStatus ? ` (${o.loiStatus})` : ""}` : ""}
                  </div>
                  {o.contingencies?.length ? <div className="mt-1 text-xs text-neutral-400">Contingencies: {o.contingencies.join(", ")}</div> : null}
                </div>
                <div className="text-right">
                  <div className="text-lg font-semibold text-[#D4AF37]">{money(o.offerAmount)}</div>
                  <Badge className={STATUS_STYLE[o.status] ?? "bg-white/10 text-neutral-300"}>{o.status.replace(/_/g, " ")}</Badge>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </InvestorPage>
  );
}
