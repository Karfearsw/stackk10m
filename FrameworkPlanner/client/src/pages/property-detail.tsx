import React from "react";
import { Layout } from "@/components/layout/Layout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { DealCalculator } from "@/components/deals/DealCalculator";
import { EntityTasksWidget } from "@/components/tasks/EntityTasksWidget";
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
  Lightbulb
} from "lucide-react";
import { Link, useLocation, useRoute } from "wouter";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import propertyImage from "@assets/generated_images/modern_suburban_house_exterior_for_real_estate_placeholder.png";
import interiorImage from "@assets/generated_images/interior_of_a_modern_living_room_for_real_estate_placeholder.png";
import { Spinner } from "@/components/ui/spinner";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, apiUpload } from "@/lib/queryClient";

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
  const num = (v: unknown) => (typeof v === "string" ? (Number.isFinite(parseFloat(v)) ? parseFloat(v) : 0) : typeof v === "number" ? (Number.isFinite(v) ? v : 0) : 0);

  const { data: skipTraceLatest } = useQuery<any>({
    queryKey: ["/api/opportunities", id, "skip-trace-latest"],
    enabled: !!id,
    queryFn: async () => {
      const res = await fetch(`/api/opportunities/${id}/skip-trace/latest`, { credentials: "include" });
      if (res.status === 404) return null;
      if (!res.ok) throw new Error("Failed to fetch skip trace");
      return res.json();
    },
  });

  const skipTraceMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/opportunities/${id}/skip-trace`, { method: "POST", credentials: "include" });
      if (res.status === 404) throw new Error("Skip trace is disabled");
      if (!res.ok) throw new Error("Skip trace failed");
      return res.json();
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["/api/opportunities", id] });
      await queryClient.invalidateQueries({ queryKey: ["/api/opportunities", id, "skip-trace-latest"] });
      toast({ title: "Skip trace completed" });
    },
    onError: (e: any) => {
      toast({ title: e?.message || "Skip trace failed", variant: "destructive" });
    },
  });

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
              <Badge variant="default" className="bg-accent text-accent-foreground hover:bg-accent/80">{property?.status ? property.status.replace("_", " ") : "—"}</Badge>
            </h1>
            <div className="flex items-center gap-2 text-muted-foreground">
              <MapPin className="h-4 w-4" />
              {property ? `${property.city || ""}, ${property.state || ""} ${property.zipCode || ""}` : ""}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={() => property?.id && setLocation(`/playground?propertyId=${property.id}`)} disabled={!property?.id}>
              <Lightbulb className="mr-2 h-4 w-4" />
              Underwrite Deal
            </Button>
            <Button variant="outline" onClick={() => property?.id && setLocation(`/calculator?propertyId=${property.id}`)} disabled={!property?.id}>
              <Calculator className="mr-2 h-4 w-4" />
              Run Comps
            </Button>
            <Button variant="outline" onClick={() => property?.id && setLocation(`/contracts?tab=create&propertyId=${property.id}`)} disabled={!property?.id}>
              <FileText className="mr-2 h-4 w-4" />
              Generate Offer
            </Button>
            <Button
              onClick={() => {
                if (!lead?.ownerPhone) return;
                setLocation(`/dialer?number=${encodeURIComponent(lead.ownerPhone)}`);
              }}
              disabled={!lead?.ownerPhone}
            >
              <Phone className="mr-2 h-4 w-4" />
              Call Owner
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
                        <Button variant="ghost" size="sm"><Phone className="h-4 w-4" /></Button>
                        <Button variant="ghost" size="sm"><Mail className="h-4 w-4" /></Button>
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
                    <div className="space-y-2">
                      <Button variant="secondary" className="w-full" disabled={skipTraceMutation.isPending} onClick={() => skipTraceMutation.mutate()}>
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
                  </CardContent>
                </Card>
              </TabsContent>
              
              <TabsContent value="financials" className="mt-6">
                <DealCalculator
                  initialValues={{
                    arv: num(property?.arv),
                    purchasePrice: num(property?.price),
                    repairCosts: num(property?.repairCost),
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
                        <div className="border rounded-md overflow-hidden">
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
                      )}
                    </div>

                    <div className="space-y-2">
                      <div className="text-sm font-medium">Rental Comps</div>
                      {(internalComps?.rentalComps || []).length === 0 ? (
                        <div className="text-sm text-muted-foreground">No rental comps yet.</div>
                      ) : (
                        <div className="border rounded-md overflow-hidden">
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
                      <div className="border rounded-md overflow-hidden">
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
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => toast({ title: "Notify Buyer is not implemented yet" })}
                                >
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
                    )}
                  </CardContent>
                </Card>
              </TabsContent>
              
              <TabsContent value="activity">
                <Card>
                  <CardContent className="pt-6">
                    <ActivitySection propertyId={property?.id} leadId={lead?.id} />
                  </CardContent>
                </Card>
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
                    setLocation(`/playground?propertyId=${property.id}`);
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
                    setLocation(`/dialer?number=${encodeURIComponent(lead.ownerPhone)}`);
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

            {property?.id ? <EntityTasksWidget entityType="opportunity" entityId={property.id} /> : null}
          </div>
        </div>
      </div>
      {isLoading && (
        <div className="absolute inset-0 flex items-center justify-center">
          <Spinner />
        </div>
      )}
      {error && (
        <div className="p-4 text-red-600">Failed to load opportunity.</div>
      )}
    </Layout>
  );
}

function OpportunityEditDialog({ property }: { property?: any }) {
  const queryClient = useQueryClient();
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

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;
    Array.from(files).forEach((file) => {
      const reader = new FileReader();
      reader.onload = (event) => {
        const base64 = event.target?.result as string;
        setFormData((prev) => ({ ...prev, images: [...prev.images, base64] }));
      };
      reader.readAsDataURL(file);
    });
  };

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
              images: formData.images,
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
  const [activeBuyerId, setActiveBuyerId] = React.useState<string>("");
  const [offerForm, setOfferForm] = React.useState({ buyerName: "", sellerName: "", offerAmount: "", status: "pending", notes: "" });
  const [commForm, setCommForm] = React.useState({ type: "call", subject: "", content: "", direction: "outbound" });

  const { data: offers = [], isLoading: offersLoading } = useQuery<any[]>({
    queryKey: ["/api/offers", propertyId],
    queryFn: async () => {
      const res = await fetch(`/api/offers?propertyId=${propertyId}`);
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
      const res = await fetch(`/api/offers`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          propertyId,
          userId,
          buyerName: offerForm.buyerName || null,
          sellerName: offerForm.sellerName || null,
          offerAmount: offerForm.offerAmount ? parseFloat(offerForm.offerAmount) : 0,
          status: offerForm.status,
          notes: offerForm.notes || null,
        }),
      });
      if (!res.ok) throw new Error("Failed to create offer");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/offers", propertyId] });
      setOfferForm({ buyerName: "", sellerName: "", offerAmount: "", status: "pending", notes: "" });
    },
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
          <CardTitle className="text-lg">Offers</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>Buyer Name</Label>
              <Input value={offerForm.buyerName} onChange={(e) => setOfferForm((p) => ({ ...p, buyerName: e.target.value }))} />
            </div>
            <div className="space-y-1">
              <Label>Seller Name</Label>
              <Input value={offerForm.sellerName} onChange={(e) => setOfferForm((p) => ({ ...p, sellerName: e.target.value }))} />
            </div>
            <div className="space-y-1">
              <Label>Offer Amount</Label>
              <Input type="number" value={offerForm.offerAmount} onChange={(e) => setOfferForm((p) => ({ ...p, offerAmount: e.target.value }))} />
            </div>
            <div className="space-y-1">
              <Label>Status</Label>
              <Select value={offerForm.status} onValueChange={(v) => setOfferForm((p) => ({ ...p, status: v }))}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="pending">Pending</SelectItem>
                  <SelectItem value="sent">Sent</SelectItem>
                  <SelectItem value="accepted">Accepted</SelectItem>
                  <SelectItem value="rejected">Rejected</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1 col-span-2">
              <Label>Notes</Label>
              <Textarea value={offerForm.notes} onChange={(e) => setOfferForm((p) => ({ ...p, notes: e.target.value }))} />
            </div>
            <div className="col-span-2 flex justify-end">
              <Button onClick={() => createOffer.mutate()} disabled={!userId || !offerForm.offerAmount || createOffer.isPending}>
                Create Offer
              </Button>
            </div>
          </div>
          <Separator />
          <ScrollArea className="h-56 border rounded-md p-2">
            {offersLoading ? (
              <div className="py-6 text-center text-muted-foreground">Loading offers…</div>
            ) : offers.length ? (
              <div className="space-y-2">
                {offers.map((o: any) => (
                  <div key={o.id} className="flex items-start justify-between border rounded-md p-3">
                    <div>
                      <div className="text-sm font-medium">Offer #{o.id}</div>
                      <div className="text-xs text-muted-foreground">
                        {o.status} · ${o.offerAmount ? parseInt(String(o.offerAmount), 10).toLocaleString() : "—"}
                      </div>
                      {o.buyerName ? <div className="text-xs text-muted-foreground">Buyer: {o.buyerName}</div> : null}
                    </div>
                    <Badge variant="outline">{o.status}</Badge>
                  </div>
                ))}
              </div>
            ) : (
              <div className="py-6 text-center text-muted-foreground">No offers yet.</div>
            )}
          </ScrollArea>
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
