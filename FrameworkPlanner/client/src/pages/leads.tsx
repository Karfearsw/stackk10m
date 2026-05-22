import { Layout } from "@/components/layout/Layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Filter, Plus, Search, Building2, MoreHorizontal, Pencil, Trash2, Lightbulb, ListFilter, Columns2, Mic } from "lucide-react";
import { useLocation } from "wouter";
import { useInfiniteQuery, useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState, type MouseEvent } from "react";
import { useToast } from "@/hooks/use-toast";
import { PipelineBoard } from "@/components/pipeline/PipelineBoard";
import { LeadPipelineCard } from "@/components/pipeline/LeadPipelineCard";
import { EntityActivity } from "@/components/activity/EntityActivity";
import { EntityTasksWidget } from "@/components/tasks/EntityTasksWidget";
import { CrmImportExportDialog } from "@/components/crm/CrmImportExportDialog";
import { SkipTraceJobPanel } from "@/components/skipTrace/SkipTraceJobPanel";
import { VoiceActionDialog } from "@/components/leads/VoiceActionDialog";
import { apiRequest } from "@/lib/queryClient";
import { calendarUrl, dialerUrl, opportunityUrl, playgroundUrl, tasksUrl } from "@/lib/deepLinks";

const statusOptions = [
  { value: "new", label: "New" },
  { value: "contacted", label: "Contacted" },
  { value: "qualified", label: "Qualified" },
  { value: "negotiation", label: "Negotiation" },
  { value: "under_contract", label: "Under Contract" },
  { value: "closed", label: "Closed" },
  { value: "lost", label: "Lost" },
];

const CUSTOM_SOURCE_VALUE = "__custom__";

type LeadViewConfig = {
  filters: Record<string, any>;
  sort?: { key?: string; dir?: "asc" | "desc" };
  columns?: Record<string, boolean>;
  density?: "luxury" | "dense";
};

function hashString(input: string) {
  let h = 5381;
  for (let i = 0; i < input.length; i += 1) {
    h = (h * 33) ^ input.charCodeAt(i);
  }
  return h >>> 0;
}

function parseLeadViewConfig(input: any): LeadViewConfig {
  if (!input || typeof input !== "object") return { filters: {} };
  const filters = input.filters && typeof input.filters === "object" ? input.filters : {};
  const sortRaw = input.sort && typeof input.sort === "object" ? input.sort : {};
  const sortKey = typeof sortRaw.key === "string" ? sortRaw.key : undefined;
  const sortDir = sortRaw.dir === "asc" ? "asc" : sortRaw.dir === "desc" ? "desc" : undefined;
  const columns = input.columns && typeof input.columns === "object" ? input.columns : undefined;
  const density = input.density === "dense" ? "dense" : input.density === "luxury" ? "luxury" : undefined;
  return { filters, sort: { key: sortKey, dir: sortDir }, columns, density };
}

function parseFiltersFromUrl() {
  const p = new URLSearchParams(window.location.search);
  const get = (k: string) => String(p.get(k) || "");
  return {
    query: get("q"),
    status: get("status") || "all",
    statusIn: get("statusIn"),
    owner: get("owner"),
    zip: get("zip"),
    state: get("state"),
    city: get("city"),
    county: get("county"),
    leadType: get("leadType"),
    assignedTo: get("assignedTo") || "",
    tags: get("tags"),
    tagsMode: get("tagsMode") || "any",
    contactPresence: get("contactPresence") || "",
    scoreMin: get("scoreMin"),
    scoreMax: get("scoreMax"),
    archived: get("archived") || "exclude",
    hasNotes: get("hasNotes"),
    noteUpdatedWithinDays: get("noteUpdatedWithinDays"),
    lastTouchFrom: get("lastTouchFrom"),
    lastTouchTo: get("lastTouchTo"),
    nextFollowUpFrom: get("nextFollowUpFrom"),
    nextFollowUpTo: get("nextFollowUpTo"),
    createdFrom: get("createdFrom"),
    createdTo: get("createdTo"),
    sortKey: get("sortKey") || "newest_imported",
    sortDir: (get("sortDir") === "asc" ? "asc" : "desc") as "asc" | "desc",
    viewToken: get("viewToken"),
  };
}

function writeFiltersToUrl(filters: any) {
  const p = new URLSearchParams();
  const set = (k: string, v: any) => {
    const s = String(v || "").trim();
    if (!s) return;
    p.set(k, s);
  };
  set("q", filters.query);
  if (filters.status && filters.status !== "all") set("status", filters.status);
  set("statusIn", filters.statusIn);
  set("owner", filters.owner);
  set("zip", filters.zip);
  set("state", filters.state);
  set("city", filters.city);
  set("county", filters.county);
  set("leadType", filters.leadType);
  set("assignedTo", filters.assignedTo);
  set("tags", filters.tags);
  if (filters.tagsMode && filters.tagsMode !== "any") set("tagsMode", filters.tagsMode);
  set("contactPresence", filters.contactPresence);
  set("scoreMin", filters.scoreMin);
  set("scoreMax", filters.scoreMax);
  if (filters.archived && filters.archived !== "exclude") set("archived", filters.archived);
  set("hasNotes", filters.hasNotes);
  set("noteUpdatedWithinDays", filters.noteUpdatedWithinDays);
  set("lastTouchFrom", filters.lastTouchFrom);
  set("lastTouchTo", filters.lastTouchTo);
  set("nextFollowUpFrom", filters.nextFollowUpFrom);
  set("nextFollowUpTo", filters.nextFollowUpTo);
  set("createdFrom", filters.createdFrom);
  set("createdTo", filters.createdTo);
  if (filters.sortKey && filters.sortKey !== "newest_imported") set("sortKey", filters.sortKey);
  if (filters.sortDir && filters.sortDir !== "desc") set("sortDir", filters.sortDir);
  set("viewToken", filters.viewToken);
  const qs = p.toString();
  const next = qs ? `?${qs}` : "";
  window.history.replaceState({}, "", `/leads${next}`);
}

export default function Leads() {
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [editingLead, setEditingLead] = useState<any>(null);
  const [newLeadOtherSource, setNewLeadOtherSource] = useState("");
  const [editLeadOtherSource, setEditLeadOtherSource] = useState("");
  const [filterOpen, setFilterOpen] = useState(false);
  const [filters, setFilters] = useState(() => parseFiltersFromUrl());
  const [appliedFilters, setAppliedFilters] = useState(filters);
  const [density, setDensity] = useState<"luxury" | "dense">("luxury");
  const [visibleColumns, setVisibleColumns] = useState<Record<string, boolean>>({
    address: true,
    owner: true,
    status: true,
    score: true,
    value: true,
    contact: true,
    notes: true,
    actions: true,
  });
  const [selectedView, setSelectedView] = useState<any | null>(null);
  const [saveViewOpen, setSaveViewOpen] = useState(false);
  const [saveViewMode, setSaveViewMode] = useState<"create" | "update">("create");
  const [saveViewName, setSaveViewName] = useState("");
  const [saveViewVisibility, setSaveViewVisibility] = useState<"private" | "team" | "link">("private");
  const [selectionMode, setSelectionMode] = useState<"explicit" | "all_filtered">("explicit");
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [excludedIds, setExcludedIds] = useState<Set<number>>(new Set());
  const [selectAllConfirmOpen, setSelectAllConfirmOpen] = useState(false);
  const [selectAllConfirmText, setSelectAllConfirmText] = useState("");
  const selectionSignature = useMemo(() => {
    const { viewToken, ...rest } = appliedFilters as any;
    return JSON.stringify(rest || {});
  }, [appliedFilters]);
  const selectionSigLabel = useMemo(() => {
    const h = hashString(selectionSignature);
    return `SIG-${h.toString(16).padStart(8, "0").slice(-8).toUpperCase()}`;
  }, [selectionSignature]);
  useEffect(() => {
    const id = setTimeout(() => setAppliedFilters(filters), 250);
    return () => clearTimeout(id);
  }, [filters]);
  const leadsQueryKey = useMemo(() => ["leads", appliedFilters], [appliedFilters]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const add = params.get("add") || "";
    if (add !== "1") return;
    setIsAddDialogOpen(true);
    params.delete("add");
    const nextQs = params.toString();
    window.history.replaceState({}, "", `/leads${nextQs ? `?${nextQs}` : ""}`);
  }, []);

  useEffect(() => {
    setSelectionMode("explicit");
    setSelectedIds(new Set());
    setExcludedIds(new Set());
  }, [selectionSignature]);
  const [selectedLeadId, setSelectedLeadId] = useState<number | null>(null);
  const [isLeadSheetOpen, setIsLeadSheetOpen] = useState(false);
  const [highlightLeadId, setHighlightLeadId] = useState<number | null>(null);
  const [didApplyQueryLead, setDidApplyQueryLead] = useState(false);
  const [forcedLead, setForcedLead] = useState<any | null>(null);
  const [noteLead, setNoteLead] = useState<any>(null);
  const [noteText, setNoteText] = useState("");
  const [isNoteDialogOpen, setIsNoteDialogOpen] = useState(false);
  const [activityLeadId, setActivityLeadId] = useState<number | null>(null);
  const [isActivityDialogOpen, setIsActivityDialogOpen] = useState(false);
  const [smsLead, setSmsLead] = useState<any>(null);
  const [smsBody, setSmsBody] = useState("");
  const [isSmsDialogOpen, setIsSmsDialogOpen] = useState(false);
  const [emailLead, setEmailLead] = useState<any>(null);
  const [emailSubject, setEmailSubject] = useState("");
  const [emailBody, setEmailBody] = useState("");
  const [isEmailDialogOpen, setIsEmailDialogOpen] = useState(false);
  const leadIdFromQuery = useMemo(() => {
    const params = new URLSearchParams(window.location.search);
    const raw = params.get("leadId") || params.get("highlight") || "";
    const n = raw ? parseInt(raw, 10) : 0;
    return Number.isFinite(n) ? n : 0;
  }, []);
  const [newLead, setNewLead] = useState({
    address: "",
    city: "",
    state: "FL",
    zipCode: "",
    ownerName: "",
    ownerPhone: "",
    ownerEmail: "",
    estimatedValue: "",
    source: "",
    status: "new",
    assignedTo: ""
  });

  const pageSize = 200;
  const {
    data: leadsPages,
    isLoading,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useInfiniteQuery<any>({
    queryKey: leadsQueryKey,
    initialPageParam: 0,
    queryFn: async ({ pageParam }) => {
      const p = new URLSearchParams();
      p.set("limit", String(pageSize));
      p.set("offset", String(pageParam || 0));
      if (appliedFilters.query?.trim()) p.set("q", appliedFilters.query.trim());
      if (appliedFilters.statusIn?.trim()) p.set("statusIn", appliedFilters.statusIn.trim());
      else if (appliedFilters.status && appliedFilters.status !== "all") p.set("status", appliedFilters.status);
      if (appliedFilters.owner?.trim()) p.set("owner", appliedFilters.owner.trim());
      if (appliedFilters.zip?.trim()) p.set("zip", appliedFilters.zip.trim());
      if (appliedFilters.state?.trim()) p.set("state", appliedFilters.state.trim());
      if (appliedFilters.city?.trim()) p.set("city", appliedFilters.city.trim());
      if (appliedFilters.county?.trim()) p.set("county", appliedFilters.county.trim());
      if (appliedFilters.leadType?.trim()) p.set("leadType", appliedFilters.leadType.trim());
      if (appliedFilters.assignedTo?.trim()) p.set("assignedTo", appliedFilters.assignedTo.trim());
      if (appliedFilters.tags?.trim()) p.set("tags", appliedFilters.tags.trim());
      if (appliedFilters.tagsMode && appliedFilters.tagsMode !== "any") p.set("tagsMode", appliedFilters.tagsMode);
      if (appliedFilters.contactPresence?.trim()) p.set("contactPresence", appliedFilters.contactPresence.trim());
      if (appliedFilters.scoreMin?.trim()) p.set("scoreMin", appliedFilters.scoreMin.trim());
      if (appliedFilters.scoreMax?.trim()) p.set("scoreMax", appliedFilters.scoreMax.trim());
      if (appliedFilters.archived && appliedFilters.archived !== "exclude") p.set("archived", appliedFilters.archived);
      if (appliedFilters.hasNotes === "true" || appliedFilters.hasNotes === "false") p.set("hasNotes", appliedFilters.hasNotes);
      if (appliedFilters.noteUpdatedWithinDays?.trim()) p.set("noteUpdatedWithinDays", appliedFilters.noteUpdatedWithinDays.trim());
      if (appliedFilters.lastTouchFrom?.trim()) p.set("lastTouchFrom", new Date(`${appliedFilters.lastTouchFrom}T00:00:00`).toISOString());
      if (appliedFilters.lastTouchTo?.trim()) p.set("lastTouchTo", new Date(`${appliedFilters.lastTouchTo}T23:59:59`).toISOString());
      if (appliedFilters.nextFollowUpFrom?.trim()) p.set("nextFollowUpFrom", new Date(`${appliedFilters.nextFollowUpFrom}T00:00:00`).toISOString());
      if (appliedFilters.nextFollowUpTo?.trim()) p.set("nextFollowUpTo", new Date(`${appliedFilters.nextFollowUpTo}T23:59:59`).toISOString());
      if (appliedFilters.createdFrom?.trim()) p.set("createdFrom", new Date(`${appliedFilters.createdFrom}T00:00:00`).toISOString());
      if (appliedFilters.createdTo?.trim()) p.set("createdTo", new Date(`${appliedFilters.createdTo}T23:59:59`).toISOString());
      if (appliedFilters.sortKey && appliedFilters.sortKey !== "newest_imported") p.set("sortKey", appliedFilters.sortKey);
      if (appliedFilters.sortDir && appliedFilters.sortDir !== "desc") p.set("sortDir", appliedFilters.sortDir);
      const res = await apiRequest("GET", `/api/leads?${p.toString()}`);
      return await res.json();
    },
    getNextPageParam: (lastPage, allPages) => {
      const total = Number(lastPage?.total || 0);
      const loaded = allPages.reduce((acc, p) => acc + (Array.isArray(p?.items) ? p.items.length : 0), 0);
      if (!total) return undefined;
      if (loaded >= total) return undefined;
      return loaded;
    },
  });

  const leadsFlat = useMemo(() => {
    const pages = leadsPages?.pages || [];
    const out: any[] = [];
    for (const p of pages) {
      const items = Array.isArray(p?.items) ? p.items : [];
      out.push(...items);
    }
    return out;
  }, [leadsPages?.pages]);

  const leads = useMemo(() => {
    if (!forcedLead) return leadsFlat;
    const forcedId = Number(forcedLead?.id || 0);
    if (!forcedId) return leadsFlat;
    if (leadsFlat.some((l: any) => Number(l?.id || 0) === forcedId)) return leadsFlat;
    return [forcedLead, ...leadsFlat];
  }, [forcedLead, leadsFlat]);

  const selectedIdsArr = useMemo(() => Array.from(selectedIds), [selectedIds]);
  const voiceSelectedLead = useMemo(() => {
    if (selectionMode !== "explicit") return null;
    if (selectedIdsArr.length !== 1) return null;
    const id = Number(selectedIdsArr[0] || 0);
    if (!id) return null;
    return (leads || []).find((l: any) => Number(l?.id || 0) === id) || null;
  }, [leads, selectedIdsArr, selectionMode]);

  const leadsTotal = useMemo(() => {
    const firstTotal = Number(leadsPages?.pages?.[0]?.total || 0);
    return firstTotal || leads.length || 0;
  }, [leads.length, leadsPages?.pages]);

  useEffect(() => {
    writeFiltersToUrl(filters);
  }, [filters]);

  useEffect(() => {
    try {
      const colsRaw = localStorage.getItem("leads.columns");
      if (colsRaw) {
        const parsed = JSON.parse(colsRaw);
        if (parsed && typeof parsed === "object") setVisibleColumns(parsed);
      }
      const densityRaw = localStorage.getItem("leads.density");
      if (densityRaw === "dense" || densityRaw === "luxury") setDensity(densityRaw);
    } catch {}
  }, []);

  useEffect(() => {
    try {
      if (selectedView?.id) {
        localStorage.setItem(`leads.columns.view.${String(selectedView.id)}`, JSON.stringify(visibleColumns));
      } else {
        localStorage.setItem("leads.columns", JSON.stringify(visibleColumns));
      }
    } catch {}
  }, [selectedView?.id, visibleColumns]);

  useEffect(() => {
    try {
      if (selectedView?.id) {
        localStorage.setItem(`leads.density.view.${String(selectedView.id)}`, density);
      } else {
        localStorage.setItem("leads.density", density);
      }
    } catch {}
  }, [selectedView?.id, density]);

  const { data: savedViewsResp, refetch: refetchSavedViews } = useQuery<any>({
    queryKey: ["/api/leads/views"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/leads/views");
      return await res.json();
    },
  });

  const savedViews = useMemo(() => (Array.isArray(savedViewsResp?.items) ? savedViewsResp.items : []), [savedViewsResp?.items]);

  const createSavedViewMutation = useMutation({
    mutationFn: async (input: { name: string; visibility: "private" | "team" | "link"; configJson: any }) => {
      const res = await apiRequest("POST", "/api/leads/views", input);
      return await res.json();
    },
    onSuccess: async (row: any) => {
      await refetchSavedViews();
      setSelectedView(row);
    },
  });

  const updateSavedViewMutation = useMutation({
    mutationFn: async (input: { id: number; name?: string; visibility?: "private" | "team" | "link"; configJson?: any }) => {
      const { id, ...rest } = input;
      const res = await apiRequest("PATCH", `/api/leads/views/${id}`, rest);
      return await res.json();
    },
    onSuccess: async (row: any) => {
      await refetchSavedViews();
      setSelectedView(row);
    },
    onError: (error: any) => {
      toast({ title: "View update failed", description: String(error?.message || error), variant: "destructive" });
    },
  });

  const deleteSavedViewMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await apiRequest("DELETE", `/api/leads/views/${id}`);
      return await res.json();
    },
    onSuccess: async () => {
      await refetchSavedViews();
      setSelectedView(null);
      setFilters((prev: any) => ({ ...prev, viewToken: "" }));
    },
  });

  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkAction, setBulkAction] = useState<"set_status" | "assign" | "archive" | "unarchive" | "export">("set_status");
  const [bulkStatus, setBulkStatus] = useState("new");
  const [bulkAssignedTo, setBulkAssignedTo] = useState("");
  const [bulkJobId, setBulkJobId] = useState<number | null>(null);
  const [bulkPreview, setBulkPreview] = useState<any | null>(null);

  const bulkPreviewMutation = useMutation({
    mutationFn: async () => {
      const selectionScope = selectionMode === "all_filtered" ? "all_filtered" : "explicit";
      const leadIds = selectionScope === "explicit" ? Array.from(selectedIds) : undefined;
      const filter = selectionScope === "all_filtered" ? { ...appliedFilters, viewToken: "" } : undefined;
      const res = await apiRequest("POST", "/api/leads/bulk/preview", { selectionScope, leadIds, filter, action: bulkAction, params: {} });
      return await res.json();
    },
    onSuccess: (data) => setBulkPreview(data),
  });

  const bulkCreateJobMutation = useMutation({
    mutationFn: async () => {
      const selectionScope = selectionMode === "all_filtered" ? "all_filtered" : "explicit";
      const leadIds = selectionScope === "explicit" ? Array.from(selectedIds) : undefined;
      const filter = selectionScope === "all_filtered" ? { ...appliedFilters, viewToken: "" } : undefined;
      const params =
        bulkAction === "set_status"
          ? { status: bulkStatus }
          : bulkAction === "assign"
            ? { assignedTo: Number(bulkAssignedTo) }
            : {};
      const res = await apiRequest("POST", "/api/leads/bulk/jobs", { selectionScope, leadIds, filter, action: bulkAction, params });
      return await res.json();
    },
    onSuccess: (data) => {
      const id = Number(data?.jobId || 0);
      if (id) setBulkJobId(id);
    },
  });

  const [voiceOpen, setVoiceOpen] = useState(false);
  const [voiceTranscript, setVoiceTranscript] = useState("");
  const [voiceParsed, setVoiceParsed] = useState<any | null>(null);
  const [voicePreview, setVoicePreview] = useState<any | null>(null);
  const [voiceActionLogId, setVoiceActionLogId] = useState<number | null>(null);

  const toastVoiceError = (error: any) => {
    const msg = String(error?.message || error || "");
    if (msg.startsWith("404:")) {
      toast({ title: "Voice", description: "Voice Playground is not enabled for your account." });
      return;
    }
    toast({ title: "Voice", description: msg || "Something went wrong." });
  };

  const buildFullAddress = (lead: any) => {
    const address = String(lead?.address || "").trim();
    const city = String(lead?.city || "").trim();
    const state = String(lead?.state || "").trim();
    const zip = String(lead?.zipCode || "").trim();
    const left = [address, city].filter(Boolean).join(city ? ", " : "");
    const right = [state, zip].filter(Boolean).join(" ");
    return [left, right].filter(Boolean).join(right ? " " : "").trim();
  };

  const openVoiceForLeadId = (leadId: number) => {
    const id = Number(leadId);
    if (!Number.isFinite(id) || id <= 0) return;
    setSelectionMode("explicit");
    setSelectedIds(new Set([id]));
    setExcludedIds(new Set());
    setVoiceTranscript("");
    setVoiceParsed(null);
    setVoicePreview(null);
    setVoiceActionLogId(null);
    setVoiceOpen(true);
  };

  const voiceParseMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/ai/voice/parse", { transcript: voiceTranscript });
      return await res.json();
    },
    onSuccess: (data) => {
      setVoiceParsed(data);
      setVoicePreview(null);
      setVoiceActionLogId(null);
    },
    onError: toastVoiceError,
  });

  const voicePreviewMutation = useMutation({
    mutationFn: async () => {
      const parsedAction = String(voiceParsed?.action || "");
      if (parsedAction === "playground_append_note") {
        if (!voiceSelectedLead) throw new Error("Playground notes require exactly 1 selected lead");
        const address = buildFullAddress(voiceSelectedLead);
        if (!address) throw new Error("Missing lead address");
        const res = await apiRequest("POST", "/api/ai/voice/preview", {
          parsed: voiceParsed,
          playground: { address, leadId: Number(voiceSelectedLead.id) },
        });
        return await res.json();
      }
      const leadIds = selectedIdsArr;
      const res = await apiRequest("POST", "/api/ai/voice/preview", { parsed: voiceParsed, leadIds });
      return await res.json();
    },
    onSuccess: (data) => setVoicePreview(data),
    onError: toastVoiceError,
  });

  const voiceApplyMutation = useMutation({
    mutationFn: async () => {
      const parsedAction = String(voiceParsed?.action || "");
      if (parsedAction === "playground_append_note") {
        if (!voiceSelectedLead) throw new Error("Playground notes require exactly 1 selected lead");
        const address = buildFullAddress(voiceSelectedLead);
        if (!address) throw new Error("Missing lead address");
        const res = await apiRequest("POST", "/api/ai/voice/apply", {
          parsed: voiceParsed,
          transcript: voiceTranscript,
          playground: { address, leadId: Number(voiceSelectedLead.id) },
        });
        return await res.json();
      }
      const leadIds = selectedIdsArr;
      const res = await apiRequest("POST", "/api/ai/voice/apply", { parsed: voiceParsed, transcript: voiceTranscript, leadIds });
      return await res.json();
    },
    onSuccess: async (data: any) => {
      const id = Number(data?.actionLogId || 0);
      if (id) setVoiceActionLogId(id);
      const exportId = Number(data?.exportId || 0);
      const token = String(data?.token || "");
      if (exportId && token) {
        const url = `/api/crm/export/files/${exportId}/download?token=${encodeURIComponent(token)}`;
        window.open(url, "_blank", "noopener,noreferrer");
      }
      await queryClient.invalidateQueries({ queryKey: leadsQueryKey });
    },
    onError: toastVoiceError,
  });

  const voiceUndoMutation = useMutation({
    mutationFn: async () => {
      if (!voiceActionLogId) throw new Error("Missing action id");
      const res = await apiRequest("POST", "/api/ai/voice/undo", { aiActionLogId: voiceActionLogId });
      return await res.json();
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: leadsQueryKey });
    },
    onError: toastVoiceError,
  });

  const { data: bulkJob } = useQuery<any>({
    queryKey: ["/api/leads/bulk/jobs", bulkJobId],
    enabled: !!bulkJobId,
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/leads/bulk/jobs/${bulkJobId}`);
      return await res.json();
    },
    refetchInterval: (q) => {
      const s = String((q.state.data as any)?.status || "");
      return s === "running" || s === "queued" ? 1500 : false;
    },
  });

  const [didToastBulkJob, setDidToastBulkJob] = useState<number | null>(null);
  useEffect(() => {
    const id = Number(bulkJob?.id || bulkJobId || 0);
    if (!id) return;
    if (didToastBulkJob === id) return;
    const status = String(bulkJob?.status || "");
    if (status !== "completed" && status !== "failed") return;
    setDidToastBulkJob(id);
    if (status === "failed") {
      toast({ title: "Bulk job failed", description: String(bulkJob?.resultJson?.error || "Something went wrong"), variant: "destructive" });
      return;
    }
    if (String(bulkJob?.action || "") !== "export") {
      toast({ title: "Bulk job completed", description: `${Number(bulkJob?.succeeded || 0).toLocaleString()} updated` });
      queryClient.invalidateQueries({ queryKey: leadsQueryKey });
    } else {
      toast({ title: "Export ready", description: "Your export is downloading." });
    }
  }, [bulkJob, bulkJobId, didToastBulkJob, leadsQueryKey, queryClient, toast]);

  useEffect(() => {
    if (!bulkJob) return;
    if (String(bulkJob.status) !== "completed") return;
    if (String(bulkJob.action) !== "export") return;
    const exportId = Number(bulkJob?.resultJson?.exportId || 0);
    const token = String(bulkJob?.resultJson?.token || "");
    if (!exportId || !token) return;
    const url = `/api/crm/export/files/${exportId}/download?token=${encodeURIComponent(token)}`;
    window.open(url, "_blank", "noopener,noreferrer");
  }, [bulkJob]);

  const savedViewToken = String(filters.viewToken || "").trim();
  const { data: tokenViewResp } = useQuery<any>({
    queryKey: ["/api/leads/views/by-token", savedViewToken],
    enabled: !!savedViewToken,
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/leads/views/by-token/${encodeURIComponent(savedViewToken)}`);
      return await res.json();
    },
    retry: false,
  });

  useEffect(() => {
    if (!tokenViewResp) return;
    const cfg = parseLeadViewConfig((tokenViewResp as any).configJson);
    setFilters((prev: any) => ({ ...prev, ...(cfg.filters || {}), viewToken: savedViewToken }));
    if (cfg.sort?.key) setFilters((prev: any) => ({ ...prev, sortKey: cfg.sort?.key, sortDir: cfg.sort?.dir || "desc" }));
    if (cfg.columns) {
      setVisibleColumns(cfg.columns);
    } else if ((tokenViewResp as any)?.id) {
      try {
        const colsRaw = localStorage.getItem(`leads.columns.view.${String((tokenViewResp as any).id)}`);
        if (colsRaw) {
          const parsed = JSON.parse(colsRaw);
          if (parsed && typeof parsed === "object") setVisibleColumns(parsed);
        }
      } catch {}
    }
    if (cfg.density) {
      setDensity(cfg.density);
    } else if ((tokenViewResp as any)?.id) {
      try {
        const d = localStorage.getItem(`leads.density.view.${String((tokenViewResp as any).id)}`);
        if (d === "dense" || d === "luxury") setDensity(d);
      } catch {}
    }
    setSelectedView(tokenViewResp);
  }, [savedViewToken, tokenViewResp]);

  const [autosaveViewConfigKey, setAutosaveViewConfigKey] = useState<string>("");
  useEffect(() => {
    if (!selectedView?.id) return;
    const id = Number(selectedView.id);
    if (!id) return;
    const baseCfg = parseLeadViewConfig(selectedView.configJson);
    const nextCfg: LeadViewConfig = { ...baseCfg, columns: visibleColumns, density };
    const key = JSON.stringify(nextCfg);
    if (key === autosaveViewConfigKey) return;
    const t = setTimeout(async () => {
      try {
        const res = await apiRequest("PATCH", `/api/leads/views/${id}`, { configJson: nextCfg });
        const row = await res.json();
        setSelectedView((prev: any) => (prev && Number(prev.id) === id ? row : prev));
        setAutosaveViewConfigKey(key);
      } catch {}
    }, 750);
    return () => clearTimeout(t);
  }, [autosaveViewConfigKey, density, selectedView?.configJson, selectedView?.id, visibleColumns]);

  const { data: leadPipelineConfig } = useQuery({
    queryKey: ["/api/pipeline-config", "lead"],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/pipeline-config?entityType=lead`);
      return await res.json();
    },
  });

  const pipelineColumns = useMemo(() => {
    const cols = (leadPipelineConfig as any)?.columns;
    if (Array.isArray(cols) && cols.length) {
      return cols.map((c: any) => ({ value: String(c.value || ""), label: String(c.label || "") })).filter((c: any) => c.value && c.label);
    }
    return statusOptions;
  }, [leadPipelineConfig]);

  const missingPipelineStatuses = useMemo(() => {
    const shown = new Set((pipelineColumns || []).map((c: any) => String(c.value || "")));
    const missing = new Set<string>();
    for (const l of leads) {
      const s = String(l?.status || "").trim();
      if (!s) continue;
      if (!shown.has(s)) missing.add(s);
    }
    return Array.from(missing);
  }, [leads, pipelineColumns]);

  const pipelineColumnsWithMissing = useMemo(() => {
    if (!missingPipelineStatuses.length) return pipelineColumns;
    const append = missingPipelineStatuses.map((s) => ({
      value: s,
      label: s
        .split("_")
        .filter(Boolean)
        .map((p) => p.slice(0, 1).toUpperCase() + p.slice(1))
        .join(" "),
    }));
    return [...pipelineColumns, ...append];
  }, [missingPipelineStatuses, pipelineColumns]);

  const { data: leadSourceOptions = [] } = useQuery<any[]>({
    queryKey: ["/api/lead-source-options"],
    queryFn: async () => {
      try {
        const res = await apiRequest("GET", "/api/lead-source-options");
        return await res.json();
      } catch {
        return [];
      }
    },
  });

  const { data: activeTeamResp } = useQuery<any>({
    queryKey: ["/api/teams/active"],
  });

  const activeTeamId = typeof activeTeamResp?.teamId === "number" ? activeTeamResp.teamId : null;

  const { data: teamMembers = [] } = useQuery<any[]>({
    queryKey: ["/api/teams", activeTeamId, "members"],
    enabled: !!activeTeamId,
  });

  const teamUsers = useMemo(() => (Array.isArray(teamMembers) ? teamMembers.map((m: any) => m?.user).filter(Boolean) : []), [teamMembers]);

  const leadSourceOptionValues = useMemo(() => {
    return new Set((leadSourceOptions || []).map((o: any) => String(o?.value || "")));
  }, [leadSourceOptions]);

  const openEditLead = (lead: any) => {
    const rawSource = String(lead?.source || "").trim();
    const hasKnownSource = rawSource && leadSourceOptionValues.has(rawSource);
    const shouldUseCustom = rawSource && !hasKnownSource;
    setEditLeadOtherSource(shouldUseCustom ? rawSource : "");
    setEditingLead({
      ...lead,
      estimatedValue: lead?.estimatedValue || "",
      assignedTo: lead?.assignedTo ? String(lead.assignedTo) : "",
      source: shouldUseCustom ? CUSTOM_SOURCE_VALUE : rawSource,
    });
  };

  useEffect(() => {
    if (newLead.source) return;
    if (!Array.isArray(leadSourceOptions) || !leadSourceOptions.length) return;
    setNewLead((prev: any) => ({ ...prev, source: String(leadSourceOptions[0]?.value || "") }));
  }, [leadSourceOptions, newLead.source]);

  const createMutation = useMutation({
    mutationFn: async (lead: any) => {
      const payload = {
        ...lead,
        estimatedValue: lead.estimatedValue ? parseFloat(lead.estimatedValue) : null,
      };
      const res = await apiRequest("POST", "/api/leads", payload);
      return await res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["leads"] });
      setNewLead({ address: "", city: "", state: "FL", zipCode: "", ownerName: "", ownerPhone: "", ownerEmail: "", estimatedValue: "", source: "", status: "new", assignedTo: "" });
      setNewLeadOtherSource("");
      setIsAddDialogOpen(false);
      toast({
        title: "Lead created",
        description: "New lead has been added successfully.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Lead creation failed",
        description: String(error?.message || error),
        variant: "destructive",
      });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: any }) => {
      const payload = {
        ...data,
        estimatedValue: data.estimatedValue ? parseFloat(data.estimatedValue) : null,
      };
      const res = await apiRequest("PATCH", `/api/leads/${id}`, payload);
      return await res.json();
    },
    onMutate: async ({ id, data }) => {
      await queryClient.cancelQueries({ queryKey: ["leads"] });
      const previous = queryClient.getQueryData<any>(leadsQueryKey);
      if (Array.isArray(previous?.items)) {
        queryClient.setQueryData(leadsQueryKey, {
          ...previous,
          items: previous.items.map((l: any) => (l?.id === id ? { ...l, ...data } : l)),
        });
      }
      return { previous };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["leads"] });
      setEditingLead(null);
      toast({
        title: "Lead updated",
        description: "Lead has been updated successfully.",
      });
    },
    onError: (error: any, _vars: any, ctx: any) => {
      if (ctx?.previous) queryClient.setQueryData(leadsQueryKey, ctx.previous);
      toast({
        title: "Lead update failed",
        description: String(error?.message || error),
        variant: "destructive",
      });
    },
  });

  const addNoteMutation = useMutation({
    mutationFn: async ({ leadId, body }: { leadId: number; body: string }) => {
      const res = await apiRequest("POST", `/api/leads/${leadId}/notes`, { body });
      return await res.json();
    },
    onSuccess: async (_note: any, vars: any) => {
      await queryClient.invalidateQueries({ queryKey: ["leads"] });
      await queryClient.invalidateQueries({ queryKey: leadsQueryKey });
      if (vars?.leadId) {
        await queryClient.invalidateQueries({ queryKey: ["/api/leads", vars.leadId] });
        await queryClient.invalidateQueries({ queryKey: ["/api/leads/notes", vars.leadId] });
      }
      queryClient.invalidateQueries({ queryKey: ["/api/activity"] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await apiRequest("DELETE", `/api/leads/${id}`);
      return await res.json();
    },
    onMutate: async (id: number) => {
      await queryClient.cancelQueries({ queryKey: ["leads"] });
      const previous = queryClient.getQueryData<any>(leadsQueryKey);
      if (Array.isArray(previous?.items)) {
        queryClient.setQueryData(leadsQueryKey, {
          ...previous,
          items: previous.items.filter((l: any) => l?.id !== id),
          total: Math.max(0, Number(previous.total || 0) - 1),
        });
      }
      return { previous };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["leads"] });
      toast({
        title: "Lead deleted",
        description: "Lead has been removed.",
      });
    },
    onError: (error: any, _id: number, ctx: any) => {
      if (ctx?.previous) queryClient.setQueryData(leadsQueryKey, ctx.previous);
      toast({
        title: "Delete failed",
        description: String(error?.message || error),
        variant: "destructive",
      });
    },
  });

  const convertToPropertyMutation = useMutation({
    mutationFn: async (leadId: number) => {
      const res = await apiRequest("POST", `/api/leads/${leadId}/convert-to-property`, {});
      return await res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["leads"] });
      queryClient.invalidateQueries({ queryKey: ["properties"] });
      queryClient.invalidateQueries({ queryKey: ["/api/activity"] });
      toast({
        title: "Property created!",
        description: `Lead successfully converted to property: ${data.property.address}`,
      });
    },
    onError: (error: any) => {
      toast({
        title: "Conversion failed",
        description: error.message,
        variant: "destructive",
      });
    }
  });

  const handleAddLead = async () => {
    if (!newLead.address || !newLead.city || !newLead.zipCode || !newLead.ownerName) {
      toast({ title: "Missing required fields", variant: "destructive" });
      return;
    }

    const source =
      newLead.source === CUSTOM_SOURCE_VALUE ? newLeadOtherSource.trim() : String(newLead.source || "").trim();
    if (!source) {
      toast({ title: "Lead source is required", variant: "destructive" });
      return;
    }

    const assignedTo =
      newLead.assignedTo && newLead.assignedTo !== "__unassigned__" ? parseInt(String(newLead.assignedTo), 10) : null;
    createMutation.mutate({ ...newLead, source, assignedTo: Number.isFinite(assignedTo as any) ? assignedTo : null });
  };

  const handleUpdateLead = async () => {
    if (editingLead) {
      const source =
        String(editingLead.source || "") === CUSTOM_SOURCE_VALUE
          ? editLeadOtherSource.trim()
          : String(editingLead.source || "").trim();
      if (String(editingLead.source || "") === CUSTOM_SOURCE_VALUE && !source) {
        toast({ title: "Lead source is required", variant: "destructive" });
        return;
      }

      updateMutation.mutate({
        id: editingLead.id,
        data: {
          ...editingLead,
          assignedTo:
            editingLead.assignedTo && editingLead.assignedTo !== "__unassigned__"
              ? parseInt(String(editingLead.assignedTo), 10)
              : null,
          source: source || null,
        },
      });
    }
  };

  const handleConvertToProperty = async (lead: any, e: MouseEvent) => {
    e.stopPropagation();
    convertToPropertyMutation.mutate(lead.id);
  };

  const getStatusBadgeColor = (status: string) => {
    switch (status) {
      case "new": return "bg-blue-500/10 text-blue-500 border-blue-500/20";
      case "contacted": return "bg-yellow-500/10 text-yellow-500 border-yellow-500/20";
      case "qualified": return "bg-green-500/10 text-green-500 border-green-500/20";
      case "negotiation": return "bg-purple-500/10 text-purple-500 border-purple-500/20";
      case "under_contract": return "bg-primary/10 text-primary border-primary/20";
      case "closed": return "bg-emerald-500/10 text-emerald-500 border-emerald-500/20";
      case "lost": return "bg-gray-500/10 text-gray-500 border-gray-500/20";
      default: return "bg-secondary";
    }
  };

  const filteredLeads = useMemo(() => {
    return leads || [];
  }, [leads]);

  const selectedLead = useMemo(() => {
    if (!selectedLeadId) return null;
    return (leads || []).find((l: any) => l.id === selectedLeadId) || null;
  }, [leads, selectedLeadId]);

  const selectedCount = useMemo(() => {
    if (selectionMode === "all_filtered") return Math.max(0, leadsTotal - excludedIds.size);
    return selectedIds.size;
  }, [excludedIds.size, leadsTotal, selectedIds.size, selectionMode]);

  const isSelected = (id: number) => {
    if (selectionMode === "all_filtered") return !excludedIds.has(id);
    return selectedIds.has(id);
  };

  const toggleRow = (id: number, checked: boolean) => {
    if (selectionMode === "all_filtered") {
      setExcludedIds((prev) => {
        const next = new Set(prev);
        if (checked) next.delete(id);
        else next.add(id);
        return next;
      });
      return;
    }
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  };

  const toggleAllLoaded = (checked: boolean) => {
    const ids = (filteredLeads || []).map((l: any) => Number(l.id)).filter((n: any) => Number.isFinite(n) && n > 0);
    if (!ids.length) return;
    setSelectionMode("explicit");
    setExcludedIds(new Set());
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (checked) ids.forEach((id) => next.add(id));
      else ids.forEach((id) => next.delete(id));
      return next;
    });
  };

  useEffect(() => {
    if (didApplyQueryLead) return;
    if (!leadIdFromQuery) return;
    if (isLoading) return;
    const apply = () => {
      setFilters({
        query: "",
        status: "all",
        statusIn: "",
        owner: "",
        zip: "",
        state: "",
        city: "",
        county: "",
        leadType: "",
        assignedTo: "",
        tags: "",
        tagsMode: "any",
        contactPresence: "",
        scoreMin: "",
        scoreMax: "",
        archived: "exclude",
        hasNotes: "",
        noteUpdatedWithinDays: "",
        lastTouchFrom: "",
        lastTouchTo: "",
        nextFollowUpFrom: "",
        nextFollowUpTo: "",
        createdFrom: "",
        createdTo: "",
        sortKey: "newest_imported",
        sortDir: "desc",
        viewToken: "",
      });
      setSelectedLeadId(leadIdFromQuery);
      setHighlightLeadId(leadIdFromQuery);
      setIsLeadSheetOpen(true);
      setDidApplyQueryLead(true);
      setTimeout(() => {
        const el = document.querySelector(`[data-testid="row-lead-${leadIdFromQuery}"]`);
        if (el) (el as HTMLElement).scrollIntoView({ block: "center" });
      }, 0);
    };

    const found = (leads || []).some((l: any) => l.id === leadIdFromQuery);
    if (found) {
      apply();
      return;
    }

    (async () => {
      try {
        const res = await apiRequest("GET", `/api/leads/${leadIdFromQuery}`);
        const lead = await res.json();
        setForcedLead(lead);
        apply();
      } catch (e: any) {
        toast({ title: e?.message || "Lead not found", variant: "destructive" });
      }
    })();
  }, [didApplyQueryLead, isLoading, leadIdFromQuery, leads]);

  const openLead = (id: number) => {
    setSelectedLeadId(id);
    setHighlightLeadId(id);
    setIsLeadSheetOpen(true);
  };

  const clearFilters = () => {
    setFilters((prev: any) => ({
      ...prev,
      query: "",
      status: "all",
      statusIn: "",
      owner: "",
      zip: "",
      state: "",
      city: "",
      county: "",
      leadType: "",
      assignedTo: "",
      tags: "",
      tagsMode: "any",
      contactPresence: "",
      scoreMin: "",
      scoreMax: "",
      archived: "exclude",
      hasNotes: "",
      noteUpdatedWithinDays: "",
      lastTouchFrom: "",
      lastTouchTo: "",
      nextFollowUpFrom: "",
      nextFollowUpTo: "",
      createdFrom: "",
      createdTo: "",
      sortKey: "newest_imported",
      sortDir: "desc",
      viewToken: "",
    }));
  };

  if (isLoading) {
    return (
      <Layout>
        <div className="text-center py-12">Loading leads...</div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-3xl font-bold tracking-tight">Leads Pipeline</h1>
          <p className="text-muted-foreground">Manage and track your active property leads.</p>
          {leadsTotal ? (
            <div className="text-xs text-muted-foreground">
              Showing {Math.min(leads.length, leadsTotal).toLocaleString()} of {leadsTotal.toLocaleString()}
            </div>
          ) : null}
          {filters.statusIn?.trim() ? (
            <div className="flex items-center gap-2 text-xs">
              <Badge variant="secondary">Multi-status</Badge>
              <span className="text-muted-foreground">{filters.statusIn}</span>
              <button
                type="button"
                className="text-primary hover:underline"
                onClick={() =>
                  setFilters((prev: any) => ({
                    ...prev,
                    statusIn: "",
                    status: "all",
                  }))
                }
              >
                Clear
              </button>
            </div>
          ) : null}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <CrmImportExportDialog entityType="lead" />
          <div className="relative hidden md:block">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search leads..."
              className="w-[160px] pl-9 lg:w-[200px]"
              value={filters.query}
              onChange={(e) => setFilters(prev => ({ ...prev, query: e.target.value }))}
              data-testid="input-leads-search"
            />
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm">
                <ListFilter className="mr-2 h-4 w-4" />
                {selectedView?.name ? selectedView.name : "Views"}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-[260px]">
              <DropdownMenuItem
                onClick={() => {
                  setSelectedView(null);
                  setAutosaveViewConfigKey("");
                  setFilters((prev: any) => ({ ...prev, viewToken: "" }));
                }}
              >
                Default (No view)
              </DropdownMenuItem>
              {savedViews.length ? <DropdownMenuSeparator /> : null}
              {savedViews.map((v: any) => (
                <DropdownMenuItem
                  key={v.id}
                  onClick={() => {
                    const cfg = parseLeadViewConfig(v.configJson);
                    setFilters((prev: any) => ({
                      ...prev,
                      ...(cfg.filters || {}),
                      sortKey: cfg.sort?.key || prev.sortKey,
                      sortDir: cfg.sort?.dir || prev.sortDir,
                      viewToken: v.visibility === "link" ? String(v.shareToken || "") : "",
                    }));
                    if (cfg.columns) {
                      setVisibleColumns(cfg.columns);
                    } else {
                      try {
                        const colsRaw = localStorage.getItem(`leads.columns.view.${String(v.id)}`);
                        if (colsRaw) {
                          const parsed = JSON.parse(colsRaw);
                          if (parsed && typeof parsed === "object") setVisibleColumns(parsed);
                        }
                      } catch {}
                    }
                    if (cfg.density) {
                      setDensity(cfg.density);
                    } else {
                      try {
                        const d = localStorage.getItem(`leads.density.view.${String(v.id)}`);
                        if (d === "dense" || d === "luxury") setDensity(d);
                      } catch {}
                    }
                    setSelectedView(v);
                    setAutosaveViewConfigKey("");
                  }}
                >
                  {v.name}
                </DropdownMenuItem>
              ))}
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={() => {
                  setSaveViewMode("create");
                  setSaveViewName("");
                  setSaveViewVisibility("private");
                  setSaveViewOpen(true);
                }}
              >
                Save as new view…
              </DropdownMenuItem>
              {selectedView?.id ? (
                <DropdownMenuItem
                  onClick={() => {
                    setSaveViewMode("update");
                    setSaveViewName(String(selectedView?.name || ""));
                    setSaveViewVisibility((selectedView?.visibility as any) || "private");
                    setSaveViewOpen(true);
                  }}
                >
                  Update this view…
                </DropdownMenuItem>
              ) : null}
              {selectedView?.shareToken ? (
                <DropdownMenuItem
                  onClick={async () => {
                    const url = `${window.location.origin}/leads?viewToken=${encodeURIComponent(String(selectedView.shareToken))}`;
                    try {
                      await navigator.clipboard.writeText(url);
                      toast({ title: "Link copied" });
                    } catch {
                      toast({ title: "Could not copy link", variant: "destructive" });
                    }
                  }}
                >
                  Copy share link
                </DropdownMenuItem>
              ) : null}
              {selectedView?.id ? (
                <DropdownMenuItem
                  className="text-destructive focus:text-destructive"
                  onClick={() => deleteSavedViewMutation.mutate(Number(selectedView.id))}
                >
                  Delete view
                </DropdownMenuItem>
              ) : null}
            </DropdownMenuContent>
          </DropdownMenu>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm">
                <Columns2 className="mr-2 h-4 w-4" />
                Columns
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-[220px]">
              {[
                { key: "address", label: "Address" },
                { key: "owner", label: "Owner" },
                { key: "status", label: "Status" },
                { key: "score", label: "Score" },
                { key: "value", label: "Value" },
                { key: "contact", label: "Contact" },
                { key: "notes", label: "Notes" },
              ].map((c) => (
                <DropdownMenuCheckboxItem
                  key={c.key}
                  checked={!!visibleColumns[c.key]}
                  onCheckedChange={(checked) => setVisibleColumns((prev) => ({ ...prev, [c.key]: !!checked }))}
                >
                  {c.label}
                </DropdownMenuCheckboxItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>

          <Button variant="outline" size="sm" onClick={() => setDensity((d) => (d === "dense" ? "luxury" : "dense"))}>
            {density === "dense" ? "Dense" : "Luxury"}
          </Button>

          <Sheet open={filterOpen} onOpenChange={setFilterOpen}>
            <SheetTrigger asChild>
              <Button variant="outline" size="sm" data-testid="button-leads-filter">
                <Filter className="mr-2 h-4 w-4" /> Filters
              </Button>
            </SheetTrigger>
            <SheetContent side="right" className="w-[min(520px,100vw)] overflow-y-auto">
              <SheetHeader>
                <SheetTitle>Filters</SheetTitle>
              </SheetHeader>
              <div className="mt-4 space-y-4">
                <div className="space-y-2">
                  <Label>Status</Label>
                  <Select value={filters.status} onValueChange={(value) => setFilters((prev: any) => ({ ...prev, status: value }))}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All</SelectItem>
                      {pipelineColumnsWithMissing.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label>ZIP</Label>
                    <Input value={filters.zip} onChange={(e) => setFilters((prev: any) => ({ ...prev, zip: e.target.value }))} />
                  </div>
                  <div className="space-y-2">
                    <Label>State</Label>
                    <Input value={filters.state} onChange={(e) => setFilters((prev: any) => ({ ...prev, state: e.target.value }))} />
                  </div>
                  <div className="space-y-2">
                    <Label>City</Label>
                    <Input value={filters.city} onChange={(e) => setFilters((prev: any) => ({ ...prev, city: e.target.value }))} />
                  </div>
                  <div className="space-y-2">
                    <Label>County</Label>
                    <Input value={filters.county} onChange={(e) => setFilters((prev: any) => ({ ...prev, county: e.target.value }))} />
                  </div>
                  <div className="space-y-2">
                    <Label>Lead Type</Label>
                    <Input value={filters.leadType} onChange={(e) => setFilters((prev: any) => ({ ...prev, leadType: e.target.value }))} />
                  </div>
                  <div className="space-y-2">
                    <Label>Assigned To</Label>
                    <Input value={filters.assignedTo} onChange={(e) => setFilters((prev: any) => ({ ...prev, assignedTo: e.target.value }))} placeholder="user id or unassigned" />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>Owner</Label>
                  <Input value={filters.owner} onChange={(e) => setFilters((prev: any) => ({ ...prev, owner: e.target.value }))} />
                </div>

                <div className="space-y-2">
                  <Label>Tags (comma-separated)</Label>
                  <Input value={filters.tags} onChange={(e) => setFilters((prev: any) => ({ ...prev, tags: e.target.value }))} />
                </div>

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label>Tags Mode</Label>
                    <Select value={filters.tagsMode || "any"} onValueChange={(v) => setFilters((prev: any) => ({ ...prev, tagsMode: v }))}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="any">Any</SelectItem>
                        <SelectItem value="all">All</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Contact Presence</Label>
                    <Select value={filters.contactPresence || ""} onValueChange={(v) => setFilters((prev: any) => ({ ...prev, contactPresence: v }))}>
                      <SelectTrigger>
                        <SelectValue placeholder="Any" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="">Any</SelectItem>
                        <SelectItem value="phone_only">Phone only</SelectItem>
                        <SelectItem value="email_only">Email only</SelectItem>
                        <SelectItem value="both">Both</SelectItem>
                        <SelectItem value="none">None</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>Note updated within (days)</Label>
                  <Input value={filters.noteUpdatedWithinDays} onChange={(e) => setFilters((prev: any) => ({ ...prev, noteUpdatedWithinDays: e.target.value }))} placeholder="e.g. 7" />
                </div>

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label>Archived</Label>
                    <Select value={filters.archived} onValueChange={(v) => setFilters((prev: any) => ({ ...prev, archived: v }))}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="exclude">Exclude</SelectItem>
                        <SelectItem value="include">Include</SelectItem>
                        <SelectItem value="only">Only</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Has Notes</Label>
                    <Select value={filters.hasNotes || ""} onValueChange={(v) => setFilters((prev: any) => ({ ...prev, hasNotes: v }))}>
                      <SelectTrigger>
                        <SelectValue placeholder="Any" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="">Any</SelectItem>
                        <SelectItem value="true">Yes</SelectItem>
                        <SelectItem value="false">No</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label>Score Min</Label>
                    <Input value={filters.scoreMin} onChange={(e) => setFilters((prev: any) => ({ ...prev, scoreMin: e.target.value }))} />
                  </div>
                  <div className="space-y-2">
                    <Label>Score Max</Label>
                    <Input value={filters.scoreMax} onChange={(e) => setFilters((prev: any) => ({ ...prev, scoreMax: e.target.value }))} />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label>Created From</Label>
                    <Input type="date" value={filters.createdFrom} onChange={(e) => setFilters((prev: any) => ({ ...prev, createdFrom: e.target.value }))} />
                  </div>
                  <div className="space-y-2">
                    <Label>Created To</Label>
                    <Input type="date" value={filters.createdTo} onChange={(e) => setFilters((prev: any) => ({ ...prev, createdTo: e.target.value }))} />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label>Last Touch From</Label>
                    <Input type="date" value={filters.lastTouchFrom} onChange={(e) => setFilters((prev: any) => ({ ...prev, lastTouchFrom: e.target.value }))} />
                  </div>
                  <div className="space-y-2">
                    <Label>Last Touch To</Label>
                    <Input type="date" value={filters.lastTouchTo} onChange={(e) => setFilters((prev: any) => ({ ...prev, lastTouchTo: e.target.value }))} />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label>Next Follow-up From</Label>
                    <Input type="date" value={filters.nextFollowUpFrom} onChange={(e) => setFilters((prev: any) => ({ ...prev, nextFollowUpFrom: e.target.value }))} />
                  </div>
                  <div className="space-y-2">
                    <Label>Next Follow-up To</Label>
                    <Input type="date" value={filters.nextFollowUpTo} onChange={(e) => setFilters((prev: any) => ({ ...prev, nextFollowUpTo: e.target.value }))} />
                  </div>
                </div>

                <div className="flex justify-between">
                  <Button variant="ghost" onClick={clearFilters}>
                    Clear
                  </Button>
                  <Button variant="secondary" onClick={() => setFilterOpen(false)}>
                    Done
                  </Button>
                </div>
              </div>
            </SheetContent>
          </Sheet>

          {hasNextPage ? (
            <>
              <Button variant="outline" size="sm" onClick={() => fetchNextPage()} disabled={isFetchingNextPage} data-testid="button-leads-load-more">
                {isFetchingNextPage ? "Loading…" : "Load more"}
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={async () => {
                  let guard = 0;
                  while (guard < 50) {
                    guard += 1;
                    const res = await fetchNextPage();
                    const pages = (res as any)?.data?.pages || [];
                    const last = pages[pages.length - 1];
                    const total = Number(last?.total || 0);
                    const loaded = pages.reduce((acc: number, p: any) => acc + (Array.isArray(p?.items) ? p.items.length : 0), 0);
                    if (!total || loaded >= total) break;
                  }
                }}
                disabled={isFetchingNextPage}
                data-testid="button-leads-load-all"
              >
                Load all
              </Button>
            </>
          ) : null}
          
          <Dialog open={saveViewOpen} onOpenChange={setSaveViewOpen}>
            <DialogContent className="sm:max-w-[420px]">
              <DialogHeader>
                <DialogTitle>{saveViewMode === "update" ? "Update View" : "Save View"}</DialogTitle>
                <DialogDescription>Save filters, sorting, columns, and density.</DialogDescription>
              </DialogHeader>
              <div className="grid gap-4 py-4">
                <div className="space-y-2">
                  <Label>Name</Label>
                  <Input value={saveViewName} onChange={(e) => setSaveViewName(e.target.value)} placeholder="e.g. High Score Orlando" />
                </div>
                <div className="space-y-2">
                  <Label>Visibility</Label>
                  <Select value={saveViewVisibility} onValueChange={(v: any) => setSaveViewVisibility(v)}>
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
              </div>
              <DialogFooter>
                <Button
                  onClick={async () => {
                    const name = saveViewName.trim();
                    if (!name) {
                      toast({ title: "Name is required", variant: "destructive" });
                      return;
                    }
                    const cfg: LeadViewConfig = {
                      filters: { ...filters, viewToken: "" },
                      sort: { key: filters.sortKey, dir: filters.sortDir },
                      columns: visibleColumns,
                      density,
                    };
                    const row =
                      saveViewMode === "update" && selectedView?.id
                        ? await updateSavedViewMutation.mutateAsync({
                            id: Number(selectedView.id),
                            name,
                            visibility: saveViewVisibility,
                            configJson: cfg,
                          })
                        : await createSavedViewMutation.mutateAsync({ name, visibility: saveViewVisibility, configJson: cfg });
                    if (saveViewVisibility === "link") {
                      setFilters((prev: any) => ({ ...prev, viewToken: String(row?.shareToken || "") }));
                    } else {
                      setFilters((prev: any) => ({ ...prev, viewToken: "" }));
                    }
                    setSelectedView(row);
                    setAutosaveViewConfigKey("");
                    setSaveViewOpen(false);
                  }}
                  disabled={createSavedViewMutation.isPending || updateSavedViewMutation.isPending}
                >
                  {createSavedViewMutation.isPending || updateSavedViewMutation.isPending ? "Saving..." : "Save"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          <Dialog open={bulkOpen} onOpenChange={setBulkOpen}>
            <DialogContent className="sm:max-w-[520px]">
              <DialogHeader>
                <DialogTitle>Bulk actions</DialogTitle>
                <DialogDescription>Preview first, then run as an async job.</DialogDescription>
              </DialogHeader>
              <div className="grid gap-4 py-2">
                <div className="grid gap-2">
                  <Label>Action</Label>
                  <Select value={bulkAction} onValueChange={(v: any) => setBulkAction(v)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="set_status">Set status</SelectItem>
                      <SelectItem value="assign">Assign</SelectItem>
                      <SelectItem value="archive">Archive</SelectItem>
                      <SelectItem value="unarchive">Unarchive</SelectItem>
                      <SelectItem value="export">Export CSV</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {bulkAction === "set_status" ? (
                  <div className="grid gap-2">
                    <Label>Status</Label>
                    <Select value={bulkStatus} onValueChange={(v) => setBulkStatus(v)}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {pipelineColumnsWithMissing.map((o) => (
                          <SelectItem key={o.value} value={o.value}>
                            {o.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                ) : null}

                {bulkAction === "assign" ? (
                  <div className="grid gap-2">
                    <Label>Assign to</Label>
                    <Select value={bulkAssignedTo} onValueChange={(v) => setBulkAssignedTo(v)}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select user" />
                      </SelectTrigger>
                      <SelectContent>
                        {teamUsers.map((u: any) => (
                          <SelectItem key={u.id} value={String(u.id)}>
                            {u.firstName || u.lastName ? `${u.firstName || ""} ${u.lastName || ""}`.trim() : u.email}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                ) : null}

                <div className="rounded-md border px-3 py-2 text-sm">
                  <div className="flex items-center justify-between gap-3">
                    <div className="text-muted-foreground">Selection</div>
                    <div className="font-medium">
                      {selectedCount.toLocaleString()} {selectionMode === "all_filtered" ? "(all filtered)" : ""}
                    </div>
                  </div>
                  <div className="mt-2 flex items-center justify-between gap-3">
                    <div className="text-muted-foreground">Preview targets</div>
                    <div className="font-medium">
                      {bulkPreview ? Number(bulkPreview.totalTargets || 0).toLocaleString() : bulkPreviewMutation.isPending ? "…" : "—"}
                    </div>
                  </div>
                </div>

                {bulkJobId ? (
                  <div className="rounded-md border px-3 py-2 text-sm">
                    <div className="flex items-center justify-between">
                      <div className="text-muted-foreground">Job</div>
                      <div className="font-medium">#{bulkJobId}</div>
                    </div>
                    <div className="mt-1 flex items-center justify-between">
                      <div className="text-muted-foreground">Status</div>
                      <div className="font-medium">{String(bulkJob?.status || "—")}</div>
                    </div>
                    <div className="mt-1 flex items-center justify-between">
                      <div className="text-muted-foreground">Progress</div>
                      <div className="font-medium">
                        {Number(bulkJob?.processed || 0).toLocaleString()} / {Number(bulkJob?.totalTargets || 0).toLocaleString()}
                      </div>
                    </div>
                    {bulkJob?.resultJson?.error ? (
                      <div className="mt-2 text-destructive whitespace-pre-wrap">{String(bulkJob.resultJson.error)}</div>
                    ) : null}
                  </div>
                ) : null}
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => bulkPreviewMutation.mutate()} disabled={bulkPreviewMutation.isPending}>
                  Refresh preview
                </Button>
                <Button
                  onClick={() => bulkCreateJobMutation.mutate()}
                  disabled={
                    bulkCreateJobMutation.isPending ||
                    bulkPreviewMutation.isPending ||
                    (bulkAction === "assign" && !bulkAssignedTo) ||
                    (bulkAction === "set_status" && !bulkStatus)
                  }
                  className="bg-primary hover:bg-primary/90 text-white"
                >
                  {bulkCreateJobMutation.isPending ? "Starting..." : "Run job"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
            <DialogTrigger asChild>
              <Button size="sm" className="bg-primary hover:bg-primary/90" data-testid="button-add-lead">
                <Plus className="mr-2 h-4 w-4" />
                Add Lead
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[425px]">
              <DialogHeader>
                <DialogTitle>Add New Lead</DialogTitle>
                <DialogDescription>Enter property details to create a new lead.</DialogDescription>
              </DialogHeader>
              <div className="grid gap-4 py-4">
                <div className="grid grid-cols-4 items-center gap-4">
                  <Label htmlFor="address" className="text-right">Address</Label>
                  <Input id="address" placeholder="123 Main St" className="col-span-3" value={newLead.address} onChange={(e) => setNewLead({...newLead, address: e.target.value})} data-testid="input-lead-address" />
                </div>
                <div className="grid grid-cols-4 items-center gap-4">
                  <Label htmlFor="city" className="text-right">City</Label>
                  <Input id="city" placeholder="Orlando" className="col-span-3" value={newLead.city} onChange={(e) => setNewLead({...newLead, city: e.target.value})} data-testid="input-lead-city" />
                </div>
                <div className="grid grid-cols-4 items-center gap-4">
                  <Label htmlFor="zipCode" className="text-right">Zip Code</Label>
                  <Input id="zipCode" placeholder="32801" className="col-span-3" value={newLead.zipCode} onChange={(e) => setNewLead({...newLead, zipCode: e.target.value})} data-testid="input-lead-zip" />
                </div>
                <div className="grid grid-cols-4 items-center gap-4">
                  <Label htmlFor="owner" className="text-right">Owner</Label>
                  <Input id="owner" placeholder="John Doe" className="col-span-3" value={newLead.ownerName} onChange={(e) => setNewLead({...newLead, ownerName: e.target.value})} data-testid="input-lead-owner" />
                </div>
                <div className="grid grid-cols-4 items-center gap-4">
                  <Label htmlFor="phone" className="text-right">Phone</Label>
                  <Input id="phone" placeholder="(555) 123-4567" className="col-span-3" value={newLead.ownerPhone} onChange={(e) => setNewLead({...newLead, ownerPhone: e.target.value})} data-testid="input-lead-phone" />
                </div>
                <div className="grid grid-cols-4 items-center gap-4">
                  <Label htmlFor="source" className="text-right">Lead Source</Label>
                  <Select
                    value={newLead.source}
                    onValueChange={(value) => {
                      if (value !== CUSTOM_SOURCE_VALUE) setNewLeadOtherSource("");
                      setNewLead({ ...newLead, source: value });
                    }}
                  >
                    <SelectTrigger className="col-span-3" data-testid="select-lead-source">
                      <SelectValue placeholder="Select source" />
                    </SelectTrigger>
                    <SelectContent>
                      {leadSourceOptions.map((o: any) => (
                        <SelectItem key={String(o.value)} value={String(o.value)}>
                          {String(o.label || o.value)}
                        </SelectItem>
                      ))}
                      <SelectItem value={CUSTOM_SOURCE_VALUE}>Other</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {newLead.source === CUSTOM_SOURCE_VALUE && (
                  <div className="grid grid-cols-4 items-center gap-4">
                    <Label htmlFor="lead-source-other" className="text-right">Other</Label>
                    <Input
                      id="lead-source-other"
                      className="col-span-3"
                      placeholder="Enter lead source"
                      value={newLeadOtherSource}
                      onChange={(e) => setNewLeadOtherSource(e.target.value)}
                      data-testid="input-lead-source-other"
                    />
                  </div>
                )}
                <div className="grid grid-cols-4 items-center gap-4">
                  <Label htmlFor="status" className="text-right">Status</Label>
                  <Select value={newLead.status} onValueChange={(value) => setNewLead({...newLead, status: value})}>
                    <SelectTrigger className="col-span-3" data-testid="select-lead-status">
                      <SelectValue placeholder="Select status" />
                    </SelectTrigger>
                    <SelectContent>
                      {pipelineColumnsWithMissing.map((option) => (
                        <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid grid-cols-4 items-center gap-4">
                  <Label htmlFor="assignedTo" className="text-right">Assigned To</Label>
                  <Select value={newLead.assignedTo} onValueChange={(value) => setNewLead({ ...newLead, assignedTo: value })}>
                    <SelectTrigger className="col-span-3" data-testid="select-lead-assigned-to">
                      <SelectValue placeholder="Unassigned" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__unassigned__">Unassigned</SelectItem>
                      {teamUsers.map((u: any) => (
                        <SelectItem key={u.id} value={String(u.id)}>
                          {u.firstName || u.lastName ? `${u.firstName || ""} ${u.lastName || ""}`.trim() : u.email}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <DialogFooter>
                <Button onClick={handleAddLead} disabled={createMutation.isPending} className="bg-primary hover:bg-primary/90 text-white" data-testid="button-create-lead">
                  {createMutation.isPending ? "Creating..." : "Create Lead"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>
      {missingPipelineStatuses.length ? (
        <div className="mt-3 rounded-md border bg-amber-50 text-amber-950 px-4 py-3 text-sm">
          Some leads are in statuses not shown in your pipeline config: {missingPipelineStatuses.join(", ")}
        </div>
      ) : null}

      {selectedCount > 0 ? (
        <div className="mt-4 rounded-md border bg-card px-4 py-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="text-sm">
            <span className="font-medium">{selectedCount.toLocaleString()}</span> selected
            {selectionMode === "all_filtered" ? <span className="text-muted-foreground"> (all filtered)</span> : null}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {selectionMode === "explicit" && leadsTotal > selectedCount ? (
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setSelectAllConfirmText("");
                  setSelectAllConfirmOpen(true);
                }}
              >
                Select all filtered ({leadsTotal.toLocaleString()})
              </Button>
            ) : null}
            <Button
              variant="outline"
              size="sm"
              disabled={selectionMode === "all_filtered" || selectedIds.size === 0 || selectedIds.size > 200}
              onClick={() => {
                setVoiceTranscript("");
                setVoiceParsed(null);
                setVoicePreview(null);
                setVoiceActionLogId(null);
                setVoiceOpen(true);
              }}
            >
              <Mic className="mr-2 h-4 w-4" />
              Voice
            </Button>
            <Button
              size="sm"
              className="bg-primary hover:bg-primary/90"
              onClick={() => {
                setBulkPreview(null);
                setBulkJobId(null);
                setBulkOpen(true);
                bulkPreviewMutation.mutate();
              }}
            >
              Bulk actions
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setSelectionMode("explicit");
                setSelectedIds(new Set());
                setExcludedIds(new Set());
              }}
            >
              Clear selection
            </Button>
          </div>
        </div>
      ) : null}

      <Dialog open={selectAllConfirmOpen} onOpenChange={setSelectAllConfirmOpen}>
        <DialogContent className="sm:max-w-[520px]">
          <DialogHeader>
            <DialogTitle>Select all filtered leads</DialogTitle>
            <DialogDescription>
              This will target all leads matching the current filters. Type {selectionSigLabel} to confirm.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="select-all-confirm">Confirmation</Label>
            <Input
              id="select-all-confirm"
              value={selectAllConfirmText}
              onChange={(e) => setSelectAllConfirmText(e.target.value)}
              placeholder={selectionSigLabel}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSelectAllConfirmOpen(false)}>
              Cancel
            </Button>
            <Button
              className="bg-primary hover:bg-primary/90 text-white"
              disabled={selectAllConfirmText.trim().toUpperCase() !== selectionSigLabel}
              onClick={() => {
                setSelectionMode("all_filtered");
                setSelectedIds(new Set());
                setExcludedIds(new Set());
                setSelectAllConfirmOpen(false);
              }}
            >
              Confirm
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <VoiceActionDialog
        open={voiceOpen}
        onOpenChange={setVoiceOpen}
        selectionMode={selectionMode}
        selectedIds={selectedIdsArr}
        selectedLead={
          voiceSelectedLead
            ? {
                id: Number(voiceSelectedLead.id),
                address: voiceSelectedLead.address,
                city: voiceSelectedLead.city,
                state: voiceSelectedLead.state,
                zipCode: voiceSelectedLead.zipCode,
              }
            : null
        }
        voiceTranscript={voiceTranscript}
        setVoiceTranscript={setVoiceTranscript}
        voiceParsed={voiceParsed}
        setVoiceParsed={setVoiceParsed}
        voicePreview={voicePreview}
        setVoicePreview={setVoicePreview}
        voiceActionLogId={voiceActionLogId}
        setVoiceActionLogId={setVoiceActionLogId}
        mutations={{
          parse: { mutate: () => voiceParseMutation.mutate(), isPending: voiceParseMutation.isPending },
          preview: { mutate: () => voicePreviewMutation.mutate(), isPending: voicePreviewMutation.isPending },
          apply: { mutate: () => voiceApplyMutation.mutate(), isPending: voiceApplyMutation.isPending },
          undo: { mutate: () => voiceUndoMutation.mutate(), isPending: voiceUndoMutation.isPending },
        }}
      />

      <Tabs defaultValue="list" className="mt-6">
        <TabsList>
          <TabsTrigger value="list">List</TabsTrigger>
          <TabsTrigger value="pipeline">Pipeline</TabsTrigger>
        </TabsList>

        <TabsContent value="list" className="mt-4">
          <div className="rounded-md border bg-card shadow-sm">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[44px]">
                    <Checkbox
                      checked={
                        selectionMode === "explicit" &&
                        (filteredLeads || []).length > 0 &&
                        (filteredLeads || []).every((l: any) => selectedIds.has(Number(l.id)))
                      }
                      onCheckedChange={(v) => toggleAllLoaded(!!v)}
                      onClick={(e) => e.stopPropagation()}
                    />
                  </TableHead>
                  {visibleColumns.address ? <TableHead>Address</TableHead> : null}
                  {visibleColumns.owner ? <TableHead>Owner</TableHead> : null}
                  {visibleColumns.status ? <TableHead>Status</TableHead> : null}
                  {visibleColumns.score ? <TableHead>Score</TableHead> : null}
                  {visibleColumns.value ? <TableHead>Value</TableHead> : null}
                  {visibleColumns.contact ? <TableHead>Contact</TableHead> : null}
                  {visibleColumns.notes ? <TableHead>Notes</TableHead> : null}
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredLeads.map((lead: any) => (
                  <TableRow
                    key={lead.id}
                    className={`hover:bg-muted/50 transition-colors cursor-pointer ${density === "dense" ? "[&>td]:py-2" : "[&>td]:py-4"} ${highlightLeadId === lead.id ? "bg-accent/15" : ""}`}
                    data-testid={`row-lead-${lead.id}`}
                    onClick={() => openLead(lead.id)}
                  >
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      <Checkbox
                        checked={isSelected(Number(lead.id))}
                        onCheckedChange={(v) => toggleRow(Number(lead.id), !!v)}
                      />
                    </TableCell>
                    {visibleColumns.address ? <TableCell className="font-medium">{lead.address}, {lead.city}</TableCell> : null}
                    {visibleColumns.owner ? <TableCell>{lead.ownerName}</TableCell> : null}
                    {visibleColumns.status ? (
                      <TableCell>
                        <Badge variant="outline" className={getStatusBadgeColor(lead.status)}>
                          {pipelineColumnsWithMissing.find((s) => s.value === lead.status)?.label || lead.status}
                        </Badge>
                      </TableCell>
                    ) : null}
                    {visibleColumns.score ? <TableCell>{lead.relasScore || "—"}</TableCell> : null}
                    {visibleColumns.value ? <TableCell>${lead.estimatedValue ? parseInt(lead.estimatedValue).toLocaleString() : "—"}</TableCell> : null}
                    {visibleColumns.contact ? (
                      <TableCell className="text-muted-foreground">
                        <div className="flex flex-col">
                          {lead.ownerPhone ? (
                            <a className="underline underline-offset-2" href={`tel:${lead.ownerPhone}`} onClick={(e) => e.stopPropagation()}>
                              {lead.ownerPhone}
                            </a>
                          ) : (
                            <span>—</span>
                          )}
                          {lead.ownerEmail ? (
                            <a className="underline underline-offset-2 truncate max-w-[220px]" href={`mailto:${lead.ownerEmail}`} onClick={(e) => e.stopPropagation()}>
                              {lead.ownerEmail}
                            </a>
                          ) : null}
                        </div>
                      </TableCell>
                    ) : null}
                    {visibleColumns.notes ? (
                      <TableCell>
                        <div className="text-sm">{Number(lead.notesCount || 0) ? `${Number(lead.notesCount)} note${Number(lead.notesCount) === 1 ? "" : "s"}` : "—"}</div>
                        {lead.lastNotePreview ? <div className="text-xs text-muted-foreground truncate max-w-[240px]" title={String(lead.lastNotePreview)}>{String(lead.lastNotePreview)}</div> : null}
                      </TableCell>
                    ) : null}
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-2">
                        {lead.linkedPropertyId ? (
                          <Button
                            size="sm"
                            variant="outline"
                            className="border-primary text-primary hover:bg-primary hover:text-white"
                            onClick={(e) => {
                              e.stopPropagation();
                              setLocation(opportunityUrl(lead.linkedPropertyId));
                            }}
                            data-testid={`button-view-opportunity-${lead.id}`}
                          >
                            View Opportunity
                          </Button>
                        ) : (
                          lead.status?.toLowerCase().trim() === "under_contract" && (
                            <Button
                              size="sm"
                              variant="outline"
                              className="border-primary text-primary hover:bg-primary hover:text-white"
                              onClick={(e) => handleConvertToProperty(lead, e)}
                              disabled={convertToPropertyMutation.isPending}
                              data-testid={`button-convert-lead-${lead.id}`}
                            >
                              <Building2 className="mr-1 h-3.5 w-3.5" />
                              Add to Properties
                            </Button>
                          )
                        )}
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                              data-testid={`menu-lead-${lead.id}`}
                              onClick={(e) => e.stopPropagation()}
                            >
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem
                              onClick={() => openEditLead(lead)}
                            >
                              <Pencil className="mr-2 h-4 w-4" />
                              Edit
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => openVoiceForLeadId(lead.id)}>
                              <Mic className="mr-2 h-4 w-4" />
                              Voice
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={() => {
                                const full = `${lead.address || ""}${lead.city ? `, ${lead.city}` : ""}${lead.state ? ` ${lead.state}` : ""}${lead.zipCode ? ` ${lead.zipCode}` : ""}`.trim();
                                setLocation(
                                  playgroundUrl({
                                    leadId: lead.id,
                                    propertyId: lead.linkedPropertyId ?? null,
                                    address: full || String(lead.address || "").trim(),
                                  }),
                                );
                              }}
                            >
                              <Lightbulb className="mr-2 h-4 w-4" />
                              Open in Playground
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={() => {
                                setLocation(tasksUrl({ relatedEntityType: "lead", relatedEntityId: lead.id }));
                              }}
                            >
                              View Tasks
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={() => {
                                setLocation(calendarUrl({ relatedEntityType: "lead", relatedEntityId: lead.id }));
                              }}
                            >
                              View Calendar
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              className="text-destructive focus:text-destructive"
                              onClick={() => deleteMutation.mutate(lead.id)}
                            >
                              <Trash2 className="mr-2 h-4 w-4" />
                              Delete
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            {leads.length === 0 && (
              <div className="text-center py-8 text-muted-foreground">No leads yet. Create one to get started!</div>
            )}
          </div>
        </TabsContent>

        <TabsContent value="pipeline" className="mt-4">
          <PipelineBoard
            columns={pipelineColumnsWithMissing}
            items={filteredLeads}
            getId={(lead: any) => lead.id}
            getStatus={(lead: any) => lead.status}
            emptyText="No leads"
            renderItem={(lead: any) => (
              <LeadPipelineCard
                lead={lead}
                columns={pipelineColumnsWithMissing}
                onUpdateStatus={(leadId, status) => updateMutation.mutate({ id: leadId, data: { status } })}
                onAddNote={(l) => {
                  setNoteLead(l);
                  setNoteText("");
                  setIsNoteDialogOpen(true);
                }}
                onOpenActivity={(l) => {
                  setActivityLeadId(l.id);
                  setIsActivityDialogOpen(true);
                }}
                onCall={(l) =>
                  setLocation(
                    dialerUrl({
                      number: String(l.ownerPhone || ""),
                      leadId: l.id,
                      propertyId: typeof (l as any).linkedPropertyId === "number" ? (l as any).linkedPropertyId : null,
                    }),
                  )
                }
                onSms={(l) => {
                  setSmsLead(l);
                  setSmsBody("");
                  setIsSmsDialogOpen(true);
                }}
                onLogEmail={(l) => {
                  setEmailLead(l);
                  setEmailSubject("");
                  setEmailBody("");
                  setIsEmailDialogOpen(true);
                }}
              />
            )}
          />
        </TabsContent>
      </Tabs>

      <Sheet open={isLeadSheetOpen} onOpenChange={setIsLeadSheetOpen}>
        <SheetContent className="sm:max-w-md overflow-hidden">
          <SheetHeader>
            <SheetTitle>{selectedLead ? `${selectedLead.address}, ${selectedLead.city}` : "Lead Details"}</SheetTitle>
            <SheetDescription>{selectedLead ? selectedLead.ownerName : ""}</SheetDescription>
          </SheetHeader>
          {selectedLead ? (
            <div className="mt-6 flex-1 min-h-0 space-y-4 pr-2 scroll-y-container">
              <div className="flex items-center justify-between gap-2">
                <Badge variant="outline" className={getStatusBadgeColor(selectedLead.status)}>
                  {pipelineColumnsWithMissing.find((s) => s.value === selectedLead.status)?.label || selectedLead.status}
                </Badge>
                <div className="flex items-center gap-2">
                  <Button variant="outline" size="sm" onClick={() => openVoiceForLeadId(selectedLead.id)}>
                    <Mic className="mr-2 h-4 w-4" />
                    Voice
                  </Button>
                  <div className="text-sm text-muted-foreground">Score: {selectedLead.relasScore || "—"}</div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <div className="text-xs text-muted-foreground">Phone</div>
                  <div className="font-medium">
                    {selectedLead.ownerPhone ? (
                      <a className="underline underline-offset-2" href={`tel:${selectedLead.ownerPhone}`}>
                        {selectedLead.ownerPhone}
                      </a>
                    ) : (
                      "—"
                    )}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">Email</div>
                  <div className="font-medium">
                    {selectedLead.ownerEmail ? (
                      <a className="underline underline-offset-2" href={`mailto:${selectedLead.ownerEmail}`}>
                        {selectedLead.ownerEmail}
                      </a>
                    ) : (
                      "—"
                    )}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">Estimated Value</div>
                  <div className="font-medium">
                    {selectedLead.estimatedValue ? `$${parseInt(selectedLead.estimatedValue).toLocaleString()}` : "—"}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">Created</div>
                  <div className="font-medium">
                    {selectedLead.createdAt ? new Date(selectedLead.createdAt).toLocaleDateString() : "—"}
                  </div>
                </div>
              </div>

              <SkipTraceJobPanel entityType="lead" entityId={selectedLead.id} />

              <EntityTasksWidget entityType="lead" entityId={selectedLead.id} />

              <div>
                <div className="text-xs text-muted-foreground mb-1">Notes</div>
                <div className="whitespace-pre-wrap text-sm border rounded-md p-3 bg-muted/30">
                  {selectedLead.notes || "No notes yet."}
                </div>
              </div>

              <div className="flex gap-2">
                {selectedLead.linkedPropertyId && (
                  <Button
                    variant="outline"
                    className="flex-1"
                    onClick={() => setLocation(`/opportunities/${selectedLead.linkedPropertyId}`)}
                  >
                    View Opportunity
                  </Button>
                )}
                <Button
                  variant="outline"
                  className={selectedLead.linkedPropertyId ? "flex-1" : "w-full"}
                  onClick={() => {
                    setIsLeadSheetOpen(false);
                    openEditLead(selectedLead);
                  }}
                >
                  Edit Lead
                </Button>
              </div>

              <Button
                variant="destructive"
                className="w-full"
                onClick={() => {
                  if (confirm("Delete this lead?")) {
                    deleteMutation.mutate(selectedLead.id);
                    setIsLeadSheetOpen(false);
                  }
                }}
              >
                Delete Lead
              </Button>
            </div>
          ) : (
            <div className="mt-6 text-sm text-muted-foreground">Select a lead to view details.</div>
          )}
        </SheetContent>
      </Sheet>

      <Dialog
        open={!!editingLead}
        onOpenChange={(open) => {
          if (open) return;
          setEditingLead(null);
          setEditLeadOtherSource("");
        }}
      >
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Edit Lead</DialogTitle>
            <DialogDescription>Update the lead information.</DialogDescription>
          </DialogHeader>
          {editingLead && (
            <div className="grid gap-4 py-4">
              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="edit-address" className="text-right">Address</Label>
                <Input id="edit-address" className="col-span-3" value={editingLead.address} onChange={(e) => setEditingLead({...editingLead, address: e.target.value})} data-testid="input-edit-address" />
              </div>
              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="edit-city" className="text-right">City</Label>
                <Input id="edit-city" className="col-span-3" value={editingLead.city} onChange={(e) => setEditingLead({...editingLead, city: e.target.value})} data-testid="input-edit-city" />
              </div>
              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="edit-zip" className="text-right">Zip Code</Label>
                <Input id="edit-zip" className="col-span-3" value={editingLead.zipCode} onChange={(e) => setEditingLead({...editingLead, zipCode: e.target.value})} data-testid="input-edit-zip" />
              </div>
              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="edit-owner" className="text-right">Owner</Label>
                <Input id="edit-owner" className="col-span-3" value={editingLead.ownerName} onChange={(e) => setEditingLead({...editingLead, ownerName: e.target.value})} data-testid="input-edit-owner" />
              </div>
              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="edit-phone" className="text-right">Phone</Label>
                <Input id="edit-phone" className="col-span-3" value={editingLead.ownerPhone || ""} onChange={(e) => setEditingLead({...editingLead, ownerPhone: e.target.value})} data-testid="input-edit-phone" />
              </div>
              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="edit-source" className="text-right">Lead Source</Label>
                <Select
                  value={String(editingLead.source || "")}
                  onValueChange={(value) => {
                    if (value !== CUSTOM_SOURCE_VALUE) setEditLeadOtherSource("");
                    setEditingLead({ ...editingLead, source: value });
                  }}
                >
                  <SelectTrigger className="col-span-3" data-testid="select-edit-source">
                    <SelectValue placeholder="Select source" />
                  </SelectTrigger>
                  <SelectContent>
                    {leadSourceOptions.map((o: any) => (
                      <SelectItem key={String(o.value)} value={String(o.value)}>
                        {String(o.label || o.value)}
                      </SelectItem>
                    ))}
                    <SelectItem value={CUSTOM_SOURCE_VALUE}>Other</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {String(editingLead.source || "") === CUSTOM_SOURCE_VALUE && (
                <div className="grid grid-cols-4 items-center gap-4">
                  <Label htmlFor="edit-source-other" className="text-right">Other</Label>
                  <Input
                    id="edit-source-other"
                    className="col-span-3"
                    placeholder="Enter lead source"
                    value={editLeadOtherSource}
                    onChange={(e) => setEditLeadOtherSource(e.target.value)}
                    data-testid="input-edit-source-other"
                  />
                </div>
              )}
              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="edit-status" className="text-right">Status</Label>
                <Select value={editingLead.status} onValueChange={(value) => setEditingLead({...editingLead, status: value})}>
                  <SelectTrigger className="col-span-3" data-testid="select-edit-status">
                    <SelectValue placeholder="Select status" />
                  </SelectTrigger>
                  <SelectContent>
                    {pipelineColumnsWithMissing.map((option) => (
                      <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="edit-assignedTo" className="text-right">Assigned To</Label>
                <Select value={String(editingLead.assignedTo || "")} onValueChange={(value) => setEditingLead({ ...editingLead, assignedTo: value })}>
                  <SelectTrigger className="col-span-3" data-testid="select-edit-assigned-to">
                    <SelectValue placeholder="Unassigned" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__unassigned__">Unassigned</SelectItem>
                    {teamUsers.map((u: any) => (
                      <SelectItem key={u.id} value={String(u.id)}>
                        {u.firstName || u.lastName ? `${u.firstName || ""} ${u.lastName || ""}`.trim() : u.email}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setEditingLead(null);
                setEditLeadOtherSource("");
              }}
            >
              Cancel
            </Button>
            <Button onClick={handleUpdateLead} disabled={updateMutation.isPending} className="bg-primary hover:bg-primary/90" data-testid="button-save-lead">
              {updateMutation.isPending ? "Saving..." : "Save Changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={isNoteDialogOpen} onOpenChange={setIsNoteDialogOpen}>
        <DialogContent className="sm:max-w-[520px]">
          <DialogHeader>
            <DialogTitle>Add Note</DialogTitle>
            <DialogDescription>{noteLead?.address ? `Lead: ${noteLead.address}` : ""}</DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="note-text">Note</Label>
            <Textarea id="note-text" value={noteText} onChange={(e) => setNoteText(e.target.value)} placeholder="Type a note…" />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsNoteDialogOpen(false)}>Cancel</Button>
            <Button
              className="bg-primary hover:bg-primary/90 text-white"
              disabled={!noteLead || !noteText.trim() || addNoteMutation.isPending}
              onClick={async () => {
                if (!noteLead) return;
                try {
                  await addNoteMutation.mutateAsync({ leadId: noteLead.id, body: noteText.trim() });
                  setIsNoteDialogOpen(false);
                  setNoteLead(null);
                  setNoteText("");
                } catch {}
              }}
            >
              {addNoteMutation.isPending ? "Saving..." : "Save Note"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={isActivityDialogOpen} onOpenChange={setIsActivityDialogOpen}>
        <DialogContent className="sm:max-w-[640px]">
          <DialogHeader>
            <DialogTitle>Activity</DialogTitle>
          </DialogHeader>
          {activityLeadId ? <EntityActivity leadId={activityLeadId} /> : null}
        </DialogContent>
      </Dialog>

      <Dialog open={isSmsDialogOpen} onOpenChange={setIsSmsDialogOpen}>
        <DialogContent className="sm:max-w-[520px]">
          <DialogHeader>
            <DialogTitle>Send SMS</DialogTitle>
            <DialogDescription>{smsLead?.ownerPhone ? `To: ${smsLead.ownerPhone}` : ""}</DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="sms-body">Message</Label>
            <Textarea id="sms-body" value={smsBody} onChange={(e) => setSmsBody(e.target.value)} placeholder="Type your message…" />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsSmsDialogOpen(false)}>Cancel</Button>
            <Button
              className="bg-primary hover:bg-primary/90 text-white"
              disabled={!smsLead?.ownerPhone || !smsBody.trim()}
              onClick={async () => {
                if (!smsLead?.ownerPhone) return;
                try {
                  await apiRequest("POST", `/api/telephony/sms`, { to: smsLead.ownerPhone, body: smsBody.trim(), metadata: { leadId: smsLead.id } });
                  toast({ title: "SMS sent", description: "Message queued/sent successfully." });
                  queryClient.invalidateQueries({ queryKey: ["/api/activity"] });
                  setIsSmsDialogOpen(false);
                  setSmsLead(null);
                  setSmsBody("");
                } catch (e: any) {
                  toast({ title: "SMS failed", description: String(e?.message || e), variant: "destructive" });
                }
              }}
            >
              Send
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={isEmailDialogOpen} onOpenChange={setIsEmailDialogOpen}>
        <DialogContent className="sm:max-w-[560px]">
          <DialogHeader>
            <DialogTitle>Log Email</DialogTitle>
            <DialogDescription>{emailLead?.ownerEmail ? `To: ${emailLead.ownerEmail}` : ""}</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-2">
              <Label htmlFor="email-subject">Subject</Label>
              <Input id="email-subject" value={emailSubject} onChange={(e) => setEmailSubject(e.target.value)} placeholder="Subject" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="email-body">Body</Label>
              <Textarea id="email-body" value={emailBody} onChange={(e) => setEmailBody(e.target.value)} placeholder="Optional notes / body…" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsEmailDialogOpen(false)}>Cancel</Button>
            <Button
              className="bg-primary hover:bg-primary/90 text-white"
              disabled={!emailLead?.ownerEmail}
              onClick={async () => {
                if (!emailLead?.ownerEmail) return;
                try {
                  await apiRequest("POST", `/api/activity`, {
                    action: "email_sent",
                    description: emailSubject ? `Sent email: ${emailSubject}` : "Sent email",
                    metadata: { leadId: emailLead.id, to: emailLead.ownerEmail, subject: emailSubject || null },
                  });
                  queryClient.invalidateQueries({ queryKey: ["/api/activity"] });
                  const to = String(emailLead.ownerEmail);
                  const subject = encodeURIComponent(String(emailSubject || ""));
                  const body = encodeURIComponent(String(emailBody || ""));
                  const url = `mailto:${to}?subject=${subject}&body=${body}`;
                  window.location.href = url;
                  setIsEmailDialogOpen(false);
                  setEmailLead(null);
                  setEmailSubject("");
                  setEmailBody("");
                } catch (e: any) {
                  toast({ title: "Log failed", description: String(e?.message || e), variant: "destructive" });
                }
              }}
            >
              Log & Open Email
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Layout>
  );
}
