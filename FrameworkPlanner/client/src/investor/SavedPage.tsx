import { useEffect, useState } from "react";
import { Link } from "wouter";
import { Loader2, MapPin, Heart } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { investorApi, money, InvestorApiError, type DealCard } from "./api";
import { InvestorPage, RequireInvestor } from "./InvestorLayout";

export function SavedPage() {
  return (
    <RequireInvestor>
      <SavedBody />
    </RequireInvestor>
  );
}

function SavedBody() {
  const { toast } = useToast();
  const [saved, setSaved] = useState<DealCard[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    investorApi.saved()
      .then((r) => setSaved(r.saved))
      .catch((e) => toast({ title: "Couldn't load saved deals", description: e instanceof InvestorApiError ? e.message : "Try again.", variant: "destructive" }))
      .finally(() => setLoading(false));
  }, []);

  return (
    <InvestorPage title="Saved" subtitle="Deals you swiped right on. The dispo team sees your interest.">
      {loading ? (
        <div className="flex min-h-[40vh] items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-[#D4AF37]" /></div>
      ) : saved.length === 0 ? (
        <Card className="border-white/10 bg-[#121212]">
          <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
            <Heart className="h-10 w-10 text-neutral-700" />
            <p className="text-neutral-400">Nothing saved yet — head to Discover and tap the heart on deals you like.</p>
            <Link href="/investor/discover"><Button className="bg-[#D4AF37] font-semibold text-black hover:bg-[#c19b2e]">Discover deals</Button></Link>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {saved.map((c) => (
            <Card key={c.deal.id} className="overflow-hidden border-white/10 bg-[#121212]">
              {c.deal.image && <img src={c.deal.image} alt={c.deal.address} className="h-40 w-full object-cover" />}
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="font-medium text-white">{c.deal.address}</div>
                    <div className="mt-0.5 flex items-center gap-1 text-xs text-neutral-400"><MapPin className="h-3 w-3" />{c.deal.city}, {c.deal.state}</div>
                  </div>
                  <Badge className="bg-[#D4AF37]/15 text-[#D4AF37]">Match {c.score}</Badge>
                </div>
                <div className="mt-2 text-lg font-semibold text-[#D4AF37]">{money(c.deal.price)}</div>
                <Link href={`/investor/messages?deal=${c.deal.id}`}>
                  <Button variant="outline" size="sm" className="mt-3 border-white/20 text-white">Message the dispo team</Button>
                </Link>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </InvestorPage>
  );
}
