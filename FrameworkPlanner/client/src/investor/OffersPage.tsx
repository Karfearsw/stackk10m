/**
 * Offers page (Phase 14): structured offer workflow.
 * - Offer builder dialog (LuxeDialog): full structured fields.
 * - Explicit review + confirmation screen before submit (never auto-submit).
 * - Version timeline (LuxeTimeline): immutable version history per offer;
 *   counters create new rows, never overwrites.
 * The original quick-offer list is kept below under "Classic offers".
 */
import { useEffect, useState } from "react";
import { Link, useLocation } from "wouter";
import { Loader2, FileText, Plus, CheckCircle2, Undo2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import {
  investorApi, money, InvestorApiError,
  type OfferRow, type StructuredOffer, type OfferForm,
  type OfferVersion, type DealRoomSummary,
} from "./api";
import { InvestorPage, RequireInvestor } from "./InvestorLayout";
import {
  LuxeDialog, LuxeStatusBadge, LuxeTimeline, LuxeEmptyState,
  LuxePageHeader, type LuxeStatusTone, type LuxeTimelineItem,
} from "@/components/luxe";

const CLASSIC_STATUS_STYLE: Record<string, string> = {
  submitted: "bg-sky-500/15 text-sky-300",
  under_review: "bg-amber-500/15 text-amber-300",
  accepted: "bg-emerald-500/15 text-emerald-300",
  countered: "bg-purple-500/15 text-purple-300",
  dead: "bg-red-500/15 text-red-300",
};

const OFFER_TONE: Record<string, LuxeStatusTone> = {
  draft: "neutral",
  submitted: "info",
  viewed: "gold",
  countered: "gold",
  accepted: "verified",
  rejected: "oxblood",
  withdrawn: "neutral",
  expired: "oxblood",
  converted_to_contract: "verified",
};

const FINANCING = ["cash", "hard_money", "conventional", "other"];
const STRUCTURES = ["assignment", "double_close"];

const EMPTY_FORM: OfferForm = {
  offerAmount: 0,
  earnestMoney: null,
  financingType: "cash",
  inspectionPeriodDays: null,
  closingDate: null,
  dealStructure: "assignment",
  contingencies: [],
  additionalTerms: null,
  expirationAt: null,
  buyerEntity: null,
  authorizedSigner: null,
};

function fmtStatus(s: string | null | undefined): string {
  return s ? s.replace(/_/g, " ") : "—";
}

export function OffersPage() {
  return (
    <RequireInvestor>
      <OffersBody />
    </RequireInvestor>
  );
}

function OffersBody() {
  const { toast } = useToast();
  const [location, setLocation] = useLocation();
  const [classic, setClassic] = useState<OfferRow[]>([]);
  const [structured, setStructured] = useState<StructuredOffer[]>([]);
  const [rooms, setRooms] = useState<DealRoomSummary[]>([]);
  const [loading, setLoading] = useState(true);

  // Builder state
  const [builderOpen, setBuilderOpen] = useState(false);
  const [builderRoomId, setBuilderRoomId] = useState<number | null>(null);
  const [form, setForm] = useState<OfferForm>(EMPTY_FORM);
  const [draft, setDraft] = useState<StructuredOffer | null>(null);
  const [reviewing, setReviewing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [pofBusy, setPofBusy] = useState(false);

  // Version-history detail state
  const [detailOffer, setDetailOffer] = useState<StructuredOffer | null>(null);
  const [versions, setVersions] = useState<OfferVersion[]>([]);
  const [detailOpen, setDetailOpen] = useState(false);

  const roomParam = (() => {
    const m = /[?&]room=(\d+)/.exec(location);
    return m ? Number(m[1]) : null;
  })();
  const offerParam = (() => {
    const m = /[?&]offer=(\d+)/.exec(location);
    return m ? Number(m[1]) : null;
  })();

  const load = async () => {
    try {
      const [c, s, rm] = await Promise.all([
        investorApi.offers().catch(() => ({ offers: [] as OfferRow[] })),
        investorApi.structuredOffers().catch(() => ({ offers: [] as StructuredOffer[] })),
        investorApi.dealRooms().catch(() => ({ rooms: [] as DealRoomSummary[] })),
      ]);
      setClassic(c.offers);
      setStructured(s.offers);
      setRooms(rm.rooms);
    } catch (e) {
      toast({ title: "Couldn't load offers", description: e instanceof InvestorApiError ? e.message : "Try again.", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  // Auto-open the builder when arriving from a deal room, or an offer detail.
  useEffect(() => {
    if (roomParam && rooms.length && !loading) {
      setBuilderRoomId(roomParam);
      setBuilderOpen(true);
    }
  }, [roomParam, rooms.length, loading]);
  useEffect(() => {
    if (offerParam && !loading) openDetail(offerParam);
  }, [offerParam, loading]);

  const openBuilder = () => {
    setForm(EMPTY_FORM);
    setDraft(null);
    setReviewing(false);
    setBuilderRoomId(roomParam);
    setBuilderOpen(true);
  };

  const valid = (): string | null => {
    if (!form.offerAmount || form.offerAmount <= 0) return "Offer amount is required.";
    if (!form.closingDate) return "Closing date is required.";
    if (!form.authorizedSigner?.trim()) return "An authorized signer is required.";
    return null;
  };

  const saveDraftAndReview = async () => {
    const err = valid();
    if (err) { toast({ title: "Missing details", description: err, variant: "destructive" }); return; }
    if (!builderRoomId) { toast({ title: "Pick a deal room", description: "Structured offers are made from a mutual-match deal room.", variant: "destructive" }); return; }
    setSaving(true);
    try {
      const r = await investorApi.createOfferDraft(builderRoomId, {
        ...form,
        contingencies: form.contingencies?.length ? form.contingencies : [],
      });
      setDraft(r.offer);
      setReviewing(true);
    } catch (e) {
      toast({ title: "Couldn't save draft", description: e instanceof InvestorApiError ? e.message : "Try again.", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const submit = async () => {
    if (!draft) return;
    setSaving(true);
    try {
      const r = await investorApi.submitOffer(draft.id);
      toast({ title: "Offer submitted", description: `Offer #${r.offer.id} is now with the OceanLuxe team.` });
      setBuilderOpen(false);
      setDraft(null);
      setReviewing(false);
      setLocation("/investor/offers");
      await load();
    } catch (e) {
      toast({ title: "Submit failed", description: e instanceof InvestorApiError ? e.message : "Try again.", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const withdraw = async (offer: StructuredOffer) => {
    if (!confirm(`Withdraw offer #${offer.id}? This is on the record.`)) return;
    try {
      await investorApi.withdrawOffer(offer.id);
      toast({ title: "Offer withdrawn" });
      await load();
    } catch (e) {
      toast({ title: "Couldn't withdraw", description: e instanceof InvestorApiError ? e.message : "Try again.", variant: "destructive" });
    }
  };

  const openDetail = async (offerId: number) => {
    try {
      const r = await investorApi.structuredOfferDetail(offerId);
      setDetailOffer(r.offer);
      setVersions(r.versions);
      setDetailOpen(true);
    } catch (e) {
      toast({ title: "Couldn't load offer", description: e instanceof InvestorApiError ? e.message : "Try again.", variant: "destructive" });
    }
  };

  const uploadPof = async (file: File) => {
    setPofBusy(true);
    try {
      await investorApi.uploadPof(file);
      toast({ title: "Proof of funds uploaded", description: "It is attached to your buyer profile for every offer." });
    } catch (e) {
      toast({ title: "Upload failed", description: e instanceof InvestorApiError ? e.message : "Try again.", variant: "destructive" });
    } finally {
      setPofBusy(false);
    }
  };

  const set = <K extends keyof OfferForm>(k: K, v: OfferForm[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  return (
    <InvestorPage title="My offers" subtitle="Structured offers → submitted → countered / accepted / rejected. Every version is kept on record.">
      <LuxePageHeader
        eyebrow="Structured offers"
        title="Offer desk"
        description="Draft, review, and submit structured offers from your mutual-match deal rooms. Nothing submits without your explicit confirmation."
        actions={
          <Button onClick={openBuilder} className="bg-[#D4AF37] font-semibold text-black hover:bg-[#c19b2e]">
            <Plus className="mr-1.5 h-4 w-4" /> New offer
          </Button>
        }
      />

      <div className="mt-6">
        {loading ? (
          <div className="flex min-h-[20vh] items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-[#D4AF37]" /></div>
        ) : structured.length === 0 ? (
          <LuxeEmptyState
            icon={<FileText className="h-6 w-6" />}
            title="No structured offers yet"
            description="Open a deal room after a mutual match and create your first offer there."
            actionLabel="Discover deals"
            onAction={() => setLocation("/investor/discover")}
          />
        ) : (
          <div className="flex flex-col gap-3">
            {structured.map((o) => (
              <Card key={o.id} className="border-white/10 bg-[#121212]">
                <CardContent className="flex flex-wrap items-center justify-between gap-4 p-4">
                  <div>
                    <div className="font-medium text-white">
                      {o.address ?? `Deal #${o.propertyId}`} <span className="text-xs text-neutral-500">· Offer #{o.id} · v{o.versionNumber}</span>
                    </div>
                    <div className="mt-0.5 text-xs text-neutral-500">
                      {o.createdAt ? new Date(o.createdAt).toLocaleDateString() : ""}
                      {o.parentOfferId ? ` · counters #${o.parentOfferId}` : ""}
                      {o.dealRoomId ? (
                        <> · <Link href={`/investor/deal-rooms/${o.dealRoomId}`}><a className="text-[#D4AF37] hover:underline">Deal room</a></Link></>
                      ) : null}
                    </div>
                    <div className="mt-0.5 text-xs text-neutral-400">
                      {fmtStatus(o.financingType)} · {fmtStatus(o.dealStructure)}
                      {o.closingDate ? ` · closes ${new Date(o.closingDate).toLocaleDateString()}` : ""}
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="text-right">
                      <div className="text-lg font-semibold text-[#D4AF37]">{money(o.offerAmount)}</div>
                      <LuxeStatusBadge tone={OFFER_TONE[String(o.status)] ?? "neutral"}>{fmtStatus(o.status)}</LuxeStatusBadge>
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <Button variant="outline" size="sm" onClick={() => openDetail(o.id)}>Versions</Button>
                      {["submitted", "viewed"].includes(String(o.status)) && (
                        <Button variant="ghost" size="sm" className="text-neutral-400" onClick={() => withdraw(o)}>
                          <Undo2 className="mr-1 h-3.5 w-3.5" /> Withdraw
                        </Button>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Classic offers kept */}
      <div className="mt-10">
        <h2 className="font-serif text-xl text-white">Classic offers</h2>
        <p className="mt-1 text-sm text-neutral-400">Quick offers from Discover → LOI. Kept for history.</p>
        <div className="mt-4 flex flex-col gap-3">
          {classic.map((o) => (
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
                  <Badge className={CLASSIC_STATUS_STYLE[o.status] ?? "bg-white/10 text-neutral-300"}>{o.status.replace(/_/g, " ")}</Badge>
                </div>
              </CardContent>
            </Card>
          ))}
          {classic.length === 0 && <p className="text-sm text-neutral-500">None.</p>}
        </div>
      </div>

      {/* Offer builder dialog: form → review → confirm */}
      <LuxeDialog
        open={builderOpen}
        onOpenChange={(open) => { setBuilderOpen(open); if (!open) { setReviewing(false); setDraft(null); } }}
        title={reviewing ? "Review your offer" : "New structured offer"}
        description={reviewing
          ? "Check every detail. Submitting puts the offer on record with the OceanLuxe team."
          : "Draft only — nothing submits until you review and confirm."}
        wide
      >
        {!reviewing ? (
          <div className="flex max-h-[70dvh] flex-col gap-4 overflow-y-auto pr-1">
            <label className="text-sm font-medium">Deal room
              <select
                className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                value={builderRoomId ?? ""}
                onChange={(e) => setBuilderRoomId(e.target.value ? Number(e.target.value) : null)}
              >
                <option value="">Select a deal room…</option>
                {rooms.map((rm) => (
                  <option key={rm.id} value={rm.id}>
                    #{rm.id} · {rm.property.address ?? "Deal"} ({fmtStatus(rm.interestStatus)})
                  </option>
                ))}
              </select>
            </label>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <label className="text-sm font-medium">Offer amount *
                <Input type="number" min={1} value={form.offerAmount || ""} onChange={(e) => set("offerAmount", Number(e.target.value))} className="mt-1" />
              </label>
              <label className="text-sm font-medium">Earnest money deposit
                <Input type="number" min={0} value={form.earnestMoney ?? ""} onChange={(e) => set("earnestMoney", e.target.value ? Number(e.target.value) : null)} className="mt-1" />
              </label>
              <label className="text-sm font-medium">Financing type
                <select className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" value={form.financingType ?? ""} onChange={(e) => set("financingType", e.target.value)}>
                  {FINANCING.map((f) => <option key={f} value={f}>{fmtStatus(f)}</option>)}
                </select>
              </label>
              <label className="text-sm font-medium">Inspection period (days)
                <Input type="number" min={0} value={form.inspectionPeriodDays ?? ""} onChange={(e) => set("inspectionPeriodDays", e.target.value ? Number(e.target.value) : null)} className="mt-1" />
              </label>
              <label className="text-sm font-medium">Closing date *
                <Input type="date" value={form.closingDate ?? ""} onChange={(e) => set("closingDate", e.target.value || null)} className="mt-1" />
              </label>
              <label className="text-sm font-medium">Deal structure
                <select className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" value={form.dealStructure ?? ""} onChange={(e) => set("dealStructure", e.target.value)}>
                  {STRUCTURES.map((f) => <option key={f} value={f}>{fmtStatus(f)}</option>)}
                </select>
              </label>
              <label className="text-sm font-medium">Buyer entity
                <Input value={form.buyerEntity ?? ""} onChange={(e) => set("buyerEntity", e.target.value || null)} placeholder="LLC or entity name" className="mt-1" />
              </label>
              <label className="text-sm font-medium">Authorized signer *
                <Input value={form.authorizedSigner ?? ""} onChange={(e) => set("authorizedSigner", e.target.value || null)} placeholder="Full legal name" className="mt-1" />
              </label>
              <label className="text-sm font-medium">Offer expires
                <Input type="datetime-local" value={form.expirationAt ?? ""} onChange={(e) => set("expirationAt", e.target.value || null)} className="mt-1" />
              </label>
              <label className="text-sm font-medium">Contingencies
                <Input value={(form.contingencies ?? []).join(", ")} onChange={(e) => set("contingencies", e.target.value.split(",").map((s) => s.trim()).filter(Boolean))} placeholder="inspection, financing, title…" className="mt-1" />
              </label>
            </div>
            <label className="text-sm font-medium">Additional terms
              <Textarea value={form.additionalTerms ?? ""} onChange={(e) => set("additionalTerms", e.target.value || null)} rows={3} className="mt-1" />
            </label>
            <label className="text-sm font-medium">Proof of funds attachment
              <Input
                type="file" accept="application/pdf,image/jpeg,image/png,image/webp" className="mt-1"
                disabled={pofBusy}
                onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadPof(f); }}
              />
              <span className="mt-1 block text-xs text-neutral-500">POF is stored on your buyer profile and referenced by every offer you make.</span>
            </label>
            <Button onClick={saveDraftAndReview} disabled={saving} className="bg-[#D4AF37] font-semibold text-black hover:bg-[#c19b2e]">
              {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null} Save draft & review
            </Button>
          </div>
        ) : draft ? (
          <div className="flex flex-col gap-4">
            <div className="grid grid-cols-2 gap-3 text-sm">
              {[
                ["Offer amount", money(draft.offerAmount)],
                ["Earnest money", money(draft.earnestMoney)],
                ["Financing", fmtStatus(draft.financingType)],
                ["Inspection period", draft.inspectionPeriodDays != null ? `${draft.inspectionPeriodDays} days` : "—"],
                ["Closing date", draft.closingDate ? new Date(draft.closingDate).toLocaleDateString() : "—"],
                ["Deal structure", fmtStatus(draft.dealStructure)],
                ["Buyer entity", draft.buyerEntity ?? "—"],
                ["Authorized signer", draft.authorizedSigner ?? "—"],
                ["Expires", draft.expirationAt ? new Date(draft.expirationAt).toLocaleString() : "—"],
                ["Contingencies", draft.contingencies.length ? draft.contingencies.join(", ") : "—"],
              ].map(([label, value]) => (
                <div key={label} className="rounded-lg border border-border/60 p-3">
                  <p className="text-[11px] uppercase tracking-[0.12em] text-muted-foreground">{label}</p>
                  <p className="mt-1 font-medium">{value}</p>
                </div>
              ))}
            </div>
            {draft.additionalTerms && (
              <div className="rounded-lg border border-border/60 p-3 text-sm">
                <p className="text-[11px] uppercase tracking-[0.12em] text-muted-foreground">Additional terms</p>
                <p className="mt-1">{draft.additionalTerms}</p>
              </div>
            )}
            <p className="rounded-lg border border-oxblood/30 bg-oxblood/5 p-3 text-sm text-muted-foreground">
              Submitting puts offer #{draft.id} on record with the OceanLuxe team. It cannot be edited after submit — only withdrawn, or countered by the team.
            </p>
            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" onClick={() => setReviewing(false)}>Back to edit</Button>
              <Button onClick={submit} disabled={saving} className="flex-1 bg-[#D4AF37] font-semibold text-black hover:bg-[#c19b2e]">
                {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CheckCircle2 className="mr-2 h-4 w-4" />}
                Submit offer
              </Button>
            </div>
          </div>
        ) : null}
      </LuxeDialog>

      {/* Version history dialog */}
      <LuxeDialog
        open={detailOpen}
        onOpenChange={setDetailOpen}
        title={detailOffer ? `Offer #${detailOffer.id} · version history` : "Offer detail"}
        description={detailOffer ? `Status: ${fmtStatus(detailOffer.status)}${detailOffer.parentOfferId ? ` · counters offer #${detailOffer.parentOfferId}` : ""}` : undefined}
        wide
      >
        {detailOffer && (
          <div className="flex flex-col gap-4">
            <div className="flex items-center gap-3">
              <span className="font-serif text-2xl font-semibold text-primary">{money(detailOffer.offerAmount)}</span>
              <LuxeStatusBadge tone={OFFER_TONE[String(detailOffer.status)] ?? "neutral"}>{fmtStatus(detailOffer.status)}</LuxeStatusBadge>
            </div>
            <LuxeTimeline
              items={versions.map((v, i): LuxeTimelineItem => ({
                id: v.versionNumber ?? i,
                title: `Version ${v.versionNumber ?? "?"}`,
                description: typeof v.snapshot === "object" && v.snapshot !== null
                  ? `${fmtStatus(String((v.snapshot as Record<string, unknown>).status))} · ${money(String((v.snapshot as Record<string, unknown>).offerAmount ?? ""))}${(v.snapshot as Record<string, unknown>).note ? ` — ${String((v.snapshot as Record<string, unknown>).note)}` : ""}`
                  : undefined,
                time: v.createdAt ? new Date(v.createdAt).toLocaleString() : undefined,
                tone: i === versions.length - 1 ? "gold" : "default",
              }))}
            />
            <p className="text-xs text-muted-foreground">Versions are immutable snapshots — a counteroffer creates a new offer row, never an overwrite.</p>
            <div className={cn("flex gap-2")}>
              {["submitted", "viewed"].includes(String(detailOffer.status)) && (
                <Button variant="outline" onClick={() => { withdraw(detailOffer); setDetailOpen(false); }}>
                  <Undo2 className="mr-1.5 h-4 w-4" /> Withdraw
                </Button>
              )}
              <Button variant="outline" onClick={() => setDetailOpen(false)}>Close</Button>
            </div>
          </div>
        )}
      </LuxeDialog>
    </InvestorPage>
  );
}
