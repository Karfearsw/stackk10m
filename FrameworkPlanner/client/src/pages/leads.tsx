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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { AdvancedFilterDrawer, type LeadFilters } from "@/components/leads/AdvancedFilterDrawer";
import { BulkActionToolbar } from "@/components/leads/BulkActionToolbar";
import { ColumnChooser, leadColumnsCatalog, type LeadColumnId } from "@/components/leads/ColumnChooser";
import { LeadNotePreview } from "@/components/leads/LeadNotePreview";
import { SavedViewsDropdown, type LeadSavedView } from "@/components/leads/SavedViewsDropdown";
import { SortMenu, type LeadSortKey } from "@/components/leads/SortMenu";
import { VoiceActionButton } from "@/components/ai/VoiceActionButton";
import { Plus, Search, Building2, MoreHorizontal, Pencil, Trash2, Lightbulb } from "lucide-react";
import { useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState, type MouseEvent } from "react";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { PipelineBoard } from "@/components/pipeline/PipelineBoard";
import { LeadPipelineCard } from "@/components/pipeline/LeadPipelineCard";
import { EntityActivity } from "@/components/activity/EntityActivity";
import { EntityTasksWidget } from "@/components/tasks/EntityTasksWidget";
import { CrmImportExportDialog } from "@/components/crm/CrmImportExportDialog";
import { apiRequest } from "@/lib/queryClient";

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

const defaultLeadFilters: LeadFilters = {
  query: "",
  status: "all",
  owner: "",
  zip: "",
  state: "",
  city: "",
  assignedTo: "",
  tags: "",
  contactPresence: "",
  archived: "exclude",
  hasNotes: "",
  createdFrom: "",
  createdTo: "",
};

function parseLeadFilters(params: URLSearchParams): LeadFilters {
  return {
    query: params.get("q") || "",
    status: params.get("status") || "all",
    owner: params.get("owner") || "",
    zip: params.get("zip") || "",
    state: params.get("state") || "",
    city: params.get("city") || "",
    assignedTo: params.get("assignedTo") || "",
    tags: params.get("tags") || "",
    contactPresence: params.get("contactPresence") || "",
    archived: params.get("archived") || "exclude",
    hasNotes: params.get("hasNotes") || "",
    createdFrom: params.get("createdFrom") ? new Date(String(params.get("createdFrom"))).toISOString().slice(0, 10) : "",
    createdTo: params.get("createdTo") ? new Date(String(params.get("createdTo"))).toISOString().slice(0, 10) : "",
  };
}

function parseLeadSort(params: URLSearchParams): { sortKey: LeadSortKey; sortDir: "asc" | "desc" } {
  const sortKey = (params.get("sortKey") || "newest_imported") as LeadSortKey;
  const sortDir = params.get("sortDir") === "asc" ? "asc" : "desc";
  return { sortKey, sortDir };
}

function parseLeadPagination(params: URLSearchParams): { pageIndex: number; pageSize: number } {
  const pageIndexRaw = parseInt(String(params.get("page") || "1"), 10);
  const pageSizeRaw = parseInt(String(params.get("pageSize") || "50"), 10);
  const pageIndex = Number.isFinite(pageIndexRaw) ? Math.max(0, pageIndexRaw - 1) : 0;
  const pageSize = Number.isFinite(pageSizeRaw) ? Math.max(10, Math.min(200, pageSizeRaw)) : 50;
  return { pageIndex, pageSize };
}

function parseLeadColumns(params: URLSearchParams): Set<LeadColumnId> {
  const raw = String(params.get("cols") || "").trim();
  if (!raw) {
    return new Set(leadColumnsCatalog.filter((c) => c.defaultVisible).map((c) => c.id));
  }
  const set = new Set<LeadColumnId>();
  for (const part of raw.split(",")) {
    const id = String(part || "").trim() as LeadColumnId;
    if (leadColumnsCatalog.some((c) => c.id === id)) set.add(id);
  }
  if (!set.size) return new Set(leadColumnsCatalog.filter((c) => c.defaultVisible).map((c) => c.id));
  return set;
}

function buildLeadsUrl(params: URLSearchParams) {
  const qs = params.toString();
  return qs ? `/leads?${qs}` : "/leads";
}

export default function Leads() {
  const [location, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { user } = useAuth();
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [editingLead, setEditingLead] = useState<any>(null);
  const [newLeadOtherSource, setNewLeadOtherSource] = useState("");
  const [editLeadOtherSource, setEditLeadOtherSource] = useState("");
  const urlParams = useMemo(() => new URLSearchParams(location.split("?")[1] || ""), [location]);
  const [filters, setFilters] = useState<LeadFilters>(() => parseLeadFilters(new URLSearchParams(window.location.search)));
  const [appliedFilters, setAppliedFilters] = useState<LeadFilters>(filters);
  const [{ sortKey, sortDir }, setSort] = useState<{ sortKey: LeadSortKey; sortDir: "asc" | "desc" }>(() =>
    parseLeadSort(new URLSearchParams(window.location.search)),
  );
  const [{ pageIndex, pageSize }, setPagination] = useState<{ pageIndex: number; pageSize: number }>(() =>
    parseLeadPagination(new URLSearchParams(window.location.search)),
  );
  const [visibleColumns, setVisibleColumns] = useState<Set<LeadColumnId>>(() => parseLeadColumns(new URLSearchParams(window.location.search)));

  useEffect(() => {
    setFilters(parseLeadFilters(urlParams));
    setSort(parseLeadSort(urlParams));
    setPagination(parseLeadPagination(urlParams));
    setVisibleColumns(parseLeadColumns(urlParams));
  }, [urlParams]);

  useEffect(() => {
    const id = setTimeout(() => setAppliedFilters(filters), 250);
    return () => clearTimeout(id);
  }, [filters]);
  useEffect(() => {
    const p = new URLSearchParams();
    if (appliedFilters.query.trim()) p.set("q", appliedFilters.query.trim());
    if (appliedFilters.status && appliedFilters.status !== "all") p.set("status", appliedFilters.status);
    if (appliedFilters.owner.trim()) p.set("owner", appliedFilters.owner.trim());
    if (appliedFilters.zip.trim()) p.set("zip", appliedFilters.zip.trim());
    if (appliedFilters.state.trim()) p.set("state", appliedFilters.state.trim());
    if (appliedFilters.city.trim()) p.set("city", appliedFilters.city.trim());
    if (appliedFilters.assignedTo) p.set("assignedTo", appliedFilters.assignedTo);
    if (appliedFilters.tags.trim()) p.set("tags", appliedFilters.tags.trim());
    if (appliedFilters.contactPresence) p.set("contactPresence", appliedFilters.contactPresence);
    if (appliedFilters.archived && appliedFilters.archived !== "exclude") p.set("archived", appliedFilters.archived);
    if (appliedFilters.hasNotes) p.set("hasNotes", appliedFilters.hasNotes);
    if (appliedFilters.createdFrom) p.set("createdFrom", new Date(`${appliedFilters.createdFrom}T00:00:00`).toISOString());
    if (appliedFilters.createdTo) p.set("createdTo", new Date(`${appliedFilters.createdTo}T00:00:00`).toISOString());
    if (sortKey) p.set("sortKey", sortKey);
    if (sortDir) p.set("sortDir", sortDir);
    if (pageIndex > 0) p.set("page", String(pageIndex + 1));
    if (pageSize !== 50) p.set("pageSize", String(pageSize));
    const colsRaw = Array.from(visibleColumns.values()).join(",");
    if (colsRaw) p.set("cols", colsRaw);
    const next = buildLeadsUrl(p);
    if (next !== location) setLocation(next);
  }, [appliedFilters, sortKey, sortDir, pageIndex, pageSize, visibleColumns, setLocation, location]);

  const leadsQueryKey = useMemo(() => ["leads", appliedFilters, sortKey, sortDir, pageIndex, pageSize], [appliedFilters, sortKey, sortDir, pageIndex, pageSize]);
  const [selectedLeadId, setSelectedLeadId] = useState<number | null>(null);
  const [isLeadSheetOpen, setIsLeadSheetOpen] = useState(false);
  const [highlightLeadId, setHighlightLeadId] = useState<number | null>(null);
  const [didApplyQueryLead, setDidApplyQueryLead] = useState(false);
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
  const [saveViewDialogOpen, setSaveViewDialogOpen] = useState(false);
  const [saveViewName, setSaveViewName] = useState("");
  const [saveViewVisibility, setSaveViewVisibility] = useState<"private" | "team" | "link">("private");
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
    status: "new"
  });

  const { data: leadsResp, isLoading } = useQuery<any>({
    queryKey: leadsQueryKey,
    queryFn: async () => {
      const p = new URLSearchParams();
      p.set("limit", String(pageSize));
      p.set("offset", String(pageIndex * pageSize));
      if (appliedFilters.query.trim()) p.set("q", appliedFilters.query.trim());
      if (appliedFilters.status && appliedFilters.status !== "all") p.set("status", appliedFilters.status);
      if (appliedFilters.owner.trim()) p.set("owner", appliedFilters.owner.trim());
      if (appliedFilters.zip.trim()) p.set("zip", appliedFilters.zip.trim());
      if (appliedFilters.state.trim()) p.set("state", appliedFilters.state.trim());
      if (appliedFilters.city.trim()) p.set("city", appliedFilters.city.trim());
      if (appliedFilters.assignedTo) p.set("assignedTo", appliedFilters.assignedTo);
      if (appliedFilters.tags.trim()) p.set("tags", appliedFilters.tags.trim());
      if (appliedFilters.contactPresence) p.set("contactPresence", appliedFilters.contactPresence);
      if (appliedFilters.archived) p.set("archived", appliedFilters.archived);
      if (appliedFilters.hasNotes) p.set("hasNotes", appliedFilters.hasNotes);
      if (appliedFilters.createdFrom) p.set("createdFrom", new Date(`${appliedFilters.createdFrom}T00:00:00`).toISOString());
      if (appliedFilters.createdTo) p.set("createdTo", new Date(`${appliedFilters.createdTo}T23:59:59`).toISOString());
      if (sortKey) p.set("sortKey", sortKey);
      if (sortDir) p.set("sortDir", sortDir);
      const res = await apiRequest("GET", `/api/leads?${p.toString()}`);
      return await res.json();
    },
  });
  const leads = useMemo(() => (Array.isArray(leadsResp?.items) ? leadsResp.items : []), [leadsResp?.items]);
  const leadsTotal = useMemo(() => Number(leadsResp?.total ?? leads.length ?? 0), [leads.length, leadsResp?.total]);

  const selectionSignature = useMemo(() => {
    const p = new URLSearchParams();
    if (appliedFilters.query.trim()) p.set("q", appliedFilters.query.trim());
    if (appliedFilters.status && appliedFilters.status !== "all") p.set("status", appliedFilters.status);
    if (appliedFilters.owner.trim()) p.set("owner", appliedFilters.owner.trim());
    if (appliedFilters.zip.trim()) p.set("zip", appliedFilters.zip.trim());
    if (appliedFilters.state.trim()) p.set("state", appliedFilters.state.trim());
    if (appliedFilters.city.trim()) p.set("city", appliedFilters.city.trim());
    if (appliedFilters.assignedTo) p.set("assignedTo", appliedFilters.assignedTo);
    if (appliedFilters.tags.trim()) p.set("tags", appliedFilters.tags.trim());
    if (appliedFilters.contactPresence) p.set("contactPresence", appliedFilters.contactPresence);
    if (appliedFilters.archived) p.set("archived", appliedFilters.archived);
    if (appliedFilters.hasNotes) p.set("hasNotes", appliedFilters.hasNotes);
    if (appliedFilters.createdFrom) p.set("createdFrom", appliedFilters.createdFrom);
    if (appliedFilters.createdTo) p.set("createdTo", appliedFilters.createdTo);
    p.set("sortKey", sortKey);
    p.set("sortDir", sortDir);
    return p.toString();
  }, [appliedFilters, sortKey, sortDir]);

  const [selectionMode, setSelectionMode] = useState<"explicit" | "all_filtered">("explicit");
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [excludedIds, setExcludedIds] = useState<Set<number>>(new Set());
  const [selectionModeSignature, setSelectionModeSignature] = useState<string>("");

  useEffect(() => {
    if (selectionMode !== "all_filtered") return;
    if (!selectionModeSignature) return;
    if (selectionModeSignature !== selectionSignature) {
      setSelectionMode("explicit");
      setSelectedIds(new Set());
      setExcludedIds(new Set());
      setSelectionModeSignature("");
    }
  }, [selectionMode, selectionModeSignature, selectionSignature]);

  const selectedCount = useMemo(() => {
    if (selectionMode === "explicit") return selectedIds.size;
    return Math.max(0, leadsTotal - excludedIds.size);
  }, [selectionMode, selectedIds.size, leadsTotal, excludedIds.size]);

  const canAssignLeads = useMemo(() => {
    const role = String((user as any)?.role || "").toLowerCase();
    return Boolean((user as any)?.isSuperAdmin) || role === "admin" || role === "team_leader";
  }, [user]);

  const { data: usersList = [] } = useQuery<any[]>({
    queryKey: ["/api/users", "scoped"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/users?limit=500");
      return await res.json();
    },
  });

  const usersById = useMemo(() => {
    const m = new Map<number, any>();
    for (const u of usersList || []) {
      const id = Number((u as any)?.id);
      if (Number.isFinite(id) && id > 0) m.set(id, u);
    }
    return m;
  }, [usersList]);

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

  const leadSourceOptionValues = useMemo(() => {
    return new Set((leadSourceOptions || []).map((o: any) => String(o?.value || "")));
  }, [leadSourceOptions]);

  const { data: viewsResp, refetch: refetchViews } = useQuery<any>({
    queryKey: ["/api/leads/views"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/leads/views");
      return await res.json();
    },
  });

  const openEditLead = (lead: any) => {
    const rawSource = String(lead?.source || "").trim();
    const hasKnownSource = rawSource && leadSourceOptionValues.has(rawSource);
    const shouldUseCustom = rawSource && !hasKnownSource;
    setEditLeadOtherSource(shouldUseCustom ? rawSource : "");
    setEditingLead({
      ...lead,
      estimatedValue: lead?.estimatedValue || "",
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
      setNewLead({ address: "", city: "", state: "FL", zipCode: "", ownerName: "", ownerPhone: "", ownerEmail: "", estimatedValue: "", source: "", status: "new" });
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

  const saveViewMutation = useMutation({
    mutationFn: async (payload: { name: string; visibility: "private" | "team" | "link" }) => {
      const configJson = {
        filters: appliedFilters,
        sortKey,
        sortDir,
        cols: Array.from(visibleColumns.values()),
      };
      const res = await apiRequest("POST", "/api/leads/views", { name: payload.name, visibility: payload.visibility, configJson });
      return await res.json();
    },
    onSuccess: async () => {
      await refetchViews();
      setSaveViewDialogOpen(false);
      setSaveViewName("");
      setSaveViewVisibility("private");
      toast({ title: "View saved", description: "Saved view is ready." });
    },
    onError: (error: any) => {
      toast({ title: "Save failed", description: String(error?.message || error), variant: "destructive" });
    },
  });

  const [bulkDialogKind, setBulkDialogKind] = useState<null | "assign" | "add_tags" | "remove_tags" | "set_status" | "archive" | "export">(null);
  const [bulkAssignTo, setBulkAssignTo] = useState<string>("");
  const [bulkStatus, setBulkStatus] = useState<string>("new");
  const [bulkTags, setBulkTags] = useState<string>("");
  const [bulkExportFormat, setBulkExportFormat] = useState<"csv" | "xlsx">("csv");
  const [bulkArchiveConfirm, setBulkArchiveConfirm] = useState(false);
  const [activeBulkJobId, setActiveBulkJobId] = useState<number | null>(null);

  const bulkSelectionScope = selectionMode === "explicit" ? "explicit" : "all_filtered";
  const bulkLeadIds = useMemo(() => Array.from(selectedIds.values()), [selectedIds]);
  const bulkQuery = useMemo(() => {
    return {
      q: appliedFilters.query.trim() || undefined,
      status: appliedFilters.status && appliedFilters.status !== "all" ? appliedFilters.status : undefined,
      owner: appliedFilters.owner.trim() || undefined,
      zip: appliedFilters.zip.trim() || undefined,
      state: appliedFilters.state.trim() || undefined,
      city: appliedFilters.city.trim() || undefined,
      assignedTo: appliedFilters.assignedTo || undefined,
      tags: appliedFilters.tags.trim()
        ? appliedFilters.tags
            .split(",")
            .map((t) => t.trim())
            .filter(Boolean)
        : undefined,
      contactPresence: appliedFilters.contactPresence || undefined,
      archived: appliedFilters.archived || undefined,
      hasNotes: appliedFilters.hasNotes || undefined,
      createdFrom: appliedFilters.createdFrom ? new Date(`${appliedFilters.createdFrom}T00:00:00`).toISOString() : undefined,
      createdTo: appliedFilters.createdTo ? new Date(`${appliedFilters.createdTo}T23:59:59`).toISOString() : undefined,
      sortKey,
      sortDir,
    };
  }, [appliedFilters, sortKey, sortDir]);

  const bulkPreviewQuery = useQuery<any>({
    queryKey: ["leads-bulk-preview", bulkDialogKind, bulkSelectionScope, selectionSignature, bulkLeadIds],
    enabled: Boolean(bulkDialogKind) && selectedCount > 0,
    queryFn: async () => {
      const action =
        bulkDialogKind === "assign"
          ? "assign"
          : bulkDialogKind === "set_status"
            ? "set_status"
            : bulkDialogKind === "add_tags"
              ? "add_tags"
              : bulkDialogKind === "remove_tags"
                ? "remove_tags"
                : bulkDialogKind === "archive"
                  ? "archive"
                  : bulkDialogKind === "export"
                    ? "export"
                    : "";
      const res = await apiRequest("POST", "/api/leads/bulk/preview", {
        action,
        selectionScope: bulkSelectionScope,
        leadIds: bulkSelectionScope === "explicit" ? bulkLeadIds : undefined,
        query: bulkSelectionScope === "all_filtered" ? bulkQuery : undefined,
      });
      return await res.json();
    },
  });

  const createBulkJobMutation = useMutation({
    mutationFn: async () => {
      if (!bulkDialogKind) throw new Error("Missing action");
      const action =
        bulkDialogKind === "assign"
          ? "assign"
          : bulkDialogKind === "set_status"
            ? "set_status"
            : bulkDialogKind === "add_tags"
              ? "add_tags"
              : bulkDialogKind === "remove_tags"
                ? "remove_tags"
                : bulkDialogKind === "archive"
                  ? "archive"
                  : bulkDialogKind === "export"
                    ? "export"
                    : "";
      const params: any = {};
      if (bulkDialogKind === "assign") params.assignedTo = bulkAssignTo ? parseInt(bulkAssignTo, 10) : null;
      if (bulkDialogKind === "set_status") params.status = bulkStatus;
      if (bulkDialogKind === "add_tags" || bulkDialogKind === "remove_tags") params.tags = bulkTags;
      if (bulkDialogKind === "export") {
        params.format = bulkExportFormat;
        params.columns = Array.from(visibleColumns.values());
      }
      const res = await apiRequest("POST", "/api/leads/bulk/jobs", {
        action,
        selectionScope: bulkSelectionScope,
        leadIds: bulkSelectionScope === "explicit" ? bulkLeadIds : undefined,
        query: bulkSelectionScope === "all_filtered" ? bulkQuery : undefined,
        params,
      });
      return await res.json();
    },
    onSuccess: (data: any) => {
      const jobId = Number(data?.jobId);
      if (Number.isFinite(jobId) && jobId > 0) setActiveBulkJobId(jobId);
      setBulkDialogKind(null);
      toast({ title: "Bulk job started", description: "Processing in background." });
    },
    onError: (error: any) => {
      toast({ title: "Bulk action failed", description: String(error?.message || error), variant: "destructive" });
    },
  });

  const bulkJobQuery = useQuery<any>({
    queryKey: ["leads-bulk-job", activeBulkJobId],
    enabled: Boolean(activeBulkJobId),
    refetchInterval: 2000,
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/leads/bulk/jobs/${activeBulkJobId}`);
      return await res.json();
    },
  });

  useEffect(() => {
    const status = String(bulkJobQuery.data?.status || "");
    if (!activeBulkJobId) return;
    if (status !== "completed" && status !== "failed") return;
    const result = bulkJobQuery.data?.resultJson;
    if (result?.downloadUrl) {
      toast({ title: "Export ready", description: "Download is ready." });
      window.open(String(result.downloadUrl), "_blank");
    } else {
      toast({ title: "Bulk job complete", description: `Succeeded: ${bulkJobQuery.data?.succeeded ?? 0}, Failed: ${bulkJobQuery.data?.failed ?? 0}` });
    }
    queryClient.invalidateQueries({ queryKey: ["leads"] });
    queryClient.invalidateQueries({ queryKey: ["/api/activity"] });
    setActiveBulkJobId(null);
    if (selectionMode === "explicit") setSelectedIds(new Set());
    else setExcludedIds(new Set());
    setSelectionMode("explicit");
    setSelectionModeSignature("");
  }, [bulkJobQuery.data, activeBulkJobId]);

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

    createMutation.mutate({ ...newLead, source });
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
        data: { ...editingLead, source: source || null },
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

  const isLeadSelected = (id: number) => {
    if (selectionMode === "explicit") return selectedIds.has(id);
    return !excludedIds.has(id);
  };

  const toggleLeadSelected = (id: number, nextChecked: boolean) => {
    if (selectionMode === "explicit") {
      setSelectedIds((prev) => {
        const next = new Set(prev);
        if (nextChecked) next.add(id);
        else next.delete(id);
        return next;
      });
      return;
    }
    setExcludedIds((prev) => {
      const next = new Set(prev);
      if (nextChecked) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const pageSelection = useMemo(() => {
    const ids = filteredLeads.map((l: any) => Number(l?.id)).filter((n: any) => Number.isFinite(n) && n > 0);
    const selectedOnPage = ids.filter((id: number) => isLeadSelected(id)).length;
    return { ids, selectedOnPage, allOnPage: ids.length > 0 && selectedOnPage === ids.length, someOnPage: selectedOnPage > 0 && selectedOnPage < ids.length };
  }, [filteredLeads, selectionMode, selectedIds, excludedIds]);

  const selectedLead = useMemo(() => {
    if (!selectedLeadId) return null;
    return (leads || []).find((l: any) => l.id === selectedLeadId) || null;
  }, [leads, selectedLeadId]);

  const { data: skipTraceLatest } = useQuery<any>({
    queryKey: ["/api/leads", selectedLeadId, "skip-trace-latest"],
    enabled: !!selectedLeadId && isLeadSheetOpen,
    queryFn: async () => {
      try {
        const res = await apiRequest("GET", `/api/leads/${selectedLeadId}/skip-trace/latest`);
        return await res.json();
      } catch (e: any) {
        const msg = String(e?.message || e);
        if (msg.startsWith("404:")) return null;
        throw e;
      }
    },
  });

  const skipTraceMutation = useMutation({
    mutationFn: async (leadId: number) => {
      try {
        const res = await apiRequest("POST", `/api/leads/${leadId}/skip-trace`, {});
        return await res.json();
      } catch (e: any) {
        const msg = String(e?.message || e);
        if (msg.startsWith("404:")) throw new Error("Skip trace is disabled");
        throw e;
      }
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["/api/leads", selectedLeadId, "skip-trace-latest"] });
      await queryClient.invalidateQueries({ queryKey: ["leads"] });
      toast({ title: "Skip trace completed" });
    },
    onError: (e: any) => {
      toast({ title: e?.message || "Skip trace failed", variant: "destructive" });
    },
  });

  useEffect(() => {
    if (didApplyQueryLead) return;
    if (!leadIdFromQuery) return;
    if (isLoading) return;
    const found = (leads || []).some((l: any) => l.id === leadIdFromQuery);
    if (!found) return;
    setFilters(defaultLeadFilters);
    setSelectedLeadId(leadIdFromQuery);
    setHighlightLeadId(leadIdFromQuery);
    setIsLeadSheetOpen(true);
    setDidApplyQueryLead(true);
    setTimeout(() => {
      const el = document.querySelector(`[data-testid="row-lead-${leadIdFromQuery}"]`);
      if (el) (el as HTMLElement).scrollIntoView({ block: "center" });
    }, 0);
  }, [didApplyQueryLead, isLoading, leadIdFromQuery, leads]);

  const openLead = (id: number) => {
    setSelectedLeadId(id);
    setHighlightLeadId(id);
    setIsLeadSheetOpen(true);
  };

  const applySavedView = (view: LeadSavedView) => {
    const cfg = (view as any)?.configJson;
    const nextFilters = cfg?.filters && typeof cfg.filters === "object" ? { ...defaultLeadFilters, ...cfg.filters } : defaultLeadFilters;
    const nextSortKey = cfg?.sortKey ? (cfg.sortKey as LeadSortKey) : sortKey;
    const nextSortDir = cfg?.sortDir === "asc" ? "asc" : "desc";
    const nextCols = Array.isArray(cfg?.cols) ? new Set<LeadColumnId>(cfg.cols) : visibleColumns;
    setFilters(nextFilters);
    setSort({ sortKey: nextSortKey, sortDir: nextSortDir });
    setVisibleColumns(nextCols);
    setPagination((p) => ({ ...p, pageIndex: 0 }));
  };

  const applySystemView = (systemId: string) => {
    const today = new Date().toISOString().slice(0, 10);
    if (systemId === "unassigned") setFilters({ ...defaultLeadFilters, assignedTo: "unassigned" });
    else if (systemId === "no_contact") setFilters({ ...defaultLeadFilters, contactPresence: "none" });
    else if (systemId === "new_today") setFilters({ ...defaultLeadFilters, createdFrom: today, createdTo: today });
    else setFilters(defaultLeadFilters);
    setPagination((p) => ({ ...p, pageIndex: 0 }));
  };

  const clearFilters = () => {
    setFilters(defaultLeadFilters);
    setPagination((p) => ({ ...p, pageIndex: 0 }));
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
          <SavedViewsDropdown
            label="Views"
            views={Array.isArray((viewsResp as any)?.items) ? ((viewsResp as any).items as LeadSavedView[]) : []}
            onSelectSystem={(systemId) => applySystemView(systemId)}
            onSelectView={(view) => applySavedView(view)}
            onSaveCurrent={() => {
              setSaveViewName("");
              setSaveViewVisibility("private");
              setSaveViewDialogOpen(true);
            }}
          />
          <SortMenu sortKey={sortKey} sortDir={sortDir} onChange={(next) => { setSort(next); setPagination((p) => ({ ...p, pageIndex: 0 })); }} />
          <AdvancedFilterDrawer value={filters} onChange={(next) => { setFilters(next); setPagination((p) => ({ ...p, pageIndex: 0 })); }} onClear={clearFilters} />
          <ColumnChooser
            visible={visibleColumns}
            onToggle={(id) => {
              setVisibleColumns((prev) => {
                const next = new Set(prev);
                if (next.has(id)) next.delete(id);
                else next.add(id);
                return next;
              });
            }}
            onRestoreDefaults={() => setVisibleColumns(new Set(leadColumnsCatalog.filter((c) => c.defaultVisible).map((c) => c.id)))}
          />
          <VoiceActionButton selectionScope={bulkSelectionScope as any} leadIds={bulkLeadIds} query={bulkQuery} />
          
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
                      {pipelineColumns.map((option) => (
                        <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
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

      <BulkActionToolbar
        className="mt-4"
        selectedCount={selectedCount}
        onAssign={() => {
          if (!canAssignLeads) {
            toast({ title: "Not allowed", description: "You don't have permission to assign leads.", variant: "destructive" });
            return;
          }
          setBulkAssignTo("");
          setBulkDialogKind("assign");
        }}
        onAddTags={() => {
          setBulkTags("");
          setBulkDialogKind("add_tags");
        }}
        onRemoveTags={() => {
          setBulkTags("");
          setBulkDialogKind("remove_tags");
        }}
        onSetStatus={() => {
          setBulkStatus("new");
          setBulkDialogKind("set_status");
        }}
        onExport={() => {
          setBulkExportFormat("csv");
          setBulkDialogKind("export");
        }}
        onArchive={() => {
          setBulkArchiveConfirm(false);
          setBulkDialogKind("archive");
        }}
        onClear={() => {
          setSelectionMode("explicit");
          setSelectedIds(new Set());
          setExcludedIds(new Set());
          setSelectionModeSignature("");
        }}
      />

      <Dialog open={saveViewDialogOpen} onOpenChange={setSaveViewDialogOpen}>
        <DialogContent className="sm:max-w-[480px]">
          <DialogHeader>
            <DialogTitle>Save view</DialogTitle>
            <DialogDescription>Save your current filters, sort, and columns.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="space-y-2">
              <Label>Name</Label>
              <Input value={saveViewName} onChange={(e) => setSaveViewName(e.target.value)} placeholder="e.g. Florida absentee" />
            </div>
            <div className="space-y-2">
              <Label>Visibility</Label>
              <Select value={saveViewVisibility} onValueChange={(v) => setSaveViewVisibility(v as any)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="private">Private</SelectItem>
                  <SelectItem value="team">Team</SelectItem>
                  <SelectItem value="link">Link-share</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button
              onClick={() => saveViewMutation.mutate({ name: saveViewName.trim(), visibility: saveViewVisibility })}
              disabled={!saveViewName.trim() || saveViewMutation.isPending}
            >
              {saveViewMutation.isPending ? "Saving..." : "Save view"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={bulkDialogKind !== null}
        onOpenChange={(open) => {
          if (!open) setBulkDialogKind(null);
        }}
      >
        <DialogContent className="sm:max-w-[520px]">
          <DialogHeader>
            <DialogTitle>Bulk action</DialogTitle>
            <DialogDescription>
              {bulkPreviewQuery.isLoading
                ? "Calculating targets…"
                : `Targets: ${Number(bulkPreviewQuery.data?.totalTargets || 0).toLocaleString()}`}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            {bulkDialogKind === "assign" ? (
              <div className="space-y-2">
                <Label>Assign to</Label>
                <Select value={bulkAssignTo} onValueChange={setBulkAssignTo}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select user" />
                  </SelectTrigger>
                  <SelectContent>
                    {(usersList || []).map((u: any) => (
                      <SelectItem key={String(u.id)} value={String(u.id)}>
                        {String(u.firstName || "")} {String(u.lastName || "")}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ) : null}
            {bulkDialogKind === "set_status" ? (
              <div className="space-y-2">
                <Label>Status</Label>
                <Select value={bulkStatus} onValueChange={setBulkStatus}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select status" />
                  </SelectTrigger>
                  <SelectContent>
                    {pipelineColumns.map((s) => (
                      <SelectItem key={s.value} value={s.value}>
                        {s.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ) : null}
            {bulkDialogKind === "add_tags" || bulkDialogKind === "remove_tags" ? (
              <div className="space-y-2">
                <Label>Tags (comma separated)</Label>
                <Input value={bulkTags} onChange={(e) => setBulkTags(e.target.value)} placeholder="vacant, high-equity" />
              </div>
            ) : null}
            {bulkDialogKind === "export" ? (
              <div className="space-y-2">
                <Label>Format</Label>
                <Select value={bulkExportFormat} onValueChange={(v) => setBulkExportFormat(v as any)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="csv">CSV</SelectItem>
                    <SelectItem value="xlsx">XLSX</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            ) : null}
            {bulkDialogKind === "archive" ? (
              <div className="space-y-2">
                <Label>Confirm</Label>
                <div className="flex items-center gap-2">
                  <Checkbox checked={bulkArchiveConfirm} onCheckedChange={(v) => setBulkArchiveConfirm(Boolean(v))} />
                  <div className="text-sm">I understand this will archive the selected leads.</div>
                </div>
              </div>
            ) : null}
          </div>
          <DialogFooter>
            <Button
              variant={bulkDialogKind === "archive" ? "destructive" : "default"}
              onClick={() => createBulkJobMutation.mutate()}
              disabled={
                createBulkJobMutation.isPending ||
                bulkPreviewQuery.isLoading ||
                Number(bulkPreviewQuery.data?.totalTargets || 0) <= 0 ||
                (bulkDialogKind === "assign" && !bulkAssignTo) ||
                ((bulkDialogKind === "add_tags" || bulkDialogKind === "remove_tags") && !bulkTags.trim()) ||
                (bulkDialogKind === "archive" && !bulkArchiveConfirm)
              }
            >
              {createBulkJobMutation.isPending ? "Starting..." : "Confirm"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Tabs defaultValue="list" className="mt-6">
        <TabsList>
          <TabsTrigger value="list">List</TabsTrigger>
          <TabsTrigger value="pipeline">Pipeline</TabsTrigger>
        </TabsList>

        <TabsContent value="list" className="mt-4">
          <div className="rounded-md border bg-card shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b px-3 py-2">
              <div className="text-sm text-muted-foreground">{Number.isFinite(leadsTotal) ? leadsTotal.toLocaleString() : leadsTotal} results</div>
              <div className="flex flex-wrap items-center gap-2">
                {selectedCount > 0 && selectionMode === "explicit" ? (
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      setSelectionMode("all_filtered");
                      setSelectionModeSignature(selectionSignature);
                      setExcludedIds(new Set());
                    }}
                  >
                    Select all {leadsTotal.toLocaleString()} matching
                  </Button>
                ) : null}
                {selectionMode === "all_filtered" ? (
                  <Badge variant="secondary">All matching selected</Badge>
                ) : null}
              </div>
            </div>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[44px]">
                    <Checkbox
                      checked={pageSelection.allOnPage ? true : pageSelection.someOnPage ? "indeterminate" : false}
                      onCheckedChange={(checked) => {
                        const next = Boolean(checked);
                        if (selectionMode === "explicit") {
                          setSelectedIds((prev) => {
                            const s = new Set(prev);
                            for (const id of pageSelection.ids) {
                              if (next) s.add(id);
                              else s.delete(id);
                            }
                            return s;
                          });
                        } else {
                          setExcludedIds((prev) => {
                            const s = new Set(prev);
                            for (const id of pageSelection.ids) {
                              if (next) s.delete(id);
                              else s.add(id);
                            }
                            return s;
                          });
                        }
                      }}
                      onClick={(e) => e.stopPropagation()}
                    />
                  </TableHead>
                  {visibleColumns.has("address") ? <TableHead>Address</TableHead> : null}
                  {visibleColumns.has("owner") ? <TableHead>Owner</TableHead> : null}
                  {visibleColumns.has("status") ? <TableHead>Status</TableHead> : null}
                  {visibleColumns.has("score") ? <TableHead>Score</TableHead> : null}
                  {visibleColumns.has("value") ? <TableHead>Value</TableHead> : null}
                  {visibleColumns.has("contact") ? <TableHead>Contact</TableHead> : null}
                  {visibleColumns.has("notes") ? <TableHead>Notes</TableHead> : null}
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredLeads.map((lead: any) => (
                  <TableRow
                    key={lead.id}
                    className={`hover:bg-muted/50 transition-colors cursor-pointer ${highlightLeadId === lead.id ? "bg-accent/15" : ""}`}
                    data-testid={`row-lead-${lead.id}`}
                    onClick={() => openLead(lead.id)}
                  >
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      <Checkbox checked={isLeadSelected(Number(lead.id))} onCheckedChange={(checked) => toggleLeadSelected(Number(lead.id), Boolean(checked))} />
                    </TableCell>
                    {visibleColumns.has("address") ? (
                      <TableCell className="font-medium">{lead.address}, {lead.city}</TableCell>
                    ) : null}
                    {visibleColumns.has("owner") ? <TableCell>{lead.ownerName}</TableCell> : null}
                    {visibleColumns.has("status") ? (
                      <TableCell>
                        <Badge variant="outline" className={getStatusBadgeColor(lead.status)}>
                          {pipelineColumns.find((s) => s.value === lead.status)?.label || lead.status}
                        </Badge>
                      </TableCell>
                    ) : null}
                    {visibleColumns.has("score") ? <TableCell>{lead.relasScore || "—"}</TableCell> : null}
                    {visibleColumns.has("value") ? (
                      <TableCell>${lead.estimatedValue ? parseInt(lead.estimatedValue).toLocaleString() : "—"}</TableCell>
                    ) : null}
                    {visibleColumns.has("contact") ? (
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
                            <a
                              className="underline underline-offset-2 truncate max-w-[220px]"
                              href={`mailto:${lead.ownerEmail}`}
                              onClick={(e) => e.stopPropagation()}
                            >
                              {lead.ownerEmail}
                            </a>
                          ) : null}
                        </div>
                      </TableCell>
                    ) : null}
                    {visibleColumns.has("notes") ? (
                      <TableCell>
                        <LeadNotePreview count={Number(lead.notesCount || 0)} preview={lead.lastNotePreview || null} />
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
                              setLocation(`/opportunities/${lead.linkedPropertyId}`);
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
                            <DropdownMenuItem
                              onClick={() => {
                                const full = `${lead.address || ""}${lead.city ? `, ${lead.city}` : ""}${lead.state ? ` ${lead.state}` : ""}${lead.zipCode ? ` ${lead.zipCode}` : ""}`.trim();
                                setLocation(`/playground?leadId=${lead.id}&address=${encodeURIComponent(full || String(lead.address || "").trim())}`);
                              }}
                            >
                              <Lightbulb className="mr-2 h-4 w-4" />
                              Open in Playground
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
            <div className="flex items-center justify-between gap-2 border-t px-3 py-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={pageIndex <= 0}
                onClick={() => setPagination((p) => ({ ...p, pageIndex: Math.max(0, p.pageIndex - 1) }))}
              >
                Previous
              </Button>
              <div className="text-sm text-muted-foreground">
                Page {pageIndex + 1} of {Math.max(1, Math.ceil(leadsTotal / pageSize))}
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={pageIndex + 1 >= Math.max(1, Math.ceil(leadsTotal / pageSize))}
                onClick={() => setPagination((p) => ({ ...p, pageIndex: p.pageIndex + 1 }))}
              >
                Next
              </Button>
            </div>
            {leads.length === 0 && (
              <div className="text-center py-8 text-muted-foreground">No leads yet. Create one to get started!</div>
            )}
          </div>
        </TabsContent>

        <TabsContent value="pipeline" className="mt-4">
          <PipelineBoard
            columns={pipelineColumns}
            items={filteredLeads}
            getId={(lead: any) => lead.id}
            getStatus={(lead: any) => lead.status}
            emptyText="No leads"
            renderItem={(lead: any) => (
              <LeadPipelineCard
                lead={lead}
                columns={pipelineColumns}
                onUpdateStatus={(leadId, status) => updateMutation.mutate({ id: leadId, data: { status } })}
                users={usersList}
                usersById={usersById}
                canAssign={canAssignLeads}
                onAssign={(leadId, assignedTo) => updateMutation.mutate({ id: leadId, data: { assignedTo } })}
                onAddNote={(l) => {
                  setNoteLead(l);
                  setNoteText("");
                  setIsNoteDialogOpen(true);
                }}
                onOpenActivity={(l) => {
                  setActivityLeadId(l.id);
                  setIsActivityDialogOpen(true);
                }}
                onCall={(l) => setLocation(`/dialer?number=${encodeURIComponent(String(l.ownerPhone || ""))}&leadId=${l.id}`)}
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
        <SheetContent className="sm:max-w-md">
          <SheetHeader>
            <SheetTitle>{selectedLead ? `${selectedLead.address}, ${selectedLead.city}` : "Lead Details"}</SheetTitle>
            <SheetDescription>{selectedLead ? selectedLead.ownerName : ""}</SheetDescription>
          </SheetHeader>
          {selectedLead ? (
            <div className="mt-6 space-y-4">
              <div className="flex items-center justify-between">
                <Badge variant="outline" className={getStatusBadgeColor(selectedLead.status)}>
                  {pipelineColumns.find((s) => s.value === selectedLead.status)?.label || selectedLead.status}
                </Badge>
                <div className="text-sm text-muted-foreground">Score: {selectedLead.relasScore || "—"}</div>
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

              <div className="space-y-2">
                <Button
                  variant="secondary"
                  className="w-full"
                  disabled={skipTraceMutation.isPending}
                  onClick={() => skipTraceMutation.mutate(selectedLead.id)}
                >
                  Skip Trace Owner
                </Button>
                {skipTraceLatest && (
                  <div className="border rounded-md p-3 text-sm bg-muted/20">
                    <div className="flex items-center justify-between">
                      <div className="text-xs text-muted-foreground">Last Result</div>
                      <div className="text-xs text-muted-foreground">
                        {skipTraceLatest.completedAt
                          ? new Date(skipTraceLatest.completedAt).toLocaleString()
                          : skipTraceLatest.requestedAt
                            ? new Date(skipTraceLatest.requestedAt).toLocaleString()
                            : "—"}
                      </div>
                    </div>
                    <div className="mt-2 grid grid-cols-1 gap-1">
                      <div>
                        <span className="text-muted-foreground">Status:</span>{" "}
                        <span className="font-medium">{String(skipTraceLatest.status || "—")}</span>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Phones:</span>{" "}
                        <span className="font-medium">{Array.isArray(skipTraceLatest.phones) && skipTraceLatest.phones.length ? skipTraceLatest.phones.join(", ") : "—"}</span>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Emails:</span>{" "}
                        <span className="font-medium">{Array.isArray(skipTraceLatest.emails) && skipTraceLatest.emails.length ? skipTraceLatest.emails.join(", ") : "—"}</span>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Cost:</span>{" "}
                        <span className="font-medium">
                          {typeof skipTraceLatest.costCents === "number" ? `$${(skipTraceLatest.costCents / 100).toFixed(2)}` : "—"}
                        </span>
                      </div>
                    </div>
                  </div>
                )}
              </div>

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
                    {pipelineColumns.map((option) => (
                      <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
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
              disabled={!noteLead || !noteText.trim() || updateMutation.isPending}
              onClick={async () => {
                if (!noteLead) return;
                try {
                  const res = await apiRequest("POST", `/api/leads/${noteLead.id}/notes`, { body: noteText.trim() });
                  await res.json();
                  queryClient.invalidateQueries({ queryKey: ["leads"] });
                  queryClient.invalidateQueries({ queryKey: ["/api/activity"] });
                  setIsNoteDialogOpen(false);
                  setNoteLead(null);
                  setNoteText("");
                } catch {}
              }}
            >
              Save Note
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
