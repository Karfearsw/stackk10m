/**
 * Locked-Up workspace (Phase 15): the investor's deals under contract,
 * moving through Awaiting Deposit → Due Diligence → Title → Funding →
 * Ready to Close → Closed (or At Risk).
 *
 * A deal appears here ONLY after passing the server-side locked-up gate
 * (fully executed agreement, all signers done, effective/expiration/closing
 * dates set, earnest money recorded). Never from likes, saves, matches, or
 * verbal acceptance.
 */
import { useEffect, useMemo, useState } from "react";
import { Link } from "wouter";
import {
  AlertTriangle,
  CalendarDays,
  LayoutGrid,
  Loader2,
  Lock,
  Table2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import {
  LuxePageHeader,
  LuxePropertyCard,
  LuxeStatusBadge,
  LuxeSection,
  LuxeEmptyState,
  LuxeDialog,
  LuxeDataTable,
  type LuxeColumn,
  LuxeMobileCard,
  LuxeMobileCardRow,
  LuxeTimeline,
  type LuxeTimelineItem,
  LuxeDocumentStatus,
  type LuxeDocState,
} from "@/components/luxe";
import { RequireInvestor } from "../InvestorLayout";
import {
  lockedUpApi,
  InvestorApiError,
  money,
  formatDate,
  formatDateTime,
  LOCKED_UP_STAGES,
  type LockedUpDeal,
  type LockedUpStage,
  type ContractStage,
  type DealCondition,
  type TimelineEvent,
} from "./api";

const DOC_STATE_MAP: Record<ContractStage, LuxeDocState> = {
  draft: "draft",
  internal_review: "internal_review",
  attorney_review: "attorney_review",
  ready: "ready",
  sent: "sent",
  delivered: "sent",
  opened: "opened",
  partially_signed: "partially_signed",
  executed: "executed",
  declined: "declined",
  voided: "voided",
  expired: "expired",
  superseded: "voided",
};

const STAGE_BADGE: Record<LockedUpStage, "gold" | "neutral" | "verified" | "oxblood" | "info"> = {
  awaiting_deposit: "gold",
  due_diligence: "info",
  title: "info",
  funding: "info",
  ready_to_close: "verified",
  closed: "verified",
  at_risk: "oxblood",
};

function emdTone(status: string | null): "verified" | "gold" | "neutral" {
  if (status === "deposited") return "verified";
  if (status === "pending") return "gold";
  return "neutral";
}

function emdLabel(status: string | null): string {
  if (!status) return "—";
  return status.split("_").map((w) => w[0].toUpperCase() + w.slice(1)).join(" ");
}

type View = "board" | "table" | "calendar";

export function LockedUpWorkspacePage() {
  return (
    <RequireInvestor>
      <LockedUpBody />
    </RequireInvestor>
  );
}

function LockedUpBody() {
  const { toast } = useToast();
  const [deals, setDeals] = useState<LockedUpDeal[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<View>("board");
  const [mobileStage, setMobileStage] = useState<LockedUpStage | "all">("all");
  const [selected, setSelected] = useState<LockedUpDeal | null>(null);

  const load = () => {
    setLoading(true);
    lockedUpApi.deals()
      .then((r) => setDeals(r.deals))
      .catch((e) => toast({
        title: "Couldn't load locked-up deals",
        description: e instanceof InvestorApiError ? e.message : "Try again.",
        variant: "destructive",
      }))
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  const grouped = useMemo(() => {
    const map = new Map<LockedUpStage, LockedUpDeal[]>();
    for (const s of LOCKED_UP_STAGES) map.set(s.value, []);
    for (const d of deals) {
      const list = map.get(d.stage) ?? map.get("awaiting_deposit");
      if (list) list.push(d);
    }
    return map;
  }, [deals]);

  const mobileDeals = mobileStage === "all" ? deals : deals.filter((d) => d.stage === mobileStage);

  const switcher = (
    <div className="flex rounded-lg border border-white/10 bg-white/5 p-1" role="tablist" aria-label="View">
      {(
        [
          { v: "board", label: "Board", Icon: LayoutGrid },
          { v: "table", label: "Table", Icon: Table2 },
          { v: "calendar", label: "Calendar", Icon: CalendarDays },
        ] as const
      ).map(({ v, label, Icon }) => (
        <button
          key={v}
          role="tab"
          aria-selected={view === v}
          onClick={() => setView(v)}
          className={cn(
            "flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
            view === v ? "bg-[#D4AF37] text-black" : "text-neutral-400 hover:text-white",
          )}
        >
          <Icon className="h-3.5 w-3.5" aria-hidden />
          <span className="hidden sm:inline">{label}</span>
        </button>
      ))}
    </div>
  );

  return (
    <div>
      <LuxePageHeader
        eyebrow="Deal Matchroom"
        title="Locked Up"
        description="Deals under fully executed contract. A deal lands here only after every contractual requirement is met — never from interest or a handshake."
        actions={switcher}
      />

      {loading ? (
        <div className="flex min-h-[40vh] items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-[#D4AF37]" />
        </div>
      ) : deals.length === 0 ? (
        <div className="mt-6">
          <LuxeEmptyState
            icon={<Lock className="h-6 w-6" aria-hidden />}
            title="No locked-up deals yet"
            description="When a contract is fully executed and every requirement is satisfied — signatures, dates, earnest money — the deal moves here through the locked-up gate."
            actionLabel="Review my offers"
            onAction={() => { window.location.href = "/investor/offers"; }}
          />
        </div>
      ) : (
        <div className="mt-6">
          {/* Mobile: filter chips + stacked cards */}
          <div className="lg:hidden">
            <div className="mb-4 flex gap-2 overflow-x-auto pb-1">
              <FilterChip active={mobileStage === "all"} onClick={() => setMobileStage("all")} label="All" />
              {LOCKED_UP_STAGES.map((s) => (
                <FilterChip
                  key={s.value}
                  active={mobileStage === s.value}
                  onClick={() => setMobileStage(s.value)}
                  label={s.label}
                />
              ))}
            </div>
            <div className="flex flex-col gap-3">
              {mobileDeals.map((d) => (
                <DealMobileCard key={d.id} deal={d} onOpen={() => setSelected(d)} />
              ))}
              {mobileDeals.length === 0 && (
                <LuxeEmptyState title="Nothing at this stage" description="No locked-up deals at this stage right now." />
              )}
            </div>
          </div>

          {/* Desktop views */}
          <div className="hidden lg:block">
            {view === "board" && <BoardView grouped={grouped} onOpen={setSelected} />}
            {view === "table" && <TableView deals={deals} onOpen={setSelected} />}
            {view === "calendar" && <CalendarView deals={deals} onOpen={setSelected} />}
          </div>
        </div>
      )}

      <DealDetailDialog deal={selected} onClose={() => setSelected(null)} onChanged={load} />
    </div>
  );
}

function FilterChip({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "shrink-0 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
        active
          ? "border-[#D4AF37]/60 bg-[#D4AF37]/15 text-[#D4AF37]"
          : "border-white/10 bg-white/5 text-neutral-400 hover:text-white",
      )}
    >
      {label}
    </button>
  );
}

/** Compact card for the board columns. */
function BoardCard({ deal, onOpen }: { deal: LockedUpDeal; onOpen: () => void }) {
  const c = deal.contract;
  const critical = deal.risks.filter((r) => r.severity === "critical");
  return (
    <button
      onClick={onOpen}
      className="w-full rounded-lg border border-white/10 bg-[#121212] p-3 text-left transition-colors hover:border-[#D4AF37]/40"
    >
      <div className="flex items-start justify-between gap-2">
        <p className="min-w-0 flex-1 truncate font-serif text-sm font-medium text-white">
          {deal.property?.address ?? `Deal #${deal.id}`}
        </p>
        {critical.length > 0 && <AlertTriangle className="h-4 w-4 shrink-0 text-[#8B1E1E]" aria-label="At risk" />}
      </div>
      <p className="mt-0.5 text-xs text-neutral-500">
        {[deal.property?.city, deal.property?.state].filter(Boolean).join(", ")}
      </p>
      <div className="mt-2 flex items-baseline justify-between text-sm">
        <span className="font-semibold text-[#D4AF37]">{money(c?.assignmentPrice ?? null)}</span>
        <span className="text-xs text-neutral-500">Close {formatDate(c?.closingDate)}</span>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        <LuxeStatusBadge tone={emdTone(c?.emdStatus ?? null)}>EMD {emdLabel(c?.emdStatus ?? null)}</LuxeStatusBadge>
        {c && (
          <LuxeDocumentStatus
            state={DOC_STATE_MAP[c.stage]}
            signersCompleted={c.signersDone}
            signersTotal={c.signersTotal}
          />
        )}
      </div>
      {deal.nextAction && <p className="mt-2 truncate text-xs text-neutral-400">Next: {deal.nextAction}</p>}
    </button>
  );
}

function BoardView({
  grouped,
  onOpen,
}: {
  grouped: Map<LockedUpStage, LockedUpDeal[]>;
  onOpen: (d: LockedUpDeal) => void;
}) {
  return (
    <div className="flex gap-4 overflow-x-auto pb-4">
      {LOCKED_UP_STAGES.map((s) => {
        const list = grouped.get(s.value) ?? [];
        return (
          <section key={s.value} className="w-72 shrink-0" aria-label={s.label}>
            <header className="mb-3 flex items-center justify-between">
              <h2 className="text-xs font-semibold uppercase tracking-[0.14em] text-neutral-400">{s.label}</h2>
              <span className="rounded-full bg-white/5 px-2 py-0.5 text-xs text-neutral-500">{list.length}</span>
            </header>
            <div className="flex flex-col gap-3">
              {list.map((d) => (
                <BoardCard key={d.id} deal={d} onOpen={() => onOpen(d)} />
              ))}
              {list.length === 0 && (
                <p className="rounded-lg border border-dashed border-white/10 p-4 text-center text-xs text-neutral-600">
                  No deals here
                </p>
              )}
            </div>
          </section>
        );
      })}
    </div>
  );
}

const dealColumns: LuxeColumn<LockedUpDeal>[] = [
  {
    key: "property",
    header: "Property",
    render: (d) => (
      <div>
        <p className="font-medium text-white">{d.property?.address ?? `Deal #${d.id}`}</p>
        <p className="text-xs text-neutral-500">{[d.property?.city, d.property?.state].filter(Boolean).join(", ")}</p>
      </div>
    ),
  },
  {
    key: "contract",
    header: "Contract",
    render: (d) => (
      <div className="text-xs">
        <p className="text-neutral-300">{d.contract?.contractType ?? "—"}</p>
        <p className="text-neutral-500">
          {d.contract?.parties.seller ?? "—"} → {d.contract?.parties.buyer ?? "—"}
        </p>
      </div>
    ),
    hideOnMobile: true,
  },
  {
    key: "acq",
    header: "Acquisition",
    render: (d) => <span className="font-medium text-white">{money(d.contract?.acquisitionPrice ?? null)}</span>,
  },
  {
    key: "resale",
    header: "Resale",
    render: (d) => <span className="font-medium text-[#D4AF37]">{money(d.contract?.assignmentPrice ?? null)}</span>,
    hideOnMobile: true,
  },
  {
    key: "emd",
    header: "EMD",
    render: (d) => (
      <div className="text-xs">
        <p className="text-white">{money(d.contract?.emdAmount ?? null)}</p>
        <LuxeStatusBadge tone={emdTone(d.contract?.emdStatus ?? null)}>{emdLabel(d.contract?.emdStatus ?? null)}</LuxeStatusBadge>
      </div>
    ),
  },
  {
    key: "dates",
    header: "Key dates",
    render: (d) => (
      <div className="text-xs text-neutral-400">
        <p>Insp: {formatDate(d.contract?.inspectionDeadline)}</p>
        <p>Exp: {formatDate(d.contract?.expirationDate)}</p>
        <p>Close: {formatDate(d.contract?.closingDate)}</p>
      </div>
    ),
    hideOnMobile: true,
  },
  {
    key: "signature",
    header: "Signature",
    render: (d) =>
      d.contract ? (
        <LuxeDocumentStatus
          state={DOC_STATE_MAP[d.contract.stage]}
          signersCompleted={d.contract.signersDone}
          signersTotal={d.contract.signersTotal}
        />
      ) : (
        <span className="text-neutral-600">—</span>
      ),
  },
  {
    key: "stage",
    header: "Stage",
    render: (d) => <LuxeStatusBadge tone={STAGE_BADGE[d.stage]}>{d.stageLabel}</LuxeStatusBadge>,
  },
  {
    key: "next",
    header: "Next action",
    render: (d) => <span className="text-xs text-neutral-400">{d.nextAction ?? "—"}</span>,
    hideOnMobile: true,
  },
  {
    key: "risk",
    header: "Risk",
    render: (d) =>
      d.risks.some((r) => r.severity === "critical") ? (
        <LuxeStatusBadge tone="oxblood">
          <AlertTriangle className="h-3 w-3" aria-hidden /> At risk
        </LuxeStatusBadge>
      ) : d.risks.length > 0 ? (
        <LuxeStatusBadge tone="gold">Watch</LuxeStatusBadge>
      ) : (
        <span className="text-xs text-neutral-600">Clear</span>
      ),
  },
];

function TableView({ deals, onOpen }: { deals: LockedUpDeal[]; onOpen: (d: LockedUpDeal) => void }) {
  return (
    <LuxeDataTable
      columns={dealColumns}
      rows={deals}
      keyOf={(d) => d.id}
      onRowClick={onOpen}
      emptyTitle="No locked-up deals"
      emptyDescription="Deals appear here after passing the locked-up gate."
    />
  );
}

function CalendarView({ deals, onOpen }: { deals: LockedUpDeal[]; onOpen: (d: LockedUpDeal) => void }) {
  const [cursor, setCursor] = useState(() => {
    const n = new Date();
    return { y: n.getFullYear(), m: n.getMonth() };
  });

  const cells = useMemo(() => {
    const first = new Date(cursor.y, cursor.m, 1);
    const start = new Date(first);
    start.setDate(1 - first.getDay());
    return Array.from({ length: 42 }, (_, i) => {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      return d;
    });
  }, [cursor]);

  const eventsByDay = useMemo(() => {
    const map = new Map<string, Array<{ deal: LockedUpDeal; label: string; tone: "gold" | "oxblood" | "neutral" }>>();
    const push = (iso: string | null, deal: LockedUpDeal, label: string, tone: "gold" | "oxblood" | "neutral") => {
      if (!iso) return;
      const key = new Date(iso).toISOString().split("T")[0];
      const list = map.get(key) ?? [];
      list.push({ deal, label, tone });
      map.set(key, list);
    };
    for (const d of deals) {
      push(d.contract?.closingDate ?? null, d, "Closing", "gold");
      push(d.contract?.inspectionDeadline ?? null, d, "Inspection deadline", "oxblood");
      push(d.contract?.expirationDate ?? null, d, "Contract expiration", "oxblood");
      push(d.nextActionDue, d, "Next action", "neutral");
    }
    return map;
  }, [deals]);

  const monthName = new Date(cursor.y, cursor.m, 1).toLocaleDateString("en-US", { month: "long", year: "numeric" });

  return (
    <LuxeSection
      title={monthName}
      actions={
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => setCursor((c) => (c.m === 0 ? { y: c.y - 1, m: 11 } : { y: c.y, m: c.m - 1 }))}>
            Prev
          </Button>
          <Button variant="outline" size="sm" onClick={() => {
            const n = new Date();
            setCursor({ y: n.getFullYear(), m: n.getMonth() });
          }}>
            Today
          </Button>
          <Button variant="outline" size="sm" onClick={() => setCursor((c) => (c.m === 11 ? { y: c.y + 1, m: 0 } : { y: c.y, m: c.m + 1 }))}>
            Next
          </Button>
        </div>
      }
    >
      <div className="grid grid-cols-7 gap-1 text-center text-[11px] font-semibold uppercase tracking-wider text-neutral-500">
        {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => <div key={d} className="py-1">{d}</div>)}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {cells.map((day) => {
          const key = day.toISOString().split("T")[0];
          const evs = eventsByDay.get(key) ?? [];
          const inMonth = day.getMonth() === cursor.m;
          const isToday = key === new Date().toISOString().split("T")[0];
          return (
            <div
              key={key}
              className={cn(
                "min-h-[84px] rounded-lg border p-1.5 text-left",
                inMonth ? "border-white/10 bg-white/[0.02]" : "border-transparent opacity-40",
                isToday && "border-[#D4AF37]/50",
              )}
            >
              <p className={cn("text-xs", isToday ? "font-bold text-[#D4AF37]" : "text-neutral-500")}>{day.getDate()}</p>
              <div className="mt-1 flex flex-col gap-1">
                {evs.slice(0, 3).map((e, i) => (
                  <button
                    key={i}
                    onClick={() => onOpen(e.deal)}
                    title={`${e.label}: ${e.deal.property?.address ?? ""}`}
                    className={cn(
                      "truncate rounded px-1 py-0.5 text-left text-[10px]",
                      e.tone === "oxblood" && "bg-[#8B1E1E]/20 text-[#e08a8a]",
                      e.tone === "gold" && "bg-[#D4AF37]/15 text-[#D4AF37]",
                      e.tone === "neutral" && "bg-white/10 text-neutral-300",
                    )}
                  >
                    {e.label}
                  </button>
                ))}
                {evs.length > 3 && <span className="text-[10px] text-neutral-600">+{evs.length - 3} more</span>}
              </div>
            </div>
          );
        })}
      </div>
    </LuxeSection>
  );
}

function DealMobileCard({ deal, onOpen }: { deal: LockedUpDeal; onOpen: () => void }) {
  const c = deal.contract;
  const critical = deal.risks.find((r) => r.severity === "critical");
  return (
    <LuxeMobileCard onClick={onOpen}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate font-serif font-medium text-white">{deal.property?.address ?? `Deal #${deal.id}`}</p>
          <p className="text-xs text-neutral-500">{[deal.property?.city, deal.property?.state].filter(Boolean).join(", ")}</p>
        </div>
        <LuxeStatusBadge tone={STAGE_BADGE[deal.stage]}>{deal.stageLabel}</LuxeStatusBadge>
      </div>
      <div className="mt-2">
        <LuxeMobileCardRow label="Resale price" value={<span className="text-[#D4AF37]">{money(c?.assignmentPrice ?? null)}</span>} />
        <LuxeMobileCardRow label="Closing" value={formatDate(c?.closingDate)} />
        <LuxeMobileCardRow label="EMD" value={`${money(c?.emdAmount ?? null)} · ${emdLabel(c?.emdStatus ?? null)}`} />
        <LuxeMobileCardRow label="Signatures" value={c ? `${c.signersDone}/${c.signersTotal} signed` : "—"} />
        {deal.openConditions > 0 && (
          <LuxeMobileCardRow label="Open conditions" value={`${deal.openConditions} open`} />
        )}
      </div>
      {critical && (
        <p className="mt-2 flex items-center gap-1.5 text-xs text-[#e08a8a]">
          <AlertTriangle className="h-3.5 w-3.5" aria-hidden /> {critical.message}
        </p>
      )}
    </LuxeMobileCard>
  );
}

// ---------------------------------------------------------------------------
// Deal detail dialog (desktop modal, mobile bottom sheet)
// ---------------------------------------------------------------------------

function DealDetailDialog({
  deal,
  onClose,
  onChanged,
}: {
  deal: LockedUpDeal | null;
  onClose: () => void;
  onChanged: () => void;
}) {
  const { toast } = useToast();
  const [detail, setDetail] = useState<{ conditions: DealCondition[]; timeline: TimelineEvent[] } | null>(null);
  const [loading, setLoading] = useState(false);
  const [moving, setMoving] = useState(false);
  const [newStage, setNewStage] = useState<LockedUpStage | "">("");
  const [nextAction, setNextAction] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setDetail(null);
    setNewStage("");
    if (!deal) return;
    setNextAction(deal.nextAction ?? "");
    setLoading(true);
    lockedUpApi.deal(deal.id)
      .then((r) => setDetail({ conditions: r.conditions, timeline: r.timeline }))
      .catch(() => null)
      .finally(() => setLoading(false));
  }, [deal]);

  if (!deal) return null;
  const c = deal.contract;

  const moveStage = () => {
    if (!newStage) return;
    setMoving(true);
    lockedUpApi.moveStage(deal.id, newStage)
      .then(() => {
        toast({ title: "Stage updated", description: `Moved to ${LOCKED_UP_STAGES.find((s) => s.value === newStage)?.label}.` });
        onChanged();
        onClose();
      })
      .catch((e) => toast({ title: "Couldn't move stage", description: e instanceof InvestorApiError ? e.message : "Try again.", variant: "destructive" }))
      .finally(() => setMoving(false));
  };

  const saveNextAction = () => {
    setSaving(true);
    lockedUpApi.updateDeal(deal.id, { nextAction })
      .then(() => {
        toast({ title: "Next action saved" });
        onChanged();
        onClose();
      })
      .catch((e) => toast({ title: "Couldn't save", description: e instanceof InvestorApiError ? e.message : "Try again.", variant: "destructive" }))
      .finally(() => setSaving(false));
  };

  const setConditionStatus = (cond: DealCondition, status: DealCondition["status"]) => {
    lockedUpApi.updateCondition(deal.id, cond.id, { status })
      .then(() => lockedUpApi.deal(deal.id))
      .then((r) => {
        setDetail((d) => (d ? { ...d, conditions: r.conditions } : d));
        onChanged();
      })
      .catch((e) => toast({ title: "Couldn't update condition", description: e instanceof InvestorApiError ? e.message : "Try again.", variant: "destructive" }));
  };

  const timelineItems: LuxeTimelineItem[] = (detail?.timeline ?? []).slice(0, 30).map((t) => ({
    id: t.id,
    title: t.eventType.replace(/[._]/g, " "),
    description: describePayload(t),
    time: formatDateTime(t.createdAt),
    tone: t.eventType.includes("void") || t.eventType.includes("declin") ? "oxblood"
      : t.eventType.includes("complet") || t.eventType.includes("execut") || t.eventType.includes("locked") ? "verified"
      : "default",
  }));

  return (
    <LuxeDialog
      open
      onOpenChange={(o) => { if (!o) onClose(); }}
      title={deal.property?.address ?? `Deal #${deal.id}`}
      description={`${deal.stageLabel} · Locked ${formatDate(deal.lockedAt)}`}
      wide
    >
      <div className="flex flex-col gap-5">
        {deal.property && (
          <LuxePropertyCard
            property={{
              id: deal.property.id,
              image: deal.property.image,
              address: deal.property.address,
              city: deal.property.city,
              state: deal.property.state,
              zipCode: deal.property.zipCode,
              beds: deal.property.beds,
              baths: deal.property.baths,
              sqft: deal.property.sqft,
              propertyType: deal.property.propertyType,
              arv: deal.property.arv,
              repairCost: deal.property.repairCost,
              price: c?.assignmentPrice ?? null,
              statusLabel: deal.stageLabel,
              statusTone: STAGE_BADGE[deal.stage],
            }}
          />
        )}

        {/* Risk warnings — oxblood only for genuine risk */}
        {deal.risks.length > 0 && (
          <div className="rounded-lg border border-[#8B1E1E]/40 bg-[#8B1E1E]/10 p-4">
            <p className="flex items-center gap-2 text-sm font-semibold text-[#e08a8a]">
              <AlertTriangle className="h-4 w-4" aria-hidden /> Risks needing attention
            </p>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-neutral-300">
              {deal.risks.map((r, i) => <li key={i}>{r.message}</li>)}
            </ul>
          </div>
        )}

        <LuxeSection title="Contract terms">
          <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm md:grid-cols-3">
            <Fact label="Contract type" value={c?.contractType ?? "—"} />
            <Fact label="Seller" value={c?.parties.seller ?? "—"} />
            <Fact label="Buyer" value={c?.parties.buyer ?? "—"} />
            <Fact label="Acquisition price" value={money(c?.acquisitionPrice ?? null)} />
            <Fact label="Assignment / resale" value={money(c?.assignmentPrice ?? null)} gold />
            <Fact label="Earnest money" value={`${money(c?.emdAmount ?? null)} · ${emdLabel(c?.emdStatus ?? null)}`} />
            <Fact label="Effective date" value={formatDate(c?.effectiveDate)} />
            <Fact label="Inspection deadline" value={formatDate(c?.inspectionDeadline)} />
            <Fact label="Contract expiration" value={formatDate(c?.expirationDate)} />
            <Fact label="Closing date" value={formatDate(c?.closingDate)} />
            <Fact label="Title company" value={c?.titleCompany ?? "—"} />
            <Fact label="Funding" value={c?.fundingStatus ? c.fundingStatus.replace(/_/g, " ") : "—"} />
          </dl>
          {c && (
            <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-white/10 pt-4">
              <LuxeDocumentStatus
                state={DOC_STATE_MAP[c.stage]}
                signersCompleted={c.signersDone}
                signersTotal={c.signersTotal}
              />
              <Link href={`/investor/contracts/${c.id}`}>
                <a className="text-sm font-medium text-[#D4AF37] hover:underline">Open contract workspace →</a>
              </Link>
            </div>
          )}
        </LuxeSection>

        <LuxeSection
          title="Open conditions"
          description="Everything that must be met or waived before closing."
          actions={deal.openConditions > 0 ? <LuxeStatusBadge tone="gold">{deal.openConditions} open</LuxeStatusBadge> : undefined}
        >
          {loading ? (
            <Loader2 className="h-5 w-5 animate-spin text-[#D4AF37]" />
          ) : (detail?.conditions ?? []).length === 0 ? (
            <p className="text-sm text-neutral-500">No conditions recorded.</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {(detail?.conditions ?? []).map((cond) => (
                <li key={cond.id} className="flex items-center justify-between gap-3 rounded-lg border border-white/10 p-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-white">{cond.title}</p>
                    <p className="text-xs text-neutral-500">Due {formatDate(cond.dueDate)}{cond.notes ? ` · ${cond.notes}` : ""}</p>
                  </div>
                  <div className="flex shrink-0 gap-1">
                    {(["open", "met", "waived"] as const).map((s) => (
                      <button
                        key={s}
                        onClick={() => setConditionStatus(cond, s)}
                        className={cn(
                          "rounded px-2 py-1 text-[11px] font-medium",
                          cond.status === s
                            ? s === "open" ? "bg-[#D4AF37]/20 text-[#D4AF37]" : "bg-emerald-500/15 text-emerald-300"
                            : "text-neutral-500 hover:text-white",
                        )}
                      >
                        {s === "open" ? "Open" : s === "met" ? "Met" : "Waived"}
                      </button>
                    ))}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </LuxeSection>

        <LuxeSection title="Team & next action">
          <div className="flex flex-col gap-3 text-sm">
            <div>
              <p className="text-xs uppercase tracking-wider text-neutral-500">Assigned team</p>
              <p className="mt-1 text-neutral-200">{deal.assignedTeam.length ? deal.assignedTeam.join(", ") : "Unassigned"}</p>
            </div>
            <div>
              <label className="text-xs uppercase tracking-wider text-neutral-500" htmlFor="next-action">Next action</label>
              <div className="mt-1 flex gap-2">
                <input
                  id="next-action"
                  value={nextAction}
                  onChange={(e) => setNextAction(e.target.value)}
                  placeholder="e.g. Confirm wire with title company"
                  className="min-w-0 flex-1 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder:text-neutral-600"
                />
                <Button size="sm" onClick={saveNextAction} disabled={saving} className="bg-[#D4AF37] font-semibold text-black hover:bg-[#c19b2e]">
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save"}
                </Button>
              </div>
              {deal.nextActionDue && <p className="mt-1 text-xs text-neutral-500">Due {formatDate(deal.nextActionDue)}</p>}
            </div>
            <div>
              <p className="text-xs uppercase tracking-wider text-neutral-500">Move stage</p>
              <div className="mt-1 flex gap-2">
                <select
                  value={newStage}
                  onChange={(e) => setNewStage(e.target.value as LockedUpStage | "")}
                  className="min-w-0 flex-1 rounded-lg border border-white/10 bg-[#121212] px-3 py-2 text-sm text-white"
                >
                  <option value="">Select stage…</option>
                  {LOCKED_UP_STAGES.filter((s) => s.value !== deal.stage).map((s) => (
                    <option key={s.value} value={s.value}>{s.label}</option>
                  ))}
                </select>
                <Button size="sm" variant="outline" onClick={moveStage} disabled={!newStage || moving}>
                  {moving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Move"}
                </Button>
              </div>
            </div>
          </div>
        </LuxeSection>

        <LuxeSection title="Activity">
          {loading ? (
            <Loader2 className="h-5 w-5 animate-spin text-[#D4AF37]" />
          ) : timelineItems.length === 0 ? (
            <p className="text-sm text-neutral-500">No activity recorded yet.</p>
          ) : (
            <LuxeTimeline items={timelineItems} />
          )}
        </LuxeSection>
      </div>
    </LuxeDialog>
  );
}

function Fact({ label, value, gold }: { label: string; value: string; gold?: boolean }) {
  return (
    <div>
      <dt className="text-[11px] uppercase tracking-[0.12em] text-neutral-500">{label}</dt>
      <dd className={cn("mt-0.5 font-medium", gold ? "text-[#D4AF37]" : "text-white")}>{value}</dd>
    </div>
  );
}

function describePayload(t: TimelineEvent): string | undefined {
  const p: Record<string, unknown> = (t.payload ?? {}) as Record<string, unknown>;
  const parts: string[] = [];
  if (typeof p.from === "string" && typeof p.to === "string") parts.push(`${p.from} → ${p.to}`);
  if (typeof p.reason === "string" && p.reason) parts.push(p.reason);
  if (typeof p.signerCount === "number") parts.push(`${p.signerCount} signers`);
  if (typeof p.name === "string" && p.name) parts.push(p.name);
  return parts.length ? parts.join(" · ") : undefined;
}
