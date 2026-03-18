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
import { Filter, Plus, Search, Building2, MoreHorizontal, Pencil, Trash2, Lightbulb } from "lucide-react";
import { useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState, type MouseEvent } from "react";
import { useToast } from "@/hooks/use-toast";
import { PipelineBoard } from "@/components/pipeline/PipelineBoard";
import { LeadPipelineCard } from "@/components/pipeline/LeadPipelineCard";
import { EntityActivity } from "@/components/activity/EntityActivity";
import { EntityTasksWidget } from "@/components/tasks/EntityTasksWidget";
import { CrmImportExportDialog } from "@/components/crm/CrmImportExportDialog";

const statusOptions = [
  { value: "new", label: "New" },
  { value: "contacted", label: "Contacted" },
  { value: "qualified", label: "Qualified" },
  { value: "negotiation", label: "Negotiation" },
  { value: "under_contract", label: "Under Contract" },
  { value: "closed", label: "Closed" },
  { value: "lost", label: "Lost" },
];

export default function Leads() {
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [editingLead, setEditingLead] = useState<any>(null);
  const [filterOpen, setFilterOpen] = useState(false);
  const [filters, setFilters] = useState({
    query: "",
    status: "all",
    owner: "",
    createdFrom: "",
    createdTo: "",
  });
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

  const { data: leads = [], isLoading } = useQuery({
    queryKey: ["leads"],
    queryFn: async () => {
      const res = await fetch("/api/leads");
      if (!res.ok) throw new Error("Failed to fetch leads");
      return res.json();
    }
  });

  const { data: leadPipelineConfig } = useQuery({
    queryKey: ["/api/pipeline-config", "lead"],
    queryFn: async () => {
      const res = await fetch(`/api/pipeline-config?entityType=lead`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch pipeline config");
      return res.json();
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
      const res = await fetch("/api/lead-source-options", { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
  });

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
      const res = await fetch("/api/leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      if (!res.ok) throw new Error("Failed to create lead");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["leads"] });
      setNewLead({ address: "", city: "", state: "FL", zipCode: "", ownerName: "", ownerPhone: "", ownerEmail: "", estimatedValue: "", source: "", status: "new" });
      setIsAddDialogOpen(false);
      toast({
        title: "Lead created",
        description: "New lead has been added successfully.",
      });
    }
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: any }) => {
      const payload = {
        ...data,
        estimatedValue: data.estimatedValue ? parseFloat(data.estimatedValue) : null,
      };
      const res = await fetch(`/api/leads/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      if (!res.ok) throw new Error("Failed to update lead");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["leads"] });
      setEditingLead(null);
      toast({
        title: "Lead updated",
        description: "Lead has been updated successfully.",
      });
    }
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(`/api/leads/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to delete lead");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["leads"] });
      toast({
        title: "Lead deleted",
        description: "Lead has been removed.",
      });
    }
  });

  const convertToPropertyMutation = useMutation({
    mutationFn: async (leadId: number) => {
      const res = await fetch(`/api/leads/${leadId}/convert-to-property`, {
        method: "POST",
        headers: { "Content-Type": "application/json" }
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Failed to convert lead");
      return data;
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
    if (newLead.address && newLead.city && newLead.zipCode && newLead.ownerName && newLead.source) {
      await createMutation.mutateAsync(newLead);
      return;
    }
    toast({ title: "Lead source is required", variant: "destructive" });
  };

  const handleUpdateLead = async () => {
    if (editingLead) {
      await updateMutation.mutateAsync({ 
        id: editingLead.id, 
        data: editingLead 
      });
    }
  };

  const handleConvertToProperty = async (lead: any, e: MouseEvent) => {
    e.stopPropagation();
    await convertToPropertyMutation.mutateAsync(lead.id);
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
    const q = filters.query.trim().toLowerCase();
    const owner = filters.owner.trim().toLowerCase();
    const from = filters.createdFrom ? new Date(filters.createdFrom) : null;
    const to = filters.createdTo ? new Date(filters.createdTo) : null;
    if (from) from.setHours(0, 0, 0, 0);
    if (to) to.setHours(23, 59, 59, 999);

    return (leads || []).filter((lead: any) => {
      if (filters.status !== "all" && lead.status !== filters.status) return false;

      if (q) {
        const haystack = [
          lead.address,
          lead.city,
          lead.state,
          lead.zipCode,
          lead.ownerName,
          lead.ownerPhone,
          lead.ownerEmail,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        if (!haystack.includes(q)) return false;
      }

      if (owner) {
        const name = String(lead.ownerName || "").toLowerCase();
        if (!name.includes(owner)) return false;
      }

      if (from || to) {
        const createdAt = lead.createdAt ? new Date(lead.createdAt) : null;
        if (!createdAt || Number.isNaN(createdAt.getTime())) return false;
        if (from && createdAt < from) return false;
        if (to && createdAt > to) return false;
      }

      return true;
    });
  }, [filters.createdFrom, filters.createdTo, filters.owner, filters.query, filters.status, leads]);

  const selectedLead = useMemo(() => {
    if (!selectedLeadId) return null;
    return (leads || []).find((l: any) => l.id === selectedLeadId) || null;
  }, [leads, selectedLeadId]);

  const { data: skipTraceLatest } = useQuery<any>({
    queryKey: ["/api/leads", selectedLeadId, "skip-trace-latest"],
    enabled: !!selectedLeadId && isLeadSheetOpen,
    queryFn: async () => {
      const res = await fetch(`/api/leads/${selectedLeadId}/skip-trace/latest`, { credentials: "include" });
      if (res.status === 404) return null;
      if (!res.ok) throw new Error("Failed to fetch skip trace");
      return res.json();
    },
  });

  const skipTraceMutation = useMutation({
    mutationFn: async (leadId: number) => {
      const res = await fetch(`/api/leads/${leadId}/skip-trace`, { method: "POST", credentials: "include" });
      if (res.status === 404) throw new Error("Skip trace is disabled");
      if (!res.ok) throw new Error("Skip trace failed");
      return res.json();
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
    setFilters({ query: "", status: "all", owner: "", createdFrom: "", createdTo: "" });
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

  const clearFilters = () => {
    setFilters({ query: "", status: "all", owner: "", createdFrom: "", createdTo: "" });
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
        <div className="flex items-center gap-2">
          <CrmImportExportDialog entityType="lead" />
          <div className="relative hidden md:block">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search leads..."
              className="w-[200px] pl-9"
              value={filters.query}
              onChange={(e) => setFilters(prev => ({ ...prev, query: e.target.value }))}
              data-testid="input-leads-search"
            />
          </div>
          <Popover open={filterOpen} onOpenChange={setFilterOpen}>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" data-testid="button-leads-filter">
                <Filter className="mr-2 h-4 w-4" /> Filter
              </Button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-80">
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label>Status</Label>
                  <Select value={filters.status} onValueChange={(value) => setFilters(prev => ({ ...prev, status: value }))}>
                    <SelectTrigger data-testid="select-filter-status">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All</SelectItem>
                      {pipelineColumns.map((option) => (
                        <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>Owner</Label>
                  <Input
                    placeholder="Owner name"
                    value={filters.owner}
                    onChange={(e) => setFilters(prev => ({ ...prev, owner: e.target.value }))}
                    data-testid="input-filter-owner"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label>From</Label>
                    <Input
                      type="date"
                      value={filters.createdFrom}
                      onChange={(e) => setFilters(prev => ({ ...prev, createdFrom: e.target.value }))}
                      data-testid="input-filter-from"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>To</Label>
                    <Input
                      type="date"
                      value={filters.createdTo}
                      onChange={(e) => setFilters(prev => ({ ...prev, createdTo: e.target.value }))}
                      data-testid="input-filter-to"
                    />
                  </div>
                </div>

                <div className="flex justify-between">
                  <Button variant="ghost" size="sm" onClick={clearFilters} data-testid="button-filter-clear">
                    Clear
                  </Button>
                  <Button variant="secondary" size="sm" onClick={() => setFilterOpen(false)} data-testid="button-filter-apply">
                    Apply
                  </Button>
                </div>
              </div>
            </PopoverContent>
          </Popover>
          
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
                  <Select value={newLead.source} onValueChange={(value) => setNewLead({ ...newLead, source: value })}>
                    <SelectTrigger className="col-span-3" data-testid="select-lead-source">
                      <SelectValue placeholder="Select source" />
                    </SelectTrigger>
                    <SelectContent>
                      {leadSourceOptions.map((o: any) => (
                        <SelectItem key={String(o.value)} value={String(o.value)}>
                          {String(o.label || o.value)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
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
                  <TableHead>Address</TableHead>
                  <TableHead>Owner</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Score</TableHead>
                  <TableHead>Value</TableHead>
                  <TableHead>Contact</TableHead>
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
                    <TableCell className="font-medium">{lead.address}, {lead.city}</TableCell>
                    <TableCell>{lead.ownerName}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className={getStatusBadgeColor(lead.status)}>
                        {pipelineColumns.find((s) => s.value === lead.status)?.label || lead.status}
                      </Badge>
                    </TableCell>
                    <TableCell>{lead.relasScore || "—"}</TableCell>
                    <TableCell>${lead.estimatedValue ? parseInt(lead.estimatedValue).toLocaleString() : "—"}</TableCell>
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
                              onClick={() => setEditingLead({ ...lead, estimatedValue: lead.estimatedValue || "" })}
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
                    setEditingLead({ ...selectedLead, estimatedValue: selectedLead.estimatedValue || "" });
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

      <Dialog open={!!editingLead} onOpenChange={(open) => !open && setEditingLead(null)}>
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
                <Select value={String(editingLead.source || "")} onValueChange={(value) => setEditingLead({ ...editingLead, source: value })}>
                  <SelectTrigger className="col-span-3" data-testid="select-edit-source">
                    <SelectValue placeholder="Select source" />
                  </SelectTrigger>
                  <SelectContent>
                    {leadSourceOptions.map((o: any) => (
                      <SelectItem key={String(o.value)} value={String(o.value)}>
                        {String(o.label || o.value)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
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
            <Button variant="outline" onClick={() => setEditingLead(null)}>Cancel</Button>
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
                const existing = String(noteLead.notes || "").trim();
                const stamped = `[${new Date().toLocaleString()}] ${noteText.trim()}`;
                const notes = existing ? `${existing}\n\n${stamped}` : stamped;
                await updateMutation.mutateAsync({ id: noteLead.id, data: { notes } });
                setIsNoteDialogOpen(false);
                setNoteLead(null);
                setNoteText("");
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
                const res = await fetch(`/api/telephony/sms`, {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  credentials: "include",
                  body: JSON.stringify({ to: smsLead.ownerPhone, body: smsBody.trim(), metadata: { leadId: smsLead.id } }),
                });
                if (!res.ok) {
                  toast({ title: "SMS failed", description: "Failed to send SMS", variant: "destructive" });
                  return;
                }
                toast({ title: "SMS sent", description: "Message queued/sent successfully." });
                queryClient.invalidateQueries({ queryKey: ["/api/activity"] });
                setIsSmsDialogOpen(false);
                setSmsLead(null);
                setSmsBody("");
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
                const res = await fetch(`/api/activity`, {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  credentials: "include",
                  body: JSON.stringify({
                    action: "email_sent",
                    description: emailSubject ? `Sent email: ${emailSubject}` : "Sent email",
                    metadata: { leadId: emailLead.id, to: emailLead.ownerEmail, subject: emailSubject || null },
                  }),
                });
                if (!res.ok) {
                  toast({ title: "Log failed", description: "Failed to log email", variant: "destructive" });
                  return;
                }
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
