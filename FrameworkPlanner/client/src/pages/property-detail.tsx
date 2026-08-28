import React from "react";
import { Layout } from "@/components/layout/Layout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { DealCalculator } from "@/components/deals/DealCalculator";
import { EntityTasksWidget } from "@/components/tasks/EntityTasksWidget";
import { SkipTraceJobPanel } from "@/components/skipTrace/SkipTraceJobPanel";
import { MediaGallery } from "@/components/media/MediaGallery";
import { 
  ArrowLeft, 
  MapPin, 
  Phone, 
  Mail, 
  Calendar, 
  CheckCircle2, 
  XCircle, 
  MessageSquare,
  FileText,
  Calculator,
  Lightbulb,
  FolderOpen,
  Building2,
  Plus,
  RefreshCw,
  Users,
  Share2,
  BarChart3,
  Clock,
  Tag,
  Target,
  TrendingUp,
  Eye,
  ImageIcon,
} from "lucide-react";
import { Link, useLocation, useRoute } from "wouter";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import propertyImage from "@assets/generated_images/modern_suburban_house_exterior_for_real_estate_placeholder.png";
import interiorImage from "@assets/generated_images/interior_of_a_modern_living_room_for_real_estate_placeholder.png";
import { Spinner } from "@/components/ui/spinner";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, apiUpload } from "@/lib/queryClient";
import { calendarUrl, dialerUrl, leadUrl, playgroundUrl, tasksUrl } from "@/lib/deepLinks";

export default function PropertyDetail() {
  const [, params] = useRoute("/opportunities/:id");
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const { toast } = useToast();
  const id = params?.id ? parseInt(params.id) : 0;
  const { data, isLoading, error } = useQuery<any>({
    queryKey: ["/api/opportunities", id],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/opportunities/${id}`);
      return await res.json();
    },
    enabled: !!id,
  });
  const property = data?.property;
  const lead = data?.lead;
  const errorStatus = error instanceof Error ? parseInt(String(error.message).split(":")[0], 10) : null;
  const isNotFound = errorStatus === 404;
  const num = (v: unknown) => (typeof v === "string" ? (Number.isFinite(parseFloat(v)) ? parseFloat(v) : 0) : typeof v === "number" ? (Number.isFinite(v) ? v : 0) : 0);
  const { data: internalComps } = useQuery<any>({
    queryKey: ["/api/opportunities", id, "comps-snapshots"],
    enabled: !!id,
    queryFn: async () => {
      const res = await fetch(`/api/opportunities/${id}/comps/snapshots`, { credentials: "include" });
      if (res.status === 404) return { avgArv: null, avgRent: null, saleComps: [], rentalComps: [] };
      if (!res.ok) throw new Error("Failed to load comps");
      return res.json();
    },
  });

  const pullCompsMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/opportunities/${id}/comps/pull`, { method: "POST", credentials: "include" });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error((json as any).message || "Failed to pull comps");
      return json;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["/api/opportunities", id, "comps-snapshots"] });
      toast({ title: "Comps pulled" });
    },
    onError: (e: any) => toast({ title: e?.message || "Failed to pull comps", variant: "destructive" }),
  });

  const { data: buyerMatches = [] } = useQuery<any[]>({
    queryKey: ["/api/opportunities", id, "buyer-matches"],
    enabled: !!id,
    queryFn: async () => {
      const res = await fetch(`/api/opportunities/${id}/buyer-matches`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load buyer matches");
      return res.json();
    },
  });

  const { data: parties = [] } = useQuery<any[]>({
    queryKey: ["/api/opportunities", id, "parties"],
    enabled: !!id,
    queryFn: async () => {
      const res = await fetch(`/api/opportunities/${id}/parties`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load parties");
      return res.json();
    },
  });

  const { data: listings = [] } = useQuery<any[]>({
    queryKey: ["/api/opportunities", id, "listings"],
    enabled: !!id,
    queryFn: async () => {
      const res = await fetch(`/api/opportunities/${id}/listings`, { credentials: "include" });
      if (!res.ok) {
        if (res.status === 404) return [];
        throw new Error("Failed to load listings");
      }
      return res.json();
    },
  });

  const { data: inquiries = [] } = useQuery<any[]>({
    queryKey: ["/api/opportunities", id, "inquiries"],
    enabled: !!id,
    queryFn: async () => {
      const res = await fetch(`/api/opportunities/${id}/inquiries`, { credentials: "include" });
      if (!res.ok) {
        if (res.status === 404) return [];
        throw new Error("Failed to load inquiries");
      }
      return res.json();
    },
  });

  const { data: opportunityEvents = [] } = useQuery<any[]>({
    queryKey: ["/api/opportunities", id, "events"],
    enabled: !!id,
    queryFn: async () => {
      const res = await fetch(`/api/opportunities/${id}/events?limit=100`, { credentials: "include" });
      if (!res.ok) {
        if (res.status === 404) return [];
        throw new Error("Failed to load events");
      }
      return res.json();
    },
  });

  const recomputeMatchesMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/opportunities/${id}/buyer-matches/recompute`, { method: "POST", credentials: "include" });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error((json as any).message || "Failed to recompute");
      return json;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["/api/opportunities", id, "buyer-matches"] });
      toast({ title: "Matches recomputed" });
    },
    onError: (e: any) => toast({ title: e?.message || "Failed to recompute", variant: "destructive" }),
  });

  const assignBuyerMutation = useMutation({
    mutationFn: async (buyerId: number) => {
      const res = await fetch(`/api/deal-assignments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ propertyId: id ? parseInt(String(id), 10) : null, buyerId }),
        credentials: "include",
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error((json as any).message || "Failed to assign buyer");
      return json;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["/api/properties/assignments", id] });
      toast({ title: "Buyer assigned" });
    },
    onError: (e: any) => toast({ title: e?.message || "Failed to assign buyer", variant: "destructive" }),
  });

  const stageChangeMutation = useMutation({
    mutationFn: async ({ stage, notes }: { stage: string; notes?: string }) => {
      const res = await fetch(`/api/opportunities/${id}/stage-change`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stage, notes }),
        credentials: "include",
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error((json as any).message || "Failed to change stage");
      }
      return res.json();
    },
    onSuccess: (result: any) => {
      const newStage = result?.newStage || result?.property?.stage;
      const oldStage = result?.oldStage || "";
      queryClient.invalidateQueries({ queryKey: ["/api/opportunities", id] });
      queryClient.invalidateQueries({ queryKey: ["/api/opportunities", id, "events"] });
      toast({
        title: "Stage Updated",
        description: `Moved from "${oldStage}" to "${newStage}"`,
      });
    },
    onError: (e: any) => toast({ title: e?.message || "Failed to change stage", variant: "destructive" }),
  });

  const inquiryStatusMutation = useMutation({
    mutationFn: async ({ inquiryId, status }: { inquiryId: number; status: string }) => {
      const res = await fetch(`/api/inquiries/${inquiryId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
        credentials: "include",
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error((json as any).message || "Failed to update inquiry");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/opportunities", id, "inquiries"] });
      toast({ title: "Inquiry status updated" });
    },
    onError: (e: any) => toast({ title: e?.message || "Failed to update", variant: "destructive" }),
  });

  const { data: buyers = [] } = useQuery<any[]>({
    queryKey: ["/api/buyers"],
    queryFn: async () => {
      const res = await fetch("/api/buyers", { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
  });

  const buyerNameById = React.useMemo(() => {
    const m = new Map<number, string>();
    for (const b of buyers || []) m.set(Number(b.id), String(b.name || `Buyer ${b.id}`));
    return m;
  }, [buyers]);

  const photoInputRef = React.useRef<HTMLInputElement | null>(null);
  const uploadPhotosMutation = useMutation({
    mutationFn: async (files: FileList) => {
      const fd = new FormData();
      Array.from(files).forEach((f) => fd.append("photos", f));
      const res = await apiUpload("POST", `/api/opportunities/${id}/photos`, fd);
      return await res.json();
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["/api/opportunities", id] });
      toast({ title: "Photos uploaded" });
    },
    onError: (e: any) => toast({ title: e?.message || "Upload failed", variant: "destructive" }),
  });

  const docsKey = React.useMemo(() => (property?.id ? `/api/documents?limit=20&offset=0&entityType=opportunity&entityId=${property.id}` : null), [property?.id]);
  const { data: docsResp } = useQuery<any>({
    queryKey: docsKey ? [docsKey] : [""],
    enabled: !!docsKey && !!user,
  });
  const linkedDocs = Array.isArray(docsResp?.items) ? docsResp.items : [];

  const { data: linkedCompanies = [] } = useQuery<any[]>({
    queryKey: property?.id ? [`/api/opportunities/${property.id}/companies`] : [""],
    enabled: !!property?.id && !!user,
  });

  const [companyDialogOpen, setCompanyDialogOpen] = React.useState(false);
  const [companyLinkForm, setCompanyLinkForm] = React.useState({ companyId: "", role: "" });
  const [stageDialogOpen, setStageDialogOpen] = React.useState(false);
  const [stageDialogStage, setStageDialogStage] = React.useState("");
  const [stageDialogNotes, setStageDialogNotes] = React.useState("");
  const [listingCreateOpen, setListingCreateOpen] = React.useState(false);
  const [listingForm, setListingForm] = React.useState({
    title: "",
    description: "",
    visibility: "link_only",
    password: "",
    slug: "",
    exposeAddress: false,
    exposeComps: false,
    exposeFinancials: false,
    exposeDocs: false,
    contactName: "",
    contactEmail: "",
    contactPhone: "",
  });
  const [noteDialogOpen, setNoteDialogOpen] = React.useState(false);
  const [noteText, setNoteText] = React.useState("");

  const linkCompanyMutation = useMutation({
    mutationFn: async () => {
      const companyId = parseInt(companyLinkForm.companyId, 10);
      const payload: any = { companyId, role: companyLinkForm.role.trim() || null };
      const res = await apiRequest("POST", `/api/opportunities/${property.id}/companies`, payload);
      return await res.json();
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: [`/api/opportunities/${property.id}/companies`] });
      setCompanyDialogOpen(false);
      setCompanyLinkForm({ companyId: "", role: "" });
      toast({ title: "Company linked" });
    },
    onError: (e: any) => toast({ title: e?.message || "Failed to link company", variant: "destructive" }),
  });

  const docInputRef = React.useRef<HTMLInputElement | null>(null);
  const uploadDocMutation = useMutation({
    mutationFn: async (files: FileList) => {
      const f = files.item(0);
      if (!f) throw new Error("No file");
      const fd = new FormData();
      fd.set("file", f);
      fd.set("entityType", "opportunity");
      fd.set("entityId", String(property.id));
      const res = await apiUpload("POST", `/api/documents/upload`, fd);
      return await res.json();
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: [docsKey || ""] });
      toast({ title: "Document uploaded" });
    },
    onError: (e: any) => toast({ title: e?.message || "Upload failed", variant: "destructive" }),
  });

  if (isLoading) {
    return (
      <Layout>
        <div className="flex items-center justify-center min-h-[400px]">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
        </div>
      </Layout>
    );
  }

  if (isNotFound) {
    return (
      <Layout>
        <div className="flex flex-col items-center justify-center min-h-[400px] text-center">
          <div className="rounded-full bg-muted p-4 mb-4">
            <svg className="h-10 w-10 text-muted-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
            </svg>
          </div>
          <h2 className="text-xl font-semibold mb-2">Opportunity Not Found</h2>
          <p className="text-muted-foreground mb-4">The opportunity you are looking for does not exist or may have been removed.</p>
          <a href="/opportunities" className="text-primary hover:underline">Back to Opportunities</a>
        </div>
      </Layout>
    );
  }

  if (error && !isLoading) {
    return (
      <Layout>
        <div className="flex flex-col items-center justify-center min-h-[400px] text-center">
          <div className="rounded-full bg-destructive/10 p-4 mb-4">
            <svg className="h-10 w-10 text-destructive" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
            </svg>
          </div>
          <h2 className="text-xl font-semibold mb-2">Failed to Load Opportunity</h2>
          <p className="text-muted-foreground mb-4">An error occurred while loading this opportunity. Please try again.</p>
          <a href="/opportunities" className="text-primary hover:underline">Back to Opportunities</a>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="flex flex-col gap-6">
        {/* Header */}
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div className="space-y-1">
            <div className="flex items-center gap-2 text-muted-foreground text-sm mb-1">
              <Link href="/opportunities" className="hover:text-foreground flex items-center gap-1 transition-colors">
                <ArrowLeft className="h-3 w-3" /> Back to Opportunities
              </Link>
              <span>/</span>
              <span>O-{id || "—"}</span>
            </div>
             <h1 className="text-3xl font-bold tracking-tight flex items-center gap-3">
               {property?.address || "—"}
               {property?.opportunityType && property.opportunityType !== "acquisition" && (
                <Badge variant="outline" className="text-xs">
                  {property.opportunityType.replace("_", " ")}
                </Badge>
              )}
              {property?.stage && (
                <StageBadge stage={property.stage} />
              )}
              <Badge variant="default" className="bg-accent text-accent-foreground hover:bg-accent/80">{property?.status ? property.status.replace("_", " ") : "—"}</Badge>
            </h1>
            <div className="flex items-center gap-2 text-muted-foreground">
              <MapPin className="h-4 w-4" />
              {property ? `${property.city || ""}, ${property.state || ""} ${property.zipCode || ""}` : ""}
              {property?.nextActionAt && (
                <>
                  <span>•</span>
                  <Clock className="h-4 w-4" />
                  <span>Next action: {new Date(property.nextActionAt).toLocaleDateString()}</span>
                </>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <Button
              variant="outline"
              onClick={() => {
                if (!lead?.id) return;
                setLocation(leadUrl(lead.id));
              }}
              disabled={!lead?.id}
            >
              <ArrowLeft className="mr-2 h-4 w-4" />
              Open Lead
            </Button>
            <Button
              variant="outline"
              onClick={() => {
                if (!property?.id) return;
                setLocation(playgroundUrl({ propertyId: property.id, leadId: lead?.id ?? null }));
              }}
              disabled={!property?.id}
            >
              <Lightbulb className="mr-2 h-4 w-4" />
              Underwrite Deal
            </Button>
            <Button variant="outline" onClick={() => property?.id && setLocation(`/calculator?propertyId=${property.id}`)} disabled={!property?.id}>
              <Calculator className="mr-2 h-4 w-4" />
              Run Comps
            </Button>
            <Button variant="outline" onClick={() => property?.id && setLocation(`/contract-generator?propertyId=${property.id}`)} disabled={!property?.id}>
              <FileText className="mr-2 h-4 w-4" />
              Generate Contract
            </Button>
            <Button
              onClick={() => {
                if (!lead?.ownerPhone) return;
                setLocation(dialerUrl({ number: String(lead.ownerPhone), leadId: lead?.id ?? null, propertyId: property?.id ?? null }));
              }}
              disabled={!lead?.ownerPhone}
            >
              <Phone className="mr-2 h-4 w-4" />
              Call Owner
            </Button>
            <Button
              variant="outline"
              onClick={() => {
                if (!property?.id) return;
                setLocation(tasksUrl({ relatedEntityType: "opportunity", relatedEntityId: property.id }));
              }}
              disabled={!property?.id}
            >
              <CheckCircle2 className="mr-2 h-4 w-4" />
              Tasks
            </Button>
             <Button
               variant="outline"
               onClick={() => {
                 if (!property?.id) return;
                 setLocation(calendarUrl({ relatedEntityType: "opportunity", relatedEntityId: property.id }));
               }}
               disabled={!property?.id}
             >
               <Calendar className="mr-2 h-4 w-4" />
               Calendar
             </Button>
            <Button variant="outline" onClick={() => setStageDialogOpen(true)} disabled={!property?.id}>
              <Tag className="mr-2 h-4 w-4" />
              Move Stage
            </Button>
            <Button variant="outline" onClick={() => setListingCreateOpen(true)} disabled={!property?.id}>
              <Share2 className="mr-2 h-4 w-4" />
              Create Public Listing
            </Button>
            <Button variant="outline" onClick={() => setNoteDialogOpen(true)} disabled={!property?.id}>
              <MessageSquare className="mr-2 h-4 w-4" />
              Add Note
            </Button>
            <Button variant="outline" onClick={() => { if (property?.id) setLocation(tasksUrl({ relatedEntityType: "opportunity", relatedEntityId: property.id })); }} disabled={!property?.id}>
              <Plus className="mr-2 h-4 w-4" />
              Add Task
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left Column - Property Info & Photos */}
          <div className="lg:col-span-2 space-y-6">
            {/* Photos */}
            <div className="grid grid-cols-2 gap-4 h-64 md:h-80">
              <div className="relative h-full rounded-lg overflow-hidden group">
                <img 
                  src={(property?.images && property.images[0]) || propertyImage} 
                  alt="Exterior" 
                  loading="lazy"
                  className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
                />
                <div className="absolute bottom-2 left-2 bg-black/50 text-white px-2 py-1 text-xs rounded backdrop-blur-sm">
                  Front Exterior
                </div>
              </div>
              <div className="relative h-full rounded-lg overflow-hidden group">
                <img 
                  src={(property?.images && property.images[1]) || interiorImage} 
                  alt="Interior" 
                  loading="lazy"
                  className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
                />
                <div className="absolute bottom-2 left-2 bg-black/50 text-white px-2 py-1 text-xs rounded backdrop-blur-sm">
                  Living Room
                </div>
              </div>
            </div>
            <div className="flex items-center justify-between">
              <input
                ref={photoInputRef}
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                onChange={(e) => {
                  if (!e.target.files || e.target.files.length === 0) return;
                  uploadPhotosMutation.mutate(e.target.files);
                  e.currentTarget.value = "";
                }}
              />
              <Button
                variant="secondary"
                onClick={() => photoInputRef.current?.click()}
                disabled={!property?.id || uploadPhotosMutation.isPending}
              >
                Upload Photos
              </Button>
              <div className="text-sm text-muted-foreground">
                {Array.isArray(property?.images) && property.images.length ? `${property.images.length} photo(s)` : "No uploaded photos"}
              </div>
            </div>

            {/* Tabs for Details */}
            <Tabs defaultValue="details" className="w-full">
              <TabsList className="w-full justify-start border-b rounded-none bg-transparent p-0 h-auto">
                <TabsTrigger 
                  value="details" 
                  className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent px-4 py-2"
                >
                  Property Details
                </TabsTrigger>
                <TabsTrigger 
                  value="financials" 
                  className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent px-4 py-2"
                >
                  Financial Analysis
                </TabsTrigger>
                <TabsTrigger 
                  value="activity" 
                  className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent px-4 py-2"
                >
                  Activity Log
                </TabsTrigger>
                <TabsTrigger
                  value="media"
                  className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent px-4 py-2"
                >
                  <ImageIcon className="h-4 w-4 mr-2" />
                  Media
                </TabsTrigger>
                <TabsTrigger
                  value="dealroom"
                  className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent px-4 py-2"
                >
                  Deal Room
                </TabsTrigger>
                <TabsTrigger
                  value="comps"
                  className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent px-4 py-2"
                >
                  Comps
                </TabsTrigger>
                 <TabsTrigger
                   value="buyerMatches"
                   className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent px-4 py-2"
                 >
                   Buyer Matches
                 </TabsTrigger>
                 <TabsTrigger
                   value="parties"
                   className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent px-4 py-2"
                 >
                   <Users className="h-4 w-4 mr-2" />
                   Parties
                 </TabsTrigger>
                 <TabsTrigger
                   value="publicListing"
                   className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent px-4 py-2"
                 >
                   <Share2 className="h-4 w-4 mr-2" />
                   Public Listing
                 </TabsTrigger>
               </TabsList>
              
              <TabsContent value="details" className="mt-6 space-y-6">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg">Property Facts</CardTitle>
                  </CardHeader>
                  <CardContent className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div className="space-y-1">
                      <p className="text-xs text-muted-foreground">Bedrooms</p>
                      <p className="font-medium text-lg">{property?.beds ?? "—"}</p>
                    </div>
                    <div className="space-y-1">
                      <p className="text-xs text-muted-foreground">Bathrooms</p>
                      <p className="font-medium text-lg">{property?.baths ?? "—"}</p>
                    </div>
                    <div className="space-y-1">
                      <p className="text-xs text-muted-foreground">Square Feet</p>
                      <p className="font-medium text-lg">{property?.sqft ? property.sqft.toLocaleString() : "—"}</p>
                    </div>
                    <div className="space-y-1">
                      <p className="text-xs text-muted-foreground">Year Built</p>
                      <p className="font-medium text-lg">{property?.yearBuilt ?? "—"}</p>
                    </div>
                    <div className="space-y-1">
                      <p className="text-xs text-muted-foreground">Lot Size</p>
                      <p className="font-medium text-lg">{property?.lotSize ?? "—"}</p>
                    </div>
                    <div className="space-y-1">
                      <p className="text-xs text-muted-foreground">Occupancy</p>
                      <p className="font-medium text-lg">{property?.occupancy ?? "—"}</p>
                    </div>
                    <div className="space-y-1">
                      <p className="text-xs text-muted-foreground">Zoning</p>
                      <p className="font-medium text-lg">—</p>
                    </div>
                    <div className="space-y-1">
                      <p className="text-xs text-muted-foreground">APN</p>
                      <p className="font-medium text-lg">{property?.apn ?? "—"}</p>
                    </div>
                  </CardContent>
                </Card>
                
                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg">Owner Information</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold">
                          {lead?.ownerName ? (lead.ownerName.split(' ').map((s: string) => s[0]).slice(0,2).join('').toUpperCase()) : "—"}
                        </div>
                        <div>
                          <p className="font-medium">{lead?.ownerName ?? "—"}</p>
                          <p className="text-xs text-muted-foreground">Primary Owner</p>
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            if (!lead?.ownerPhone) return;
                            setLocation(
                              dialerUrl({ number: String(lead.ownerPhone), leadId: lead?.id ?? null, propertyId: property?.id ?? null }),
                            );
                          }}
                          disabled={!lead?.ownerPhone}
                        >
                          <Phone className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            if (!lead?.ownerEmail) return;
                            window.location.href = `mailto:${encodeURIComponent(String(lead.ownerEmail))}`;
                          }}
                          disabled={!lead?.ownerEmail}
                        >
                          <Mail className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                    <Separator />
                    <div className="grid grid-cols-2 gap-4 text-sm">
                      <div>
                        <p className="text-muted-foreground">Phone</p>
                        <p className="font-medium">{lead?.ownerPhone ?? "—"}</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">Email</p>
                        <p className="font-medium">{lead?.ownerEmail ?? "—"}</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">Mailing Address</p>
                        <p className="font-medium">{property ? `${property.address}, ${property.city} ${property.zipCode}` : "—"}</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">Motivation</p>
                        <p className="font-medium">{lead?.motivation ?? "—"}</p>
                      </div>
                    </div>
                    <SkipTraceJobPanel entityType="opportunity" entityId={id} />
                  </CardContent>
                </Card>
              </TabsContent>
              
              <TabsContent value="financials" className="mt-6">
                <DealCalculator
                  initialValues={{
                    arv: num(property?.arv),
                    offerTarget: num(property?.price),
                    repairs: num(property?.repairCost),
                    rentPerMonth: num(property?.rentPerMonth),
                  }}
                  showActions={false}
                />
              </TabsContent>

              <TabsContent value="dealroom" className="mt-6">
                <DealRoomSection propertyId={property?.id} userId={user?.id} />
              </TabsContent>

              <TabsContent value="comps" className="mt-6 space-y-6">
                <Card>
                  <CardHeader className="flex flex-row items-center justify-between">
                    <CardTitle className="text-lg">Internal Comps</CardTitle>
                    <Button variant="secondary" onClick={() => pullCompsMutation.mutate()} disabled={pullCompsMutation.isPending}>
                      Pull Internal Comps
                    </Button>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="grid grid-cols-2 gap-3">
                      <div className="border rounded-md p-3">
                        <div className="text-xs text-muted-foreground">ARV (Avg Sold)</div>
                        <div className="text-xl font-semibold">
                          {typeof internalComps?.avgArv === "number" ? `$${Math.round(internalComps.avgArv).toLocaleString()}` : "—"}
                        </div>
                      </div>
                      <div className="border rounded-md p-3">
                        <div className="text-xs text-muted-foreground">Expected Rent (Avg)</div>
                        <div className="text-xl font-semibold">
                          {typeof internalComps?.avgRent === "number" ? `$${Math.round(internalComps.avgRent).toLocaleString()}/mo` : "—"}
                        </div>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <div className="text-sm font-medium">Sale Comps</div>
                      {(internalComps?.saleComps || []).length === 0 ? (
                        <div className="text-sm text-muted-foreground">No sale comps yet.</div>
                      ) : (
                        <div className="border rounded-md scroll-x-container">
                          <div className="min-w-[900px]">
                            <div className="grid grid-cols-6 gap-2 p-2 text-xs text-muted-foreground bg-muted/30">
                              <div className="col-span-2">Address</div>
                              <div>Distance</div>
                              <div>Sold Price</div>
                              <div>Sold Date</div>
                              <div>SqFt</div>
                            </div>
                            {(internalComps.saleComps || []).slice(0, 25).map((r: any) => (
                              <div key={String(r.id)} className="grid grid-cols-6 gap-2 p-2 text-sm border-t">
                                <div className="col-span-2 truncate">{r.comp?.address || `Property ${r.compPropertyId}`}</div>
                                <div>{typeof r.distanceMiles === "number" ? r.distanceMiles.toFixed(2) : "—"} mi</div>
                                <div>{typeof r.soldPrice === "number" ? `$${Math.round(r.soldPrice).toLocaleString()}` : "—"}</div>
                                <div>{r.soldDate ? new Date(r.soldDate).toLocaleDateString() : "—"}</div>
                                <div>{r.comp?.sqft ? Number(r.comp.sqft).toLocaleString() : "—"}</div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>

                    <div className="space-y-2">
                      <div className="text-sm font-medium">Rental Comps</div>
                      {(internalComps?.rentalComps || []).length === 0 ? (
                        <div className="text-sm text-muted-foreground">No rental comps yet.</div>
                      ) : (
                        <div className="border rounded-md scroll-x-container">
                          <div className="min-w-[900px]">
                            <div className="grid grid-cols-6 gap-2 p-2 text-xs text-muted-foreground bg-muted/30">
                              <div className="col-span-2">Address</div>
                              <div>Distance</div>
                              <div>Rent</div>
                              <div>Rented Date</div>
                              <div>SqFt</div>
                            </div>
                            {(internalComps.rentalComps || []).slice(0, 25).map((r: any) => (
                              <div key={String(r.id)} className="grid grid-cols-6 gap-2 p-2 text-sm border-t">
                                <div className="col-span-2 truncate">{r.comp?.address || `Property ${r.compPropertyId}`}</div>
                                <div>{typeof r.distanceMiles === "number" ? r.distanceMiles.toFixed(2) : "—"} mi</div>
                                <div>{typeof r.rentPerMonth === "number" ? `$${Math.round(r.rentPerMonth).toLocaleString()}/mo` : "—"}</div>
                                <div>{r.comp?.rented_date || r.comp?.rentedDate ? new Date(r.comp.rented_date || r.comp.rentedDate).toLocaleDateString() : "—"}</div>
                                <div>{r.comp?.sqft ? Number(r.comp.sqft).toLocaleString() : "—"}</div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="buyerMatches" className="mt-6 space-y-6">
                <Card>
                  <CardHeader className="flex flex-row items-center justify-between">
                    <CardTitle className="text-lg">Buyer Matches</CardTitle>
                    <Button variant="secondary" onClick={() => recomputeMatchesMutation.mutate()} disabled={recomputeMatchesMutation.isPending}>
                      Recompute
                    </Button>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {buyerMatches.length === 0 ? (
                      <div className="text-sm text-muted-foreground">No matches yet.</div>
                    ) : (
                      <div className="border rounded-md scroll-x-container">
                        <div className="min-w-[1000px]">
                          <div className="grid grid-cols-12 gap-2 p-2 text-xs text-muted-foreground bg-muted/30">
                            <div className="col-span-5">Buyer</div>
                            <div className="col-span-2">Score</div>
                            <div className="col-span-3">Reasons</div>
                            <div className="col-span-2 text-right">Actions</div>
                          </div>
                          {buyerMatches.slice(0, 25).map((m: any) => {
                            const buyerId = Number(m.buyerId ?? m.buyer_id);
                            const reasons = Array.isArray(m.reasons) ? m.reasons : [];
                            const score = typeof m.matchScore === "number" ? m.matchScore : typeof m.score === "number" ? m.score / 1000 : 0;
                            return (
                              <div key={String(m.id)} className="grid grid-cols-12 gap-2 p-2 text-sm border-t items-center">
                                <div className="col-span-5 truncate">{buyerNameById.get(buyerId) || `Buyer ${buyerId}`}</div>
                                <div className="col-span-2 font-medium">{score.toFixed(2)}</div>
                                <div className="col-span-3 flex flex-wrap gap-1">
                                  {reasons.slice(0, 3).map((r: string) => (
                                    <Badge key={r} variant="secondary" className="text-xs">{r}</Badge>
                                  ))}
                                </div>
                                <div className="col-span-2 flex justify-end gap-2">
                                  <Button size="sm" variant="outline" onClick={() => toast({ title: "Notify Buyer is not implemented yet" })}>
                                    Notify
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() => assignBuyerMutation.mutate(buyerId)}
                                    disabled={assignBuyerMutation.isPending}
                                  >
                                    Assign
                                  </Button>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>
              
              <TabsContent value="parties">
                <PartiesSection propertyId={property?.id} parties={parties} onUpdated={() => queryClient.invalidateQueries({ queryKey: ["/api/opportunities", id, "parties"] })} />
              </TabsContent>

              <TabsContent value="publicListing">
                <PublicListingSection
                  propertyId={property?.id}
                  listings={listings}
                  inquiries={inquiries}
                  onUpdated={() => {
                    queryClient.invalidateQueries({ queryKey: ["/api/opportunities", id, "listings"] });
                    queryClient.invalidateQueries({ queryKey: ["/api/opportunities", id, "inquiries"] });
                  }}
                  onListingCreate={() => setListingCreateOpen(true)}
                />
              </TabsContent>

              <TabsContent value="media" className="mt-6">
                <Card>
                  <CardContent className="pt-6">
                    <MediaGallery entityType="opportunity" entityId={id} role="property_media" />
                  </CardContent>
                </Card>
              </TabsContent>
                            <TabsContent value="activity">
                <Card>
                  <CardContent className="pt-6">
                    <ActivitySection propertyId={property?.id} leadId={lead?.id} />
                  </CardContent>
                </Card>
                {opportunityEvents.length > 0 && (
                  <Card className="mt-4">
                    <CardHeader>
                      <CardTitle className="text-lg">Opportunity Events</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-3">
                        {opportunityEvents.map((evt: any) => (
                          <div key={evt.id} className="border rounded-md p-3">
                            <div className="flex items-center justify-between">
                              <div className="text-sm font-medium">{evt.title || evt.eventType}</div>
                              <div className="text-xs text-muted-foreground">{new Date(evt.createdAt).toLocaleString()}</div>
                            </div>
                            {evt.description && <div className="text-xs text-muted-foreground mt-1">{evt.description}</div>}
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                )}
              </TabsContent>
            </Tabs>
          </div>

          {/* Right Column - RELAS Score & Actions */}
          <div className="space-y-6">
            <Card className="border-accent/50 bg-accent/5">
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center justify-between">
                  <span>RELAS Score</span>
                  <Badge className="bg-accent hover:bg-accent/90 text-xl px-3 py-1">{lead?.relasScore ?? "—"}</Badge>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground mb-4">
                  This lead shows <strong className="text-accent-foreground">Motivation</strong> based on key factors.
                </p>
                <div className="space-y-3">
                  <div className="flex items-center justify-between text-sm">
                    <span className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-accent" /> Vacant Property</span>
                    <span className="font-medium">+25</span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-accent" /> Out of State Owner</span>
                    <span className="font-medium">+20</span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-accent" /> Tax Delinquent</span>
                    <span className="font-medium">+30</span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-accent" /> Quick Sale Requested</span>
                    <span className="font-medium">+17</span>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Actions</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <OpportunityEditDialog property={property} />
                <Button
                  variant="outline"
                  className="w-full justify-start"
                  onClick={() => {
                    if (!property?.id) return;
                    setLocation(playgroundUrl({ propertyId: property.id, leadId: lead?.id ?? null }));
                  }}
                  disabled={!property?.id}
                >
                  <Lightbulb className="mr-2 h-4 w-4" />
                  Open in Playground
                </Button>
                <Button
                  variant="outline"
                  className="w-full justify-start"
                  onClick={() => {
                    if (!lead?.ownerPhone) return;
                    setLocation(
                      dialerUrl({ number: String(lead.ownerPhone), leadId: lead?.id ?? null, propertyId: property?.id ?? null }),
                    );
                  }}
                  disabled={!lead?.ownerPhone}
                >
                  <Phone className="mr-2 h-4 w-4" />
                  Call Owner
                </Button>
                <LinkLeadDialog property={property} />
              </CardContent>
            </Card>
            
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Notes</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="bg-muted/50 p-3 rounded-md text-sm text-muted-foreground italic mb-3">
                  {(lead?.notes ?? property?.notes) ?? "No notes yet."}
                </div>
                <AddNoteForm leadId={lead?.id} propertyId={property?.id} initialNotes={lead?.notes ?? property?.notes}
                  onAdded={() => {
                    queryClient.invalidateQueries({ queryKey: ["/api/opportunities", id] });
                    queryClient.invalidateQueries({ queryKey: ["/api/activity"] });
                    queryClient.invalidateQueries({ queryKey: ["leads"] });
                  }} />
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle className="text-lg flex items-center gap-2">
                  <FolderOpen className="h-4 w-4" />
                  Documents
                </CardTitle>
                <div className="flex items-center gap-2">
                  <input
                    ref={docInputRef}
                    type="file"
                    className="hidden"
                    onChange={(e) => {
                      const files = e.target.files;
                      if (files && files.length) uploadDocMutation.mutate(files);
                      e.currentTarget.value = "";
                    }}
                  />
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => docInputRef.current?.click()}
                    disabled={!property?.id || uploadDocMutation.isPending}
                  >
                    <Plus className="mr-2 h-4 w-4" />
                    Upload
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="space-y-2">
                {linkedDocs.length ? (
                  linkedDocs.map((d: any) => (
                    <div key={d.id} className="flex items-center justify-between gap-2">
                      <div className="text-sm truncate">{String(d.title || `Document ${d.id}`)}</div>
                      <Button variant="outline" size="sm" onClick={() => window.open(`/api/documents/${d.id}/download`, "_blank")}>
                        Download
                      </Button>
                    </div>
                  ))
                ) : (
                  <div className="text-sm text-muted-foreground">No documents linked</div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle className="text-lg flex items-center gap-2">
                  <Building2 className="h-4 w-4" />
                  Companies
                </CardTitle>
                <Dialog open={companyDialogOpen} onOpenChange={setCompanyDialogOpen}>
                  <DialogTrigger asChild>
                    <Button variant="outline" size="sm" disabled={!property?.id}>
                      <Plus className="mr-2 h-4 w-4" />
                      Link
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="sm:max-w-md">
                    <DialogHeader>
                      <DialogTitle>Link company</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-3">
                      <div className="space-y-2">
                        <Label>Company ID</Label>
                        <Input value={companyLinkForm.companyId} onChange={(e) => setCompanyLinkForm((p) => ({ ...p, companyId: e.target.value }))} />
                      </div>
                      <div className="space-y-2">
                        <Label>Role</Label>
                        <Input value={companyLinkForm.role} onChange={(e) => setCompanyLinkForm((p) => ({ ...p, role: e.target.value }))} placeholder="lender, title, vendor" />
                      </div>
                    </div>
                    <DialogFooter>
                      <Button
                        onClick={() => {
                          const n = parseInt(companyLinkForm.companyId, 10);
                          if (!Number.isFinite(n) || n <= 0) return toast({ title: "Company ID is required", variant: "destructive" });
                          linkCompanyMutation.mutate();
                        }}
                        disabled={linkCompanyMutation.isPending}
                      >
                        Link
                      </Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
              </CardHeader>
              <CardContent className="space-y-2">
                {linkedCompanies.length ? (
                  linkedCompanies.map((row: any) => (
                    <div key={row.link?.id || row.company?.id} className="text-sm">
                      {String(row.company?.name || `Company ${row.link?.companyId || ""}`)}
                      {row.link?.role ? ` (${String(row.link.role)})` : ""}
                    </div>
                  ))
                ) : (
                  <div className="text-sm text-muted-foreground">No companies linked</div>
                )}
              </CardContent>
            </Card>

            {property?.id ? <EntityTasksWidget entityType="opportunity" entityId={property.id} /> : null}
          </div>
        </div>
      </div>
      {isLoading && (
        <div className="absolute inset-0 flex items-center justify-center">
          <Spinner />
        </div>
      )}


      {/* Stage Change Dialog */}
      <Dialog open={stageDialogOpen} onOpenChange={setStageDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Change Opportunity Stage</DialogTitle>
            <DialogDescription>
              Current stage: <strong>{property?.stage || "lead"}</strong>
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>New Stage</Label>
              <Select value={stageDialogStage} onValueChange={setStageDialogStage}>
                <SelectTrigger>
                  <SelectValue placeholder="Select stage" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="lead">Lead</SelectItem>
                  <SelectItem value="contacted">Contacted</SelectItem>
                  <SelectItem value="negotiating">Negotiating</SelectItem>
                  <SelectItem value="under_contract">Under Contract</SelectItem>
                  <SelectItem value="in_disposition">In Disposition</SelectItem>
                  <SelectItem value="reserved">Reserved</SelectItem>
                  <SelectItem value="sold">Sold</SelectItem>
                  <SelectItem value="closed">Closed</SelectItem>
                  <SelectItem value="dead">Dead</SelectItem>
                  <SelectItem value="voided">Voided</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {stageDialogStage && (
              <div className="bg-muted/50 rounded-md p-3 space-y-2">
                <div>
                  <p className="text-xs font-medium mb-1">Expectations for this stage:</p>
                  <ul className="text-xs text-muted-foreground space-y-1">
                    {STAGE_EXPECTATIONS[stageDialogStage as any]?.map((item) => (
                      <li key={item}>• {item}</li>
                    ))}
                  </ul>
                </div>
                {HIGH_IMPACT_STAGES.has(stageDialogStage) && (
                  <div className="border-t pt-2">
                    <p className="text-xs font-medium text-amber-600 mb-1">Automations that will run:</p>
                    <ul className="text-xs text-muted-foreground space-y-1">
                      {(STAGE_AUTOMATIONS[stageDialogStage] || []).map((item) => (
                        <li key={item}>→ {item}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}
            <div className="space-y-2">
              <Label>
                Notes {REASON_REQUIRED_STAGES.has(stageDialogStage) ? <span className="text-red-500">(required for {stageDialogStage})</span> : <span className="text-muted-foreground">(optional)</span>}
              </Label>
              <Textarea
                value={stageDialogNotes}
                onChange={(e) => setStageDialogNotes(e.target.value)}
                placeholder={REASON_REQUIRED_STAGES.has(stageDialogStage) ? "Required: explain why this deal is being marked dead/voided..." : "Reason for stage change or additional context..."}
                rows={3}
              />
            </div>
            {REASON_REQUIRED_STAGES.has(stageDialogStage) && !stageDialogNotes.trim() && (
              <p className="text-xs text-red-500">A reason is required before moving to {stageDialogStage}.</p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setStageDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => {
                if (!stageDialogStage) return;
                if (REASON_REQUIRED_STAGES.has(stageDialogStage) && !stageDialogNotes.trim()) return;
                stageChangeMutation.mutate({ stage: stageDialogStage, notes: stageDialogNotes });
                setStageDialogOpen(false);
                setStageDialogStage("");
                setStageDialogNotes("");
              }}
              disabled={stageChangeMutation.isPending || !stageDialogStage || (REASON_REQUIRED_STAGES.has(stageDialogStage) && !stageDialogNotes.trim())}
            >
              {stageChangeMutation.isPending ? "Changing..." : "Change Stage"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Create Public Listing Dialog */}
      <Dialog open={listingCreateOpen} onOpenChange={setListingCreateOpen}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Create Public Listing</DialogTitle>
            <DialogDescription>Create a shareable link for investors to view property details and submit inquiries without CRM login.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 max-h-[70vh] overflow-y-auto pr-2">
            <div className="space-y-2">
              <Label>Title</Label>
              <Input
                value={listingForm.title}
                onChange={(e) => setListingForm((p) => ({ ...p, title: e.target.value }))}
                placeholder="Leave blank to use property address"
              />
            </div>
            <div className="space-y-2">
              <Label>Description</Label>
              <Textarea
                value={listingForm.description}
                onChange={(e) => setListingForm((p) => ({ ...p, description: e.target.value }))}
                rows={3}
                placeholder="Property description for investors..."
              />
            </div>
            <div className="space-y-2">
              <Label>Visibility</Label>
              <Select value={listingForm.visibility} onValueChange={(v) => setListingForm((p) => ({ ...p, visibility: v }))}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="public">Public (searchable)</SelectItem>
                  <SelectItem value="link_only">Link Only (recommended)</SelectItem>
                  <SelectItem value="password_protected">Password Protected</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {listingForm.visibility === "password_protected" && (
              <div className="space-y-2">
                <Label>Password</Label>
                <Input
                  type="password"
                  value={listingForm.password}
                  onChange={(e) => setListingForm((p) => ({ ...p, password: e.target.value }))}
                  placeholder="Enter password for listing access"
                />
              </div>
            )}
            <div className="space-y-2">
              <Label>Custom Slug (optional)</Label>
              <Input
                value={listingForm.slug}
                onChange={(e) => setListingForm((p) => ({ ...p, slug: e.target.value }))}
                placeholder="my-property-deal"
              />
            </div>
            <div className="space-y-2">
              <Label>Contact Info</Label>
              <div className="grid grid-cols-2 gap-3">
                <Input placeholder="Your name" value={listingForm.contactName} onChange={(e) => setListingForm((p) => ({ ...p, contactName: e.target.value }))} />
                <Input placeholder="Email" value={listingForm.contactEmail} onChange={(e) => setListingForm((p) => ({ ...p, contactEmail: e.target.value }))} />
                <Input placeholder="Phone" value={listingForm.contactPhone} onChange={(e) => setListingForm((p) => ({ ...p, contactPhone: e.target.value }))} />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Fields to Expose</Label>
              <div className="space-y-2">
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={listingForm.exposeAddress} onChange={(e) => setListingForm((p) => ({ ...p, exposeAddress: e.target.checked }))} />
                  Property Address
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={listingForm.exposeComps} onChange={(e) => setListingForm((p) => ({ ...p, exposeComps: e.target.checked }))} />
                  Comparable Sales (Comps)
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={listingForm.exposeFinancials} onChange={(e) => setListingForm((p) => ({ ...p, exposeFinancials: e.target.checked }))} />
                  Financial Details
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={listingForm.exposeDocs} onChange={(e) => setListingForm((p) => ({ ...p, exposeDocs: e.target.checked }))} />
                  Downloadable Documents
                </label>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setListingCreateOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={async () => {
                if (!property?.id) return;
                const payload: any = {
                  title: listingForm.title || null,
                  description: listingForm.description || null,
                  visibility: listingForm.visibility,
                  slug: listingForm.slug || undefined,
                  exposeAddress: listingForm.exposeAddress,
                  exposeComps: listingForm.exposeComps,
                  exposeFinancials: listingForm.exposeFinancials,
                  exposeDocs: listingForm.exposeDocs,
                  contactName: listingForm.contactName || null,
                  contactEmail: listingForm.contactEmail || null,
                  contactPhone: listingForm.contactPhone || null,
                };
                if (listingForm.visibility === "password_protected" && listingForm.password) {
                  payload.passwordHash = listingForm.password;
                }
                try {
                  const res = await apiRequest("POST", `/api/opportunities/${property.id}/listings`, payload);
                  const created: any = await res.json();
                  setListingCreateOpen(false);
                  setListingForm({
                    title: "", description: "", visibility: "link_only", password: "",
                    slug: "", exposeAddress: false, exposeComps: false, exposeFinancials: false, exposeDocs: false,
                    contactName: "", contactEmail: "", contactPhone: "",
                  });
                  queryClient.invalidateQueries({ queryKey: ["/api/opportunities", id, "listings"] });
                  toast({ title: "Listing created" });
                  if (created?.token) {
                    const url = `${window.location.origin}/l/${created.token}`;
                    navigator.clipboard.writeText(url);
                    toast({ title: "Share link copied to clipboard", description: url });
                  }
                } catch (e: any) {
                  toast({ title: e?.message || "Failed to create listing", variant: "destructive" });
                }
              }}
            >
              Create Listing
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add Note Dialog */}
      <Dialog open={noteDialogOpen} onOpenChange={setNoteDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Add Note</DialogTitle>
          </DialogHeader>
          <Textarea
            value={noteText}
            onChange={(e) => setNoteText(e.target.value)}
            placeholder="Enter note..."
            rows={4}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setNoteDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={async () => {
                if (!property?.id || !noteText.trim()) return;
                try {
                  const currentNotes = property?.notes || "";
                  const timestamp = new Date().toLocaleString();
                  const newNotes = [currentNotes || "", `[${timestamp}] ${noteText.trim()}`].filter(Boolean).join("\n");
                  const res = await apiRequest("PATCH", `/api/opportunities/${property.id}`, { notes: newNotes });
                  await res.json();
                  setNoteDialogOpen(false);
                  setNoteText("");
                  queryClient.invalidateQueries({ queryKey: ["/api/opportunities", id] });
                  queryClient.invalidateQueries({ queryKey: ["/api/activity"] });
                  toast({ title: "Note added" });
                } catch (e: any) {
                  toast({ title: e?.message || "Failed to add note", variant: "destructive" });
                }
              }}
            >
              Add Note
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Layout>
  );
}

function OpportunityEditDialog({ property }: { property?: any }) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [open, setOpen] = React.useState(false);
  const [formData, setFormData] = React.useState({
    status: "",
    price: "",
    arv: "",
    repairCost: "",
    beds: "",
    baths: "",
    sqft: "",
    yearBuilt: "",
    lotSize: "",
    occupancy: "",
    apn: "",
    notes: "",
    images: [] as string[],
  });

  React.useEffect(() => {
    if (!open) return;
    setFormData({
      status: property?.status || "active",
      price: property?.price?.toString?.() || "",
      arv: property?.arv?.toString?.() || "",
      repairCost: property?.repairCost?.toString?.() || "",
      beds: typeof property?.beds === "number" ? String(property.beds) : "",
      baths: typeof property?.baths === "number" ? String(property.baths) : "",
      sqft: typeof property?.sqft === "number" ? String(property.sqft) : "",
      yearBuilt: typeof property?.yearBuilt === "number" ? String(property.yearBuilt) : "",
      lotSize: property?.lotSize || "",
      occupancy: property?.occupancy || "unknown",
      apn: property?.apn || "",
      notes: property?.notes || "",
      images: Array.isArray(property?.images) ? property.images : [],
    });
  }, [open, property]);

  const patchOpportunity = useMutation({
    mutationFn: async (payload: any) => {
      const res = await apiRequest("PATCH", `/api/opportunities/${property.id}`, payload);
      return await res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/opportunities", property.id] });
      queryClient.invalidateQueries({ queryKey: ["/api/opportunities"] });
      queryClient.invalidateQueries({ queryKey: ["/api/activity"] });
      setOpen(false);
    },
  });

  const photosMutation = useMutation({    mutationFn: async (files: FileList) => {      const fd = new FormData();      Array.from(files).forEach((f) => fd.append('photos', f));      const res = await apiUpload('POST', `/api/opportunities/${property.id}/photos`, fd);      return await res.json();    },    onSuccess: async () => {      await queryClient.invalidateQueries({ queryKey: ['/api/opportunities', property.id] });      setFormData((prev) => ({ ...prev, images: photosMutation.data?.property?.images || prev.images }));      toast({ title: 'Photos uploaded' });    },    onError: (e: any) => toast({ title: e?.message || 'Upload failed', variant: 'destructive' }),  });  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {    const files = e.target.files;    if (!files) return;    photosMutation.mutate(files);    e.currentTarget.value = '';  };


  const removeImage = (index: number) => {
    setFormData((prev) => ({ ...prev, images: prev.images.filter((_, i) => i !== index) }));
  };

  if (!property?.id) {
    return (
      <Button variant="outline" className="w-full justify-start" disabled>
        <FileText className="mr-2 h-4 w-4" />
        Edit Opportunity
      </Button>
    );
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" className="w-full justify-start">
          <FileText className="mr-2 h-4 w-4" />
          Edit Opportunity
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Edit Opportunity</DialogTitle>
        </DialogHeader>
        <form
          className="space-y-4 max-h-[70vh] overflow-y-auto pr-2"
          onSubmit={(e) => {
            e.preventDefault();
            patchOpportunity.mutate({
              status: formData.status,
              price: formData.price || null,
              arv: formData.arv || null,
              repairCost: formData.repairCost || null,
              beds: formData.beds ? parseInt(formData.beds, 10) : null,
              baths: formData.baths ? parseInt(formData.baths, 10) : null,
              sqft: formData.sqft ? parseInt(formData.sqft, 10) : null,
              yearBuilt: formData.yearBuilt ? parseInt(formData.yearBuilt, 10) : null,
              lotSize: formData.lotSize || null,
              occupancy: formData.occupancy || null,
              apn: formData.apn || null,
              notes: formData.notes || null,
            });
          }}
        >
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Status</Label>
              <Select value={formData.status} onValueChange={(v) => setFormData((p) => ({ ...p, status: v }))}>
                <SelectTrigger>
                  <SelectValue placeholder="Select status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="under_contract">Under Contract</SelectItem>
                  <SelectItem value="pending">Pending</SelectItem>
                  <SelectItem value="sold">Sold</SelectItem>
                  <SelectItem value="withdrawn">Withdrawn</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Occupancy</Label>
              <Select value={formData.occupancy} onValueChange={(v) => setFormData((p) => ({ ...p, occupancy: v }))}>
                <SelectTrigger>
                  <SelectValue placeholder="Select occupancy" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="unknown">Unknown</SelectItem>
                  <SelectItem value="owner_occupied">Owner Occupied</SelectItem>
                  <SelectItem value="tenant_occupied">Tenant Occupied</SelectItem>
                  <SelectItem value="vacant">Vacant</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Price</Label>
              <Input type="number" value={formData.price} onChange={(e) => setFormData((p) => ({ ...p, price: e.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label>ARV</Label>
              <Input type="number" value={formData.arv} onChange={(e) => setFormData((p) => ({ ...p, arv: e.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label>Repair Cost</Label>
              <Input type="number" value={formData.repairCost} onChange={(e) => setFormData((p) => ({ ...p, repairCost: e.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label>APN</Label>
              <Input value={formData.apn} onChange={(e) => setFormData((p) => ({ ...p, apn: e.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label>Beds</Label>
              <Input type="number" value={formData.beds} onChange={(e) => setFormData((p) => ({ ...p, beds: e.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label>Baths</Label>
              <Input type="number" value={formData.baths} onChange={(e) => setFormData((p) => ({ ...p, baths: e.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label>SqFt</Label>
              <Input type="number" value={formData.sqft} onChange={(e) => setFormData((p) => ({ ...p, sqft: e.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label>Year Built</Label>
              <Input type="number" value={formData.yearBuilt} onChange={(e) => setFormData((p) => ({ ...p, yearBuilt: e.target.value }))} />
            </div>
            <div className="space-y-2 col-span-2">
              <Label>Lot Size</Label>
              <Input value={formData.lotSize} onChange={(e) => setFormData((p) => ({ ...p, lotSize: e.target.value }))} />
            </div>
            <div className="space-y-2 col-span-2">
              <Label>Notes</Label>
              <Textarea value={formData.notes} onChange={(e) => setFormData((p) => ({ ...p, notes: e.target.value }))} />
            </div>
          </div>

          <div className="space-y-2">
            <Label>Photos</Label>
            <div className="grid grid-cols-3 gap-3">
              {formData.images.map((img, idx) => (
                <div key={idx} className="relative group aspect-video">
                  <img src={img} alt={`Photo ${idx + 1}`} className="w-full h-full object-cover rounded-lg border" />
                  <button
                    type="button"
                    onClick={() => removeImage(idx)}
                    className="absolute top-1 right-1 px-2 py-1 text-xs bg-destructive text-white rounded opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    Remove
                  </button>
                </div>
              ))}
              <label className="cursor-pointer aspect-video">
                <input type="file" accept="image/*" multiple className="hidden" onChange={handleImageUpload} />
                <div className="w-full h-full border-2 border-dashed border-muted-foreground/30 rounded-lg flex items-center justify-center text-sm text-muted-foreground hover:border-primary hover:bg-accent/10 transition-colors">
                  Add Photos
                </div>
              </label>
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={patchOpportunity.isPending}>
              Save
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function LinkLeadDialog({ property }: { property?: any }) {
  const queryClient = useQueryClient();
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");

  React.useEffect(() => {
    if (!open) return;
    const seed = [property?.address, property?.city, property?.state].filter(Boolean).join(" ");
    setQuery((prev) => prev || seed);
  }, [open, property]);

  const { data: searchData, isLoading } = useQuery<any>({
    queryKey: ["/api/search", query],
    queryFn: async () => {
      const res = await fetch(`/api/search?q=${encodeURIComponent(query)}&limit=20`);
      if (!res.ok) throw new Error("Failed to search");
      return res.json();
    },
    enabled: open && query.trim().length >= 2,
  });

  const leads = React.useMemo(() => {
    const results = searchData?.results || [];
    return results.filter((r: any) => r.type === "lead");
  }, [searchData]);

  const linkLead = useMutation({
    mutationFn: async (leadId: number) => {
      const res = await fetch(`/api/opportunities/${property.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sourceLeadId: leadId }),
      });
      if (!res.ok) throw new Error("Failed to link lead");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/opportunities", property.id] });
      queryClient.invalidateQueries({ queryKey: ["/api/opportunities"] });
      queryClient.invalidateQueries({ queryKey: ["leads"] });
      queryClient.invalidateQueries({ queryKey: ["/api/activity"] });
      setOpen(false);
    },
  });

  if (!property?.id) {
    return (
      <Button variant="outline" className="w-full justify-start" disabled>
        <MessageSquare className="mr-2 h-4 w-4" />
        Link Lead
      </Button>
    );
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" className="w-full justify-start">
          <MessageSquare className="mr-2 h-4 w-4" />
          {property?.sourceLeadId ? `Change Linked Lead (#${property.sourceLeadId})` : "Link Lead"}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Link Lead</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1">
            <Label>Search</Label>
            <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search leads by address, owner, phone, email…" />
          </div>
          <div className="border rounded-md">
            <ScrollArea className="h-72">
              <div className="p-2 space-y-2">
                {isLoading ? (
                  <div className="py-8 text-center text-muted-foreground">Searching…</div>
                ) : query.trim().length < 2 ? (
                  <div className="py-8 text-center text-muted-foreground">Type at least 2 characters.</div>
                ) : leads.length ? (
                  leads.map((r: any) => (
                    <div key={r.id} className="flex items-start justify-between border rounded-md p-3">
                      <div>
                        <div className="text-sm font-medium">{r.title}</div>
                        <div className="text-xs text-muted-foreground">{r.subtitle}</div>
                      </div>
                      <Button size="sm" onClick={() => linkLead.mutate(r.id)} disabled={linkLead.isPending}>
                        Link
                      </Button>
                    </div>
                  ))
                ) : (
                  <div className="py-8 text-center text-muted-foreground">No leads found.</div>
                )}
              </div>
            </ScrollArea>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function DealRoomSection({ propertyId, userId }: { propertyId?: number; userId?: number }) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [activeBuyerId, setActiveBuyerId] = React.useState<string>("");
  const [offerForm, setOfferForm] = React.useState({ buyerName: "", sellerName: "", offerAmount: "", status: "pending", notes: "", earnestMoney: "", financingType: "", closeBy: "", terms: "" });
  const [commForm, setCommForm] = React.useState({ type: "call", subject: "", content: "", direction: "outbound" });

  const { data: buyerOffers = [], isLoading: offersLoading } = useQuery<any[]>({
    queryKey: ["/api/opportunities", propertyId, "offers"],
    queryFn: async () => {
      const res = await fetch(`/api/opportunities/${propertyId}/offers`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch offers");
      return res.json();
    },
    enabled: !!propertyId,
  });

  const { data: contracts = [], isLoading: contractsLoading } = useQuery<any[]>({
    queryKey: ["/api/contracts", propertyId],
    queryFn: async () => {
      const res = await fetch(`/api/contracts?propertyId=${propertyId}`);
      if (!res.ok) throw new Error("Failed to fetch contracts");
      return res.json();
    },
    enabled: !!propertyId,
  });

  const { data: buyers = [] } = useQuery<any[]>({
    queryKey: ["/api/buyers"],
    queryFn: async () => {
      const res = await fetch(`/api/buyers?limit=200`);
      if (!res.ok) throw new Error("Failed to fetch buyers");
      return res.json();
    },
  });

  const { data: assignments = [], isLoading: assignmentsLoading } = useQuery<any[]>({
    queryKey: ["/api/properties/assignments", propertyId],
    queryFn: async () => {
      const res = await fetch(`/api/properties/${propertyId}/assignments?limit=100`);
      if (!res.ok) throw new Error("Failed to fetch assignments");
      return res.json();
    },
    enabled: !!propertyId,
  });

  const buyerById = React.useMemo(() => {
    const map = new Map<number, any>();
    (buyers || []).forEach((b: any) => map.set(b.id, b));
    return map;
  }, [buyers]);

  React.useEffect(() => {
    const firstBuyerId = assignments?.[0]?.buyerId;
    if (!activeBuyerId && firstBuyerId) setActiveBuyerId(String(firstBuyerId));
  }, [assignments, activeBuyerId]);

  const createOffer = useMutation({
    mutationFn: async () => {
      if (!propertyId) throw new Error("Missing propertyId");
      if (!userId) throw new Error("Missing user");
      const res = await fetch(`/api/opportunities/${propertyId}/offers`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          amount: offerForm.offerAmount ? parseFloat(offerForm.offerAmount) : 0,
          earnestMoney: offerForm.earnestMoney || null,
          financingType: offerForm.financingType || null,
          closeBy: offerForm.closeBy || null,
          terms: offerForm.terms || null,
          notes: offerForm.notes || null,
        }),
        credentials: "include",
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json?.message || "Failed to create offer");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/opportunities", propertyId, "offers"] });
      queryClient.invalidateQueries({ queryKey: ["/api/opportunities", propertyId, "events"] });
      setOfferForm({ buyerName: "", sellerName: "", offerAmount: "", status: "pending", notes: "", earnestMoney: "", financingType: "", closeBy: "", terms: "" });
    },
  });

  const counterOffer = useMutation({
    mutationFn: async ({ offerId, amount }: { offerId: number; amount: number }) => {
      if (!userId) throw new Error("Missing user");
      const res = await fetch(`/api/buyer-offers/${offerId}/counter`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount }),
        credentials: "include",
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.message || "Failed to counter offer");
      return json;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["/api/opportunities", propertyId, "offers"] });
      await queryClient.invalidateQueries({ queryKey: ["/api/opportunities", propertyId, "events"] });
      toast({ title: "Counter-offer created" });
    },
    onError: (e: any) => toast({ title: e?.message || "Failed to counter", variant: "destructive" }),
  });

  const setOfferStatus = useMutation({
    mutationFn: async ({ offerId, status }: { offerId: number; status: string }) => {
      if (!userId) throw new Error("Missing user");
      const res = await fetch(`/api/buyer-offers/${offerId}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
        credentials: "include",
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.message || "Failed to update offer");
      return json;
    },
    onSuccess: async (result: any) => {
      await queryClient.invalidateQueries({ queryKey: ["/api/opportunities", propertyId, "offers"] });
      await queryClient.invalidateQueries({ queryKey: ["/api/opportunities", propertyId, "events"] });
      await queryClient.invalidateQueries({ queryKey: ["/api/opportunities", propertyId] });
      await queryClient.invalidateQueries({ queryKey: ["/api/opportunities", propertyId, "listings"] });
      toast({ title: `Offer ${String(result?.status || "").replace("_", " ")}` });
    },
    onError: (e: any) => toast({ title: e?.message || "Failed to update offer", variant: "destructive" }),
  });

  const createAssignment = useMutation({
    mutationFn: async (buyerId: number) => {
      if (!propertyId) throw new Error("Missing propertyId");
      const res = await fetch(`/api/deal-assignments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ propertyId, buyerId }),
      });
      if (!res.ok) throw new Error("Failed to create assignment");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/properties/assignments", propertyId] });
    },
  });

  const deleteAssignment = useMutation({
    mutationFn: async (assignmentId: number) => {
      const res = await fetch(`/api/deal-assignments/${assignmentId}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to delete assignment");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/properties/assignments", propertyId] });
    },
  });

  const { data: comms = [], isLoading: commsLoading } = useQuery<any[]>({
    queryKey: ["/api/buyers/comms", activeBuyerId],
    queryFn: async () => {
      const res = await fetch(`/api/buyers/${activeBuyerId}/communications?limit=100`);
      if (!res.ok) throw new Error("Failed to fetch communications");
      return res.json();
    },
    enabled: !!activeBuyerId,
  });

  const createComm = useMutation({
    mutationFn: async () => {
      if (!activeBuyerId) throw new Error("Missing buyer");
      if (!userId) throw new Error("Missing user");
      const res = await fetch(`/api/buyers/${activeBuyerId}/communications`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId,
          type: commForm.type,
          subject: commForm.subject || null,
          content: commForm.content || null,
          direction: commForm.direction,
        }),
      });
      if (!res.ok) throw new Error("Failed to create communication");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/buyers/comms", activeBuyerId] });
      setCommForm({ type: "call", subject: "", content: "", direction: "outbound" });
    },
  });

  if (!propertyId) {
    return <div className="py-10 text-center text-muted-foreground">Select an opportunity to view the deal room.</div>;
  }

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Buyer Offers</CardTitle>
          <CardDescription className="text-xs">Track offers, counter-offers, and acceptances. Accepted offers move the deal to Reserved and pause the listing.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="border rounded-md p-3 space-y-3">
            <p className="text-xs font-medium text-muted-foreground">Log a new offer</p>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Offer Amount ($) *</Label>
                <Input type="number" value={offerForm.offerAmount} onChange={(e) => setOfferForm((p) => ({ ...p, offerAmount: e.target.value }))} />
              </div>
              <div className="space-y-1">
                <Label>Earnest Money ($)</Label>
                <Input type="number" value={offerForm.earnestMoney} onChange={(e) => setOfferForm((p) => ({ ...p, earnestMoney: e.target.value }))} />
              </div>
              <div className="space-y-1">
                <Label>Financing Type</Label>
                <Input value={offerForm.financingType} onChange={(e) => setOfferForm((p) => ({ ...p, financingType: e.target.value }))} placeholder="cash, conventional, hard money…" />
              </div>
              <div className="space-y-1">
                <Label>Close By</Label>
                <Input type="date" value={offerForm.closeBy} onChange={(e) => setOfferForm((p) => ({ ...p, closeBy: e.target.value }))} />
              </div>
              <div className="space-y-1 col-span-2">
                <Label>Terms / Conditions</Label>
                <Textarea value={offerForm.terms} onChange={(e) => setOfferForm((p) => ({ ...p, terms: e.target.value }))} rows={2} placeholder="Inspection period, contingencies, assignment terms…" />
              </div>
              <div className="space-y-1 col-span-2">
                <Label>Notes</Label>
                <Textarea value={offerForm.notes} onChange={(e) => setOfferForm((p) => ({ ...p, notes: e.target.value }))} rows={2} />
              </div>
              <div className="col-span-2 flex justify-end">
                <Button onClick={() => createOffer.mutate()} disabled={!userId || !offerForm.offerAmount || createOffer.isPending}>
                  {createOffer.isPending ? "Saving…" : "Create Offer"}
                </Button>
              </div>
            </div>
          </div>
          <Separator />
          {offersLoading ? (
            <div className="py-6 text-center text-muted-foreground">Loading offers…</div>
          ) : buyerOffers.length ? (
            <div className="border rounded-md scroll-x-container">
              <div className="min-w-[760px]">
                <div className="grid grid-cols-8 gap-2 p-2 text-xs text-muted-foreground bg-muted/30">
                  <div>Version</div>
                  <div>Amount</div>
                  <div>EMD</div>
                  <div>Financing</div>
                  <div>Close By</div>
                  <div>Status</div>
                  <div>Received</div>
                  <div className="text-right">Actions</div>
                </div>
                {buyerOffers.map((o: any) => (
                  <div key={o.id} className={`grid grid-cols-8 gap-2 p-2 text-sm border-t items-center ${o.superseded ? "opacity-50" : ""}`}>
                    <div className="font-medium">v{o.version || 1}{o.superseded ? " (superseded)" : ""}</div>
                    <div className="font-semibold">${Number(o.amount || 0).toLocaleString()}</div>
                    <div>{o.earnestMoney ? `$${Number(o.earnestMoney).toLocaleString()}` : "—"}</div>
                    <div>{o.financingType || "—"}</div>
                    <div>{o.closeBy ? new Date(o.closeBy).toLocaleDateString() : "—"}</div>
                    <div>
                      <Badge variant={o.status === "accepted" ? "default" : o.status === "rejected" || o.status === "withdrawn" ? "destructive" : "outline"} className="capitalize">
                        {String(o.status || "received").replace("_", " ")}
                      </Badge>
                    </div>
                    <div className="text-xs text-muted-foreground">{o.createdAt ? new Date(o.createdAt).toLocaleDateString() : "—"}</div>
                    <div className="flex justify-end gap-1 flex-wrap">
                      {!o.superseded && o.status !== "accepted" && o.status !== "rejected" && o.status !== "withdrawn" && (
                        <>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => {
                              const amount = window.prompt("Counter amount:", o.amount ? String(o.amount) : "");
                              if (amount === null) return;
                              const n = Number(amount);
                              if (!Number.isFinite(n) || n <= 0) return toast({ title: "Enter a valid amount", variant: "destructive" });
                              counterOffer.mutate({ offerId: o.id, amount: n });
                            }}
                            disabled={counterOffer.isPending}
                          >
                            Counter
                          </Button>
                          <Button
                            size="sm"
                            onClick={() => {
                              if (!window.confirm(`Accept offer #${o.id} for $${Number(o.amount).toLocaleString()}? This moves the deal to Reserved, creates closing tasks, and pauses the public listing.`)) return;
                              setOfferStatus.mutate({ offerId: o.id, status: "accepted" });
                            }}
                            disabled={setOfferStatus.isPending}
                          >
                            Accept
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => {
                              if (window.confirm(`Reject offer #${o.id}?`)) setOfferStatus.mutate({ offerId: o.id, status: "rejected" });
                            }}
                            disabled={setOfferStatus.isPending}
                          >
                            Reject
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => setOfferStatus.mutate({ offerId: o.id, status: "withdrawn" })}
                            disabled={setOfferStatus.isPending}
                          >
                            Withdraw
                          </Button>
                        </>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="py-6 text-center text-muted-foreground">No buyer offers yet. Create one above or from a buyer inquiry.</div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Buyer Assignments</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-2 items-end">
            <div className="flex-1 space-y-1">
              <Label>Assign Buyer</Label>
              <Select value={activeBuyerId} onValueChange={setActiveBuyerId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select buyer" />
                </SelectTrigger>
                <SelectContent>
                  {buyers.map((b: any) => (
                    <SelectItem key={b.id} value={String(b.id)}>
                      {b.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button
              variant="secondary"
              onClick={() => {
                const n = activeBuyerId ? parseInt(activeBuyerId, 10) : 0;
                if (!n) return;
                createAssignment.mutate(n);
              }}
              disabled={!activeBuyerId || createAssignment.isPending}
            >
              Assign
            </Button>
          </div>
          <ScrollArea className="h-48 border rounded-md p-2">
            {assignmentsLoading ? (
              <div className="py-6 text-center text-muted-foreground">Loading assignments…</div>
            ) : assignments.length ? (
              <div className="space-y-2">
                {assignments.map((a: any) => (
                  <div key={a.id} className="flex items-start justify-between border rounded-md p-3">
                    <div>
                      <div className="text-sm font-medium">{buyerById.get(a.buyerId)?.name || `Buyer #${a.buyerId}`}</div>
                      <div className="text-xs text-muted-foreground">Status: {a.status}</div>
                    </div>
                    <Button variant="destructive" size="sm" onClick={() => deleteAssignment.mutate(a.id)} disabled={deleteAssignment.isPending}>
                      Remove
                    </Button>
                  </div>
                ))}
              </div>
            ) : (
              <div className="py-6 text-center text-muted-foreground">No buyers assigned.</div>
            )}
          </ScrollArea>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Buyer Communications</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>Buyer</Label>
              <Select value={activeBuyerId} onValueChange={setActiveBuyerId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select buyer" />
                </SelectTrigger>
                <SelectContent>
                  {assignments.map((a: any) => (
                    <SelectItem key={a.buyerId} value={String(a.buyerId)}>
                      {buyerById.get(a.buyerId)?.name || `Buyer #${a.buyerId}`}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Type</Label>
              <Select value={commForm.type} onValueChange={(v) => setCommForm((p) => ({ ...p, type: v }))}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="call">Call</SelectItem>
                  <SelectItem value="text">Text</SelectItem>
                  <SelectItem value="email">Email</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1 col-span-2">
              <Label>Subject</Label>
              <Input value={commForm.subject} onChange={(e) => setCommForm((p) => ({ ...p, subject: e.target.value }))} />
            </div>
            <div className="space-y-1 col-span-2">
              <Label>Content</Label>
              <Textarea value={commForm.content} onChange={(e) => setCommForm((p) => ({ ...p, content: e.target.value }))} />
            </div>
            <div className="col-span-2 flex justify-end">
              <Button onClick={() => createComm.mutate()} disabled={!userId || !activeBuyerId || !commForm.content.trim() || createComm.isPending}>
                Log Communication
              </Button>
            </div>
          </div>
          <Separator />
          <ScrollArea className="h-48 border rounded-md p-2">
            {!activeBuyerId ? (
              <div className="py-6 text-center text-muted-foreground">Assign a buyer to start a comm log.</div>
            ) : commsLoading ? (
              <div className="py-6 text-center text-muted-foreground">Loading communications…</div>
            ) : comms.length ? (
              <div className="space-y-2">
                {comms.map((c: any) => (
                  <div key={c.id} className="border rounded-md p-3">
                    <div className="flex items-center justify-between">
                      <div className="text-sm font-medium">{c.type}</div>
                      <div className="text-xs text-muted-foreground">{new Date(c.createdAt).toLocaleString()}</div>
                    </div>
                    {c.subject ? <div className="text-xs text-muted-foreground">{c.subject}</div> : null}
                    {c.content ? <div className="text-sm mt-1 whitespace-pre-wrap">{c.content}</div> : null}
                  </div>
                ))}
              </div>
            ) : (
              <div className="py-6 text-center text-muted-foreground">No communications yet.</div>
            )}
          </ScrollArea>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Contracts</CardTitle>
        </CardHeader>
        <CardContent>
          <ScrollArea className="h-56 border rounded-md p-2">
            {contractsLoading ? (
              <div className="py-6 text-center text-muted-foreground">Loading contracts…</div>
            ) : contracts.length ? (
              <div className="space-y-2">
                {contracts.map((c: any) => (
                  <div key={c.id} className="flex items-start justify-between border rounded-md p-3">
                    <div>
                      <div className="text-sm font-medium">Contract #{c.id}</div>
                      <div className="text-xs text-muted-foreground">
                        ${c.amount ? parseInt(String(c.amount), 10).toLocaleString() : "—"} · {c.status || "—"}
                      </div>
                    </div>
                    <Badge variant="outline">{c.status || "—"}</Badge>
                  </div>
                ))}
              </div>
            ) : (
              <div className="py-6 text-center text-muted-foreground">No contracts yet.</div>
            )}
          </ScrollArea>
        </CardContent>
      </Card>
    </div>
  );
}

function ActivitySection({ propertyId, leadId }: { propertyId?: number; leadId?: number }) {
  const { data: logs = [], isLoading } = useQuery<any[]>({
    queryKey: ["/api/activity", propertyId, leadId],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (propertyId) params.set("propertyId", String(propertyId));
      if (leadId) params.set("leadId", String(leadId));
      const res = await fetch(`/api/activity?${params.toString()}`);
      if (!res.ok) throw new Error("Failed to fetch activity");
      return res.json();
    },
    enabled: !!propertyId || !!leadId,
  });

  if (isLoading) {
    return <div className="py-8 text-center text-muted-foreground">Loading activity…</div>;
  }
  if (!logs.length) {
    return <div className="py-8 text-center text-muted-foreground">No recent activity.</div>;
  }
  return (
    <div className="space-y-3">
      {logs.map((log: any) => (
        <div key={log.id} className="flex items-start justify-between border rounded-md p-3">
          <div>
            <div className="text-sm font-medium">{log.action.replaceAll('_',' ')}</div>
            <div className="text-xs text-muted-foreground">{log.description}</div>
          </div>
          <div className="text-xs text-muted-foreground">
            {new Date(log.createdAt).toLocaleString()}
          </div>
        </div>
      ))}
    </div>
  );
}

function AddNoteForm({ leadId, propertyId, initialNotes, onAdded }: { leadId?: number; propertyId?: number; initialNotes?: string; onAdded?: () => void }) {
  const [text, setText] = React.useState("");
  const disabled = (!leadId && !propertyId) || !text.trim();
  const handleAdd = async () => {
    const targetLeadId = leadId;
    const targetPropertyId = propertyId;
    const timestamp = new Date().toLocaleString();
    const nextNotes = [initialNotes || "", `[# ${timestamp}] ${text.trim()}`].filter(Boolean).join("\n");
    let res: Response;
    if (targetLeadId) {
      res = await fetch(`/api/leads/${targetLeadId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notes: nextNotes })
      });
    } else if (targetPropertyId) {
      res = await fetch(`/api/opportunities/${targetPropertyId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notes: nextNotes })
      });
    } else {
      return;
    }
    if (res.ok) {
      onAdded?.();
    } else {
      alert("Failed to add note");
    }
  };
  return (
    <div className="relative">
      <textarea
        className="w-full min-h-[80px] rounded-md border bg-background p-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
        placeholder="Add a note..."
        value={text}
        onChange={(e) => setText(e.target.value)}
      />
      <Button size="sm" className="absolute bottom-2 right-2 h-7 px-2" onClick={handleAdd} disabled={disabled}>
        Add
      </Button>
    </div>
  );
}

const STAGE_EXPECTATIONS: Record<string, string[]> = {
  lead: ["Contact seller", "Initial outreach", "Qualify property"],
  contacted: ["Schedule showing", "Send CMA", "Gather seller details"],
  negotiating: ["Review offer terms", "Counter offer", "Finalize contract terms"],
  under_contract: ["EMD deposit", "Inspection deadline", "Due diligence", "Secure financing"],
  in_disposition: ["Build buyer list", "Create public listing", "Schedule tours"],
  reserved: ["Confirm buyer commitment", "Coordinate closing", "Assign contract"],
  sold: ["Close deal", "Receive assignment fee", "Disburse funds"],
  closed: ["Post-close wrap-up", "Archive documents"],
  dead: ["Document reasons", "Attempt re-engagement"],
  voided: ["Reason recorded", "Cancel related tasks", "Archive"],
};

// Downstream automations triggered when entering a stage (shown in the stage
// confirmation dialog so the user knows what will run).
const STAGE_AUTOMATIONS: Record<string, string[]> = {
  under_contract: [
    "Creates a due diligence checklist (EMD, inspection, title, financing, appraisal, walk-through)",
    "Creates a 'Create public listing' disposition task",
  ],
  in_disposition: [
    "Checks for a published public listing and flags one if missing",
    "Creates a buyer outreach & follow-up task",
  ],
  reserved: [
    "Creates closing coordination tasks (buyer commitment, title, closing docs)",
  ],
  sold: ["Records the closing date", "Archives public listings", "Creates a final deal review task"],
  closed: ["Records the closing date", "Archives public listings", "Creates a final deal review task"],
  dead: ["Pauses public listings", "Requires a reason", "Preserves all history"],
  voided: ["Pauses public listings", "Requires a reason", "Preserves all history"],
};

const HIGH_IMPACT_STAGES = new Set(["under_contract", "reserved", "sold", "closed", "dead", "voided"]);
const REASON_REQUIRED_STAGES = new Set(["dead", "voided"]);

function StageBadge({ stage }: { stage: string }) {
  const stageConfig: Record<string, { label: string; color: string }> = {
    lead: { label: "Lead", color: "bg-gray-100 text-gray-800" },
    contacted: { label: "Contacted", color: "bg-blue-100 text-blue-800" },
    negotiating: { label: "Negotiating", color: "bg-yellow-100 text-yellow-800" },
    under_contract: { label: "Under Contract", color: "bg-orange-100 text-orange-800" },
    in_disposition: { label: "In Disposition", color: "bg-purple-100 text-purple-800" },
    reserved: { label: "Reserved", color: "bg-indigo-100 text-indigo-800" },
    sold: { label: "Sold", color: "bg-green-100 text-green-800" },
    closed: { label: "Closed", color: "bg-emerald-100 text-emerald-800" },
    dead: { label: "Dead", color: "bg-red-100 text-red-800" },
    voided: { label: "Voided", color: "bg-slate-100 text-slate-800" },
  };
  const config = stageConfig[stage] || { label: stage, color: "bg-gray-100 text-gray-800" };
  return <Badge variant="secondary" className={config.color}>{config.label}</Badge>;
}

function PartiesSection({ propertyId, parties, onUpdated }: { propertyId?: number; parties: any[]; onUpdated: () => void }) {
  const { toast } = useToast();
  const [dialogOpen, setDialogOpen] = React.useState(false);
  const [form, setForm] = React.useState({ role: "seller", name: "", email: "", phone: "", company: "", notes: "" });
  const [loading, setLoading] = React.useState(false);

  if (!propertyId) return <div className="py-10 text-center text-muted-foreground">Loading parties…</div>;

  const roleOptions = ["seller", "buyer", "assignee", "lender", "title", "attorney", "partner"];

  const handleAdd = async () => {
    if (!form.name.trim() || !form.role) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/opportunities/${propertyId}/parties`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to add party");
      setDialogOpen(false);
      setForm({ role: "seller", name: "", email: "", phone: "", company: "", notes: "" });
      onUpdated();
      toast({ title: "Party added" });
    } catch (e: any) {
      toast({ title: e?.message || "Failed to add party", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (partyId: number) => {
    try {
      const res = await fetch(`/api/opportunities/parties/${partyId}`, { method: "DELETE", credentials: "include" });
      if (!res.ok) throw new Error("Failed to remove party");
      onUpdated();
      toast({ title: "Party removed" });
    } catch (e: any) {
      toast({ title: e?.message || "Failed to remove", variant: "destructive" });
    }
  };

  const grouped = React.useMemo(() => {
    const groups: Record<string, any[]> = {};
    for (const p of parties || []) {
      const role = p.role || "other";
      if (!groups[role]) groups[role] = [];
      groups[role].push(p);
    }
    return groups;
  }, [parties]);

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h3 className="text-lg font-semibold">Opportunity Parties</h3>
        <Button size="sm" onClick={() => setDialogOpen(true)}>
          <Plus className="h-4 w-4 mr-2" />
          Add Party
        </Button>
      </div>

      {Object.keys(grouped).length === 0 ? (
        <div className="text-sm text-muted-foreground py-8 text-center">No parties added yet.</div>
      ) : (
        Object.entries(grouped).map(([role, items]) => (
          <Card key={role}>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm capitalize">{role}s</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {items.map((p: any) => (
                <div key={p.id} className="flex items-center justify-between border rounded-md p-3">
                  <div>
                    <div className="font-medium">{p.name || "—"}</div>
                    <div className="text-sm text-muted-foreground">
                      {p.email && <span>{p.email}</span>}
                      {p.email && p.phone && <span> · </span>}
                      {p.phone && <span>{p.phone}</span>}
                      {p.company && <span> · {p.company}</span>}
                    </div>
                    {p.notes && <div className="text-xs text-muted-foreground mt-1">{p.notes}</div>}
                  </div>
                  <Button variant="ghost" size="sm" onClick={() => handleDelete(p.id)} disabled={loading}>
                    <XCircle className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </CardContent>
          </Card>
        ))
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Add Party</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Role</Label>
              <Select value={form.role} onValueChange={(v) => setForm((p) => ({ ...p, role: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {roleOptions.map((r) => (
                    <SelectItem key={r} value={r} className="capitalize">{r}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2"><Label>Name</Label><Input value={form.name} onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))} /></div>
            <div className="space-y-2"><Label>Email</Label><Input value={form.email} onChange={(e) => setForm((p) => ({ ...p, email: e.target.value }))} /></div>
            <div className="space-y-2"><Label>Phone</Label><Input value={form.phone} onChange={(e) => setForm((p) => ({ ...p, phone: e.target.value }))} /></div>
            <div className="space-y-2"><Label>Company</Label><Input value={form.company} onChange={(e) => setForm((p) => ({ ...p, company: e.target.value }))} /></div>
            <div className="space-y-2"><Label>Notes</Label><Textarea value={form.notes} onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))} rows={3} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleAdd} disabled={loading || !form.name.trim()}>{loading ? "Adding..." : "Add Party"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function PublicListingSection({ propertyId, listings, inquiries, onUpdated, onListingCreate }: { propertyId?: number; listings: any[]; inquiries: any[]; onUpdated: () => void; onListingCreate?: () => void }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [inquiryFilter, setInquiryFilter] = React.useState<string>("all");

  const { data: teamUsers = [] } = useQuery<any[]>({
    queryKey: ["/api/users", "team"],
    queryFn: async () => {
      const res = await fetch("/api/users", { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
  });

  const convertInquiry = useMutation({
    mutationFn: async (inquiryId: number) => {
      const res = await fetch(`/api/inquiries/${inquiryId}/convert`, { method: "POST", credentials: "include" });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.message || "Failed to convert inquiry");
      return json;
    },
    onSuccess: async (result: any) => {
      await queryClient.invalidateQueries({ queryKey: ["/api/opportunities", propertyId, "inquiries"] });
      await queryClient.invalidateQueries({ queryKey: ["/api/opportunities", propertyId, "parties"] });
      await queryClient.invalidateQueries({ queryKey: ["/api/buyers"] });
      toast({ title: result?.created ? "Converted to new buyer" : "Linked to existing buyer" });
    },
    onError: (e: any) => toast({ title: e?.message || "Failed to convert", variant: "destructive" }),
  });

  const offerFromInquiry = useMutation({
    mutationFn: async ({ inquiryId, amount }: { inquiryId: number; amount: string }) => {
      const res = await fetch(`/api/inquiries/${inquiryId}/offer`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount }),
        credentials: "include",
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.message || "Failed to create offer");
      return json;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["/api/opportunities", propertyId, "inquiries"] });
      toast({ title: "Offer created from inquiry" });
    },
    onError: (e: any) => toast({ title: e?.message || "Failed to create offer", variant: "destructive" }),
  });

  const assignInquiry = useMutation({
    mutationFn: async ({ inquiryId, userId }: { inquiryId: number; userId: number | null }) => {
      const res = await fetch(`/api/inquiries/${inquiryId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ assignedToUserId: userId }),
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to assign inquiry");
      return res.json();
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["/api/opportunities", propertyId, "inquiries"] });
      toast({ title: "Inquiry assigned" });
    },
    onError: (e: any) => toast({ title: e?.message || "Failed to assign", variant: "destructive" }),
  });

  const INQUIRY_STATUS_OPTIONS = ["new", "contacted", "qualified", "offer_received", "negotiating", "won", "lost", "spam"];

  if (!propertyId) return <div className="py-10 text-center text-muted-foreground">Loading listings…</div>;

  const allListings = listings || [];
  const activeListings = allListings.filter((l: any) => l.status === "published");

  const handleListingStatus = async (listingId: number, status: string) => {
    try {
      const res = await fetch(`/api/listings/${listingId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to update listing");
      onUpdated();
      toast({ title: status === "published" ? "Listing published" : status === "paused" ? "Listing paused" : "Listing archived" });
    } catch (e: any) {
      toast({ title: e?.message || "Failed", variant: "destructive" });
    }
  };

  const handleListingDelete = async (listingId: number) => {
    if (!window.confirm("Delete this public listing? Inquiries linked to it will be kept.")) return;
    try {
      const res = await fetch(`/api/listings/${listingId}`, { method: "DELETE", credentials: "include" });
      if (!res.ok) throw new Error("Failed to delete listing");
      onUpdated();
      toast({ title: "Listing deleted" });
    } catch (e: any) {
      toast({ title: e?.message || "Failed", variant: "destructive" });
    }
  };

  const shareListing = async (listing: any, channel: string, target?: string) => {
    try {
      await fetch(`/api/listings/${listing.id}/share`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ channel, target: target || null }),
        credentials: "include",
      });
      onUpdated();
    } catch {
      // Non-blocking: the share action itself still proceeds client-side.
    }
  };

  const handleInquiryStatus = async (inquiryId: number, status: string) => {
    try {
      const res = await fetch(`/api/inquiries/${inquiryId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to update inquiry");
      onUpdated();
      toast({ title: "Inquiry status updated" });
    } catch (e: any) {
      toast({ title: e?.message || "Failed", variant: "destructive" });
    }
  };

  const statusBadgeVariant = (status: string) => {
    switch (status) {
      case "published": return "default";
      case "paused": return "secondary";
      case "draft": return "outline";
      case "archived": return "destructive";
      default: return "secondary";
    }
  };

  return (
    <div className="space-y-6">
      {allListings.length === 0 ? (
        <Card>
          <CardContent className="pt-6">
            <div className="text-center py-8">
              <Share2 className="h-12 w-12 text-muted-foreground/30 mx-auto mb-3" />
              <h3 className="font-medium mb-2">No public listings yet</h3>
              <p className="text-sm text-muted-foreground mb-4">Create a public listing to share this opportunity with investors.</p>
              <Button onClick={onListingCreate}>
                <Share2 className="h-4 w-4 mr-2" />
                Create Public Listing
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {allListings.map((listing: any) => {
            const listingInquiries = (inquiries || []).filter((i: any) => i.listingId === listing.id);
            const isLive = listing.status === "published";
            return (
              <Card key={listing.id}>
                <CardHeader>
                  <CardTitle className="flex items-center justify-between">
                    <span>{listing.title || `Listing #${listing.id}`}</span>
                    <Badge variant={statusBadgeVariant(listing.status)}>{listing.status}</Badge>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                    <div><p className="text-muted-foreground">Views</p><p className="font-medium">{listing.viewCount || 0}</p></div>
                    <div><p className="text-muted-foreground">Visibility</p><p className="font-medium capitalize">{listing.visibility?.replace("_", " ") || "—"}</p></div>
                    <div><p className="text-muted-foreground">Published</p><p className="font-medium">{listing.publishedAt ? new Date(listing.publishedAt).toLocaleDateString() : "—"}</p></div>
                    <div><p className="text-muted-foreground">Inquiries</p><p className="font-medium">{listingInquiries.length}</p></div>
                  </div>
                  {listing.token && (
                    <div className="mt-4">
                      <p className="text-xs text-muted-foreground mb-1">Share Link</p>
                      <div className="flex items-center gap-2">
                        <code className="text-sm bg-muted px-2 py-1 rounded break-all">
                          {`${window.location.origin}/l/${listing.token}`}
                        </code>
                        <Button size="sm" variant="outline" onClick={() => {
                          navigator.clipboard.writeText(`${window.location.origin}/l/${listing.token}`);
                          toast({ title: "Link copied" });
                          shareListing(listing, "copy");
                        }}>Copy</Button>
                        {isLive && (
                          <Button size="sm" variant="outline" onClick={() => { window.open(`/l/${listing.token}`, "_blank"); shareListing(listing, "preview"); }}>
                            Preview
                          </Button>
                        )}
                        {isLive && (
                          <>
                            <Button size="sm" variant="outline" onClick={() => {
                              const target = window.prompt("Email this listing link to:", listing.contactEmail || "");
                              if (target === null) return;
                              const url = `${window.location.origin}/l/${listing.token}`;
                              window.location.href = `mailto:${encodeURIComponent(target || "")}?subject=${encodeURIComponent(listing.title || "Investment opportunity")}&body=${encodeURIComponent(`Check out this investment opportunity: ${url}`)}`;
                              shareListing(listing, "email", target || "");
                            }}>
                              Email
                            </Button>
                            <Button size="sm" variant="outline" onClick={() => {
                              const target = window.prompt("Send this listing link via SMS to:", listing.contactPhone || "");
                              if (target === null) return;
                              const url = `${window.location.origin}/l/${listing.token}`;
                              window.open(`sms:${encodeURIComponent(target || "")}?&body=${encodeURIComponent(`Check out this investment opportunity: ${url}`)}`);
                              shareListing(listing, "sms", target || "");
                            }}>
                              SMS
                            </Button>
                          </>
                        )}
                      </div>
                    </div>
                  )}
                  <div className="mt-4 flex flex-wrap items-center gap-2">
                    {!isLive && listing.status !== "archived" && (
                      <Button size="sm" onClick={() => handleListingStatus(listing.id, "published")}>
                        Publish
                      </Button>
                    )}
                    {isLive && (
                      <Button size="sm" variant="outline" onClick={() => handleListingStatus(listing.id, "paused")}>
                        Pause
                      </Button>
                    )}
                    {listing.status !== "archived" && (
                      <Button size="sm" variant="outline" onClick={() => handleListingStatus(listing.id, "archived")}>
                        Archive
                      </Button>
                    )}
                    <Button size="sm" variant="ghost" className="text-destructive" onClick={() => handleListingDelete(listing.id)}>
                      Delete
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {(inquiries || []).length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Mail className="h-5 w-5" />
              Buyer Inquiries ({inquiries.length})
            </CardTitle>
            <div className="flex flex-wrap gap-1.5 mt-2">
              {["all", ...INQUIRY_STATUS_OPTIONS].map((s) => {
                const count = s === "all" ? inquiries.length : inquiries.filter((i: any) => (i.status || "new") === s).length;
                return (
                  <Button
                    key={s}
                    size="sm"
                    variant={inquiryFilter === s ? "default" : "outline"}
                    className="text-xs capitalize"
                    onClick={() => setInquiryFilter(s)}
                  >
                    {s.replace("_", " ")} ({count})
                  </Button>
                );
              })}
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {inquiries
              .filter((i: any) => inquiryFilter === "all" || (i.status || "new") === inquiryFilter)
              .map((inquiry: any) => {
                const assignedName = teamUsers.find((u: any) => Number(u.id) === Number(inquiry.assignedToUserId))?.fullName || teamUsers.find((u: any) => Number(u.id) === Number(inquiry.assignedToUserId))?.email;
                return (
                  <div key={inquiry.id} className="border rounded-md p-4 space-y-3">
                    <div className="flex items-center justify-between flex-wrap gap-2">
                      <div>
                        <span className="font-medium">{inquiry.name}</span>
                        <span className="text-sm text-muted-foreground ml-2">({inquiry.buyerType})</span>
                        {assignedName && <span className="text-xs text-muted-foreground ml-2">→ {assignedName}</span>}
                      </div>
                      <Select value={inquiry.status || "new"} onValueChange={(v) => handleInquiryStatus(inquiry.id, v)}>
                        <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {INQUIRY_STATUS_OPTIONS.map((s) => (
                            <SelectItem key={s} value={s} className="capitalize">{s.replace("_", " ")}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="grid grid-cols-2 gap-4 text-sm">
                      {inquiry.email && <div><p className="text-muted-foreground">Email</p><p className="font-medium">{inquiry.email}</p></div>}
                      {inquiry.phone && <div><p className="text-muted-foreground">Phone</p><p className="font-medium">{inquiry.phone}</p></div>}
                      {inquiry.offerAmount && <div><p className="text-muted-foreground">Offer Amount</p><p className="font-medium text-green-600">${Number(inquiry.offerAmount).toLocaleString()}</p></div>}
                      {inquiry.company && <div><p className="text-muted-foreground">Company</p><p className="font-medium">{inquiry.company}</p></div>}
                    </div>
                    {inquiry.message && <div><p className="text-muted-foreground text-xs mb-1">Message</p><p className="text-sm">{inquiry.message}</p></div>}
                    {inquiry.proofOfFundsUrl && (
                      <div><a href={inquiry.proofOfFundsUrl} target="_blank" rel="noopener noreferrer" className="text-sm text-blue-600 hover:underline">View Proof of Funds</a></div>
                    )}
                    <div className="text-xs text-muted-foreground">Received: {new Date(inquiry.createdAt).toLocaleString()}</div>
                    <div className="flex flex-wrap items-center gap-2 border-t pt-3">
                      <Button size="sm" variant="outline" onClick={() => convertInquiry.mutate(inquiry.id)} disabled={convertInquiry.isPending}>
                        Convert to Buyer
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          const amount = window.prompt("Offer amount for this inquiry:", inquiry.offerAmount ? String(inquiry.offerAmount) : "");
                          if (amount === null) return;
                          const n = Number(amount);
                          if (!Number.isFinite(n) || n <= 0) return toast({ title: "Enter a valid offer amount", variant: "destructive" });
                          offerFromInquiry.mutate({ inquiryId: inquiry.id, amount: String(n) });
                        }}
                        disabled={offerFromInquiry.isPending}
                      >
                        Create Offer
                      </Button>
                      <Select
                        value={inquiry.assignedToUserId ? String(inquiry.assignedToUserId) : "unassigned"}
                        onValueChange={(v) => assignInquiry.mutate({ inquiryId: inquiry.id, userId: v === "unassigned" ? null : parseInt(v, 10) })}
                      >
                        <SelectTrigger className="w-44 h-8 text-xs"><SelectValue placeholder="Assign to…" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="unassigned">Unassigned</SelectItem>
                          {teamUsers.map((u: any) => (
                            <SelectItem key={u.id} value={String(u.id)}>
                              {u.fullName || u.email}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                );
              })}
            {inquiries.filter((i: any) => inquiryFilter === "all" || (i.status || "new") === inquiryFilter).length === 0 && (
              <div className="text-sm text-muted-foreground">No inquiries with status "{inquiryFilter.replace("_", " ")}".</div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
