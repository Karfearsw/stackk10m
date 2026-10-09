/**
 * Deal Room page (Phase 13): unlocked at mutual match.
 * Conversation, Q&A, property details, underwriting, files, showings,
 * tasks/deadlines, offers entry, and the activity timeline — all in one
 * room, role-scoped so investors only see authorized information.
 */
import { useEffect, useState } from "react";
import { Link, useLocation, useRoute } from "wouter";
import {
  Loader2, MessageCircle, Send, HelpCircle, CalendarClock,
  FolderOpen, FileText, ListChecks, Activity, Camera,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import {
  LuxePageHeader, LuxeSection, LuxePropertyCard, LuxeTimeline,
  LuxeEmptyState, LuxeStatusBadge, LuxeMetric, LuxeDialog,
  type LuxeTimelineItem, type LuxeStatusTone,
} from "@/components/luxe";
import {
  investorApi, money, InvestorApiError,
  type DealRoomDetail, type RoomMessage,
} from "../api";
import { RequireInvestor } from "../InvestorLayout";

const ROOM_TONE: Record<string, LuxeStatusTone> = {
  open: "neutral",
  negotiating: "gold",
  contracting: "info",
  closing: "info",
  closed: "verified",
  archived: "neutral",
};

const INTEREST_TONE: Record<string, LuxeStatusTone> = {
  mutual_match: "verified",
  due_diligence: "gold",
  offer_submitted: "gold",
  negotiating: "gold",
  offer_accepted: "verified",
  contract_sent: "info",
  fully_executed: "verified",
  locked_up: "verified",
  closing: "info",
  closed: "verified",
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

function fmtLabel(s: string | null | undefined): string {
  return s ? s.replace(/_/g, " ") : "—";
}

export function DealRoomPage() {
  return (
    <RequireInvestor>
      <DealRoomBody />
    </RequireInvestor>
  );
}

function DealRoomBody() {
  const [, params] = useRoute("/investor/deal-rooms/:id");
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const roomId = params?.id ? Number(params.id) : NaN;

  const [room, setRoom] = useState<DealRoomDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [qaOpen, setQaOpen] = useState(false);
  const [question, setQuestion] = useState("");
  const [showingOpen, setShowingOpen] = useState(false);
  const [showStart, setShowStart] = useState("");
  const [showEnd, setShowEnd] = useState("");
  const [showNotes, setShowNotes] = useState("");

  const load = async () => {
    if (!Number.isFinite(roomId)) return;
    try {
      const r = await investorApi.dealRoom(roomId);
      setRoom(r.room);
    } catch (e) {
      toast({ title: "Couldn't load deal room", description: e instanceof InvestorApiError ? e.message : "Try again.", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [roomId]);

  const send = async (kind: "message" | "question" | "answer", body: string, parentId?: number | null) => {
    if (!body.trim()) return;
    setSending(true);
    try {
      await investorApi.sendRoomMessage(roomId, { body: body.trim(), kind, parentId: parentId ?? null });
      setDraft("");
      setQuestion("");
      setQaOpen(false);
      await load();
    } catch (e) {
      toast({ title: "Message failed", description: e instanceof InvestorApiError ? e.message : "Try again.", variant: "destructive" });
    } finally {
      setSending(false);
    }
  };

  const requestShowing = async () => {
    try {
      await investorApi.requestShowing(roomId, { startsAt: showStart, endsAt: showEnd, notes: showNotes || null });
      setShowingOpen(false);
      setShowStart(""); setShowEnd(""); setShowNotes("");
      toast({ title: "Showing requested", description: "The dispo team will confirm your time slot." });
      await load();
    } catch (e) {
      toast({ title: "Couldn't request showing", description: e instanceof InvestorApiError ? e.message : "Try again.", variant: "destructive" });
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-[#D4AF37]" />
      </div>
    );
  }

  if (!room) {
    return (
      <LuxeEmptyState
        icon={<MessageCircle className="h-6 w-6" />}
        title="Deal room not found"
        description="This room may not exist, or you may not be a participant yet."
        actionLabel="Back to deals"
        onAction={() => setLocation("/investor/discover")}
      />
    );
  }

  const p = room.property;
  const spread = p && p.arv != null && p.repairCost != null && p.askingPrice != null
    ? p.arv - p.repairCost - p.askingPrice
    : null;
  const questions = room.messages.filter((m) => m.kind === "question");
  const activityItems: LuxeTimelineItem[] = room.messages.map((m) => ({
    id: `m-${m.id}`,
    title: m.kind === "announcement" ? "Room update" : m.kind === "question" ? `Q&A — ${m.authorName}` : m.authorName,
    description: m.body ?? undefined,
    time: m.createdAt ? new Date(m.createdAt).toLocaleString() : undefined,
    tone: (m.kind === "announcement" ? "gold" : m.mine ? "verified" : "default") as LuxeTimelineItem["tone"],
  }));

  return (
    <div className="flex flex-col gap-6 pb-10">
      <LuxePageHeader
        eyebrow="Deal room"
        title={p?.address ?? `Deal #${room.id}`}
        description={p ? [p.city, p.state, p.zipCode].filter(Boolean).join(", ") : undefined}
        actions={
          <>
            {room.interestStatus && (
              <LuxeStatusBadge tone={INTEREST_TONE[room.interestStatus] ?? "neutral"} dot>
                {fmtLabel(room.interestStatus)}
              </LuxeStatusBadge>
            )}
            <LuxeStatusBadge tone={ROOM_TONE[room.status ?? ""] ?? "neutral"}>
              Room {fmtLabel(room.status)}
            </LuxeStatusBadge>
          </>
        }
      />

      {/* Participants */}
      <LuxeSection title="Deal participants" description="Who is in this room and in what role.">
        <div className="flex flex-wrap gap-2">
          {room.participants.map((pt) => (
            <LuxeStatusBadge key={pt.userId} tone={pt.role === "team_admin" ? "gold" : pt.role === "owner" ? "info" : "neutral"}>
              {pt.name} · {fmtLabel(pt.role)}
            </LuxeStatusBadge>
          ))}
          {room.participants.length === 0 && <p className="text-sm text-muted-foreground">No participants yet.</p>}
        </div>
      </LuxeSection>

      {/* Property + underwriting */}
      {p && (
        <>
          <LuxePropertyCard
            property={{
              id: p.id,
              image: p.images[0] ?? null,
              address: p.address ?? "Address pending",
              city: p.city, state: p.state, zipCode: p.zipCode,
              propertyType: p.propertyType,
              price: p.askingPrice ?? p.price,
              arv: p.arv, repairCost: p.repairCost, spread,
              beds: p.beds, baths: p.baths, sqft: p.sqft,
            }}
          />
          <LuxeSection title="Underwriting" description="Numbers as shared with the team. Verified figures carry the green mark.">
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              <LuxeMetric label="Asking" value={money(p.askingPrice ?? p.price)} tone="gold" />
              <LuxeMetric label="Est. ARV" value={money(p.arv)} />
              <LuxeMetric label="Est. repairs" value={money(p.repairCost)} />
              <LuxeMetric label="Est. spread" value={money(spread)} sub="ARV − repairs − asking" />
            </div>
          </LuxeSection>
        </>
      )}

      {/* Conversation */}
      <LuxeSection
        title="Conversation"
        description="In-app messages with the OceanLuxe team."
        actions={
          <Button variant="outline" size="sm" onClick={() => setQaOpen(true)}>
            <HelpCircle className="mr-1.5 h-4 w-4" /> Ask a question
          </Button>
        }
      >
        {room.messages.filter((m) => m.kind === "message" || m.kind === "announcement").length === 0 ? (
          <LuxeEmptyState icon={<MessageCircle className="h-6 w-6" />} title="No messages yet" description="Say hello to the team handling this deal." />
        ) : (
          <div className="flex flex-col gap-3">
            {room.messages.filter((m) => m.kind === "message" || m.kind === "announcement").map((m) => (
              <MessageBubble key={m.id} message={m} />
            ))}
          </div>
        )}
        <div className="mt-4 flex gap-2">
          <Textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Write a message…"
            rows={2}
            className="flex-1"
          />
          <Button onClick={() => send("message", draft)} disabled={sending || !draft.trim()} className="shrink-0">
            <Send className="h-4 w-4" />
          </Button>
        </div>
      </LuxeSection>

      {/* Q&A */}
      <LuxeSection title="Q&A" description="Questions and the team's answers, kept on the record.">
        {questions.length === 0 ? (
          <LuxeEmptyState icon={<HelpCircle className="h-6 w-6" />} title="No questions yet" description="Ask about comps, access, title, or anything on this deal." />
        ) : (
          <div className="flex flex-col gap-4">
            {questions.map((q) => (
              <div key={q.id} className="rounded-lg border border-border/60 p-4">
                <p className="text-sm"><span className="font-semibold">{q.authorName}:</span> {q.body}</p>
                {room.messages.filter((m) => m.parentId === q.id).map((a) => (
                  <div key={a.id} className="mt-2 border-l-2 border-primary/40 pl-3 text-sm text-muted-foreground">
                    <span className="font-medium text-foreground">{a.authorName}:</span> {a.body}
                  </div>
                ))}
                <ReplyInline questionId={q.id} onReply={(body) => send("answer", body, q.id)} />
              </div>
            ))}
          </div>
        )}
      </LuxeSection>

      {/* Photos, videos, files */}
      <LuxeSection title="Photos, videos & files" description="Deal media shared by the team.">
        {room.files.length === 0 ? (
          <LuxeEmptyState icon={<Camera className="h-6 w-6" />} title="No files yet" description="The team will add property media and documents here." />
        ) : (
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {room.files.map((f) => (
              <div key={f.id} className="flex items-center gap-3 rounded-lg border border-border/60 p-3">
                <FolderOpen className="h-5 w-5 shrink-0 text-muted-foreground" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{f.filename ?? "Untitled file"}</p>
                  <p className="text-xs text-muted-foreground">{fmtLabel(f.category)}{f.createdAt ? ` · ${new Date(f.createdAt).toLocaleDateString()}` : ""}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </LuxeSection>

      {/* Showing / access scheduling */}
      <LuxeSection
        title="Showing & access"
        description="Request a time to walk the property with the team."
        actions={
          <Button variant="outline" size="sm" onClick={() => setShowingOpen(true)}>
            <CalendarClock className="mr-1.5 h-4 w-4" /> Request showing
          </Button>
        }
      >
        {room.showings.length === 0 ? (
          <LuxeEmptyState icon={<CalendarClock className="h-6 w-6" />} title="No showings scheduled" />
        ) : (
          <div className="flex flex-col gap-2">
            {room.showings.map((s) => (
              <div key={s.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border/60 p-3 text-sm">
                <div>
                  <p className="font-medium">
                    {s.startsAt ? new Date(s.startsAt).toLocaleString() : "TBD"}
                    {s.endsAt ? ` – ${new Date(s.endsAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}` : ""}
                  </p>
                  {s.notes && <p className="text-xs text-muted-foreground">{s.notes}</p>}
                </div>
                <LuxeStatusBadge tone={s.status === "confirmed" ? "verified" : s.status === "cancelled" ? "oxblood" : "neutral"}>
                  {fmtLabel(s.status)}
                </LuxeStatusBadge>
              </div>
            ))}
          </div>
        )}
      </LuxeSection>

      {/* Tasks, deadlines, closing checklist */}
      <LuxeSection title="Tasks & deadlines" description="Due-diligence steps and the closing checklist.">
        {room.tasks.length === 0 ? (
          <LuxeEmptyState icon={<ListChecks className="h-6 w-6" />} title="No tasks yet" description="Checklist items will appear as the deal moves forward." />
        ) : (
          <div className="flex flex-col gap-2">
            {room.tasks.map((t) => (
              <div key={t.id} className="flex items-start gap-3 rounded-lg border border-border/60 p-3">
                <ListChecks className={`mt-0.5 h-4 w-4 shrink-0 ${t.status === "done" ? "text-verified" : "text-muted-foreground"}`} />
                <div className="min-w-0 flex-1">
                  <p className={`text-sm font-medium ${t.status === "done" ? "line-through text-muted-foreground" : ""}`}>{t.title}</p>
                  {t.description && <p className="mt-0.5 text-xs text-muted-foreground">{t.description}</p>}
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  {t.dueAt && (
                    <span className="text-xs text-muted-foreground">Due {new Date(t.dueAt).toLocaleDateString()}</span>
                  )}
                  <LuxeStatusBadge tone={t.category === "closing" ? "oxblood" : "neutral"}>{fmtLabel(t.category)}</LuxeStatusBadge>
                </div>
              </div>
            ))}
          </div>
        )}
      </LuxeSection>

      {/* Offer creation entry */}
      <LuxeSection
        title="Offers"
        description="Structured offers live on the Offers page — every version is kept on record."
        actions={
          <Link href={`/investor/offers?room=${room.id}`}>
            <Button size="sm" className="bg-[#D4AF37] font-semibold text-black hover:bg-[#c19b2e]">
              <FileText className="mr-1.5 h-4 w-4" /> Create offer
            </Button>
          </Link>
        }
      >
        {room.offers.length === 0 ? (
          <LuxeEmptyState icon={<FileText className="h-6 w-6" />} title="No offers yet" description="Create your first structured offer when the numbers work." />
        ) : (
          <div className="flex flex-col gap-2">
            {room.offers.map((o) => (
              <Link key={o.id} href={`/investor/offers?offer=${o.id}`}>
                <a className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border/60 p-3 transition-colors hover:border-primary/40">
                  <div>
                    <p className="text-sm font-medium">Offer #{o.id} · v{o.versionNumber}</p>
                    <p className="text-xs text-muted-foreground">
                      {o.submittedAt ? new Date(o.submittedAt).toLocaleDateString() : "Draft"}
                      {o.parentOfferId ? ` · counters #${o.parentOfferId}` : ""}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="font-serif text-lg font-semibold text-primary">{money(o.offerAmount)}</span>
                    <LuxeStatusBadge tone={OFFER_TONE[String(o.status)] ?? "neutral"}>{fmtLabel(o.status)}</LuxeStatusBadge>
                  </div>
                </a>
              </Link>
            ))}
          </div>
        )}
      </LuxeSection>

      {/* Activity timeline + contract status */}
      <LuxeSection title="Activity" description="Room timeline, newest first.">
        {activityItems.length === 0 ? (
          <LuxeEmptyState icon={<Activity className="h-6 w-6" />} title="No activity yet" />
        ) : (
          <LuxeTimeline items={[...activityItems].reverse().slice(0, 30)} />
        )}
      </LuxeSection>

      {/* Ask-a-question dialog */}
      <LuxeDialog open={qaOpen} onOpenChange={setQaOpen} title="Ask the team" description="Your question goes on the record for this deal.">
        <div className="flex flex-col gap-3">
          <Textarea value={question} onChange={(e) => setQuestion(e.target.value)} rows={4} placeholder="e.g. Are there recent comps within a half mile?" />
          <Button onClick={() => send("question", question)} disabled={sending || !question.trim()}>
            {sending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null} Post question
          </Button>
        </div>
      </LuxeDialog>

      {/* Request-showing dialog */}
      <LuxeDialog open={showingOpen} onOpenChange={setShowingOpen} title="Request a showing" description="Pick your preferred window; the team confirms.">
        <div className="flex flex-col gap-3">
          <label className="text-sm font-medium">Starts at
            <Input type="datetime-local" value={showStart} onChange={(e) => setShowStart(e.target.value)} className="mt-1" />
          </label>
          <label className="text-sm font-medium">Ends at
            <Input type="datetime-local" value={showEnd} onChange={(e) => setShowEnd(e.target.value)} className="mt-1" />
          </label>
          <Textarea value={showNotes} onChange={(e) => setShowNotes(e.target.value)} rows={2} placeholder="Notes for the team (optional)" />
          <Button onClick={requestShowing} disabled={!showStart || !showEnd}>Request showing</Button>
        </div>
      </LuxeDialog>
    </div>
  );
}

function MessageBubble({ message: m }: { message: RoomMessage }) {
  if (m.kind === "announcement") {
    return (
      <div className="rounded-lg border border-primary/30 bg-primary/5 px-4 py-3 text-sm">
        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-primary">Room update</p>
        <p className="mt-1">{m.body}</p>
        {m.createdAt && <p className="mt-1 text-xs text-muted-foreground">{new Date(m.createdAt).toLocaleString()}</p>}
      </div>
    );
  }
  return (
    <div className={`flex ${m.mine ? "justify-end" : "justify-start"}`}>
      <div className={`max-w-[85%] rounded-lg px-4 py-2.5 text-sm ${m.mine ? "bg-primary/15 text-foreground" : "border border-border/60"}`}>
        {!m.mine && <p className="mb-0.5 text-xs font-semibold text-muted-foreground">{m.authorName}</p>}
        <p>{m.body}</p>
        {m.createdAt && <p className="mt-1 text-[11px] text-muted-foreground">{new Date(m.createdAt).toLocaleString()}</p>}
      </div>
    </div>
  );
}

function ReplyInline({ questionId, onReply }: { questionId: number; onReply: (body: string) => void }) {
  const [open, setOpen] = useState(false);
  const [body, setBody] = useState("");
  if (!open) {
    return (
      <button className="mt-2 text-xs font-medium text-primary hover:underline" onClick={() => setOpen(true)}>
        Reply
      </button>
    );
  }
  return (
    <div className="mt-2 flex gap-2">
      <Input value={body} onChange={(e) => setBody(e.target.value)} placeholder="Your reply…" className="h-8 text-sm" />
      <Button size="sm" disabled={!body.trim()} onClick={() => { onReply(body); setBody(""); setOpen(false); }}>Send</Button>
    </div>
  );
}
