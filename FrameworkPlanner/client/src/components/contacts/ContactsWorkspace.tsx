import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useLocation } from "wouter";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { cn } from "@/lib/utils";
import { Mail, MessageSquare, Network, Phone, Plus, Save, Search, Trash2, UserRoundCog } from "lucide-react";

type ContactListItem = {
  id: number;
  name: string;
  nickname?: string | null;
  email?: string | null;
  phone?: string | null;
  type?: string | null;
  company?: string | null;
  title?: string | null;
  market?: string | null;
  trustLevel?: number | null;
  vip?: boolean | null;
  doNotCall?: boolean | null;
  doNotText?: boolean | null;
  doNotEmail?: boolean | null;
  notes?: string | null;
  lastContactedAt?: string | null;
  nextFollowUpAt?: string | null;
  roles?: string[];
  tags?: string[];
  score?: number | null;
  companyPrimary?: { id: number; name: string } | null;
};

type SavedViewRow = {
  id: number;
  name: string;
  visibility: "private" | "team" | "link";
  configJson: any;
  shareToken?: string | null;
};

function formatE164(raw: string) {
  const digits = raw.replace(/[^\d+]/g, "");
  if (digits.startsWith("+")) return digits;
  if (digits.length === 10) return "+1" + digits;
  return digits;
}

function getContactIdFromLocation(): number | null {
  if (typeof window === "undefined") return null;
  const p = new URLSearchParams(window.location.search);
  const raw = p.get("contactId") || "";
  const n = raw ? parseInt(raw, 10) : 0;
  return Number.isFinite(n) && n > 0 ? n : null;
}

function setContactIdInUrl(navigate: (to: string) => void, contactId: number | null) {
  if (typeof window === "undefined") return;
  const p = new URLSearchParams(window.location.search);
  if (contactId) p.set("contactId", String(contactId));
  else p.delete("contactId");
  navigate(`/contacts?${p.toString()}`);
}

function getDefaultFilters() {
  return {
    query: "",
    market: "",
    roleKeys: [] as string[],
    tagKeys: [] as string[],
    sort: "recent" as "recent" | "score" | "name",
  };
}

export function ContactsWorkspace({ headerRight }: { headerRight?: ReactNode }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [location, navigate] = useLocation();

  const [filters, setFilters] = useState(() => getDefaultFilters());
  const [selectedView, setSelectedView] = useState<SavedViewRow | null>(null);
  const [selectedId, setSelectedId] = useState<number | null>(() => getContactIdFromLocation());

  useEffect(() => {
    setSelectedId(getContactIdFromLocation());
  }, [location]);

  const listKey = useMemo(() => {
    const p = new URLSearchParams();
    p.set("includeTotal", "1");
    p.set("limit", "200");
    p.set("offset", "0");
    if (filters.query.trim()) p.set("query", filters.query.trim());
    if (filters.market.trim()) p.set("market", filters.market.trim());
    if (filters.sort) p.set("sort", filters.sort);
    if (filters.roleKeys.length) p.set("role", filters.roleKeys.join(","));
    if (filters.tagKeys.length) p.set("tag", filters.tagKeys.join(","));
    return `/api/contacts?${p.toString()}`;
  }, [filters]);

  const { data: listResp, isFetching: listFetching } = useQuery<{ items: ContactListItem[]; total: number }>({
    queryKey: [listKey],
    queryFn: async () => {
      const res = await fetch(listKey, { credentials: "include" });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.message || "Failed to load contacts");
      if (!json || typeof json !== "object" || !Array.isArray((json as any).items)) throw new Error("Unexpected response");
      return json;
    },
  });

  const contacts = useMemo(() => (Array.isArray(listResp?.items) ? listResp!.items : []), [listResp?.items]);

  const selected = useMemo(() => (selectedId ? contacts.find((c) => c.id === selectedId) || null : null), [contacts, selectedId]);

  const { data: rolesResp } = useQuery<{ items: Array<{ id: number; key: string; label: string }> }>({
    queryKey: ["/api/contacts/meta/roles"],
    queryFn: async () => {
      const res = await fetch("/api/contacts/meta/roles", { credentials: "include" });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.message || "Failed to load roles");
      return json;
    },
  });

  const { data: tagsResp } = useQuery<{ items: Array<{ id: number; key: string; label: string; color?: string | null }> }>({
    queryKey: ["/api/contacts/meta/tags"],
    queryFn: async () => {
      const res = await fetch("/api/contacts/meta/tags", { credentials: "include" });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.message || "Failed to load tags");
      return json;
    },
  });

  const roleOptions = useMemo(() => (Array.isArray(rolesResp?.items) ? rolesResp!.items : []), [rolesResp?.items]);
  const tagOptions = useMemo(() => (Array.isArray(tagsResp?.items) ? tagsResp!.items : []), [tagsResp?.items]);

  const { data: viewsResp, refetch: refetchViews } = useQuery<{ items: SavedViewRow[] }>({
    queryKey: ["/api/contacts/views"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/contacts/views");
      return await res.json();
    },
  });

  const savedViews = useMemo(() => (Array.isArray(viewsResp?.items) ? viewsResp!.items : []), [viewsResp?.items]);

  const applyView = (v: SavedViewRow) => {
    setSelectedView(v);
    const cfg = v?.configJson && typeof v.configJson === "object" ? v.configJson : {};
    setFilters({
      query: String(cfg.query || ""),
      market: String(cfg.market || ""),
      roleKeys: Array.isArray(cfg.roleKeys) ? cfg.roleKeys.map((x: any) => String(x)).filter(Boolean) : [],
      tagKeys: Array.isArray(cfg.tagKeys) ? cfg.tagKeys.map((x: any) => String(x)).filter(Boolean) : [],
      sort: cfg.sort === "score" || cfg.sort === "name" || cfg.sort === "recent" ? cfg.sort : "recent",
    });
  };

  const saveViewMutation = useMutation({
    mutationFn: async (input: { name: string; visibility: "private" | "team" | "link" }) => {
      const payload = {
        name: input.name,
        visibility: input.visibility,
        configJson: { ...filters },
      };
      const res = await apiRequest("POST", "/api/contacts/views", payload);
      return await res.json();
    },
    onSuccess: async (row: any) => {
      await refetchViews();
      setSelectedView(row);
      toast({ title: "View saved" });
    },
    onError: (e: any) => toast({ title: "Save failed", description: String(e?.message || e), variant: "destructive" }),
  });

  const deleteViewMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await apiRequest("DELETE", `/api/contacts/views/${id}`);
      return await res.json();
    },
    onSuccess: async () => {
      await refetchViews();
      setSelectedView(null);
      toast({ title: "View deleted" });
    },
    onError: (e: any) => toast({ title: "Delete failed", description: String(e?.message || e), variant: "destructive" }),
  });

  const { data: timelineResp } = useQuery<{ items: any[] }>({
    queryKey: selectedId ? [`/api/contacts/${selectedId}/timeline`] : ["contacts.timeline.none"],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/contacts/${selectedId}/timeline?limit=100&offset=0`);
      return await res.json();
    },
    enabled: Boolean(selectedId),
  });

  const { data: graphResp } = useQuery<any>({
    queryKey: selectedId ? [`/api/contacts/${selectedId}/graph`] : ["contacts.graph.none"],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/contacts/${selectedId}/graph`);
      return await res.json();
    },
    enabled: Boolean(selectedId),
  });

  const [editOpen, setEditOpen] = useState(false);
  const [editForm, setEditForm] = useState<any>(() => ({
    name: "",
    nickname: "",
    phone: "",
    email: "",
    company: "",
    type: "",
    title: "",
    market: "",
    trustLevel: "",
    vip: false,
    doNotCall: false,
    doNotText: false,
    doNotEmail: false,
    notes: "",
  }));

  useEffect(() => {
    if (!selected) return;
    setEditForm({
      name: selected.name || "",
      nickname: selected.nickname || "",
      phone: selected.phone || "",
      email: selected.email || "",
      company: selected.company || "",
      type: selected.type || "",
      title: selected.title || "",
      market: selected.market || "",
      trustLevel: typeof selected.trustLevel === "number" ? String(selected.trustLevel) : "",
      vip: Boolean(selected.vip),
      doNotCall: Boolean(selected.doNotCall),
      doNotText: Boolean(selected.doNotText),
      doNotEmail: Boolean(selected.doNotEmail),
      notes: selected.notes || "",
    });
  }, [selected?.id]);

  const updateContactMutation = useMutation({
    mutationFn: async () => {
      if (!selectedId) throw new Error("No contact selected");
      const trustLevel = editForm.trustLevel ? Number(editForm.trustLevel) : null;
      const res = await apiRequest("PATCH", `/api/contacts/${selectedId}`, {
        name: String(editForm.name || "").trim(),
        nickname: String(editForm.nickname || "").trim() || null,
        phone: String(editForm.phone || "").trim() || null,
        email: String(editForm.email || "").trim() || null,
        company: String(editForm.company || "").trim() || null,
        type: String(editForm.type || "").trim() || null,
        title: String(editForm.title || "").trim() || null,
        market: String(editForm.market || "").trim() || null,
        trustLevel: Number.isFinite(trustLevel) ? trustLevel : null,
        vip: Boolean(editForm.vip),
        doNotCall: Boolean(editForm.doNotCall),
        doNotText: Boolean(editForm.doNotText),
        doNotEmail: Boolean(editForm.doNotEmail),
        notes: String(editForm.notes || "").trim() || null,
      });
      return await res.json();
    },
    onSuccess: async () => {
      setEditOpen(false);
      qc.invalidateQueries({ predicate: (q) => typeof q.queryKey?.[0] === "string" && String(q.queryKey[0]).startsWith("/api/contacts") });
      toast({ title: "Contact updated" });
    },
    onError: (e: any) => toast({ title: "Save failed", description: String(e?.message || e), variant: "destructive" }),
  });

  const [noteOpen, setNoteOpen] = useState(false);
  const [noteBody, setNoteBody] = useState("");
  const addNoteMutation = useMutation({
    mutationFn: async () => {
      if (!selectedId) throw new Error("No contact selected");
      const body = noteBody.trim();
      if (!body) throw new Error("Note is empty");
      const res = await apiRequest("POST", `/api/contacts/${selectedId}/notes`, { body });
      return await res.json();
    },
    onSuccess: async () => {
      setNoteBody("");
      setNoteOpen(false);
      qc.invalidateQueries({ queryKey: [`/api/contacts/${selectedId}/timeline`] });
      qc.invalidateQueries({ queryKey: [listKey] });
      toast({ title: "Note added" });
    },
    onError: (e: any) => toast({ title: "Note failed", description: String(e?.message || e), variant: "destructive" }),
  });

  const [smsOpen, setSmsOpen] = useState(false);
  const [smsBody, setSmsBody] = useState("");
  const sendSmsMutation = useMutation({
    mutationFn: async () => {
      if (!selected) throw new Error("No contact selected");
      const to = formatE164(String(selected.phone || ""));
      if (!to) throw new Error("Missing phone number");
      const body = smsBody.trim();
      if (!body) throw new Error("Message is empty");
      const res = await apiRequest("POST", "/api/telephony/sms", { to, body, metadata: { contactId: selected.id } });
      return await res.json();
    },
    onSuccess: async () => {
      setSmsBody("");
      setSmsOpen(false);
      qc.invalidateQueries({ queryKey: [`/api/contacts/${selectedId}/timeline`] });
      qc.invalidateQueries({ queryKey: [listKey] });
      toast({ title: "SMS queued" });
    },
    onError: (e: any) => toast({ title: "SMS failed", description: String(e?.message || e), variant: "destructive" }),
  });

  const [taskOpen, setTaskOpen] = useState(false);
  const [taskTitle, setTaskTitle] = useState("");
  const createTaskMutation = useMutation({
    mutationFn: async () => {
      if (!selectedId) throw new Error("No contact selected");
      const title = taskTitle.trim();
      if (!title) throw new Error("Task title is empty");
      const res = await apiRequest("POST", "/api/tasks", {
        title,
        status: "open",
        priority: "medium",
        relatedEntityType: "contact",
        relatedEntityId: selectedId,
      });
      return await res.json();
    },
    onSuccess: async () => {
      setTaskTitle("");
      setTaskOpen(false);
      qc.invalidateQueries({ queryKey: [`/api/contacts/${selectedId}/timeline`] });
      toast({ title: "Task created" });
    },
    onError: (e: any) => toast({ title: "Task failed", description: String(e?.message || e), variant: "destructive" }),
  });

  const [linkOpen, setLinkOpen] = useState(false);
  const [linkForm, setLinkForm] = useState({ entityType: "lead", entityId: "", relationship: "related" });
  const addLinkMutation = useMutation({
    mutationFn: async () => {
      if (!selectedId) throw new Error("No contact selected");
      const entityType = String(linkForm.entityType || "").trim();
      const entityId = Number(linkForm.entityId);
      const relationship = String(linkForm.relationship || "").trim() || "related";
      if (!entityType) throw new Error("Missing entity type");
      if (!Number.isFinite(entityId) || entityId <= 0) throw new Error("Invalid entity id");
      const res = await apiRequest("POST", `/api/contacts/${selectedId}/links`, { entityType, entityId, relationship });
      return await res.json();
    },
    onSuccess: async () => {
      setLinkOpen(false);
      setLinkForm({ entityType: "lead", entityId: "", relationship: "related" });
      qc.invalidateQueries({ queryKey: [`/api/contacts/${selectedId}/graph`] });
      toast({ title: "Link added" });
    },
    onError: (e: any) => toast({ title: "Link failed", description: String(e?.message || e), variant: "destructive" }),
  });

  const [mergeOpen, setMergeOpen] = useState(false);
  const [mergeId, setMergeId] = useState("");
  const mergeMutation = useMutation({
    mutationFn: async () => {
      if (!selectedId) throw new Error("No contact selected");
      const mergedId = Number(mergeId);
      if (!Number.isFinite(mergedId) || mergedId <= 0) throw new Error("Invalid merge id");
      const res = await apiRequest("POST", "/api/contacts/merge", { winnerId: selectedId, mergedId });
      return await res.json();
    },
    onSuccess: async () => {
      setMergeId("");
      setMergeOpen(false);
      await qc.invalidateQueries({ predicate: (q) => typeof q.queryKey?.[0] === "string" && String(q.queryKey[0]).startsWith("/api/contacts") });
      setContactIdInUrl(navigate, selectedId);
      toast({ title: "Contacts merged" });
    },
    onError: (e: any) => toast({ title: "Merge failed", description: String(e?.message || e), variant: "destructive" }),
  });

  const addRoleMutation = useMutation({
    mutationFn: async (roleKey: string) => {
      if (!selectedId) throw new Error("No contact selected");
      const key = String(roleKey || "").trim();
      if (!key) throw new Error("Role is empty");
      await apiRequest("POST", `/api/contacts/${selectedId}/roles`, { roleKey: key });
      return true;
    },
    onSuccess: async () => {
      qc.invalidateQueries({ queryKey: [listKey] });
      qc.invalidateQueries({ queryKey: [`/api/contacts/${selectedId}/graph`] });
    },
  });

  const addTagMutation = useMutation({
    mutationFn: async (tagKey: string) => {
      if (!selectedId) throw new Error("No contact selected");
      const key = String(tagKey || "").trim();
      if (!key) throw new Error("Tag is empty");
      await apiRequest("POST", `/api/contacts/${selectedId}/tags`, { tagKey: key });
      return true;
    },
    onSuccess: async () => {
      qc.invalidateQueries({ queryKey: [listKey] });
      qc.invalidateQueries({ queryKey: [`/api/contacts/${selectedId}/graph`] });
    },
  });

  const [newRole, setNewRole] = useState("");
  const [newTag, setNewTag] = useState("");

  return (
    <div className="p-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mb-4">
        <div className="flex items-center gap-2">
          <Network className="h-5 w-5 text-primary" />
          <div className="text-2xl font-bold">Contacts</div>
          <Badge variant="secondary">{listResp?.total ?? 0}</Badge>
        </div>
        <div className="flex items-center gap-2">
          <Dialog>
            <DialogTrigger asChild>
              <Button variant="outline" size="sm">
                <Plus className="h-4 w-4 mr-2" />
                Save Segment
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-md">
              <DialogHeader>
                <DialogTitle>Save Segment</DialogTitle>
              </DialogHeader>
              <SaveViewForm
                onSubmit={(name, visibility) => saveViewMutation.mutate({ name, visibility })}
                pending={saveViewMutation.isPending}
              />
            </DialogContent>
          </Dialog>
          {headerRight}
        </div>
      </div>

      <ResizablePanelGroup direction="horizontal" className="min-h-[72vh]" autoSaveId="contacts-workspace">
        <ResizablePanel defaultSize={28} minSize={22}>
          <Card className="h-full">
            <div className="p-4 space-y-3">
              <div className="flex items-center gap-2">
                <Search className="h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search name, phone, email, company, notes…"
                  value={filters.query}
                  onChange={(e) => setFilters((p) => ({ ...p, query: e.target.value }))}
                />
              </div>

              <div className="grid grid-cols-1 gap-2">
                <Input
                  placeholder="Market (e.g. Orlando)"
                  value={filters.market}
                  onChange={(e) => setFilters((p) => ({ ...p, market: e.target.value }))}
                />
                <Select value={filters.sort} onValueChange={(v: any) => setFilters((p) => ({ ...p, sort: v }))}>
                  <SelectTrigger>
                    <SelectValue placeholder="Sort" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="recent">Recently contacted</SelectItem>
                    <SelectItem value="score">Relationship score</SelectItem>
                    <SelectItem value="name">Name</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="flex flex-wrap gap-2">
                {filters.roleKeys.map((k) => (
                  <Badge
                    key={`role-${k}`}
                    variant="secondary"
                    className="cursor-pointer"
                    onClick={() => setFilters((p) => ({ ...p, roleKeys: p.roleKeys.filter((x) => x !== k) }))}
                  >
                    {k}
                  </Badge>
                ))}
                {filters.tagKeys.map((k) => (
                  <Badge
                    key={`tag-${k}`}
                    variant="outline"
                    className="cursor-pointer"
                    onClick={() => setFilters((p) => ({ ...p, tagKeys: p.tagKeys.filter((x) => x !== k) }))}
                  >
                    {k}
                  </Badge>
                ))}
              </div>

              <div className="grid grid-cols-2 gap-2">
                <Select
                  value=""
                  onValueChange={(v) => {
                    const key = String(v || "").trim();
                    if (!key) return;
                    setFilters((p) => (p.roleKeys.includes(key) ? p : { ...p, roleKeys: [...p.roleKeys, key] }));
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Add role" />
                  </SelectTrigger>
                  <SelectContent>
                    {roleOptions.map((r) => (
                      <SelectItem key={r.key} value={r.key}>
                        {r.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <Select
                  value=""
                  onValueChange={(v) => {
                    const key = String(v || "").trim();
                    if (!key) return;
                    setFilters((p) => (p.tagKeys.includes(key) ? p : { ...p, tagKeys: [...p.tagKeys, key] }));
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Add tag" />
                  </SelectTrigger>
                  <SelectContent>
                    {tagOptions.map((t) => (
                      <SelectItem key={t.key} value={t.key}>
                        {t.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <Separator />

              <div className="space-y-2">
                <div className="text-sm font-medium">Saved Segments</div>
                <ScrollArea className="h-32 pr-3">
                  <div className="space-y-1">
                    {savedViews.map((v) => (
                      <button
                        key={v.id}
                        type="button"
                        className={cn(
                          "w-full text-left rounded-md px-2 py-2 hover:bg-muted",
                          selectedView?.id === v.id ? "bg-muted" : undefined,
                        )}
                        onClick={() => applyView(v)}
                      >
                        <div className="text-sm font-medium truncate">{v.name}</div>
                        <div className="text-xs text-muted-foreground">{v.visibility}</div>
                      </button>
                    ))}
                    {!savedViews.length ? <div className="text-xs text-muted-foreground">No saved segments</div> : null}
                  </div>
                </ScrollArea>
                {selectedView ? (
                  <Button
                    size="sm"
                    variant="destructive"
                    onClick={() => deleteViewMutation.mutate(selectedView.id)}
                    disabled={deleteViewMutation.isPending}
                  >
                    <Trash2 className="h-4 w-4 mr-2" />
                    Delete Segment
                  </Button>
                ) : null}
              </div>
            </div>

            <Separator />

            <ScrollArea className="h-[calc(72vh-320px)]">
              <div className="p-2 space-y-1">
                {listFetching ? <div className="text-sm text-muted-foreground p-2">Loading…</div> : null}
                {!listFetching && !contacts.length ? <div className="text-sm text-muted-foreground p-2">No contacts</div> : null}
                {contacts.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    className={cn(
                      "w-full text-left rounded-md px-2 py-2 hover:bg-muted flex items-start justify-between gap-3",
                      selectedId === c.id ? "bg-muted" : undefined,
                    )}
                    onClick={() => {
                      setSelectedId(c.id);
                      setContactIdInUrl(navigate, c.id);
                    }}
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <div className="font-medium truncate">{c.name || "Unknown"}</div>
                        {typeof c.score === "number" ? <Badge variant="secondary">{c.score}</Badge> : null}
                        {c.vip ? <Badge>VIP</Badge> : null}
                      </div>
                      <div className="text-xs text-muted-foreground truncate">
                        {c.phone || c.email || c.companyPrimary?.name || c.company || "—"}
                      </div>
                      <div className="flex flex-wrap gap-1 mt-1">
                        {(c.roles || []).slice(0, 2).map((r) => (
                          <Badge key={`${c.id}-r-${r}`} variant="secondary" className="text-[10px]">
                            {r}
                          </Badge>
                        ))}
                        {(c.tags || []).slice(0, 1).map((t) => (
                          <Badge key={`${c.id}-t-${t}`} variant="outline" className="text-[10px]">
                            {t}
                          </Badge>
                        ))}
                      </div>
                    </div>
                    <div className="text-[10px] text-muted-foreground whitespace-nowrap">
                      {c.lastContactedAt ? new Date(c.lastContactedAt).toLocaleDateString() : ""}
                    </div>
                  </button>
                ))}
              </div>
            </ScrollArea>
          </Card>
        </ResizablePanel>

        <ResizableHandle withHandle />

        <ResizablePanel defaultSize={52} minSize={30}>
          <Card className="h-full">
            {!selected ? (
              <div className="p-6 text-sm text-muted-foreground">Select a contact</div>
            ) : (
              <div className="h-full flex flex-col">
                <div className="p-4 border-b">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-xl font-semibold truncate">{selected.name}</div>
                      <div className="text-sm text-muted-foreground truncate">
                        {selected.title ? `${selected.title} • ` : ""}
                        {selected.companyPrimary?.name || selected.company || ""}
                        {selected.market ? ` • ${selected.market}` : ""}
                      </div>
                      <div className="flex flex-wrap gap-2 mt-2">
                        {(selected.roles || []).map((r) => (
                          <Badge key={`sr-${r}`} variant="secondary">
                            {r}
                          </Badge>
                        ))}
                        {(selected.tags || []).map((t) => (
                          <Badge key={`st-${t}`} variant="outline">
                            {t}
                          </Badge>
                        ))}
                      </div>
                    </div>
                    <Dialog open={editOpen} onOpenChange={setEditOpen}>
                      <DialogTrigger asChild>
                        <Button variant="outline" size="sm">
                          <UserRoundCog className="h-4 w-4 mr-2" />
                          Edit
                        </Button>
                      </DialogTrigger>
                      <DialogContent className="max-w-lg">
                        <DialogHeader>
                          <DialogTitle>Edit Contact</DialogTitle>
                        </DialogHeader>
                        <div className="grid gap-3">
                          <div className="grid gap-1">
                            <Label>Name</Label>
                            <Input value={editForm.name} onChange={(e) => setEditForm((p: any) => ({ ...p, name: e.target.value }))} />
                          </div>
                          <div className="grid grid-cols-2 gap-2">
                            <div className="grid gap-1">
                              <Label>Nickname</Label>
                              <Input value={editForm.nickname} onChange={(e) => setEditForm((p: any) => ({ ...p, nickname: e.target.value }))} />
                            </div>
                            <div className="grid gap-1">
                              <Label>Title</Label>
                              <Input value={editForm.title} onChange={(e) => setEditForm((p: any) => ({ ...p, title: e.target.value }))} />
                            </div>
                          </div>
                          <div className="grid grid-cols-2 gap-2">
                            <div className="grid gap-1">
                              <Label>Phone</Label>
                              <Input value={editForm.phone} onChange={(e) => setEditForm((p: any) => ({ ...p, phone: e.target.value }))} />
                            </div>
                            <div className="grid gap-1">
                              <Label>Email</Label>
                              <Input value={editForm.email} onChange={(e) => setEditForm((p: any) => ({ ...p, email: e.target.value }))} />
                            </div>
                          </div>
                          <div className="grid grid-cols-2 gap-2">
                            <div className="grid gap-1">
                              <Label>Company (legacy)</Label>
                              <Input value={editForm.company} onChange={(e) => setEditForm((p: any) => ({ ...p, company: e.target.value }))} />
                            </div>
                            <div className="grid gap-1">
                              <Label>Type (legacy)</Label>
                              <Input value={editForm.type} onChange={(e) => setEditForm((p: any) => ({ ...p, type: e.target.value }))} />
                            </div>
                          </div>
                          <div className="grid grid-cols-2 gap-2">
                            <div className="grid gap-1">
                              <Label>Market</Label>
                              <Input value={editForm.market} onChange={(e) => setEditForm((p: any) => ({ ...p, market: e.target.value }))} />
                            </div>
                            <div className="grid gap-1">
                              <Label>Trust Level (0–100)</Label>
                              <Input value={editForm.trustLevel} onChange={(e) => setEditForm((p: any) => ({ ...p, trustLevel: e.target.value }))} />
                            </div>
                          </div>
                          <div className="grid gap-1">
                            <Label>Notes</Label>
                            <Textarea value={editForm.notes} onChange={(e) => setEditForm((p: any) => ({ ...p, notes: e.target.value }))} rows={4} />
                          </div>
                          <div className="flex justify-end">
                            <Button onClick={() => updateContactMutation.mutate()} disabled={!String(editForm.name || "").trim() || updateContactMutation.isPending}>
                              <Save className="h-4 w-4 mr-2" />
                              Save
                            </Button>
                          </div>
                        </div>
                      </DialogContent>
                    </Dialog>
                  </div>
                </div>

                <div className="p-4 border-b flex items-center gap-2">
                  <Input placeholder="Add role (e.g. buyer)" value={newRole} onChange={(e) => setNewRole(e.target.value)} />
                  <Button
                    variant="secondary"
                    onClick={() => addRoleMutation.mutate(newRole)}
                    disabled={!newRole.trim() || addRoleMutation.isPending}
                  >
                    Add Role
                  </Button>
                  <Input placeholder="Add tag (e.g. Orlando VIP)" value={newTag} onChange={(e) => setNewTag(e.target.value)} />
                  <Button variant="secondary" onClick={() => addTagMutation.mutate(newTag)} disabled={!newTag.trim() || addTagMutation.isPending}>
                    Add Tag
                  </Button>
                </div>

                <div className="flex-1 min-h-0">
                  <Tabs defaultValue="timeline" className="h-full flex flex-col">
                    <div className="px-4 pt-3">
                      <TabsList>
                        <TabsTrigger value="timeline">Timeline</TabsTrigger>
                        <TabsTrigger value="graph">Connections</TabsTrigger>
                      </TabsList>
                    </div>
                    <TabsContent value="timeline" className="flex-1 min-h-0 px-4 pb-4">
                      <ScrollArea className="h-full pr-3">
                        <div className="space-y-2">
                          {(timelineResp?.items || []).map((it: any) => (
                            <Card key={`${it.kind}-${it.id}`} className="p-3">
                              <div className="flex items-center justify-between gap-2">
                                <div className="text-sm font-medium truncate">{it.title || it.kind}</div>
                                <div className="text-xs text-muted-foreground whitespace-nowrap">
                                  {it.occurred_at ? new Date(it.occurred_at).toLocaleString() : ""}
                                </div>
                              </div>
                              {it.body ? <div className="text-sm mt-2 whitespace-pre-wrap">{it.body}</div> : null}
                            </Card>
                          ))}
                          {!timelineResp?.items?.length ? <div className="text-sm text-muted-foreground">No activity yet</div> : null}
                        </div>
                      </ScrollArea>
                    </TabsContent>
                    <TabsContent value="graph" className="flex-1 min-h-0 px-4 pb-4">
                      <ScrollArea className="h-full pr-3">
                        <div className="space-y-4">
                          <div>
                            <div className="text-sm font-medium mb-2">Linked Records</div>
                            <div className="grid grid-cols-2 gap-2">
                              {(graphResp?.linkedCounts || []).map((r: any) => (
                                <Card key={`${r.entityType}-${r.relationship}`} className="p-3">
                                  <div className="text-sm font-medium">{r.entityType}</div>
                                  <div className="text-xs text-muted-foreground">{r.relationship}</div>
                                  <div className="text-lg font-semibold mt-1">{r.count}</div>
                                </Card>
                              ))}
                              {!graphResp?.linkedCounts?.length ? <div className="text-sm text-muted-foreground">No links yet</div> : null}
                            </div>
                          </div>
                          <div>
                            <div className="text-sm font-medium mb-2">Top Connected</div>
                            <div className="space-y-2">
                              {(graphResp?.topConnected || []).map((c: any) => (
                                <Card key={`tc-${c.contactId}`} className="p-3 flex items-center justify-between gap-2">
                                  <div className="min-w-0">
                                    <div className="text-sm font-medium truncate">{c.name || `Contact ${c.contactId}`}</div>
                                    <div className="text-xs text-muted-foreground truncate">{c.phone || c.email || ""}</div>
                                  </div>
                                  <Badge variant="secondary">{c.sharedCount}</Badge>
                                </Card>
                              ))}
                              {!graphResp?.topConnected?.length ? <div className="text-sm text-muted-foreground">No connections yet</div> : null}
                            </div>
                          </div>
                          <div>
                            <div className="text-sm font-medium mb-2">Explicit Relationships</div>
                            <div className="space-y-2">
                              {(graphResp?.relationships || []).map((r: any) => (
                                <Card key={`rel-${r.id}`} className="p-3">
                                  <div className="text-sm font-medium">{r.relationship}</div>
                                  <div className="text-xs text-muted-foreground">
                                    {r.fromContactId === selected.id ? r.toName : r.fromName}
                                  </div>
                                </Card>
                              ))}
                              {!graphResp?.relationships?.length ? <div className="text-sm text-muted-foreground">No relationships yet</div> : null}
                            </div>
                          </div>
                        </div>
                      </ScrollArea>
                    </TabsContent>
                  </Tabs>
                </div>
              </div>
            )}
          </Card>
        </ResizablePanel>

        <ResizableHandle withHandle />

        <ResizablePanel defaultSize={20} minSize={18}>
          <Card className="h-full">
            <div className="p-4 space-y-3">
              <div className="text-sm font-medium">Actions</div>
              <Button
                className="w-full"
                onClick={() => {
                  if (!selected?.phone) return;
                  const formatted = formatE164(String(selected.phone || ""));
                  navigate(`/phone?tab=dial&number=${encodeURIComponent(formatted)}`);
                }}
                disabled={!selected?.phone}
              >
                <Phone className="h-4 w-4 mr-2" />
                Call
              </Button>

              <Dialog open={smsOpen} onOpenChange={setSmsOpen}>
                <DialogTrigger asChild>
                  <Button className="w-full" variant="secondary" disabled={!selected?.phone}>
                    <MessageSquare className="h-4 w-4 mr-2" />
                    Text
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-w-lg">
                  <DialogHeader>
                    <DialogTitle>Send SMS</DialogTitle>
                  </DialogHeader>
                  <div className="grid gap-3">
                    <Textarea value={smsBody} onChange={(e) => setSmsBody(e.target.value)} rows={6} placeholder="Type message…" />
                    <div className="flex justify-end">
                      <Button onClick={() => sendSmsMutation.mutate()} disabled={!smsBody.trim() || sendSmsMutation.isPending || !selected?.phone}>
                        Send
                      </Button>
                    </div>
                  </div>
                </DialogContent>
              </Dialog>

              <Button className="w-full" variant="outline" asChild disabled={!selected?.email}>
                <a href={selected?.email ? `mailto:${encodeURIComponent(String(selected.email || ""))}` : "#"} aria-disabled={!selected?.email}>
                  <Mail className="h-4 w-4 mr-2" />
                  Email
                </a>
              </Button>

              <Dialog open={noteOpen} onOpenChange={setNoteOpen}>
                <DialogTrigger asChild>
                  <Button className="w-full" variant="secondary" disabled={!selectedId}>
                    <Plus className="h-4 w-4 mr-2" />
                    Add Note
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-w-lg">
                  <DialogHeader>
                    <DialogTitle>Add Note</DialogTitle>
                  </DialogHeader>
                  <div className="grid gap-3">
                    <Textarea value={noteBody} onChange={(e) => setNoteBody(e.target.value)} rows={6} placeholder="What happened? What’s next?" />
                    <div className="flex justify-end">
                      <Button onClick={() => addNoteMutation.mutate()} disabled={!noteBody.trim() || addNoteMutation.isPending}>
                        Save
                      </Button>
                    </div>
                  </div>
                </DialogContent>
              </Dialog>

              <Dialog open={taskOpen} onOpenChange={setTaskOpen}>
                <DialogTrigger asChild>
                  <Button className="w-full" variant="secondary" disabled={!selectedId}>
                    <Plus className="h-4 w-4 mr-2" />
                    Add Task
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-w-lg">
                  <DialogHeader>
                    <DialogTitle>Create Task</DialogTitle>
                  </DialogHeader>
                  <div className="grid gap-3">
                    <Input value={taskTitle} onChange={(e) => setTaskTitle(e.target.value)} placeholder="Follow up, send docs, request quote…" />
                    <div className="flex justify-end">
                      <Button onClick={() => createTaskMutation.mutate()} disabled={!taskTitle.trim() || createTaskMutation.isPending}>
                        Create
                      </Button>
                    </div>
                  </div>
                </DialogContent>
              </Dialog>

              <Dialog open={linkOpen} onOpenChange={setLinkOpen}>
                <DialogTrigger asChild>
                  <Button className="w-full" variant="outline" disabled={!selectedId}>
                    <Plus className="h-4 w-4 mr-2" />
                    Link Record
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-w-lg">
                  <DialogHeader>
                    <DialogTitle>Link Record</DialogTitle>
                  </DialogHeader>
                  <div className="grid gap-3">
                    <div className="grid grid-cols-2 gap-2">
                      <Select value={linkForm.entityType} onValueChange={(v) => setLinkForm((p) => ({ ...p, entityType: v }))}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="lead">Lead</SelectItem>
                          <SelectItem value="opportunity">Opportunity</SelectItem>
                          <SelectItem value="property">Property</SelectItem>
                          <SelectItem value="contract">Contract</SelectItem>
                          <SelectItem value="buyer">Buyer</SelectItem>
                        </SelectContent>
                      </Select>
                      <Input value={linkForm.entityId} onChange={(e) => setLinkForm((p) => ({ ...p, entityId: e.target.value }))} placeholder="Entity ID" />
                    </div>
                    <Input value={linkForm.relationship} onChange={(e) => setLinkForm((p) => ({ ...p, relationship: e.target.value }))} placeholder="Relationship (seller, lender, contractor…)" />
                    <div className="flex justify-end">
                      <Button onClick={() => addLinkMutation.mutate()} disabled={addLinkMutation.isPending}>
                        Link
                      </Button>
                    </div>
                  </div>
                </DialogContent>
              </Dialog>

              <Dialog open={mergeOpen} onOpenChange={setMergeOpen}>
                <DialogTrigger asChild>
                  <Button className="w-full" variant="destructive" disabled={!selectedId}>
                    <Trash2 className="h-4 w-4 mr-2" />
                    Merge Duplicate
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-w-md">
                  <DialogHeader>
                    <DialogTitle>Merge Duplicate</DialogTitle>
                  </DialogHeader>
                  <div className="grid gap-3">
                    <div className="text-sm text-muted-foreground">
                      This merges another contact into the currently selected contact (winner).
                    </div>
                    <Input value={mergeId} onChange={(e) => setMergeId(e.target.value)} placeholder="Duplicate Contact ID" />
                    <div className="flex justify-end">
                      <Button variant="destructive" onClick={() => mergeMutation.mutate()} disabled={!mergeId.trim() || mergeMutation.isPending}>
                        Merge
                      </Button>
                    </div>
                  </div>
                </DialogContent>
              </Dialog>
            </div>
          </Card>
        </ResizablePanel>
      </ResizablePanelGroup>
    </div>
  );
}

function SaveViewForm({
  onSubmit,
  pending,
}: {
  onSubmit: (name: string, visibility: "private" | "team" | "link") => void;
  pending: boolean;
}) {
  const [name, setName] = useState("");
  const [visibility, setVisibility] = useState<"private" | "team" | "link">("private");
  return (
    <div className="grid gap-3">
      <div className="grid gap-1">
        <Label>Name</Label>
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Cash Buyers FL" />
      </div>
      <div className="grid gap-1">
        <Label>Visibility</Label>
        <Select value={visibility} onValueChange={(v: any) => setVisibility(v)}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="private">Private</SelectItem>
            <SelectItem value="team">Team</SelectItem>
            <SelectItem value="link">Link</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="flex justify-end">
        <Button onClick={() => onSubmit(name.trim(), visibility)} disabled={!name.trim() || pending}>
          <Save className="h-4 w-4 mr-2" />
          Save
        </Button>
      </div>
    </div>
  );
}

