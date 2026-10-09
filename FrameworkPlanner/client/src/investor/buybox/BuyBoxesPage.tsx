/**
 * Buy Boxes management (Phase 10): the investor's named buy boxes.
 *
 * Each box carries an active/paused state, hard requirements, flexible
 * preferences, exclusions, notification frequency, team ownership, match
 * history, plus duplicate and archive actions.
 */
import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import {
  Loader2, Plus, Pencil, Copy, Pause, Play, Archive, ArchiveRestore, History, Boxes, Check,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import {
  investorApi, InvestorApiError, money,
  type NamedBuyBox, type BuyBoxCreateInput, type BuyBoxMatchEntry, type NotifyFrequency,
} from "../api";
import { RequireInvestor } from "../InvestorLayout";
import {
  LuxePageHeader, LuxeSection, LuxeStatusBadge, LuxeEmptyState,
  LuxeDialog, LuxeMobileCard, LuxeMobileCardRow, LuxeTimeline, type LuxeTimelineItem,
} from "@/components/luxe";
import { US_STATES, PROPERTY_TYPES, STRATEGIES, NOTIFY_FREQUENCIES } from "../onboarding/profile";

type ReqMap = Record<string, unknown>;

function strList(v: unknown): string[] {
  return Array.isArray(v) ? v.map((x) => String(x)) : [];
}
function numOrNull(v: unknown): number | null {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

function Chip({ selected, onClick, children }: { selected: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-full border px-3 py-1.5 text-sm transition-colors",
        selected
          ? "border-primary bg-primary/15 text-primary"
          : "border-border text-muted-foreground hover:border-foreground/40 hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}

function toggle(list: string[], v: string): string[] {
  return list.includes(v) ? list.filter((x) => x !== v) : [...list, v];
}

function TagInput({ value, onChange, placeholder }: { value: string[]; onChange: (v: string[]) => void; placeholder: string }) {
  const [draft, setDraft] = useState("");
  const add = () => {
    const v = draft.trim();
    if (v && !value.includes(v)) onChange([...value, v]);
    setDraft("");
  };
  return (
    <div>
      <div className="flex gap-2">
        <Input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); add(); } }}
          placeholder={placeholder}
          className="border-border bg-background text-foreground"
        />
        <Button type="button" variant="outline" onClick={add}>Add</Button>
      </div>
      {value.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {value.map((v) => (
            <Badge key={v} variant="outline" className="cursor-pointer border-primary/50 text-primary" onClick={() => onChange(value.filter((x) => x !== v))}>
              {v} ✕
            </Badge>
          ))}
        </div>
      )}
    </div>
  );
}

type BoxForm = {
  name: string;
  notifyFrequency: NotifyFrequency;
  targetStates: string[];
  targetZips: string[];
  propertyTypes: string[];
  strategies: string[];
  priceMin: string;
  priceMax: string;
  prefNotes: string;
  dealBreakers: string[];
  seedFromProfile: boolean;
};

const EMPTY_FORM: BoxForm = {
  name: "",
  notifyFrequency: "digest",
  targetStates: [],
  targetZips: [],
  propertyTypes: [],
  strategies: [],
  priceMin: "",
  priceMax: "",
  prefNotes: "",
  dealBreakers: [],
  seedFromProfile: false,
};

function formFromBox(box: NamedBuyBox): BoxForm {
  const hard: ReqMap = box.hardRequirements ?? {};
  const prefs: ReqMap = box.preferences ?? {};
  const excl: ReqMap = box.exclusions ?? {};
  const priceMin = numOrNull(hard.priceMin);
  const priceMax = numOrNull(hard.priceMax);
  return {
    name: box.name,
    notifyFrequency: box.notifyFrequency,
    targetStates: strList(hard.targetStates),
    targetZips: strList(hard.targetZips),
    propertyTypes: strList(hard.propertyTypes),
    strategies: strList(hard.strategies),
    priceMin: priceMin === null ? "" : String(priceMin),
    priceMax: priceMax === null ? "" : String(priceMax),
    prefNotes: typeof prefs.notes === "string" ? prefs.notes : "",
    dealBreakers: strList(excl.dealBreakers),
    seedFromProfile: false,
  };
}

function formToInput(form: BoxForm): BuyBoxCreateInput {
  const priceMin = form.priceMin.trim() === "" ? null : Number(form.priceMin);
  const priceMax = form.priceMax.trim() === "" ? null : Number(form.priceMax);
  return {
    name: form.name.trim(),
    notifyFrequency: form.notifyFrequency,
    hardRequirements: {
      targetStates: form.targetStates,
      targetZips: form.targetZips,
      propertyTypes: form.propertyTypes,
      strategies: form.strategies,
      ...(Number.isFinite(priceMin) ? { priceMin } : {}),
      ...(Number.isFinite(priceMax) ? { priceMax } : {}),
    },
    preferences: form.prefNotes.trim() ? { notes: form.prefNotes.trim() } : {},
    exclusions: form.dealBreakers.length ? { dealBreakers: form.dealBreakers } : {},
    seedFromProfile: form.seedFromProfile,
  };
}

function requirementSummary(box: NamedBuyBox): string {
  const hard: ReqMap = box.hardRequirements ?? {};
  const parts: string[] = [];
  const states = strList(hard.targetStates);
  const zips = strList(hard.targetZips);
  if (states.length) parts.push(states.slice(0, 4).join(", ") + (states.length > 4 ? ` +${states.length - 4}` : ""));
  if (zips.length) parts.push(`${zips.length} zip${zips.length === 1 ? "" : "s"}`);
  const types = strList(hard.propertyTypes);
  if (types.length) parts.push(types.slice(0, 3).join(", ") + (types.length > 3 ? ` +${types.length - 3}` : ""));
  const priceMin = numOrNull(hard.priceMin);
  const priceMax = numOrNull(hard.priceMax);
  if (priceMin !== null || priceMax !== null) {
    parts.push(priceMin !== null && priceMax !== null ? `${money(priceMin)}–${money(priceMax)}` : priceMin !== null ? `${money(priceMin)}+` : `up to ${money(priceMax as number)}`);
  }
  return parts.length ? parts.join(" · ") : "No requirements set yet";
}

export function BuyBoxesPage() {
  return (
    <RequireInvestor>
      <BuyBoxesBody />
    </RequireInvestor>
  );
}

function BuyBoxesBody() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [boxes, setBoxes] = useState<NamedBuyBox[]>([]);
  const [archived, setArchived] = useState<NamedBuyBox[]>([]);
  const [showArchived, setShowArchived] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<NamedBuyBox | null>(null);
  const [form, setForm] = useState<BoxForm>({ ...EMPTY_FORM });
  const [saving, setSaving] = useState(false);
  const [historyBox, setHistoryBox] = useState<NamedBuyBox | null>(null);
  const [history, setHistory] = useState<BuyBoxMatchEntry[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [busyId, setBusyId] = useState<number | null>(null);

  const refresh = async () => {
    const [live, all] = await Promise.all([
      investorApi.listBuyBoxes(false),
      investorApi.listBuyBoxes(true),
    ]);
    setBoxes(live.boxes);
    setArchived(all.boxes.filter((b) => b.isArchived));
  };

  useEffect(() => {
    refresh().catch(() => null).finally(() => setLoading(false));
  }, []);

  const fail = (e: unknown, fallback: string) =>
    toast({ title: fallback, description: e instanceof InvestorApiError ? e.message : "Try again.", variant: "destructive" });

  const openCreate = () => {
    setEditing(null);
    setForm({ ...EMPTY_FORM });
    setDialogOpen(true);
  };

  const openEdit = (box: NamedBuyBox) => {
    setEditing(box);
    setForm(formFromBox(box));
    setDialogOpen(true);
  };

  const saveForm = async () => {
    if (!form.name.trim()) {
      toast({ title: "Name your buy box", description: "Give it a name like “Orlando Rentals”.", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      if (editing) {
        await investorApi.updateBuyBox(editing.id, formToInput(form));
        toast({ title: "Buy box updated" });
      } else {
        await investorApi.createBuyBox(formToInput(form));
        toast({ title: "Buy box created" });
      }
      setDialogOpen(false);
      await refresh();
    } catch (e) {
      fail(e, "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const act = async (id: number, fn: (i: number) => Promise<unknown>, label: string) => {
    setBusyId(id);
    try {
      await fn(id);
      toast({ title: label });
      await refresh();
    } catch (e) {
      fail(e, label + " failed");
    } finally {
      setBusyId(null);
    }
  };

  const openHistory = async (box: NamedBuyBox) => {
    setHistoryBox(box);
    setHistoryLoading(true);
    try {
      const r = await investorApi.buyBoxMatches(box.id, 30);
      setHistory(r.matches);
    } catch (e) {
      fail(e, "Could not load match history");
    } finally {
      setHistoryLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const boxCard = (box: NamedBuyBox) => (
    <LuxeMobileCard key={box.id} className="p-0">
      <div className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="truncate font-serif text-lg font-medium tracking-tight">{box.name}</h3>
            <p className="mt-1 text-xs text-muted-foreground">{requirementSummary(box)}</p>
          </div>
          <div className="flex shrink-0 flex-col items-end gap-1.5">
            {box.isArchived ? (
              <LuxeStatusBadge tone="neutral">Archived</LuxeStatusBadge>
            ) : box.isActive ? (
              <LuxeStatusBadge tone="verified" dot>Active</LuxeStatusBadge>
            ) : (
              <LuxeStatusBadge tone="neutral">Paused</LuxeStatusBadge>
            )}
            <LuxeStatusBadge tone="gold">{box.notifyFrequency}</LuxeStatusBadge>
          </div>
        </div>
        <div className="mt-3">
          <LuxeMobileCardRow label="Matches recorded" value={box.matchCount} />
          <LuxeMobileCardRow
            label="Last match"
            value={box.lastMatchedAt ? new Date(box.lastMatchedAt).toLocaleDateString() : "—"}
          />
        </div>
        <div className="mt-3 flex flex-wrap gap-1.5 border-t border-border/60 pt-3">
          <Button size="sm" variant="outline" disabled={busyId === box.id} onClick={() => openHistory(box)}>
            <History className="mr-1.5 h-3.5 w-3.5" /> History
          </Button>
          {!box.isArchived && (
            <>
              <Button size="sm" variant="outline" disabled={busyId === box.id} onClick={() => openEdit(box)}>
                <Pencil className="mr-1.5 h-3.5 w-3.5" /> Edit
              </Button>
              {box.isActive ? (
                <Button size="sm" variant="outline" disabled={busyId === box.id} onClick={() => act(box.id, investorApi.pauseBuyBox, "Buy box paused")}>
                  <Pause className="mr-1.5 h-3.5 w-3.5" /> Pause
                </Button>
              ) : (
                <Button size="sm" variant="outline" disabled={busyId === box.id} onClick={() => act(box.id, investorApi.resumeBuyBox, "Buy box resumed")}>
                  <Play className="mr-1.5 h-3.5 w-3.5" /> Resume
                </Button>
              )}
              <Button size="sm" variant="outline" disabled={busyId === box.id} onClick={() => act(box.id, investorApi.duplicateBuyBox, "Buy box duplicated")}>
                <Copy className="mr-1.5 h-3.5 w-3.5" /> Duplicate
              </Button>
              <Button size="sm" variant="outline" disabled={busyId === box.id} onClick={() => act(box.id, investorApi.archiveBuyBox, "Buy box archived")}>
                <Archive className="mr-1.5 h-3.5 w-3.5" /> Archive
              </Button>
            </>
          )}
          {box.isArchived && (
            <Button size="sm" variant="outline" disabled={busyId === box.id} onClick={() => act(box.id, investorApi.restoreBuyBox, "Buy box restored")}>
              <ArchiveRestore className="mr-1.5 h-3.5 w-3.5" /> Restore
            </Button>
          )}
        </div>
      </div>
    </LuxeMobileCard>
  );

  return (
    <div>
      <LuxePageHeader
        eyebrow="Deal Matchroom"
        title="Buy boxes"
        description="One box per strategy, market, or team lane. Pause what is stale, duplicate what works, archive what is done."
        actions={
          <Button onClick={openCreate}>
            <Plus className="mr-2 h-4 w-4" /> New buy box
          </Button>
        }
      />

      <div className="mt-6 flex flex-col gap-4">
        {boxes.length === 0 ? (
          <LuxeEmptyState
            icon={<Boxes className="h-5 w-5" />}
            title="No buy boxes yet"
            description="Create one for each lane you buy in — “Orlando Rentals”, “Central Florida Flips”, “Michigan Buy and Hold”. Matches score against every active box."
            actionLabel="Create your first buy box"
            onAction={openCreate}
          />
        ) : (
          boxes.map(boxCard)
        )}
      </div>

      {archived.length > 0 && (
        <div className="mt-10">
          <button
            type="button"
            onClick={() => setShowArchived(!showArchived)}
            className="text-sm font-medium text-muted-foreground hover:text-foreground"
          >
            {showArchived ? "Hide" : "Show"} archived ({archived.length})
          </button>
          {showArchived && <div className="mt-4 flex flex-col gap-4">{archived.map(boxCard)}</div>}
        </div>
      )}

      {/* Create / edit dialog */}
      <LuxeDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        title={editing ? "Edit buy box" : "New buy box"}
        description={editing ? `Update ${editing.name}.` : "Name it, set the hard requirements, add your flexibilities and exclusions."}
        wide
      >
        <div className="flex flex-col gap-6">
          <div>
            <Label className="text-muted-foreground">Name *</Label>
            <Input
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="e.g. Orlando Rentals"
              className="mt-1.5 border-border bg-background text-foreground"
            />
          </div>

          {!editing && (
            <button
              type="button"
              onClick={() => setForm({ ...form, seedFromProfile: !form.seedFromProfile })}
              className="flex items-start gap-3 rounded-lg border border-border px-4 py-3 text-left text-sm"
            >
              <span className={cn("mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded border", form.seedFromProfile ? "border-primary bg-primary text-primary-foreground" : "border-border")}>
                {form.seedFromProfile && <Check className="h-3.5 w-3.5" />}
              </span>
              <span>
                <span className="font-medium text-foreground">Seed from my profile</span>
                <span className="mt-0.5 block text-xs text-muted-foreground">Copy markets, price band, and strategies from your investor profile as the hard requirements.</span>
              </span>
            </button>
          )}

          <LuxeSection title="Hard requirements" description="Deals must clear these to score." contentClassName="pt-4">
            <div className="flex flex-col gap-5">
              <div>
                <Label className="text-muted-foreground">States</Label>
                <div className="mt-2 flex max-h-36 flex-wrap gap-1.5 overflow-y-auto">
                  {US_STATES.map((st) => (
                    <Chip key={st} selected={form.targetStates.includes(st)} onClick={() => setForm({ ...form, targetStates: toggle(form.targetStates, st) })}>{st}</Chip>
                  ))}
                </div>
              </div>
              <div>
                <Label className="text-muted-foreground">Zip codes</Label>
                <div className="mt-2">
                  <TagInput value={form.targetZips} onChange={(v) => setForm({ ...form, targetZips: v })} placeholder="32801" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="text-muted-foreground">Min price ($)</Label>
                  <Input type="number" min={0} value={form.priceMin} onChange={(e) => setForm({ ...form, priceMin: e.target.value })} className="mt-1.5 border-border bg-background text-foreground" />
                </div>
                <div>
                  <Label className="text-muted-foreground">Max price ($)</Label>
                  <Input type="number" min={0} value={form.priceMax} onChange={(e) => setForm({ ...form, priceMax: e.target.value })} className="mt-1.5 border-border bg-background text-foreground" />
                </div>
              </div>
              <div>
                <Label className="text-muted-foreground">Property types</Label>
                <div className="mt-2 flex flex-wrap gap-2">
                  {PROPERTY_TYPES.map((t) => (
                    <Chip key={t.id} selected={form.propertyTypes.includes(t.id)} onClick={() => setForm({ ...form, propertyTypes: toggle(form.propertyTypes, t.id) })}>{t.label}</Chip>
                  ))}
                </div>
              </div>
              <div>
                <Label className="text-muted-foreground">Strategies</Label>
                <div className="mt-2 flex flex-wrap gap-2">
                  {STRATEGIES.map((s) => (
                    <Chip key={s.id} selected={form.strategies.includes(s.id)} onClick={() => setForm({ ...form, strategies: toggle(form.strategies, s.id) })}>{s.label}</Chip>
                  ))}
                </div>
              </div>
            </div>
          </LuxeSection>

          <LuxeSection title="Flexible preferences" description="Nice-to-haves that nudge the score up." contentClassName="pt-4">
            <Label className="text-muted-foreground">Notes</Label>
            <Textarea
              value={form.prefNotes}
              onChange={(e) => setForm({ ...form, prefNotes: e.target.value })}
              placeholder="e.g. Prefer corner lots and newer roofs; open to light cosmetic rehabs."
              className="mt-1.5 border-border bg-background text-foreground"
            />
          </LuxeSection>

          <LuxeSection title="Exclusions" description="Hard no's for this box." contentClassName="pt-4">
            <Label className="text-muted-foreground">Deal-breakers</Label>
            <div className="mt-2">
              <TagInput value={form.dealBreakers} onChange={(v) => setForm({ ...form, dealBreakers: v })} placeholder="e.g. flood zones" />
            </div>
          </LuxeSection>

          <div>
            <Label className="text-muted-foreground">Match alerts for this box</Label>
            <div className="mt-2 flex flex-wrap gap-2">
              {NOTIFY_FREQUENCIES.map((f) => (
                <Chip key={f.id} selected={form.notifyFrequency === f.id} onClick={() => setForm({ ...form, notifyFrequency: f.id })}>
                  {f.label}
                </Chip>
              ))}
            </div>
          </div>

          <div className="flex justify-end gap-2 border-t border-border pt-4">
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button disabled={saving} onClick={saveForm}>
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {editing ? "Save changes" : "Create buy box"}
            </Button>
          </div>
        </div>
      </LuxeDialog>

      {/* Match history dialog */}
      <LuxeDialog
        open={historyBox !== null}
        onOpenChange={(open) => { if (!open) setHistoryBox(null); }}
        title={historyBox ? `Match history — ${historyBox.name}` : "Match history"}
        description="Every deal this box has scored, newest first."
      >
        {historyLoading ? (
          <div className="flex items-center justify-center py-10">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
          </div>
        ) : history.length === 0 ? (
          <LuxeEmptyState title="No matches yet" description="When this box scores a deal, the match is recorded here." />
        ) : (
          <LuxeTimeline
            items={history.map((m): LuxeTimelineItem => ({
              id: m.id,
              title: m.address ? `${m.address}${m.city ? ` — ${m.city}` : ""}` : `Property #${m.propertyId ?? "?"}`,
              description: m.reasons.length ? m.reasons.slice(0, 3).join(" · ") : undefined,
              time: m.matchedAt ? new Date(m.matchedAt).toLocaleDateString() : undefined,
              tone: m.score >= 70 ? "gold" : m.score >= 40 ? "default" : "default",
            }))}
          />
        )}
      </LuxeDialog>
    </div>
  );
}
