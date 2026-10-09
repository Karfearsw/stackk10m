/**
 * Discover feed (Phase 11): deal discovery cards built on the Luxe design
 * system — LuxePropertyCard for the card, LuxeMatchScore for the score,
 * LuxeBottomSheet for the match-explanation panel.
 *
 * Interaction rules (deliberate, never dating-app):
 * - Pass / Save / View Deal / Interested / Submit Offer are ALWAYS visible
 *   as real buttons on every card.
 * - Swipe left = Pass, swipe right = Interested, everywhere. Swipe only
 *   duplicates the buttons — it is never the only method. Arrow keys do the
 *   same. Swipe is NEVER used for offers, signatures, reservations,
 *   payments, or anything binding — those always open a confirmation step.
 * - Undo is offered after every Pass.
 * - Every match score is shown with its explanation. ARV and spread are
 *   labeled as estimates, never guaranteed returns.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { useLocation } from "wouter";
import {
  X, Bookmark, Eye, CheckCircle2, FileText, Loader2, Undo2,
  Compass, Pencil, TriangleAlert,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import {
  LuxePropertyCard,
  LuxeMatchScore,
  LuxeStatusBadge,
  LuxeBottomSheet,
  LuxeDialog,
  LuxeEmptyState,
  type LuxeStatusTone,
} from "@/components/luxe";
import {
  investorApi, money, InvestorApiError,
  type DiscoveryDealCard, type MatchExplanation, type MatchDimension, type DimensionStatus,
} from "./api";
import { InvestorPage, RequireInvestor } from "./InvestorLayout";

type Sort = "score" | "newest" | "price";

function prettyStrategy(s: string | null): string | null {
  if (!s) return null;
  return s.split("-").map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
}

function formatDeadline(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function deadlineUrgency(iso: string | null): "soon" | "later" | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const days = Math.ceil((d.getTime() - Date.now()) / 86_400_000);
  return days <= 14 ? "soon" : "later";
}

/* ---------------- match explanation panel ---------------- */

function dimensionTone(status: DimensionStatus): LuxeStatusTone {
  switch (status) {
    case "strong": return "gold";
    case "hard_fail": return "oxblood";
    default: return "neutral";
  }
}

function dimensionLabel(status: DimensionStatus): string {
  switch (status) {
    case "strong": return "Strong";
    case "moderate": return "Moderate";
    case "weak": return "Weak";
    case "missing": return "Missing data";
    case "hard_fail": return "Hard rule";
  }
}

function DimensionBar({ dim }: { dim: MatchDimension }) {
  if (dim.status === "missing") {
    return <p className="text-xs text-muted-foreground">Not enough data to score this dimension.</p>;
  }
  const fill =
    dim.status === "hard_fail"
      ? "bg-oxblood"
      : dim.status === "strong"
        ? "bg-primary"
        : "bg-muted-foreground/50";
  return (
    <div
      className="h-1.5 w-full overflow-hidden rounded-full bg-muted"
      role="img"
      aria-label={`${dim.label}: ${dim.score} out of 100`}
    >
      <div className={cn("h-full rounded-full", fill)} style={{ width: `${dim.score}%` }} />
    </div>
  );
}

function MatchExplanationPanel({ card }: { card: DiscoveryDealCard }) {
  const [, setLocation] = useLocation();
  const exp: MatchExplanation = card.explanation;
  const calculated = new Date(exp.calculatedAt);
  const calculatedLabel = Number.isNaN(calculated.getTime())
    ? "recently"
    : calculated.toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

  return (
    <div className="flex flex-col gap-6">
      {/* Overall score — always paired with its explanation */}
      <div className="flex items-center gap-4">
        <LuxeMatchScore score={exp.score} size="lg" showLabel />
        <div>
          <p className="font-serif text-lg leading-tight">
            {exp.hardFail ? "Does not fit your buy box" : exp.score >= 70 ? "Strong fit" : exp.score >= 40 ? "Partial fit" : "Weak fit"}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            Fit score, calculated {calculatedLabel}. Estimates only — never guaranteed returns.
          </p>
        </div>
      </div>

      {exp.hardRuleFailures.length > 0 && (
        <section aria-label="Hard rule failures">
          <h4 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Hard-rule failures</h4>
          <div className="mt-2 flex flex-col gap-2">
            {exp.hardRuleFailures.map((f, i) => (
              <div key={i} className="flex items-start gap-2 rounded-lg border border-oxblood/30 bg-oxblood/10 p-3">
                <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-oxblood" aria-hidden />
                <div>
                  <p className="text-sm font-medium text-oxblood">{f.rule}</p>
                  <p className="mt-0.5 text-sm text-muted-foreground">{f.message}</p>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      <section aria-label="Score breakdown">
        <h4 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">What went into this score</h4>
        <ul className="mt-3 flex flex-col gap-4">
          {exp.dimensions.map((dim) => (
            <li key={dim.key}>
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-medium">{dim.label}</span>
                <LuxeStatusBadge tone={dimensionTone(dim.status)}>{dimensionLabel(dim.status)}</LuxeStatusBadge>
              </div>
              <div className="mt-1.5"><DimensionBar dim={dim} /></div>
              <p className="mt-1 text-xs text-muted-foreground">
                {dim.detail}{dim.estimate ? " (estimate)" : ""}
              </p>
            </li>
          ))}
        </ul>
      </section>

      {exp.strongMatches.length > 0 && (
        <section aria-label="Strong matches">
          <h4 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Strong matches</h4>
          <ul className="mt-2 flex flex-col gap-1.5">
            {exp.strongMatches.map((s, i) => (
              <li key={i} className="flex items-center gap-2 text-sm">
                <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-primary" aria-hidden /> {s}
              </li>
            ))}
          </ul>
        </section>
      )}

      {exp.weakMatches.length > 0 && (
        <section aria-label="Weak matches">
          <h4 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Weak matches</h4>
          <ul className="mt-2 flex flex-col gap-1.5">
            {exp.weakMatches.map((s, i) => (
              <li key={i} className="flex items-center gap-2 text-sm text-muted-foreground">
                <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-muted-foreground/50" aria-hidden /> {s}
              </li>
            ))}
          </ul>
        </section>
      )}

      {exp.missingInformation.length > 0 && (
        <section aria-label="Missing information">
          <h4 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Missing information</h4>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {exp.missingInformation.map((m, i) => (
              <LuxeStatusBadge key={i} tone="neutral">{m}</LuxeStatusBadge>
            ))}
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            Missing fields do not lower the score — they are simply left out of it until the data arrives.
          </p>
        </section>
      )}

      <section aria-label="About this score" className="border-t border-border/60 pt-4">
        {exp.dataSources.length > 0 && (
          <p className="text-xs text-muted-foreground">
            <span className="font-medium text-foreground">Data sources:</span> {exp.dataSources.join(" · ")}
          </p>
        )}
        <Button variant="outline" size="sm" className="mt-3" onClick={() => setLocation("/investor/buy-box")}>
          <Pencil className="mr-1.5 h-3.5 w-3.5" /> Edit buy box
        </Button>
      </section>
    </div>
  );
}

/* ---------------- card actions (always visible) ---------------- */

type CardHandlers = {
  onPass: () => void;
  onSave: () => void;
  onView: () => void;
  onInterest: () => void;
  onOffer: () => void;
};

function DealActions({ card, busy, handlers }: { card: DiscoveryDealCard; busy: boolean; handlers: CardHandlers }) {
  const address = card.deal.displayAddress;
  const btn = "h-9 text-[13px]";
  return (
    <div className="flex flex-wrap gap-2" role="group" aria-label={`Actions for ${address}`}>
      <Button variant="outline" size="sm" className={btn} disabled={busy} onClick={handlers.onPass} aria-label={`Pass on ${address}`}>
        <X className="mr-1.5 h-4 w-4" aria-hidden /> Pass
      </Button>
      <Button variant="outline" size="sm" className={btn} disabled={busy} onClick={handlers.onSave} aria-label={card.saved ? `Saved: ${address}` : `Save ${address}`}>
        <Bookmark className={cn("mr-1.5 h-4 w-4", card.saved && "fill-current")} aria-hidden /> {card.saved ? "Saved" : "Save"}
      </Button>
      <Button variant="ghost" size="sm" className={btn} disabled={busy} onClick={handlers.onView} aria-label={`View deal details for ${address}`}>
        <Eye className="mr-1.5 h-4 w-4" aria-hidden /> View Deal
      </Button>
      <Button size="sm" className={cn(btn, "bg-primary text-primary-foreground hover:bg-primary/90")} disabled={busy} onClick={handlers.onInterest} aria-label={`Mark interested in ${address}`}>
        <CheckCircle2 className="mr-1.5 h-4 w-4" aria-hidden /> Interested
      </Button>
      <Button variant="outline" size="sm" className={cn(btn, "border-primary/40 text-primary hover:bg-primary/10")} disabled={busy} onClick={handlers.onOffer} aria-label={`Submit an offer on ${address}`}>
        <FileText className="mr-1.5 h-4 w-4" aria-hidden /> Submit Offer
      </Button>
    </div>
  );
}

/* ---------------- single deck card ---------------- */

function DeckCard({ card, busy, handlers, onExplain }: {
  card: DiscoveryDealCard; busy: boolean; handlers: CardHandlers; onExplain: () => void;
}) {
  const touch = useRef<{ x: number } | null>(null);
  const d = card.deal;
  const urgency = deadlineUrgency(d.deadline);
  const deadlineLabel = formatDeadline(d.deadline);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (busy) return;
    if (e.key === "ArrowLeft") { e.preventDefault(); handlers.onPass(); }
    else if (e.key === "ArrowRight") { e.preventDefault(); handlers.onInterest(); }
  };

  return (
    <div
      role="region"
      aria-label={`Deal ${d.displayAddress}. Left arrow or swipe left to pass, right arrow or swipe right for interested.`}
      tabIndex={0}
      onKeyDown={handleKeyDown}
      onTouchStart={(e) => { touch.current = { x: e.touches[0].clientX }; }}
      onTouchEnd={(e) => {
        if (!touch.current || busy) return;
        const dx = e.changedTouches[0].clientX - touch.current.x;
        touch.current = null;
        if (dx > 90) handlers.onInterest();
        else if (dx < -90) handlers.onPass();
      }}
      className="rounded-xl outline-none focus-visible:ring-1 focus-visible:ring-primary/60"
    >
      <LuxePropertyCard
        property={{
          id: d.id,
          image: d.image,
          address: d.displayAddress,
          city: d.city,
          state: d.state,
          zipCode: d.zipCode,
          propertyType: d.propertyType,
          price: d.price,
          arv: d.arv,
          repairCost: d.repairCost,
          spread: card.spread,
          beds: d.beds,
          baths: d.baths,
          sqft: d.sqft,
          matchScore: card.score,
          statusLabel: prettyStrategy(d.strategy),
          statusTone: "gold",
          verificationLabel: d.verificationState === "verified" ? "Verified details" : null,
        }}
        footer={
          <div className="flex flex-col gap-3">
            <div className="flex flex-wrap items-center gap-1.5">
              {card.explanation.hardFail && (
                <LuxeStatusBadge tone="oxblood">Does not fit your buy box</LuxeStatusBadge>
              )}
              {d.verificationState === "partial" && (
                <LuxeStatusBadge tone="neutral">Partially verified</LuxeStatusBadge>
              )}
              {d.verificationState === "unverified" && (
                <LuxeStatusBadge tone="neutral">Unverified — estimates only</LuxeStatusBadge>
              )}
              {d.occupancy && <LuxeStatusBadge tone="neutral">{d.occupancy}</LuxeStatusBadge>}
              {deadlineLabel && (
                <LuxeStatusBadge tone={urgency === "soon" ? "oxblood" : "neutral"}>
                  Deadline {deadlineLabel}
                </LuxeStatusBadge>
              )}
              {d.missingWarnings.length > 0 && (
                <LuxeStatusBadge tone="neutral">{d.missingWarnings.length} detail{d.missingWarnings.length === 1 ? "" : "s"} missing</LuxeStatusBadge>
              )}
            </div>
            <button
              type="button"
              onClick={onExplain}
              className="self-start text-[13px] font-medium text-primary underline-offset-4 hover:underline"
            >
              Why this score?
            </button>
            <DealActions card={card} busy={busy} handlers={handlers} />
          </div>
        }
      />
    </div>
  );
}

/* ---------------- offer dialog ---------------- */

function OfferDialog({ card, open, onClose, onSubmitted }: {
  card: DiscoveryDealCard | null; open: boolean; onClose: () => void; onSubmitted: () => void;
}) {
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({ offerAmount: "", earnestMoney: "", closingTimelineDays: "30", contingencies: "", specialTerms: "" });

  useEffect(() => {
    if (card) {
      setForm({
        offerAmount: card.deal.price ? String(Math.round(Number(card.deal.price))) : "",
        earnestMoney: "", closingTimelineDays: "30", contingencies: "", specialTerms: "",
      });
    }
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
      // Log the offer submission in the interaction trail, then confirm.
      await investorApi.logInteraction(card.deal.id, "offer_submitted").catch(() => null);
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
    <LuxeDialog open={open} onOpenChange={(o) => !o && onClose()} title="Submit an offer" description={card ? `${card.deal.displayAddress} — asking ${money(card.deal.price)}` : undefined}>
      <div className="flex flex-col gap-4 py-2">
        <p className="text-xs text-muted-foreground">
          Submitting an offer starts a conversation with the dispo team — it is not a binding agreement. Figures are estimates unless verified.
        </p>
        <div><Label className="text-neutral-300">Offer amount ($)</Label><Input type="number" min={1} value={form.offerAmount} onChange={(e) => setForm({ ...form, offerAmount: e.target.value })} className="border-white/10 bg-black text-white" /></div>
        <div className="grid grid-cols-2 gap-3">
          <div><Label className="text-neutral-300">Earnest money ($)</Label><Input type="number" min={0} value={form.earnestMoney} onChange={(e) => setForm({ ...form, earnestMoney: e.target.value })} className="border-white/10 bg-black text-white" /></div>
          <div><Label className="text-neutral-300">Close in (days)</Label><Input type="number" min={1} value={form.closingTimelineDays} onChange={(e) => setForm({ ...form, closingTimelineDays: e.target.value })} className="border-white/10 bg-black text-white" /></div>
        </div>
        <div><Label className="text-neutral-300">Contingencies (comma-separated)</Label><Input value={form.contingencies} onChange={(e) => setForm({ ...form, contingencies: e.target.value })} placeholder="inspection, financing" className="border-white/10 bg-black text-white" /></div>
        <div><Label className="text-neutral-300">Special terms</Label><Textarea value={form.specialTerms} onChange={(e) => setForm({ ...form, specialTerms: e.target.value })} className="border-white/10 bg-black text-white" /></div>
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose} className="text-neutral-400">Cancel</Button>
          <Button disabled={busy} onClick={submit} className="bg-primary font-semibold text-primary-foreground hover:bg-primary/90">
            {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Submit offer
          </Button>
        </div>
      </div>
    </LuxeDialog>
  );
}

/* ---------------- feed ---------------- */

export function DiscoverFeed() {
  return (
    <RequireInvestor>
      <FeedBody />
    </RequireInvestor>
  );
}

function FeedBody() {
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const [cards, setCards] = useState<DiscoveryDealCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [sort, setSort] = useState<Sort>("score");
  const [index, setIndex] = useState(0);
  const [offerFor, setOfferFor] = useState<DiscoveryDealCard | null>(null);
  const [sheetCard, setSheetCard] = useState<DiscoveryDealCard | null>(null);
  const [lastPassed, setLastPassed] = useState<{ card: DiscoveryDealCard; index: number } | null>(null);
  // Ref mirror of cards so remove/undo handlers can clamp the deck position
  // against the latest list without stale closures.
  const cardsRef = useRef<DiscoveryDealCard[]>([]);
  cardsRef.current = cards;

  const load = useCallback(async (s: Sort) => {
    setLoading(true);
    try {
      const r = await investorApi.discoverFeed(s);
      setCards(r.cards);
      setIndex(0);
      setLastPassed(null);
    } catch (e) {
      toast({ title: "Couldn't load deals", description: e instanceof InvestorApiError ? e.message : "Try again.", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => { load(sort); }, [sort, load]);

  const current = cards[index] ?? null;

  // Log a "viewed" interaction each time a new card becomes current.
  useEffect(() => {
    if (current) {
      investorApi.logInteraction(current.deal.id, "viewed").catch(() => null);
    }
  }, [current?.deal.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const failToast = (e: unknown) => {
    toast({ title: "Action failed", description: e instanceof InvestorApiError ? e.message : "Try again.", variant: "destructive" });
  };

  const removeCurrent = useCallback(() => {
    const prev = cardsRef.current;
    const next = prev.filter((_, i) => i !== index);
    setCards(next);
    if (index >= next.length) setIndex(Math.max(0, next.length - 1));
  }, [index]);

  const handlePass = useCallback(async () => {
    if (!current || busy) return;
    setBusy(true);
    try {
      await investorApi.logInteraction(current.deal.id, "passed");
      setLastPassed({ card: current, index });
      removeCurrent();
      toast({ title: "Passed", description: "Deal moved out of your feed. You can undo this." });
    } catch (e) { failToast(e); }
    finally { setBusy(false); }
  }, [current, busy, index, removeCurrent, toast]);

  const handleUndoPass = useCallback(async () => {
    if (!lastPassed || busy) return;
    setBusy(true);
    try {
      await investorApi.undoPass(lastPassed.card.deal.id);
      const at = Math.min(lastPassed.index, cardsRef.current.length);
      setCards((prev) => [...prev.slice(0, at), lastPassed.card, ...prev.slice(at)]);
      setIndex(at);
      setLastPassed(null);
      toast({ title: "Restored", description: "The deal is back in your feed." });
    } catch (e) { failToast(e); }
    finally { setBusy(false); }
  }, [lastPassed, busy, toast]);

  const handleSave = useCallback(async () => {
    if (!current || busy) return;
    setBusy(true);
    try {
      await investorApi.logInteraction(current.deal.id, "saved");
      setCards((prev) => prev.map((c) => c.deal.id === current.deal.id ? { ...c, saved: true } : c));
      toast({ title: "Saved", description: "Find it under Saved deals." });
    } catch (e) { failToast(e); }
    finally { setBusy(false); }
  }, [current, busy, toast]);

  const handleInterest = useCallback(async () => {
    if (!current || busy) return;
    setBusy(true);
    try {
      await investorApi.logInteraction(current.deal.id, "interested");
      removeCurrent();
      toast({ title: "Marked as interested", description: "The dispo team has been notified." });
    } catch (e) { failToast(e); }
    finally { setBusy(false); }
  }, [current, busy, removeCurrent, toast]);

  const handlers: CardHandlers = {
    onPass: handlePass,
    onSave: handleSave,
    onView: () => current && setSheetCard(current),
    onInterest: handleInterest,
    onOffer: () => current && setOfferFor(current),
  };

  return (
    <InvestorPage title="Discover" subtitle="Deals matched to your buy box, with the reasoning shown.">
      <div className="mb-4 flex flex-wrap items-center gap-2">
        {(["score", "newest", "price"] as Sort[]).map((s) => (
          <Button key={s} size="sm" variant={sort === s ? "default" : "outline"}
            onClick={() => setSort(s)}
            className={sort === s ? "bg-primary text-primary-foreground hover:bg-primary/90" : "border-white/20 text-neutral-300"}>
            {s === "score" ? "Best match" : s === "newest" ? "Newest" : "Price"}
          </Button>
        ))}
      </div>

      {loading ? (
        <div className="flex min-h-[40vh] items-center justify-center" aria-label="Loading deals">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      ) : !current ? (
        <LuxeEmptyState
          icon={<Compass className="h-5 w-5" aria-hidden />}
          title="No more deals right now"
          description="New inventory lands here as contracts come in. Check back soon — or widen your buy box."
          actionLabel="Adjust buy box"
          onAction={() => setLocation("/investor/buy-box")}
        />
      ) : (
        <div className="mx-auto max-w-xl">
          <p className="mb-2 text-center text-xs text-neutral-500" aria-live="polite">
            {index + 1} of {cards.length}
          </p>
          <p className="mb-3 text-center text-[11px] text-neutral-500">
            Swipe left to Pass · Swipe right for Interested — or use the buttons and arrow keys.
          </p>

          {lastPassed && (
            <div className="mb-3 flex items-center justify-between gap-3 rounded-lg border border-border/60 bg-muted/40 px-3 py-2">
              <p className="text-xs text-muted-foreground">
                Passed on <span className="font-medium text-foreground">{lastPassed.card.deal.displayAddress}</span>
              </p>
              <Button variant="outline" size="sm" onClick={handleUndoPass} disabled={busy} aria-label="Undo pass">
                <Undo2 className="mr-1.5 h-3.5 w-3.5" aria-hidden /> Undo
              </Button>
            </div>
          )}

          <DeckCard card={current} busy={busy} handlers={handlers} onExplain={() => setSheetCard(current)} />
        </div>
      )}

      <LuxeBottomSheet
        open={!!sheetCard}
        onOpenChange={(o) => !o && setSheetCard(null)}
        title={sheetCard ? sheetCard.deal.displayAddress : "Deal details"}
        description="Match details and the full deal picture."
      >
        {sheetCard && (
          <div className="flex flex-col gap-6">
            <div className="flex flex-wrap items-center gap-1.5">
              {sheetCard.deal.missingWarnings.map((w, i) => (
                <LuxeStatusBadge key={i} tone="neutral">{w}</LuxeStatusBadge>
              ))}
              {sheetCard.deal.deadline && (
                <LuxeStatusBadge tone={deadlineUrgency(sheetCard.deal.deadline) === "soon" ? "oxblood" : "neutral"}>
                  Deadline {formatDeadline(sheetCard.deal.deadline)}
                </LuxeStatusBadge>
              )}
            </div>
            <MatchExplanationPanel card={sheetCard} />
            <div className="border-t border-border/60 pt-4">
              <DealActions
                card={sheetCard}
                busy={busy}
                handlers={{
                  ...handlers,
                  onView: () => setSheetCard(null),
                }}
              />
            </div>
          </div>
        )}
      </LuxeBottomSheet>

      <OfferDialog card={offerFor} open={!!offerFor} onClose={() => setOfferFor(null)} onSubmitted={() => load(sort)} />
    </InvestorPage>
  );
}
