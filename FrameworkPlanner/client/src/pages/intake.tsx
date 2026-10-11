/**
 * Lead Intake Workspace — the single working view for the lead pipeline.
 *
 * Problem it solves: with 11,000+ leads (FSBO + municipal distress signals),
 * agents were bouncing between Signals, Leads, assignment, calling, comps and
 * contracts. This page collapses that into one work queue:
 *
 *   filter (source/county/contact) → select → bulk assign → work the lead
 *   (call outcomes, status progression, skip trace, ARV deal math)
 *
 * Reuses: GET /api/leads (all filter/sort params), /api/lead-source-options,
 * /api/users, PATCH /api/leads/:id, POST /api/leads/:id/notes,
 * POST /api/leads/bulk-assign, POST /api/leads/:id/skip-trace.
 * Canonical stages from @shared/pipeline-stages — no duplicate taxonomy.
 */
import { LEAD_STAGES, LEAD_STAGE_LABELS } from "@shared/pipeline-stages";
import { Layout } from "@/components/layout/Layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import {
  Phone,
  Mail,
  PhoneOff,
  UserCheck,
  ChevronRight,
  Filter,
  Search,
  Zap,
  Calculator,
  Radar,
  CheckCircle2,
} from "lucide-react";

// Pipeline progression surfaced in Intake (subset of canonical LEAD_STAGES).
const INTAKE_STAGES = ["new", "contacted", "qualified", "negotiation", "under_contract"] as const;

const CALL_OUTCOMES = [
  { value: "called", label: "Called", icon: Phone, note: "Call: Attempted — no outcome recorded" },
  { value: "no_answer", label: "No Answer", icon: PhoneOff, note: "Call: No answer" },
  { value: "contacted", label: "Contacted", icon: UserCheck, note: "Call: Contacted owner", toStatus: "contacted" },
  { value: "follow_up", label: "Follow-up", icon: CheckCircle2, note: "Call: Follow-up scheduled" },
] as const;

function fmtMoney(v: any): string {
  const n = Number(v);
  if (!Number.isFinite(n) || n <= 0) return "—";
  return "$" + Math.round(n).toLocaleString();
}

function contactLevel(lead: any): "both" | "phone" | "email" | "none" {
  const hasPhone = !!(lead.ownerPhone || "").trim();
  const hasEmail = !!(lead.ownerEmail || "").trim();
  if (hasPhone && hasEmail) return "both";
  if (hasPhone) return "phone";
  if (hasEmail) return "email";
  return "none";
}

export default function Intake() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // ── Filters ────────────────────────────────────────────────────────────
  const [query, setQuery] = useState("");
  const [source, setSource] = useState("all");
  const [county, setCounty] = useState("");
  const [assignedTo, setAssignedTo] = useState("all");
  const [contact, setContact] = useState("all");
  const [status, setStatus] = useState("all");

  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [detailId, setDetailId] = useState<number | null>(null);
  const [assignUserId, setAssignUserId] = useState("");

  const filtersKey = useMemo(
    () => ["intake", { query, source, county, assignedTo, contact, status }],
    [query, source, county, assignedTo, contact, status]
  );

  const pageSize = 100;
  const {
    data: pages,
    isLoading,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useInfiniteQuery<any>({
    queryKey: filtersKey,
    initialPageParam: 0,
    queryFn: async ({ pageParam }) => {
      const p = new URLSearchParams();
      p.set("limit", String(pageSize));
      p.set("offset", String(pageParam || 0));
      p.set("sortKey", "highest_score"); // distress-score leads first by default
      if (query.trim()) p.set("q", query.trim());
      if (source !== "all") p.set("source", source);
      if (county.trim()) p.set("county", county.trim());
      if (assignedTo !== "all") p.set("assignedTo", assignedTo);
      if (contact !== "all") p.set("contactPresence", contact === "none" ? "none" : contact === "phone" ? "phone_only" : contact === "email" ? "email_only" : "both");
      if (status !== "all") p.set("status", status);
      const res = await apiRequest("GET", `/api/leads?${p.toString()}`);
      return await res.json();
    },
    getNextPageParam: (lastPage, allPages) => {
      const total = Number(lastPage?.total || 0);
      const loaded = allPages.reduce((acc, pg) => acc + (Array.isArray(pg?.items) ? pg.items.length : 0), 0);
      if (!total || loaded >= total) return undefined;
      return loaded;
    },
  });

  const leads: any[] = useMemo(
    () => (pages?.pages || []).flatMap((pg: any) => (Array.isArray(pg?.items) ? pg.items : [])),
    [pages]
  );
  const total = Number(pages?.pages?.[0]?.total || 0);

  // ── Supporting data ────────────────────────────────────────────────────
  const { data: sourceOptionsData } = useQuery({
    queryKey: ["/api/lead-source-options"],
    queryFn: async () => (await apiRequest("GET", "/api/lead-source-options")).json(),
  });
  const sourceOptions: any[] = sourceOptionsData?.options || sourceOptionsData || [];

  const { data: usersData } = useQuery({
    queryKey: ["/api/users"],
    queryFn: async () => (await apiRequest("GET", "/api/users")).json(),
  });
  const users: any[] = (usersData?.users || []).filter((u: any) => u.isActive !== false);
  const userName = (id: any) => users.find((u: any) => u.id === Number(id))?.name || users.find((u: any) => u.id === Number(id))?.email || "—";

  const detailLead = useMemo(
    () => leads.find((l: any) => l.id === detailId) || null,
    [leads, detailId]
  );

  // ── Mutations ──────────────────────────────────────────────────────────
  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["intake"] });
    queryClient.invalidateQueries({ queryKey: ["leads"] });
  };

  const bulkAssignMutation = useMutation({
    mutationFn: async ({ leadIds, userId }: { leadIds: number[]; userId: number }) =>
      (await apiRequest("POST", "/api/leads/bulk-assign", { leadIds, userId })).json(),
    onSuccess: (r: any) => {
      invalidate();
      setSelectedIds(new Set());
      setAssignUserId("");
      toast({ title: `Assigned ${r.assigned} lead${r.assigned === 1 ? "" : "s"}` });
    },
    onError: (e: any) => toast({ title: "Bulk assign failed", description: e.message, variant: "destructive" }),
  });

  const patchLeadMutation = useMutation({
    mutationFn: async ({ id, patch }: { id: number; patch: Record<string, any> }) =>
      (await apiRequest("PATCH", `/api/leads/${id}`, patch)).json(),
    onSuccess: () => invalidate(),
    onError: (e: any) => toast({ title: "Update failed", description: e.message, variant: "destructive" }),
  });

  const logCallMutation = useMutation({
    mutationFn: async ({ id, outcome }: { id: number; outcome: (typeof CALL_OUTCOMES)[number] }) => {
      await apiRequest("PATCH", `/api/leads/${id}`, { lastTouchAt: new Date().toISOString() });
      const patch: Record<string, any> = {};
      if ((outcome as any).toStatus) patch.status = (outcome as any).toStatus;
      if (Object.keys(patch).length) await apiRequest("PATCH", `/api/leads/${id}`, patch);
      await apiRequest("POST", `/api/leads/${id}/notes`, { body: outcome.note });
      return outcome;
    },
    onSuccess: (outcome) => {
      invalidate();
      toast({ title: `Logged: ${outcome.label}` });
    },
    onError: (e: any) => toast({ title: "Call log failed", description: e.message, variant: "destructive" }),
  });

  const skipTraceMutation = useMutation({
    mutationFn: async (id: number) =>
      (await apiRequest("POST", `/api/leads/${id}/skip-trace`, {})).json(),
    onSuccess: (r: any) => {
      invalidate();
      toast({ title: r?.cached ? "Skip trace (cached result)" : "Skip trace complete" });
    },
    onError: (e: any) => toast({ title: "Skip trace failed", description: e.message, variant: "destructive" }),
  });

  const toggleSelect = (id: number, checked: boolean) =>
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });

  const toggleSelectAll = (checked: boolean) =>
    setSelectedIds(checked ? new Set(leads.map((l: any) => l.id)) : new Set());

  const allSelected = leads.length > 0 && leads.every((l: any) => selectedIds.has(l.id));

  // ── Render helpers ─────────────────────────────────────────────────────
  const scoreBadge = (lead: any) => {
    const s = Number(lead.relasScore);
    if (!Number.isFinite(s) || s <= 0) return null;
    const hot = s >= 80;
    return (
      <Badge variant={hot ? "destructive" : "secondary"} className="gap-1">
        <Zap className="h-3 w-3" />
        {s}
      </Badge>
    );
  };

  const contactBadges = (lead: any) => {
    const level = contactLevel(lead);
    return (
      <span className="inline-flex items-center gap-1.5">
        <span title={lead.ownerPhone || "No phone"}>
          <Phone className={`h-3.5 w-3.5 ${level === "both" || level === "phone" ? "text-emerald-600" : "text-muted-foreground/30"}`} />
        </span>
        <span title={lead.ownerEmail || "No email"}>
          <Mail className={`h-3.5 w-3.5 ${level === "both" || level === "email" ? "text-emerald-600" : "text-muted-foreground/30"}`} />
        </span>
        {level === "none" && (
          <Badge variant="outline" className="text-[10px] text-amber-700 border-amber-300">
            needs skip trace
          </Badge>
        )}
      </span>
    );
  };

  return (
    <Layout>
      <div className="p-4 md:p-6 max-w-7xl mx-auto w-full">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-2xl font-semibold">Lead Intake</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              One work queue: filter → assign → call → qualify → offer. Distress-score leads first.
            </p>
          </div>
          <Badge variant="secondary" className="text-sm">
            {total.toLocaleString()} in queue
          </Badge>
        </div>

        {/* Filter bar */}
        <div className="grid grid-cols-2 md:grid-cols-6 gap-2 mb-4">
          <div className="col-span-2 relative">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search address, owner…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="pl-8"
            />
          </div>
          <Select value={source} onValueChange={setSource}>
            <SelectTrigger><SelectValue placeholder="Source" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All sources</SelectItem>
              {sourceOptions.map((s: any) => (
                <SelectItem key={s.value || s} value={s.value || s}>
                  {s.label || s}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Input
            placeholder="County"
            value={county}
            onChange={(e) => setCounty(e.target.value)}
          />
          <Select value={assignedTo} onValueChange={setAssignedTo}>
            <SelectTrigger><SelectValue placeholder="Assignee" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All agents</SelectItem>
              <SelectItem value="unassigned">Unassigned</SelectItem>
              {users.map((u: any) => (
                <SelectItem key={u.id} value={String(u.id)}>
                  {u.name || u.email}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={contact} onValueChange={setContact}>
            <SelectTrigger><SelectValue placeholder="Contact" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Any contact</SelectItem>
              <SelectItem value="none">Needs skip trace</SelectItem>
              <SelectItem value="phone">Has phone</SelectItem>
              <SelectItem value="email">Has email</SelectItem>
              <SelectItem value="both">Phone + email</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-center gap-2 mb-4">
          <Filter className="h-4 w-4 text-muted-foreground" />
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger className="w-40"><SelectValue placeholder="Status" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              {(LEAD_STAGES as readonly string[]).map((s) => (
                <SelectItem key={s} value={s}>
                  {LEAD_STAGE_LABELS[s as keyof typeof LEAD_STAGE_LABELS] || s}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {(query || source !== "all" || county || assignedTo !== "all" || contact !== "all" || status !== "all") && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setQuery(""); setSource("all"); setCounty("");
                setAssignedTo("all"); setContact("all"); setStatus("all");
              }}
            >
              Clear
            </Button>
          )}
        </div>

        {/* Bulk assign bar */}
        {selectedIds.size > 0 && (
          <div className="flex items-center gap-2 mb-4 p-3 rounded-lg border bg-muted/40 sticky top-0 z-10">
            <span className="text-sm font-medium">{selectedIds.size} selected</span>
            <Select value={assignUserId} onValueChange={setAssignUserId}>
              <SelectTrigger className="w-48"><SelectValue placeholder="Assign to agent…" /></SelectTrigger>
              <SelectContent>
                {users.map((u: any) => (
                  <SelectItem key={u.id} value={String(u.id)}>
                    {u.name || u.email}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              size="sm"
              disabled={!assignUserId || bulkAssignMutation.isPending}
              onClick={() =>
                bulkAssignMutation.mutate({
                  leadIds: [...selectedIds],
                  userId: Number(assignUserId),
                })
              }
            >
              {bulkAssignMutation.isPending ? "Assigning…" : "Assign"}
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setSelectedIds(new Set())}>
              Clear
            </Button>
          </div>
        )}

        {/* Queue — desktop table */}
        <div className="hidden md:block rounded-lg border overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10">
                  <Checkbox checked={allSelected} onCheckedChange={(c) => toggleSelectAll(!!c)} />
                </TableHead>
                <TableHead>Score</TableHead>
                <TableHead>Property / Owner</TableHead>
                <TableHead>Source</TableHead>
                <TableHead>County</TableHead>
                <TableHead>Contact</TableHead>
                <TableHead>Assigned</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-10"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow><TableCell colSpan={9} className="text-center py-8 text-muted-foreground">Loading queue…</TableCell></TableRow>
              ) : leads.length === 0 ? (
                <TableRow><TableCell colSpan={9} className="text-center py-8 text-muted-foreground">No leads match these filters.</TableCell></TableRow>
              ) : (
                leads.map((lead: any) => (
                  <TableRow
                    key={lead.id}
                    className="cursor-pointer hover:bg-muted/40"
                    onClick={() => setDetailId(lead.id)}
                  >
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      <Checkbox
                        checked={selectedIds.has(lead.id)}
                        onCheckedChange={(c) => toggleSelect(lead.id, !!c)}
                      />
                    </TableCell>
                    <TableCell>{scoreBadge(lead)}</TableCell>
                    <TableCell>
                      <div className="font-medium text-sm">{lead.address}</div>
                      <div className="text-xs text-muted-foreground">
                        {lead.city}, {lead.state} {lead.zipCode} · {lead.ownerName || "Unknown owner"}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="text-[11px]">{lead.source || "—"}</Badge>
                    </TableCell>
                    <TableCell className="text-sm">{lead.county || "—"}</TableCell>
                    <TableCell>{contactBadges(lead)}</TableCell>
                    <TableCell className="text-sm">{lead.assignedTo ? userName(lead.assignedTo) : <span className="text-muted-foreground">Unassigned</span>}</TableCell>
                    <TableCell>
                      <Badge variant="secondary" className="text-[11px]">
                        {(LEAD_STAGE_LABELS as any)[lead.status] || lead.status}
                      </Badge>
                    </TableCell>
                    <TableCell><ChevronRight className="h-4 w-4 text-muted-foreground" /></TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>

        {/* Queue — mobile cards */}
        <div className="md:hidden space-y-2">
          {isLoading ? (
            <div className="text-center py-8 text-muted-foreground text-sm">Loading queue…</div>
          ) : leads.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground text-sm">No leads match these filters.</div>
          ) : (
            leads.map((lead: any) => (
              <div
                key={lead.id}
                className="rounded-lg border p-3 flex gap-3 cursor-pointer active:bg-muted/40"
                onClick={() => setDetailId(lead.id)}
              >
                <div onClick={(e) => e.stopPropagation()} className="pt-1">
                  <Checkbox
                    checked={selectedIds.has(lead.id)}
                    onCheckedChange={(c) => toggleSelect(lead.id, !!c)}
                  />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-sm truncate">{lead.address}</span>
                    {scoreBadge(lead)}
                  </div>
                  <div className="text-xs text-muted-foreground truncate">
                    {lead.city}, {lead.state} · {lead.ownerName || "Unknown owner"}
                  </div>
                  <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                    <Badge variant="outline" className="text-[10px]">{lead.source || "—"}</Badge>
                    {contactBadges(lead)}
                    <Badge variant="secondary" className="text-[10px]">
                      {(LEAD_STAGE_LABELS as any)[lead.status] || lead.status}
                    </Badge>
                  </div>
                </div>
                <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0 self-center" />
              </div>
            ))
          )}
        </div>

        {hasNextPage && (
          <div className="flex justify-center mt-4">
            <Button
              variant="outline"
              disabled={isFetchingNextPage}
              onClick={() => fetchNextPage()}
            >
              {isFetchingNextPage ? "Loading…" : `Load more (${total.toLocaleString()} total)`}
            </Button>
          </div>
        )}

        {/* Detail drawer */}
        <LeadIntakeDrawer
          lead={detailLead}
          open={detailId !== null}
          onClose={() => setDetailId(null)}
          userName={userName}
          patchLead={(patch) => detailId && patchLeadMutation.mutate({ id: detailId, patch })}
          patching={patchLeadMutation.isPending}
          logCall={(outcome) => detailId && logCallMutation.mutate({ id: detailId, outcome })}
          loggingCall={logCallMutation.isPending}
          runSkipTrace={() => detailId && skipTraceMutation.mutate(detailId)}
          skipTracing={skipTraceMutation.isPending}
        />
      </div>
    </Layout>
  );
}

/* ── Lead detail drawer: work one lead end-to-end ─────────────────────────── */
function LeadIntakeDrawer({
  lead,
  open,
  onClose,
  userName,
  patchLead,
  patching,
  logCall,
  loggingCall,
  runSkipTrace,
  skipTracing,
}: {
  lead: any | null;
  open: boolean;
  onClose: () => void;
  userName: (id: any) => string;
  patchLead: (patch: Record<string, any>) => void;
  patching: boolean;
  logCall: (outcome: (typeof CALL_OUTCOMES)[number]) => void;
  loggingCall: boolean;
  runSkipTrace: () => void;
  skipTracing: boolean;
}) {
  const [arv, setArv] = useState("");
  const [repairs, setRepairs] = useState("");
  const [estValue, setEstValue] = useState("");
  const [initializedFor, setInitializedFor] = useState<number | null>(null);

  if (lead && initializedFor !== lead.id) {
    setArv(lead.arvEstimate != null ? String(lead.arvEstimate) : "");
    setRepairs(lead.repairEstimate != null ? String(lead.repairEstimate) : "");
    setEstValue(lead.estimatedValue != null ? String(lead.estimatedValue) : "");
    setInitializedFor(lead.id);
  }

  if (!lead) return null;

  const stageIdx = INTAKE_STAGES.indexOf(lead.status as any);
  const arvNum = Number(arv);
  const repairNum = Number(repairs);
  const maxOffer =
    Number.isFinite(arvNum) && arvNum > 0
      ? Math.round(arvNum * 0.7 - (Number.isFinite(repairNum) ? repairNum : 0))
      : null;

  const saveDealMath = () => {
    const patch: Record<string, any> = {};
    if (arv.trim() !== "") patch.arvEstimate = arv.trim();
    if (repairs.trim() !== "") patch.repairEstimate = repairs.trim();
    if (estValue.trim() !== "") patch.estimatedValue = estValue.trim();
    if (Object.keys(patch).length) patchLead(patch);
  };

  return (
    <Sheet open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="text-left">{lead.address}</SheetTitle>
          <SheetDescription className="text-left">
            {lead.city}, {lead.state} {lead.zipCode} · {lead.ownerName || "Unknown owner"}
          </SheetDescription>
        </SheetHeader>

        <div className="space-y-6 mt-6 pb-8">
          {/* Status progression */}
          <section>
            <h3 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-2">
              Pipeline stage
            </h3>
            <div className="flex items-center gap-1 flex-wrap">
              {INTAKE_STAGES.map((s, i) => {
                const active = lead.status === s;
                const done = stageIdx > -1 && i < stageIdx;
                return (
                  <div key={s} className="flex items-center gap-1">
                    <Button
                      size="sm"
                      variant={active ? "default" : done ? "secondary" : "outline"}
                      disabled={patching || active}
                      onClick={() => patchLead({ status: s })}
                      className="text-xs"
                    >
                      {(LEAD_STAGE_LABELS as any)[s]}
                    </Button>
                    {i < INTAKE_STAGES.length - 1 && (
                      <ChevronRight className="h-3 w-3 text-muted-foreground" />
                    )}
                  </div>
                );
              })}
            </div>
          </section>

          {/* Call outcomes */}
          <section>
            <h3 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-2">
              Log call outcome
            </h3>
            <div className="grid grid-cols-2 gap-2">
              {CALL_OUTCOMES.map((o) => (
                <Button
                  key={o.value}
                  variant="outline"
                  size="sm"
                  disabled={loggingCall}
                  onClick={() => logCall(o)}
                  className="justify-start gap-2"
                >
                  <o.icon className="h-4 w-4" />
                  {o.label}
                </Button>
              ))}
            </div>
            {lead.lastTouchAt && (
              <p className="text-xs text-muted-foreground mt-2">
                Last touch: {new Date(lead.lastTouchAt).toLocaleString()}
              </p>
            )}
          </section>

          {/* Contact + skip trace */}
          <section>
            <h3 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-2">
              Contact
            </h3>
            <div className="space-y-1.5 text-sm">
              <div className="flex items-center gap-2">
                <Phone className="h-4 w-4 text-muted-foreground" />
                {lead.ownerPhone ? (
                  <a href={`tel:${lead.ownerPhone}`} className="text-primary underline">{lead.ownerPhone}</a>
                ) : (
                  <span className="text-muted-foreground">No phone on file</span>
                )}
              </div>
              <div className="flex items-center gap-2">
                <Mail className="h-4 w-4 text-muted-foreground" />
                {lead.ownerEmail ? (
                  <a href={`mailto:${lead.ownerEmail}`} className="text-primary underline">{lead.ownerEmail}</a>
                ) : (
                  <span className="text-muted-foreground">No email on file</span>
                )}
              </div>
            </div>
            {contactLevel(lead) === "none" && (
              <Button
                size="sm"
                className="mt-3 gap-2"
                disabled={skipTracing}
                onClick={runSkipTrace}
              >
                <Radar className="h-4 w-4" />
                {skipTracing ? "Tracing…" : "Run skip trace"}
              </Button>
            )}
            {contactLevel(lead) !== "none" && (
              <Button
                size="sm"
                variant="outline"
                className="mt-3 gap-2"
                disabled={skipTracing}
                onClick={runSkipTrace}
              >
                <Radar className="h-4 w-4" />
                {skipTracing ? "Tracing…" : "Re-run skip trace"}
              </Button>
            )}
          </section>

          {/* Comps / ARV */}
          <section>
            <h3 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-2">
              <span className="inline-flex items-center gap-1.5">
                <Calculator className="h-3.5 w-3.5" /> Deal math
              </span>
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              <div>
                <label className="text-[11px] text-muted-foreground">Est. value</label>
                <Input
                  value={estValue}
                  onChange={(e) => setEstValue(e.target.value)}
                  placeholder="$"
                  inputMode="decimal"
                />
              </div>
              <div>
                <label className="text-[11px] text-muted-foreground">ARV</label>
                <Input
                  value={arv}
                  onChange={(e) => setArv(e.target.value)}
                  placeholder="$"
                  inputMode="decimal"
                />
              </div>
              <div>
                <label className="text-[11px] text-muted-foreground">Repairs</label>
                <Input
                  value={repairs}
                  onChange={(e) => setRepairs(e.target.value)}
                  placeholder="$"
                  inputMode="decimal"
                />
              </div>
            </div>
            <div className="flex items-center justify-between mt-2">
              <Button size="sm" variant="outline" disabled={patching} onClick={saveDealMath}>
                Save deal math
              </Button>
              {maxOffer !== null && maxOffer > 0 && (
                <span className="text-sm">
                  <span className="text-muted-foreground">Max offer (70% rule): </span>
                  <span className="font-semibold">${maxOffer.toLocaleString()}</span>
                </span>
              )}
            </div>
            <p className="text-[11px] text-muted-foreground mt-2">
              Full comp snapshots live on the property record once this lead converts
              (Opportunities → comps). ARV here is the agent's working number.
            </p>
          </section>

          {/* Meta */}
          <section className="text-xs text-muted-foreground space-y-1 border-t pt-4">
            <div>Source: <span className="text-foreground">{lead.source || "—"}</span></div>
            <div>County: <span className="text-foreground">{lead.county || "—"}</span></div>
            <div>Assigned: <span className="text-foreground">{lead.assignedTo ? userName(lead.assignedTo) : "Unassigned"}</span></div>
            {lead.notes && (
              <div className="pt-2">
                <span className="font-medium text-foreground">Notes:</span>
                <p className="whitespace-pre-wrap mt-1">{lead.notes}</p>
              </div>
            )}
          </section>
        </div>
      </SheetContent>
    </Sheet>
  );
}
