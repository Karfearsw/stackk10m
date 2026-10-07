/** Discover feed — "Tinder for real estate": swipe/save/pass on matched deals. */
import { useEffect, useRef, useState } from "react";
import { Heart, X, Loader2, BedDouble, Bath, Ruler, MapPin, BadgeDollarSign, HandCoins } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { investorApi, money, InvestorApiError, type DealCard } from "./api";
import { InvestorPage, RequireInvestor } from "./InvestorLayout";

type Sort = "score" | "newest" | "price";

function ScoreRing({ score }: { score: number }) {
  const r = 26;
  const c = 2 * Math.PI * r;
  const color = score >= 70 ? "#D4AF37" : score >= 40 ? "#a3a3a3" : "#525252";
  return (
    <div className="relative h-16 w-16">
      <svg viewBox="0 0 64 64" className="h-16 w-16 -rotate-90">
        <circle cx="32" cy="32" r={r} fill="none" stroke="rgba(255,255,255,0.1)" strokeWidth="6" />
        <circle cx="32" cy="32" r={r} fill="none" stroke={color} strokeWidth="6" strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c - (c * score) / 100} />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center text-sm font-bold text-white">{score}</div>
    </div>
  );
}

function DealCardView({ card, onPass, onInterest, onOffer, busy }: {
  card: DealCard; onPass: () => void; onInterest: () => void; onOffer: () => void; busy: boolean;
}) {
  const d = card.deal;
  const touch = useRef<{ x: number } | null>(null);

  return (
    <Card
      className="overflow-hidden border-white/10 bg-[#121212]"
      onTouchStart={(e) => { touch.current = { x: e.touches[0].clientX }; }}
      onTouchEnd={(e) => {
        if (!touch.current || busy) return;
        const dx = e.changedTouches[0].clientX - touch.current.x;
        if (dx > 90) onInterest();
        else if (dx < -90) onPass();
        touch.current = null;
      }}
    >
      {d.image ? (
        <div className="relative h-64 bg-black sm:h-80">
          <img src={d.image} alt={d.address} className="h-full w-full object-cover" />
          <div className="absolute right-3 top-3 rounded-full bg-black/70 p-1 backdrop-blur"><ScoreRing score={card.score} /></div>
        </div>
      ) : (
        <div className="flex h-40 items-center justify-center bg-[#0a0a0a]">
          <div className="mr-3"><ScoreRing score={card.score} /></div>
          <span className="text-sm text-neutral-500">No photo</span>
        </div>
      )}
      <CardContent className="p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="font-serif text-xl text-white">{d.address}</div>
            <div className="mt-1 flex items-center gap-1 text-sm text-neutral-400">
              <MapPin className="h-3.5 w-3.5" /> {d.city}{d.city && d.state ? ", " : ""}{d.state} {d.zipCode}
            </div>
          </div>
          {!d.image && <ScoreRing score={card.score} />}
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-4 text-sm text-neutral-300">
          <span className="flex items-center gap-1.5 text-lg font-semibold text-[#D4AF37]"><BadgeDollarSign className="h-5 w-5" />{money(d.price)}</span>
          {d.beds !== null && <span className="flex items-center gap-1"><BedDouble className="h-4 w-4 text-neutral-500" />{d.beds} bd</span>}
          {d.baths !== null && <span className="flex items-center gap-1"><Bath className="h-4 w-4 text-neutral-500" />{d.baths} ba</span>}
          {d.sqft !== null && <span className="flex items-center gap-1"><Ruler className="h-4 w-4 text-neutral-500" />{d.sqft.toLocaleString()} sqft</span>}
          {d.propertyType && <Badge variant="outline" className="border-white/20 text-neutral-300">{d.propertyType}</Badge>}
        </div>

        {(d.arv !== null || card.spread !== null) && (
          <div className="mt-3 flex flex-wrap gap-4 text-sm">
            {d.arv !== null && <span className="text-neutral-400">ARV <span className="font-medium text-white">{money(d.arv)}</span></span>}
            {card.spread !== null && (
              <span className="flex items-center gap-1 text-neutral-400">
                <HandCoins className="h-4 w-4" /> Spread <span className={cn("font-medium", card.spread >= 0 ? "text-emerald-400" : "text-red-400")}>{money(card.spread)}</span>
              </span>
            )}
          </div>
        )}

        {card.reasons.length > 0 && (
          <div className="mt-4">
            <div className="text-xs uppercase tracking-widest text-neutral-500">Why this matches</div>
            <ul className="mt-2 flex flex-col gap-1.5">
              {card.reasons.map((r, i) => (
                <li key={i} className="flex items-center gap-2 text-sm text-neutral-300">
                  <span className="h-1.5 w-1.5 rounded-full bg-[#D4AF37]" /> {r}
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="mt-6 flex items-center justify-between gap-3">
          <Button onClick={onPass} disabled={busy} variant="outline" size="lg" className="h-14 w-14 rounded-full border-red-500/40 p-0 text-red-400 hover:bg-red-500/10" aria-label="Pass">
            <X className="h-6 w-6" />
          </Button>
          <Button onClick={onOffer} disabled={busy} className="flex-1 bg-white/10 text-white hover:bg-white/20">
            Make offer
          </Button>
          <Button onClick={onInterest} disabled={busy} size="lg" className="h-14 w-14 rounded-full bg-[#D4AF37] p-0 text-black hover:bg-[#c19b2e]" aria-label="I'm interested">
            <Heart className={cn("h-6 w-6", card.saved && "fill-black")} />
          </Button>
        </div>
        {card.saved && <p className="mt-2 text-center text-xs text-[#D4AF37]">Saved — the dispo team has been notified.</p>}
      </CardContent>
    </Card>
  );
}

function OfferDialog({ card, open, onClose, onSubmitted }: {
  card: DealCard | null; open: boolean; onClose: () => void; onSubmitted: () => void;
}) {
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({ offerAmount: "", earnestMoney: "", closingTimelineDays: "30", contingencies: "", specialTerms: "" });

  useEffect(() => {
    if (card) setForm({ offerAmount: card.deal.price ? String(Math.round(Number(card.deal.price))) : "", earnestMoney: "", closingTimelineDays: "30", contingencies: "", specialTerms: "" });
  }, [card]);

  const submit = async () => {
    if (!card) return;
    const offerAmount = Number(form.offerAmount);
    if (!Number.isFinite(offerAmount) || offerAmount <= 0) {
      toast({ title: "Enter a valid offer amount", variant: "destructive" });
      return;
    }
    setBusy(true);
    try {
      const r = await investorApi.offer(card.deal.id, {
        offerAmount,
        earnestMoney: form.earnestMoney ? Number(form.earnestMoney) : null,
        closingTimelineDays: form.closingTimelineDays ? Number(form.closingTimelineDays) : null,
        contingencies: form.contingencies.split(",").map((s) => s.trim()).filter(Boolean),
        specialTerms: form.specialTerms || null,
      });
      toast({ title: "Offer submitted", description: `Offer #${r.offerId} created — LOI #${r.loiId} drafted for the dispo team.` });
      onSubmitted();
      onClose();
    } catch (e) {
      toast({ title: "Offer failed", description: e instanceof InvestorApiError ? e.message : "Try again.", variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="border-white/10 bg-[#121212] text-white">
        <DialogHeader>
          <DialogTitle className="font-serif text-lg">Make an offer</DialogTitle>
          {card && <p className="text-sm text-neutral-400">{card.deal.address} — asking {money(card.deal.price)}</p>}
        </DialogHeader>
        <div className="flex flex-col gap-4 py-2">
          <div><Label className="text-neutral-300">Offer amount ($)</Label><Input type="number" min={1} value={form.offerAmount} onChange={(e) => setForm({ ...form, offerAmount: e.target.value })} className="border-white/10 bg-black text-white" /></div>
          <div className="grid grid-cols-2 gap-3">
            <div><Label className="text-neutral-300">Earnest money ($)</Label><Input type="number" min={0} value={form.earnestMoney} onChange={(e) => setForm({ ...form, earnestMoney: e.target.value })} className="border-white/10 bg-black text-white" /></div>
            <div><Label className="text-neutral-300">Close in (days)</Label><Input type="number" min={1} value={form.closingTimelineDays} onChange={(e) => setForm({ ...form, closingTimelineDays: e.target.value })} className="border-white/10 bg-black text-white" /></div>
          </div>
          <div><Label className="text-neutral-300">Contingencies (comma-separated)</Label><Input value={form.contingencies} onChange={(e) => setForm({ ...form, contingencies: e.target.value })} placeholder="inspection, financing" className="border-white/10 bg-black text-white" /></div>
          <div><Label className="text-neutral-300">Special terms</Label><Textarea value={form.specialTerms} onChange={(e) => setForm({ ...form, specialTerms: e.target.value })} className="border-white/10 bg-black text-white" /></div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose} className="text-neutral-400">Cancel</Button>
          <Button disabled={busy} onClick={submit} className="bg-[#D4AF37] font-semibold text-black hover:bg-[#c19b2e]">
            {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Submit offer
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function DiscoverFeed() {
  return (
    <RequireInvestor>
      <FeedBody />
    </RequireInvestor>
  );
}

function FeedBody() {
  const { toast } = useToast();
  const [cards, setCards] = useState<DealCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [sort, setSort] = useState<Sort>("score");
  const [offerFor, setOfferFor] = useState<DealCard | null>(null);

  const load = async (s: Sort) => {
    setLoading(true);
    try {
      const r = await investorApi.feed(s);
      setCards(r.cards);
    } catch (e) {
      toast({ title: "Couldn't load deals", description: e instanceof InvestorApiError ? e.message : "Try again.", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(sort); }, [sort]);

  const act = async (card: DealCard, fn: (id: number) => Promise<unknown>, label: string) => {
    setBusy(true);
    try {
      await fn(card.deal.id);
      setCards((prev) => label === "pass"
        ? prev.filter((c) => c.deal.id !== card.deal.id)
        : prev.map((c) => c.deal.id === card.deal.id ? { ...c, saved: true } : c));
    } catch (e) {
      toast({ title: "Action failed", description: e instanceof InvestorApiError ? e.message : "Try again.", variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  const [index, setIndex] = useState(0);
  useEffect(() => setIndex(0), [cards.length]);

  const current = cards[index];

  return (
    <InvestorPage title="Discover" subtitle="Deals matched to your buy box. Swipe right on what you like.">
      <div className="mb-4 flex gap-2">
        {(["score", "newest", "price"] as Sort[]).map((s) => (
          <Button key={s} size="sm" variant={sort === s ? "default" : "outline"}
            onClick={() => setSort(s)}
            className={sort === s ? "bg-[#D4AF37] text-black hover:bg-[#c19b2e]" : "border-white/20 text-neutral-300"}>
            {s === "score" ? "Best match" : s === "newest" ? "Newest" : "Price"}
          </Button>
        ))}
      </div>

      {loading ? (
        <div className="flex min-h-[40vh] items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-[#D4AF37]" /></div>
      ) : !current ? (
        <Card className="border-white/10 bg-[#121212]">
          <CardContent className="py-12 text-center">
            <p className="font-serif text-lg text-white">No more deals right now</p>
            <p className="mt-2 text-sm text-neutral-400">New inventory lands here as contracts come in. Check back soon — or widen your buy box.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="mx-auto max-w-xl">
          <div className="mb-2 text-center text-xs text-neutral-500">{index + 1} of {cards.length}</div>
          <DealCardView
            card={current}
            busy={busy}
            onPass={() => { act(current, investorApi.pass, "pass"); }}
            onInterest={() => { act(current, investorApi.interest, "interest"); }}
            onOffer={() => setOfferFor(current)}
          />
        </div>
      )}

      <OfferDialog card={offerFor} open={!!offerFor} onClose={() => setOfferFor(null)} onSubmitted={() => load(sort)} />
    </InvestorPage>
  );
}
