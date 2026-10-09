/**
 * Contract workspace (Phase 16): the full document lifecycle in one place.
 *
 * Draft → Internal Review → Attorney Review Required → Ready to Send → Sent →
 * Delivered → Opened → Partially Signed → Fully Executed
 * (or Declined / Voided / Expired / Superseded).
 *
 * Built on LuxeDocumentStatus. Legal terms render as readable prose — never
 * inside decorative swipe cards. Executed documents are immutable: the
 * workspace offers no edit path, only amendments (new versions).
 */
import { useEffect, useState } from "react";
import { useRoute } from "wouter";
import {
  AlertTriangle,
  CheckCircle2,
  Download,
  FileText,
  Loader2,
  Lock,
  Printer,
  XCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import {
  LuxePageHeader,
  LuxeStatusBadge,
  LuxeSection,
  LuxeEmptyState,
  LuxeDialog,
  LuxeTimeline,
  type LuxeTimelineItem,
  LuxeDocumentStatus,
} from "@/components/luxe";
import { RequireInvestor } from "../InvestorLayout";
import {
  contractWorkspaceApi,
  lockedUpApi,
  InvestorApiError,
  money,
  formatDate,
  formatDateTime,
  type ContractDetail,
  type ContractStage,
  type TimelineEvent,
} from "../lockedup/api";
import { DOC_STATE_MAP, signerTone } from "./ContractCard";

const LIFECYCLE: Array<{ stage: ContractStage; label: string }> = [
  { stage: "draft", label: "Draft" },
  { stage: "internal_review", label: "Internal Review" },
  { stage: "attorney_review", label: "Attorney Review" },
  { stage: "ready", label: "Ready to Send" },
  { stage: "sent", label: "Sent" },
  { stage: "delivered", label: "Delivered" },
  { stage: "opened", label: "Opened" },
  { stage: "partially_signed", label: "Partially Signed" },
  { stage: "executed", label: "Fully Executed" },
];

const TERMINAL: Partial<Record<ContractStage, { label: string; description: string }>> = {
  declined: { label: "Declined", description: "A party declined to sign. See the signers tab for the reason." },
  voided: { label: "Voided", description: "This contract was voided and can no longer be signed." },
  expired: { label: "Expired", description: "The signing window expired. Re-issue with a new expiration if still wanted." },
  superseded: { label: "Superseded", description: "Replaced by a newer version. See the versions tab." },
};

type Tab = "document" | "signers" | "activity" | "reminders" | "versions" | "certificate" | "gate";

export function ContractWorkspacePage() {
  return (
    <RequireInvestor>
      <ContractWorkspaceBody />
    </RequireInvestor>
  );
}

function ContractWorkspaceBody() {
  const [, params] = useRoute("/investor/contracts/:id");
  const id = params?.id ? parseInt(params.id, 10) : NaN;
  const { toast } = useToast();
  const [detail, setDetail] = useState<ContractDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>("document");
  const [confirm, setConfirm] = useState<"void" | "decline" | null>(null);
  const [reason, setReason] = useState("");
  const [acting, setActing] = useState(false);

  const load = () => {
    if (!Number.isFinite(id)) return;
    setLoading(true);
    contractWorkspaceApi.detail(id)
      .then(setDetail)
      .catch((e) => toast({
        title: "Couldn't load contract",
        description: e instanceof InvestorApiError ? e.message : "Try again.",
        variant: "destructive",
      }))
      .finally(() => setLoading(false));
  };

  useEffect(load, [id]);

  if (!Number.isFinite(id)) {
    return <LuxeEmptyState icon={<FileText className="h-6 w-6" />} title="Invalid contract" description="That contract link doesn't look right." />;
  }

  if (loading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-[#D4AF37]" />
      </div>
    );
  }

  if (!detail) {
    return <LuxeEmptyState icon={<FileText className="h-6 w-6" />} title="Contract not found" description="It may have been removed or belong to another account." />;
  }

  const c = detail.contract;
  const terminal = TERMINAL[c.stage];
  const isTerminal = Boolean(terminal);

  const doVoid = () => {
    setActing(true);
    contractWorkspaceApi.voidContract(id, reason || null)
      .then(() => {
        toast({ title: "Contract voided" });
        setConfirm(null);
        setReason("");
        load();
      })
      .catch((e) => toast({ title: "Couldn't void contract", description: e instanceof InvestorApiError ? e.message : "Try again.", variant: "destructive" }))
      .finally(() => setActing(false));
  };

  const doDecline = () => {
    if (!reason.trim()) {
      toast({ title: "Reason required", description: "A decline reason is required.", variant: "destructive" });
      return;
    }
    setActing(true);
    contractWorkspaceApi.declineContract(id, reason.trim())
      .then(() => {
        toast({ title: "Contract declined" });
        setConfirm(null);
        setReason("");
        load();
      })
      .catch((e) => toast({ title: "Couldn't decline contract", description: e instanceof InvestorApiError ? e.message : "Try again.", variant: "destructive" }))
      .finally(() => setActing(false));
  };

  return (
    <div>
      <LuxePageHeader
        eyebrow="Contract workspace"
        title={c.documentName}
        description={`${c.contractType ?? "Contract"} · v${c.version}${detail.template ? ` · ${detail.template.name}` : ""}${detail.property ? ` · ${detail.property.address}, ${detail.property.city}, ${detail.property.state}` : ""}`}
        actions={
          <>
            <a href={contractWorkspaceApi.downloadUrl(id)}>
              <Button variant="outline" size="sm" className="h-9">
                <Download className="mr-1.5 h-4 w-4" aria-hidden /> Download
              </Button>
            </a>
            <Button variant="outline" size="sm" className="h-9" onClick={() => window.print()}>
              <Printer className="mr-1.5 h-4 w-4" aria-hidden /> Print
            </Button>
            {!isTerminal && c.stage !== "executed" && (
              <>
                <Button variant="outline" size="sm" className="h-9 border-[#8B1E1E]/50 text-[#e08a8a] hover:bg-[#8B1E1E]/10" onClick={() => setConfirm("void")}>
                  Void
                </Button>
                <Button variant="outline" size="sm" className="h-9 border-[#8B1E1E]/50 text-[#e08a8a] hover:bg-[#8B1E1E]/10" onClick={() => setConfirm("decline")}>
                  Decline
                </Button>
              </>
            )}
          </>
        }
      />

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <LuxeDocumentStatus state={DOC_STATE_MAP[c.stage]} signersCompleted={c.signersDone} signersTotal={c.signersTotal} />
        {c.immutable && (
          <LuxeStatusBadge tone="verified">
            <Lock className="h-3 w-3" aria-hidden /> Frozen — executed documents are immutable
          </LuxeStatusBadge>
        )}
        {detail.envelope && (
          <span className="text-xs text-neutral-500">
            {detail.envelope.signingMode === "sequential" ? "Sequential" : "Parallel"} signing
            {detail.envelope.expiresAt ? ` · Expires ${formatDate(detail.envelope.expiresAt)}` : ""}
          </span>
        )}
      </div>

      {/* Lifecycle stepper */}
      <div className="mt-6">
        {terminal ? (
          <div className="rounded-lg border border-[#8B1E1E]/40 bg-[#8B1E1E]/10 p-4">
            <p className="flex items-center gap-2 font-serif text-lg text-[#e08a8a]">
              <AlertTriangle className="h-5 w-5" aria-hidden /> {terminal.label}
            </p>
            <p className="mt-1 text-sm text-neutral-400">{terminal.description}</p>
          </div>
        ) : (
          <LifecycleStepper current={c.stage} />
        )}
      </div>

      {/* Tabs */}
      <div className="mt-6 flex gap-1 overflow-x-auto border-b border-white/10" role="tablist" aria-label="Contract sections">
        {(
          [
            { v: "document", label: "Document" },
            { v: "signers", label: `Signers (${c.signersDone}/${c.signersTotal})` },
            { v: "activity", label: "Activity" },
            { v: "reminders", label: `Reminders (${detail.reminders.length})` },
            { v: "versions", label: `Versions (${detail.versions.length + 1})` },
            { v: "certificate", label: "Certificate" },
            { v: "gate", label: "Locked-Up Gate" },
          ] as Array<{ v: Tab; label: string }>
        ).map(({ v, label }) => (
          <button
            key={v}
            role="tab"
            aria-selected={tab === v}
            onClick={() => setTab(v)}
            className={cn(
              "shrink-0 border-b-2 px-4 py-2.5 text-sm font-medium transition-colors",
              tab === v
                ? "border-[#D4AF37] text-[#D4AF37]"
                : "border-transparent text-neutral-400 hover:text-white",
            )}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="mt-6">
        {tab === "document" && <DocumentTab contractId={id} detail={detail} />}
        {tab === "signers" && <SignersTab detail={detail} />}
        {tab === "activity" && <ActivityTab events={detail.timeline} />}
        {tab === "reminders" && <RemindersTab contractId={id} detail={detail} onChanged={load} />}
        {tab === "versions" && <VersionsTab contractId={id} detail={detail} onChanged={load} />}
        {tab === "certificate" && <CertificateTab contractId={id} />}
        {tab === "gate" && <GateTab detail={detail} />}
      </div>

      {/* Void / decline confirmation */}
      <LuxeDialog
        open={confirm !== null}
        onOpenChange={(o) => { if (!o) { setConfirm(null); setReason(""); } }}
        title={confirm === "void" ? "Void this contract?" : "Decline this contract?"}
        description={
          confirm === "void"
            ? "Voiding stops the signing process immediately. This is recorded in the audit trail."
            : "Declining records your reason in the audit trail. Signer self-decline happens through their signing link."
        }
      >
        <div className="flex flex-col gap-4">
          <div>
            <label htmlFor="void-decline-reason" className="text-xs uppercase tracking-wider text-neutral-500">
              Reason{confirm === "decline" ? " (required)" : " (optional)"}
            </label>
            <textarea
              id="void-decline-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
              placeholder="Why is this contract being voided or declined?"
              className="mt-1 w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder:text-neutral-600"
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => { setConfirm(null); setReason(""); }}>Cancel</Button>
            <Button
              disabled={acting}
              onClick={confirm === "void" ? doVoid : doDecline}
              className="bg-[#8B1E1E] text-white hover:bg-[#8B1E1E]/80"
            >
              {acting ? <Loader2 className="h-4 w-4 animate-spin" /> : confirm === "void" ? "Void contract" : "Decline contract"}
            </Button>
          </div>
        </div>
      </LuxeDialog>
    </div>
  );
}

function LifecycleStepper({ current }: { current: ContractStage }) {
  const idx = LIFECYCLE.findIndex((s) => s.stage === current);
  return (
    <ol className="flex items-start gap-0 overflow-x-auto" aria-label="Contract lifecycle">
      {LIFECYCLE.map((s, i) => {
        const done = i < idx;
        const now = i === idx;
        return (
          <li key={s.stage} className="flex min-w-[104px] flex-1 items-start">
            <div className="flex w-full flex-col items-center text-center">
              <span
                className={cn(
                  "flex h-8 w-8 items-center justify-center rounded-full border text-xs font-semibold",
                  done && "border-emerald-500/50 bg-emerald-500/15 text-emerald-300",
                  now && "border-[#D4AF37] bg-[#D4AF37]/15 text-[#D4AF37]",
                  !done && !now && "border-white/10 bg-white/5 text-neutral-600",
                )}
                aria-current={now ? "step" : undefined}
              >
                {done ? <CheckCircle2 className="h-4 w-4" aria-hidden /> : i + 1}
              </span>
              <span className={cn("mt-1.5 px-1 text-[11px] leading-tight", now ? "font-semibold text-[#D4AF37]" : done ? "text-neutral-300" : "text-neutral-600")}>
                {s.label}
              </span>
            </div>
            {i < LIFECYCLE.length - 1 && (
              <span className={cn("mt-4 h-px w-full min-w-[12px]", i < idx ? "bg-emerald-500/40" : "bg-white/10")} aria-hidden />
            )}
          </li>
        );
      })}
    </ol>
  );
}

/** Legal terms as readable prose — never inside decorative swipe cards. */
function DocumentTab({ contractId, detail }: { contractId: number; detail: ContractDetail }) {
  const [preview, setPreview] = useState<{ title: string; content: string } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    contractWorkspaceApi.preview(contractId)
      .then(setPreview)
      .catch(() => null)
      .finally(() => setLoading(false));
  }, [contractId]);

  const c = detail.contract;
  return (
    <div className="flex flex-col gap-5">
      <LuxeSection title="Document details">
        <div className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm md:grid-cols-4">
          <Meta label="Template" value={detail.template ? `${detail.template.name} (v${detail.template.version})` : "—"} />
          <Meta label="Jurisdiction" value={detail.template?.jurisdiction ?? "—"} />
          <Meta label="Template status" value={detail.template?.status ?? "—"} />
          <Meta label="Document version" value={`v${c.version}`} />
          <Meta label="Acquisition price" value={money(c.acquisitionPrice)} />
          <Meta label="Assignment / resale" value={money(c.assignmentPrice)} />
          <Meta label="Earnest money" value={`${money(c.emdAmount)} · ${c.emdStatus ?? "—"}`} />
          <Meta label="Closing date" value={formatDate(c.closingDate)} />
        </div>
        {c.immutable && (
          <p className="mt-4 flex items-center gap-2 text-sm text-emerald-300">
            <Lock className="h-4 w-4" aria-hidden />
            Fully executed on {formatDateTime(c.executedAt)}. This document is frozen — changes require an amendment (new version).
          </p>
        )}
      </LuxeSection>

      <LuxeSection
        title="Legal terms"
        description="The full text with deal data merged in. Read it here in full — this is the binding language."
      >
        {loading ? (
          <Loader2 className="h-5 w-5 animate-spin text-[#D4AF37]" />
        ) : preview?.content ? (
          <article className="max-w-prose whitespace-pre-line font-serif text-[15px] leading-relaxed text-neutral-100">
            {preview.content}
          </article>
        ) : (
          <p className="text-sm text-neutral-500">No document text available yet.</p>
        )}
      </LuxeSection>
    </div>
  );
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[11px] uppercase tracking-[0.12em] text-neutral-500">{label}</p>
      <p className="mt-0.5 font-medium text-white">{value}</p>
    </div>
  );
}

function SignersTab({ detail }: { detail: ContractDetail }) {
  const c = detail.contract;
  return (
    <div className="flex flex-col gap-5">
      <LuxeSection
        title="Signers"
        description={`${detail.envelope?.signingMode === "parallel" ? "Parallel" : "Sequential"} routing · e-record consent is captured before anyone signs.`}
        actions={<LuxeStatusBadge tone="neutral">{c.signersDone}/{c.signersTotal} signed</LuxeStatusBadge>}
      >
        {detail.signers.length === 0 ? (
          <p className="text-sm text-neutral-500">No signers assigned yet.</p>
        ) : (
          <ul className="flex flex-col gap-3">
            {detail.signers
              .slice()
              .sort((a, b) => (a.signingOrder ?? 0) - (b.signingOrder ?? 0))
              .map((s) => (
                <li key={s.id} className="rounded-lg border border-white/10 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <p className="font-medium text-white">
                        {s.name}
                        {s.role ? <span className="ml-2 text-xs text-neutral-500">{s.role}</span> : null}
                      </p>
                      <p className="text-xs text-neutral-500">{s.email ?? "No email on file"}</p>
                    </div>
                    <LuxeStatusBadge tone={signerTone(s.status)} dot>{s.status.replace(/_/g, " ")}</LuxeStatusBadge>
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs md:grid-cols-4">
                    <span className="text-neutral-500">Sent <span className="text-neutral-300">{formatDateTime(s.sentAt)}</span></span>
                    <span className="text-neutral-500">Viewed <span className="text-neutral-300">{formatDateTime(s.viewedAt)}</span></span>
                    <span className="text-neutral-500">Signed <span className="text-neutral-300">{formatDateTime(s.signedAt)}</span></span>
                    <span className="text-neutral-500">
                      E-record consent{" "}
                      {s.consentAt
                        ? <span className="text-emerald-300">captured {formatDateTime(s.consentAt)}</span>
                        : <span className="text-neutral-600">not yet</span>}
                    </span>
                  </div>
                  {s.declineReason && (
                    <p className="mt-2 flex items-start gap-1.5 text-xs text-[#e08a8a]">
                      <XCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
                      Declined: {s.declineReason}
                    </p>
                  )}
                  {s.hasSignature && s.status === "signed" && (
                    <p className="mt-2 flex items-center gap-1.5 text-xs text-emerald-300">
                      <CheckCircle2 className="h-3.5 w-3.5" aria-hidden /> Intent to sign confirmed — signature captured.
                    </p>
                  )}
                </li>
              ))}
          </ul>
        )}
      </LuxeSection>
    </div>
  );
}

function ActivityTab({ events }: { events: TimelineEvent[] }) {
  const items: LuxeTimelineItem[] = events.map((t) => ({
    id: t.id,
    title: t.eventType.replace(/[._]/g, " "),
    description: t.eventHash ? `hash ${t.eventHash.slice(0, 12)}…` : undefined,
    time: formatDateTime(t.createdAt),
    tone: t.eventType.includes("void") || t.eventType.includes("declin") ? "oxblood"
      : t.eventType.includes("complet") || t.eventType.includes("execut") || t.eventType.includes("finaliz") ? "verified"
      : "default",
  }));
  return (
    <LuxeSection title="Audit trail" description="Every event is hash-chained — tampering breaks the chain.">
      {items.length === 0
        ? <p className="text-sm text-neutral-500">No events recorded yet.</p>
        : <LuxeTimeline items={items} />}
    </LuxeSection>
  );
}

function RemindersTab({ contractId, detail, onChanged }: { contractId: number; detail: ContractDetail; onChanged: () => void }) {
  const { toast } = useToast();
  const [remindAt, setRemindAt] = useState("");
  const [channel, setChannel] = useState<"email" | "sms" | "in_app">("email");
  const [recipient, setRecipient] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  const create = () => {
    if (!remindAt || !recipient.trim()) {
      toast({ title: "Missing fields", description: "A date/time and recipient are required.", variant: "destructive" });
      return;
    }
    setSaving(true);
    contractWorkspaceApi.createReminder(contractId, {
      remindAt: new Date(remindAt).toISOString(),
      channel,
      recipient: recipient.trim(),
      note: note.trim() || null,
    })
      .then(() => {
        toast({ title: "Reminder recorded", description: "Saved as a record only — nothing was sent." });
        setRemindAt(""); setRecipient(""); setNote("");
        onChanged();
      })
      .catch((e) => toast({ title: "Couldn't save reminder", description: e instanceof InvestorApiError ? e.message : "Try again.", variant: "destructive" }))
      .finally(() => setSaving(false));
  };

  const cancel = (reminderId: number) => {
    contractWorkspaceApi.cancelReminder(contractId, reminderId)
      .then(onChanged)
      .catch((e) => toast({ title: "Couldn't cancel", description: e instanceof InvestorApiError ? e.message : "Try again.", variant: "destructive" }));
  };

  return (
    <div className="flex flex-col gap-5">
      <LuxeSection title="Schedule a reminder" description="Reminders are records only — creating one does not send any email or SMS.">
        <div className="grid gap-3 md:grid-cols-2">
          <div>
            <label className="text-xs uppercase tracking-wider text-neutral-500" htmlFor="remind-at">Remind at</label>
            <input
              id="remind-at"
              type="datetime-local"
              value={remindAt}
              onChange={(e) => setRemindAt(e.target.value)}
              className="mt-1 w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white"
            />
          </div>
          <div>
            <label className="text-xs uppercase tracking-wider text-neutral-500" htmlFor="remind-channel">Channel</label>
            <select
              id="remind-channel"
              value={channel}
              onChange={(e) => setChannel(e.target.value as "email" | "sms" | "in_app")}
              className="mt-1 w-full rounded-lg border border-white/10 bg-[#121212] px-3 py-2 text-sm text-white"
            >
              <option value="email">Email</option>
              <option value="sms">SMS</option>
              <option value="in_app">In-app</option>
            </select>
          </div>
          <div>
            <label className="text-xs uppercase tracking-wider text-neutral-500" htmlFor="remind-recipient">Recipient</label>
            <input
              id="remind-recipient"
              value={recipient}
              onChange={(e) => setRecipient(e.target.value)}
              placeholder="name@example.com or signer name"
              list="signer-emails"
              className="mt-1 w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder:text-neutral-600"
            />
            <datalist id="signer-emails">
              {detail.signers.filter((s) => s.email).map((s) => <option key={s.id} value={s.email ?? ""} />)}
            </datalist>
          </div>
          <div>
            <label className="text-xs uppercase tracking-wider text-neutral-500" htmlFor="remind-note">Note</label>
            <input
              id="remind-note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="e.g. Nudge before expiration"
              className="mt-1 w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder:text-neutral-600"
            />
          </div>
        </div>
        <Button onClick={create} disabled={saving} className="mt-4 bg-[#D4AF37] font-semibold text-black hover:bg-[#c19b2e]">
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Record reminder"}
        </Button>
      </LuxeSection>

      <LuxeSection title="Scheduled reminders">
        {detail.reminders.length === 0 ? (
          <p className="text-sm text-neutral-500">No reminders scheduled.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {detail.reminders.map((r) => (
              <li key={r.id} className="flex items-center justify-between gap-3 rounded-lg border border-white/10 p-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-white">{r.recipient}</p>
                  <p className="text-xs text-neutral-500">
                    {formatDateTime(r.remindAt)} · {r.channel}{r.note ? ` · ${r.note}` : ""}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <LuxeStatusBadge tone={r.status === "sent" ? "verified" : r.status === "cancelled" ? "neutral" : "gold"}>
                    {r.status}
                  </LuxeStatusBadge>
                  {r.status === "scheduled" && (
                    <Button variant="ghost" size="sm" onClick={() => cancel(r.id)} className="text-neutral-500 hover:text-white">
                      Cancel
                    </Button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </LuxeSection>
    </div>
  );
}

function VersionsTab({ contractId, detail, onChanged }: { contractId: number; detail: ContractDetail; onChanged: () => void }) {
  const { toast } = useToast();
  const [changes, setChanges] = useState("");
  const [content, setContent] = useState("");
  const [loadedContent, setLoadedContent] = useState(false);
  const [saving, setSaving] = useState(false);
  const c = detail.contract;

  const loadContent = () => {
    contractWorkspaceApi.preview(contractId)
      .then((p) => { setContent(p.content); setLoadedContent(true); })
      .catch(() => toast({ title: "Couldn't load document text", variant: "destructive" }));
  };

  const amend = () => {
    if (!changes.trim()) {
      toast({ title: "Describe the amendment", description: "The changes field is required.", variant: "destructive" });
      return;
    }
    setSaving(true);
    contractWorkspaceApi.amend(contractId, { changes: changes.trim(), content: loadedContent ? content : undefined })
      .then((r) => {
        toast({ title: "Amendment created", description: `Now on version ${r.version}. The prior version is superseded.` });
        setChanges(""); setContent(""); setLoadedContent(false);
        onChanged();
      })
      .catch((e) => toast({ title: "Couldn't create amendment", description: e instanceof InvestorApiError ? e.message : "Try again.", variant: "destructive" }))
      .finally(() => setSaving(false));
  };

  return (
    <div className="flex flex-col gap-5">
      <LuxeSection title="Version history" description="Every amendment snapshots the prior version. Executed documents can't be amended — they're frozen.">
        <ul className="flex flex-col gap-2">
          <li className="flex items-center justify-between rounded-lg border border-[#D4AF37]/30 bg-[#D4AF37]/5 p-3">
            <div>
              <p className="text-sm font-medium text-white">Version {c.version} — current</p>
              <p className="text-xs text-neutral-500">{c.documentName}</p>
            </div>
            <LuxeStatusBadge tone="gold">Current</LuxeStatusBadge>
          </li>
          {detail.versions.map((v) => (
            <li key={v.id} className="flex items-center justify-between rounded-lg border border-white/10 p-3">
              <div>
                <p className="text-sm font-medium text-white">Version {v.versionNumber}</p>
                <p className="text-xs text-neutral-500">{v.changes ?? "—"} · {formatDateTime(v.createdAt)}</p>
              </div>
              <LuxeStatusBadge tone="neutral">Superseded</LuxeStatusBadge>
            </li>
          ))}
        </ul>
      </LuxeSection>

      {!c.immutable && c.stage !== "voided" && (
        <LuxeSection title="Create amendment" description="Describe what changes, optionally edit the text. This opens a new draft version — it does not touch the current one.">
          <div className="flex flex-col gap-3">
            <div>
              <label className="text-xs uppercase tracking-wider text-neutral-500" htmlFor="amend-changes">What changes (required)</label>
              <textarea
                id="amend-changes"
                value={changes}
                onChange={(e) => setChanges(e.target.value)}
                rows={2}
                placeholder="e.g. Extend inspection deadline by 7 days; correct the legal description."
                className="mt-1 w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder:text-neutral-600"
              />
            </div>
            {!loadedContent ? (
              <Button variant="outline" size="sm" onClick={loadContent} className="self-start">
                Load current text to edit
              </Button>
            ) : (
              <div>
                <label className="text-xs uppercase tracking-wider text-neutral-500" htmlFor="amend-content">Amended text</label>
                <textarea
                  id="amend-content"
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  rows={10}
                  className="mt-1 w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 font-serif text-sm leading-relaxed text-white"
                />
              </div>
            )}
            <Button onClick={amend} disabled={saving} className="self-start bg-[#D4AF37] font-semibold text-black hover:bg-[#c19b2e]">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Create amendment"}
            </Button>
          </div>
        </LuxeSection>
      )}
    </div>
  );
}

interface CertificateInfo {
  envelopeId: number;
  title: string;
  status: string;
  documentSha256: string | null;
  finalPdfSha256: string | null;
  completedAt: string | null;
  signers: Array<{
    name: string;
    email: string | null;
    role: string;
    signatureType: string | null;
    signedAt: string | null;
    ip: string | null;
    userAgent: string | null;
    consentAt: string | null;
  }>;
  auditChainHead: string | null;
  auditEvents: number;
}

function CertificateTab({ contractId }: { contractId: number }) {
  const { toast } = useToast();
  const [cert, setCert] = useState<CertificateInfo | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    contractWorkspaceApi.certificate(contractId)
      .then((c) => setCert(c as unknown as CertificateInfo))
      .catch((e) => toast({
        title: "Certificate not available",
        description: e instanceof InvestorApiError ? e.message : "The envelope may not be completed yet.",
        variant: "destructive",
      }))
      .finally(() => setLoading(false));
  }, [contractId]);

  if (loading) return <Loader2 className="h-6 w-6 animate-spin text-[#D4AF37]" />;
  if (!cert) return <LuxeEmptyState icon={<FileText className="h-6 w-6" />} title="No certificate yet" description="The Certificate of Completion is generated when every signer has signed." />;

  const short = (h: string | null) => (h ? `${h.slice(0, 16)}…${h.slice(-8)}` : "—");

  return (
    <div className="flex flex-col gap-5">
      <LuxeSection
        title="Certificate of Completion"
        description="The audit package retained with the executed document."
        actions={
          <a href={contractWorkspaceApi.downloadUrl(contractId)}>
            <Button variant="outline" size="sm" className="h-9">
              <Download className="mr-1.5 h-4 w-4" aria-hidden /> Executed PDF
            </Button>
          </a>
        }
      >
        <div className="grid grid-cols-1 gap-x-6 gap-y-3 text-sm md:grid-cols-2">
          <Meta label="Document" value={cert.title} />
          <Meta label="Completed" value={formatDateTime(cert.completedAt)} />
          <Meta label="Document hash (SHA-256)" value={short(cert.documentSha256)} />
          <Meta label="Final PDF hash (SHA-256)" value={short(cert.finalPdfSha256)} />
          <Meta label="Audit chain head" value={short(cert.auditChainHead)} />
          <Meta label="Audit events" value={String(cert.auditEvents)} />
        </div>
      </LuxeSection>

      <LuxeSection title="Signers on record">
        <ul className="flex flex-col gap-2">
          {cert.signers.map((s, i) => (
            <li key={i} className="rounded-lg border border-white/10 p-3 text-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="font-medium text-white">{s.name} <span className="ml-1 text-xs text-neutral-500">{s.role}</span></p>
                <LuxeStatusBadge tone={s.signedAt ? "verified" : "neutral"}>{s.signedAt ? "Signed" : "Pending"}</LuxeStatusBadge>
              </div>
              <p className="mt-1 text-xs text-neutral-500">
                {s.email ?? "No email"} · {s.signatureType ? `${s.signatureType} signature` : "no signature type"} ·
                signed {formatDateTime(s.signedAt)} · consent {formatDateTime(s.consentAt)}
              </p>
            </li>
          ))}
        </ul>
      </LuxeSection>
    </div>
  );
}

function GateTab({ detail }: { detail: ContractDetail }) {
  const { toast } = useToast();
  const [locking, setLocking] = useState(false);
  const gate = detail.gate;

  const lock = () => {
    setLocking(true);
    lockedUpApi.lock(detail.contract.id)
      .then(() => toast({ title: "Deal locked up", description: "The deal is now in the Locked-Up pipeline." }))
      .catch((e) => {
        const unmet = (e as unknown as { unmet?: string[] }).unmet;
        toast({
          title: "Gate not satisfied",
          description: unmet?.length ? unmet.join(" ") : e instanceof InvestorApiError ? e.message : "Try again.",
          variant: "destructive",
        });
      })
      .finally(() => setLocking(false));
  };

  return (
    <LuxeSection
      title="Locked-Up gate"
      description="A deal enters Locked Up only when every requirement below is met. Interest, matches, and verbal acceptance never qualify."
      actions={
        gate.eligible
          ? <Button size="sm" onClick={lock} disabled={locking} className="bg-[#D4AF37] font-semibold text-black hover:bg-[#c19b2e]">
              {locking ? <Loader2 className="h-4 w-4 animate-spin" /> : "Move to Locked Up"}
            </Button>
          : <LuxeStatusBadge tone="gold">Not yet eligible</LuxeStatusBadge>
      }
    >
      <ul className="flex flex-col gap-2">
        {gate.requirements.map((r) => (
          <li key={r.key} className="flex items-start gap-3 rounded-lg border border-white/10 p-3">
            {r.met
              ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" aria-hidden />
              : <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-[#8B1E1E]" aria-hidden />}
            <span className={cn("text-sm", r.met ? "text-neutral-300" : "text-white font-medium")}>{r.label}</span>
          </li>
        ))}
      </ul>
      {!gate.eligible && (
        <p className="mt-3 text-sm text-neutral-500">
          Finish the items above — fully execute the agreement, collect every signature, and set the dates and earnest money — then try again.
        </p>
      )}
    </LuxeSection>
  );
}
