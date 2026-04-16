import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { ResearchHub, type PlaygroundQuickLink, type PlaygroundResearchNote } from "@/components/underwriting/ResearchHub";
import { UnderwriteDealPanel } from "@/components/underwriting/UnderwriteDealPanel";
import { makeAddressSearchUrl } from "@/utils/playgroundPersistence";
import { makeEmptyUnderwritingV1, underwritingSchemaV1, type UnderwritingComp, type UnderwritingV1 } from "@shared/underwriting";

type PlaygroundChecklistItem = { id: string; label: string; done: boolean; createdAt: string };
type PlaygroundChecklistJson = { prefs?: { browserMode?: "iframe" | "external" }; items?: PlaygroundChecklistItem[] };

type SubjectSnapshot = {
  address: string;
  beds?: number | null;
  baths?: number | null;
  sqft?: number | null;
  yearBuilt?: number | null;
  propertyType?: string | null;
  occupancy?: string | null;
};

type TemplateDto = { id: number; name: string; config: any };

function nowIso() {
  return new Date().toISOString();
}

function makeCompId() {
  return `${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

function safeJsonParse(value: unknown, fallback: any) {
  if (typeof value !== "string") return fallback;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function coerceQuickLinks(raw: any): PlaygroundQuickLink[] {
  if (!Array.isArray(raw)) return [];
  const out: PlaygroundQuickLink[] = [];
  for (const r of raw) {
    const id = typeof r?.id === "string" && r.id ? r.id : "";
    const name = typeof r?.name === "string" ? r.name : typeof r?.label === "string" ? r.label : "";
    const url = typeof r?.url === "string" ? r.url : "";
    const createdAt = typeof r?.createdAt === "string" && r.createdAt ? r.createdAt : new Date().toISOString();
    if (!id || !name || !url) continue;
    out.push({ id, name, url, createdAt });
  }
  return out;
}

function coerceNotes(raw: any): PlaygroundResearchNote[] {
  if (!Array.isArray(raw)) return [];
  const out: PlaygroundResearchNote[] = [];
  for (const r of raw) {
    const id = typeof r?.id === "string" && r.id ? r.id : "";
    const typeRaw = typeof r?.type === "string" ? r.type : "residential";
    const type =
      typeRaw === "land_vacant" || typeRaw === "commercial" || typeRaw === "multi_family" || typeRaw === "residential"
        ? typeRaw
        : "residential";
    const title = typeof r?.title === "string" ? r.title : "";
    const content = typeof r?.content === "string" ? r.content : "";
    const createdAt = typeof r?.createdAt === "string" && r.createdAt ? r.createdAt : new Date().toISOString();
    const updatedAt = typeof r?.updatedAt === "string" && r.updatedAt ? r.updatedAt : createdAt;
    if (!id) continue;
    out.push({ id, type, title, content, createdAt, updatedAt });
  }
  return out;
}

function coerceTags(raw: any): string[] {
  if (!Array.isArray(raw)) return [];
  const out: string[] = [];
  for (const t of raw) {
    const v = typeof t === "string" ? t.trim() : "";
    if (!v) continue;
    if (!out.includes(v)) out.push(v);
  }
  return out;
}

function coerceChecklist(raw: any): PlaygroundChecklistJson {
  if (!raw || typeof raw !== "object") return {};
  const prefsRaw = (raw as any).prefs;
  const prefsMode = prefsRaw?.browserMode === "external" ? "external" : prefsRaw?.browserMode === "iframe" ? "iframe" : undefined;
  const itemsRaw = (raw as any).items;
  const items: PlaygroundChecklistItem[] = [];
  if (Array.isArray(itemsRaw)) {
    for (const i of itemsRaw) {
      const id = typeof i?.id === "string" && i.id ? i.id : "";
      const label = typeof i?.label === "string" ? i.label : "";
      const done = Boolean(i?.done);
      const createdAt = typeof i?.createdAt === "string" && i.createdAt ? i.createdAt : new Date().toISOString();
      if (!id || !label.trim()) continue;
      items.push({ id, label: label.trim(), done, createdAt });
    }
  }
  return { prefs: prefsMode ? { browserMode: prefsMode } : undefined, items };
}

export function UnderwriteDealWorkspace(props: {
  address: string;
  propertyId?: number | null;
  leadId?: number | null;
  subject?: SubjectSnapshot | null;
  sessionId?: number | null;
}) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const address = String(props.address || "").trim();
  const propertyId = props.propertyId ?? null;
  const leadId = props.leadId ?? null;
  const subject = props.subject ?? null;

  const sessionKey = props.sessionId ? `id:${props.sessionId}` : propertyId ? `property:${propertyId}` : leadId ? `lead:${leadId}` : `addr:${address}`;

  const { data: session, isLoading: sessionLoading } = useQuery<any>({
    queryKey: ["/api/playground/sessions/open", sessionKey],
    queryFn: async () => {
      if (props.sessionId && props.sessionId > 0) {
        const res = await fetch(`/api/playground/sessions/${props.sessionId}`, { credentials: "include" });
        const json = await res.json();
        if (!res.ok) throw new Error(json?.message || "Failed to load session");
        return json;
      }
      if (!address) throw new Error("Address is required");
      const res = await fetch(`/api/playground/sessions/open`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ address, propertyId: propertyId ?? undefined, leadId: leadId ?? undefined }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.message || "Failed to open session");
      return json;
    },
    enabled: Boolean(address) || (props.sessionId ? props.sessionId > 0 : false),
  });

  const { data: templates } = useQuery<TemplateDto[]>({
    queryKey: ["/api/underwriting/templates"],
    queryFn: async () => {
      const res = await fetch("/api/underwriting/templates", { credentials: "include" });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.message || "Failed to load templates");
      return Array.isArray(json) ? json : [];
    },
  });

  const [currentUrl, setCurrentUrl] = useState<string>(() => makeAddressSearchUrl(address));
  const [underwriting, setUnderwriting] = useState<UnderwritingV1>(() => makeEmptyUnderwritingV1(nowIso()));
  const [quickLinks, setQuickLinks] = useState<PlaygroundQuickLink[]>([]);
  const [notes, setNotes] = useState<PlaygroundResearchNote[]>([]);
  const [tags, setTags] = useState<string[]>([]);
  const [checklist, setChecklist] = useState<PlaygroundChecklistItem[]>([]);
  const [browserMode, setBrowserMode] = useState<"iframe" | "external">("iframe");
  const [assignedTo, setAssignedTo] = useState<number | null>(null);
  const [assignmentDueAt, setAssignmentDueAt] = useState<string | null>(null);
  const [assignmentStatus, setAssignmentStatus] = useState<string | null>(null);
  const hydratedRef = useRef(false);
  const saveTimerRef = useRef<number | null>(null);

  useEffect(() => {
    if (!session) return;
    const nextUrl = String(session?.currentUrl || "").trim() || String(session?.current_url || "").trim() || makeAddressSearchUrl(address);
    setCurrentUrl(nextUrl);
    let raw: any = {};
    try {
      raw = session?.underwritingJson ? JSON.parse(session.underwritingJson) : {};
    } catch {
      raw = {};
    }
    const parsed = underwritingSchemaV1.safeParse(raw);
    setUnderwriting(parsed.success ? parsed.data : makeEmptyUnderwritingV1(nowIso()));
    const nextLinks = coerceQuickLinks(safeJsonParse(session?.bookmarksJson, []));
    const nextNotes = coerceNotes(safeJsonParse(session?.notesJson, []));
    const nextTags = coerceTags(safeJsonParse(session?.tagsJson, []));
    const checklistJson = coerceChecklist(safeJsonParse(session?.checklistJson, {}));
    setQuickLinks(nextLinks);
    setNotes(nextNotes);
    setTags(nextTags);
    setChecklist(checklistJson.items || []);
    setBrowserMode(checklistJson.prefs?.browserMode || "iframe");
    setAssignedTo(typeof session?.assignedTo === "number" ? session.assignedTo : null);
    setAssignmentDueAt(session?.assignmentDueAt ? new Date(session.assignmentDueAt as any).toISOString().slice(0, 10) : null);
    setAssignmentStatus(typeof session?.assignmentStatus === "string" && session.assignmentStatus.trim() ? session.assignmentStatus : null);
    hydratedRef.current = true;
  }, [session, address]);

  const patchSession = useMutation({
    mutationFn: async (patch: any) => {
      if (!session?.id) return null;
      const res = await fetch(`/api/playground/sessions/${session.id}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.message || "Failed to save session");
      return json;
    },
    onSuccess: (updated) => {
      if (!updated) return;
      qc.setQueryData(["/api/playground/sessions/open", sessionKey], updated);
    },
    onError: (e: any) => {
      toast({ title: "Save failed", description: e?.message || "Unknown error", variant: "destructive" });
    },
  });

  useEffect(() => {
    if (!hydratedRef.current) return;
    if (!session?.id) return;
    if (saveTimerRef.current) window.clearTimeout(saveTimerRef.current);
    saveTimerRef.current = window.setTimeout(() => {
      patchSession.mutate({
        currentUrl,
        tagsJson: JSON.stringify(tags || []),
        bookmarksJson: JSON.stringify(quickLinks || []),
        checklistJson: JSON.stringify({ prefs: { browserMode }, items: checklist || [] }),
        notesJson: JSON.stringify(notes || []),
        underwritingJson: JSON.stringify({ ...underwriting, updatedAt: nowIso() }),
        assignedTo,
        assignmentDueAt: assignmentDueAt ? new Date(`${assignmentDueAt}T00:00:00.000Z`).toISOString() : null,
        assignmentStatus,
      });
      saveTimerRef.current = null;
    }, 500);
    return () => {
      if (saveTimerRef.current) window.clearTimeout(saveTimerRef.current);
    };
  }, [currentUrl, notes, quickLinks, underwriting, tags, checklist, browserMode, assignedTo, assignmentDueAt, assignmentStatus, session?.id]);

  const { data: users } = useQuery<any[]>({
    queryKey: ["/api/users"],
    queryFn: async () => {
      const res = await fetch("/api/users", { credentials: "include" });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.message || "Failed to load users");
      return Array.isArray(json) ? json : [];
    },
  });

  const selectedTemplate = useMemo(() => {
    const tid = underwriting.templateId ? parseInt(underwriting.templateId, 10) : NaN;
    if (!Number.isFinite(tid)) return null;
    return (templates || []).find((t) => t.id === tid) || null;
  }, [templates, underwriting.templateId]);

  const addComp = (partial: { address?: string; url?: string; soldPrice?: number | null; sqft?: number | null; beds?: number | null; baths?: number | null; domDays?: number | null; distanceMi?: number | null }) => {
    const comp: UnderwritingComp = {
      id: makeCompId(),
      address: String(partial.address || address || "Comp").trim() || "Comp",
      url: partial.url || null,
      distanceMi: partial.distanceMi ?? null,
      domDays: partial.domDays ?? null,
      soldPrice: partial.soldPrice ?? null,
      sqft: partial.sqft ?? null,
      beds: partial.beds ?? null,
      baths: partial.baths ?? null,
      included: true,
      primary: false,
      createdAt: nowIso(),
    };
    setUnderwriting((u) => ({ ...u, comps: [comp, ...u.comps], updatedAt: nowIso() }));
    toast({ title: "Comp saved" });
  };

  const handleHotkeys = useRef<(e: KeyboardEvent) => void>(() => {});
  handleHotkeys.current = (e) => {
    if (e.defaultPrevented) return;
    const k = e.key.toLowerCase();
    if (k === "c" && !e.metaKey && !e.ctrlKey && !e.altKey) {
      e.preventDefault();
      addComp({ url: currentUrl, address: address || "Comp" });
      return;
    }
    if (k === "1" && !e.metaKey && !e.ctrlKey && !e.altKey) {
      e.preventDefault();
      setCurrentUrl(makeAddressSearchUrl(`${address} site:zillow.com`));
      return;
    }
    if (k === "2" && !e.metaKey && !e.ctrlKey && !e.altKey) {
      e.preventDefault();
      setCurrentUrl(makeAddressSearchUrl(`${address} site:redfin.com`));
      return;
    }
    if (k === "3" && !e.metaKey && !e.ctrlKey && !e.altKey) {
      e.preventDefault();
      setCurrentUrl(makeAddressSearchUrl(`${address} google maps`));
      return;
    }
  };

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => handleHotkeys.current(e);
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  if (sessionLoading) {
    return (
      <div className="flex items-center justify-center py-12 text-sm text-muted-foreground">
        Loading…
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 min-h-[70vh]">
      <div className="lg:col-span-7 min-h-[70vh]">
        <ResearchHub
          address={address}
          currentUrl={currentUrl}
          onUrlChange={setCurrentUrl}
          browserMode={browserMode}
          onBrowserModeChange={setBrowserMode}
          quickLinks={quickLinks}
          onQuickLinksChange={setQuickLinks}
          notes={notes}
          onNotesChange={setNotes}
          tags={tags}
          onTagsChange={setTags}
          checklist={checklist}
          onChecklistChange={setChecklist}
          assignedTo={assignedTo}
          onAssignedToChange={setAssignedTo}
          assignmentDueAt={assignmentDueAt}
          onAssignmentDueAtChange={setAssignmentDueAt}
          assignmentStatus={assignmentStatus}
          onAssignmentStatusChange={setAssignmentStatus}
          users={users || []}
          onSaveComp={(comp) => addComp({ ...comp, url: comp.url || currentUrl })}
        />
      </div>
      <div className="lg:col-span-5 min-h-[70vh]">
        <UnderwriteDealPanel
          subject={subject}
          underwriting={underwriting}
          templates={templates || []}
          selectedTemplate={selectedTemplate}
          onUnderwritingChange={setUnderwriting}
          onCreateTemplate={async (name, config) => {
            const res = await fetch("/api/underwriting/templates", {
              method: "POST",
              credentials: "include",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ name, config }),
            });
            const json = await res.json();
            if (!res.ok) throw new Error(json?.message || "Failed to create template");
            qc.invalidateQueries({ queryKey: ["/api/underwriting/templates"] });
            return json;
          }}
          onRunAi={async (payload) => {
            const res = await fetch("/api/underwriting/ai", {
              method: "POST",
              credentials: "include",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(payload),
            });
            const json = await res.json();
            if (!res.ok) throw new Error(json?.message || "AI request failed");
            return json;
          }}
        />
      </div>
    </div>
  );
}
