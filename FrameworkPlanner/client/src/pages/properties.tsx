import { useEffect, useMemo, useState } from "react";
import { Layout } from "@/components/layout/Layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Plus, Filter, Search, Home, Upload, X, ChevronLeft, ChevronRight, Trash2, Edit, ImageIcon } from "lucide-react";
import { useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { PipelineBoard } from "@/components/pipeline/PipelineBoard";
import { OpportunityPipelineCard } from "@/components/pipeline/OpportunityPipelineCard";
import { EntityActivity } from "@/components/activity/EntityActivity";
import { CrmImportExportDialog } from "@/components/crm/CrmImportExportDialog";

interface Property {
  id: number;
  address: string;
  city: string;
  state: string;
  zipCode: string;
  beds?: number;
  baths?: number;
  sqft?: number;
  price?: string;
  status?: string;
  notes?: string | null;
  apn?: string;
  yearBuilt?: number;
  lotSize?: string;
  occupancy?: string;
  images?: string[];
  arv?: string;
  repairCost?: string;
  assignedTo?: number;
}

function PropertyImageCarousel({ images }: { images: string[] }) {
  const [currentIndex, setCurrentIndex] = useState(0);

  if (!images || images.length === 0) {
    return (
      <div className="h-full w-full flex items-center justify-center bg-secondary">
        <Home className="h-8 w-8 text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="relative h-full w-full group">
      <img
        src={images[currentIndex]}
        alt={`Property ${currentIndex + 1}`}
        className="h-full w-full object-cover"
      />
      {images.length > 1 && (
        <>
          <button
            onClick={(e) => {
              e.stopPropagation();
              setCurrentIndex((prev) => (prev === 0 ? images.length - 1 : prev - 1));
            }}
            className="absolute left-2 top-1/2 -translate-y-1/2 p-1 bg-black/50 rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
          >
            <ChevronLeft className="h-4 w-4 text-white" />
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              setCurrentIndex((prev) => (prev === images.length - 1 ? 0 : prev + 1));
            }}
            className="absolute right-2 top-1/2 -translate-y-1/2 p-1 bg-black/50 rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
          >
            <ChevronRight className="h-4 w-4 text-white" />
          </button>
          <div className="absolute bottom-2 left-1/2 -translate-x-1/2 flex gap-1">
            {images.map((_, idx) => (
              <div
                key={idx}
                className={`h-1.5 w-1.5 rounded-full ${idx === currentIndex ? 'bg-white' : 'bg-white/50'}`}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function PropertyForm({ 
  property, 
  statusOptions,
  onClose, 
  onSubmit 
}: { 
  property?: Property; 
  statusOptions: Array<{ value: string; label: string }>;
  onClose: () => void; 
  onSubmit: (data: any) => void;
}) {
  const [formData, setFormData] = useState({
    address: property?.address || "",
    city: property?.city || "",
    state: property?.state || "",
    zipCode: property?.zipCode || "",
    beds: property?.beds?.toString() || "",
    baths: property?.baths?.toString() || "",
    sqft: property?.sqft?.toString() || "",
    price: property?.price?.toString() || "",
    status: property?.status || "active",
    apn: property?.apn || "",
    yearBuilt: property?.yearBuilt?.toString() || "",
    lotSize: property?.lotSize || "",
    occupancy: property?.occupancy || "unknown",
    arv: property?.arv?.toString() || "",
    repairCost: property?.repairCost?.toString() || "",
    images: property?.images || [] as string[],
  });
  const [addressSearch, setAddressSearch] = useState("");
  const [addressSuggestions, setAddressSuggestions] = useState<any[]>([]);
  const [addressSuggestOpen, setAddressSuggestOpen] = useState(false);

  useEffect(() => {
    const t = setTimeout(async () => {
      const q = addressSearch.trim();
      if (q.length < 2) {
        setAddressSuggestions([]);
        return;
      }
      try {
        const res = await fetch(`/api/address/suggest?q=${encodeURIComponent(q)}`);
        if (!res.ok) {
          setAddressSuggestions([]);
          return;
        }
        const json = await res.json();
        setAddressSuggestions(Array.isArray(json?.suggestions) ? json.suggestions : []);
      } catch {
        setAddressSuggestions([]);
      }
    }, 250);
    return () => clearTimeout(t);
  }, [addressSearch]);

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;

    Array.from(files).forEach((file) => {
      const reader = new FileReader();
      reader.onload = (event) => {
        const base64 = event.target?.result as string;
        setFormData((prev) => ({
          ...prev,
          images: [...prev.images, base64],
        }));
      };
      reader.readAsDataURL(file);
    });
  };

  const removeImage = (index: number) => {
    setFormData((prev) => ({
      ...prev,
      images: prev.images.filter((_, i) => i !== index),
    }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit({
      address: formData.address,
      city: formData.city,
      state: formData.state,
      zipCode: formData.zipCode,
      beds: formData.beds ? parseInt(formData.beds) : null,
      baths: formData.baths ? parseInt(formData.baths) : null,
      sqft: formData.sqft ? parseInt(formData.sqft) : null,
      price: formData.price || null,
      status: formData.status,
      apn: formData.apn || null,
      yearBuilt: formData.yearBuilt ? parseInt(formData.yearBuilt) : null,
      lotSize: formData.lotSize || null,
      occupancy: formData.occupancy || null,
      arv: formData.arv || null,
      repairCost: formData.repairCost || null,
      images: formData.images,
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6 max-h-[70vh] overflow-y-auto custom-scrollbar pr-2">
      <div className="space-y-4">
        <h3 className="font-semibold text-lg flex items-center gap-2">
          <ImageIcon className="h-5 w-5" />
          Property Images
        </h3>
        
        <div className="grid grid-cols-3 gap-3">
          {formData.images.map((img, index) => (
            <div key={index} className="relative group aspect-video">
              <img
                src={img}
                alt={`Property ${index + 1}`}
                className="w-full h-full object-cover rounded-lg border"
              />
              <button
                type="button"
                onClick={() => removeImage(index)}
                className="absolute top-1 right-1 p-1 bg-destructive text-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          ))}
          
          <label className="cursor-pointer aspect-video">
            <input
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={handleImageUpload}
              data-testid="input-property-images"
            />
            <div className="w-full h-full border-2 border-dashed border-muted-foreground/30 rounded-lg flex flex-col items-center justify-center gap-1 hover:border-primary hover:bg-accent/10 transition-colors">
              <Upload className="h-5 w-5 text-muted-foreground" />
              <span className="text-xs text-muted-foreground">Add Images</span>
            </div>
          </label>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="col-span-2 space-y-2">
          <Label htmlFor="addressSearch">Address Search</Label>
          <Input
            id="addressSearch"
            value={addressSearch}
            onChange={(e) => {
              setAddressSearch(e.target.value);
              setAddressSuggestOpen(true);
            }}
            onFocus={() => setAddressSuggestOpen(true)}
            placeholder="Start typing an address…"
          />
          {addressSuggestOpen && addressSuggestions.length > 0 && (
            <div className="border rounded-md bg-background max-h-40 overflow-y-auto">
              {addressSuggestions.map((s: any, idx: number) => (
                <button
                  key={s.placeId || `${s.label}-${idx}`}
                  type="button"
                  className="w-full text-left px-3 py-2 hover:bg-accent text-sm"
                  onClick={() => {
                    setFormData((prev) => ({
                      ...prev,
                      address: s.address || prev.address,
                      city: s.city || prev.city,
                      state: s.state || prev.state,
                      zipCode: s.zipCode || prev.zipCode,
                    }));
                    setAddressSearch(s.label || "");
                    setAddressSuggestions([]);
                    setAddressSuggestOpen(false);
                  }}
                >
                  {s.label || s.address}
                </button>
              ))}
            </div>
          )}
        </div>
        <div className="col-span-2 space-y-2">
          <Label htmlFor="address">Address *</Label>
          <Input
            id="address"
            value={formData.address}
            onChange={(e) => setFormData({ ...formData, address: e.target.value })}
            required
            data-testid="input-property-address"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="city">City *</Label>
          <Input
            id="city"
            value={formData.city}
            onChange={(e) => setFormData({ ...formData, city: e.target.value })}
            required
            data-testid="input-property-city"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="state">State *</Label>
          <Input
            id="state"
            value={formData.state}
            onChange={(e) => setFormData({ ...formData, state: e.target.value.toUpperCase().slice(0, 2) })}
            maxLength={2}
            required
            data-testid="input-property-state"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="zipCode">Zip Code *</Label>
          <Input
            id="zipCode"
            value={formData.zipCode}
            onChange={(e) => setFormData({ ...formData, zipCode: e.target.value })}
            required
            data-testid="input-property-zip"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="status">Status</Label>
          <Select value={formData.status} onValueChange={(value) => setFormData({ ...formData, status: value })}>
            <SelectTrigger data-testid="select-property-status">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {statusOptions.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label htmlFor="price">Asking Price ($)</Label>
          <Input
            id="price"
            type="number"
            value={formData.price}
            onChange={(e) => setFormData({ ...formData, price: e.target.value })}
            data-testid="input-property-price"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="arv">ARV ($)</Label>
          <Input
            id="arv"
            type="number"
            value={formData.arv}
            onChange={(e) => setFormData({ ...formData, arv: e.target.value })}
            placeholder="After Repair Value"
            data-testid="input-property-arv"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="repairCost">Repair Cost ($)</Label>
          <Input
            id="repairCost"
            type="number"
            value={formData.repairCost}
            onChange={(e) => setFormData({ ...formData, repairCost: e.target.value })}
            data-testid="input-property-repair"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="beds">Beds</Label>
          <Input
            id="beds"
            type="number"
            value={formData.beds}
            onChange={(e) => setFormData({ ...formData, beds: e.target.value })}
            data-testid="input-property-beds"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="baths">Baths</Label>
          <Input
            id="baths"
            type="number"
            value={formData.baths}
            onChange={(e) => setFormData({ ...formData, baths: e.target.value })}
            data-testid="input-property-baths"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="sqft">Square Feet</Label>
          <Input
            id="sqft"
            type="number"
            value={formData.sqft}
            onChange={(e) => setFormData({ ...formData, sqft: e.target.value })}
            data-testid="input-property-sqft"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="yearBuilt">Year Built</Label>
          <Input
            id="yearBuilt"
            type="number"
            value={formData.yearBuilt}
            onChange={(e) => setFormData({ ...formData, yearBuilt: e.target.value })}
            data-testid="input-property-year"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="lotSize">Lot Size</Label>
          <Input
            id="lotSize"
            value={formData.lotSize}
            onChange={(e) => setFormData({ ...formData, lotSize: e.target.value })}
            placeholder="e.g., 0.25 acres"
            data-testid="input-property-lot"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="apn">APN</Label>
          <Input
            id="apn"
            value={formData.apn}
            onChange={(e) => setFormData({ ...formData, apn: e.target.value })}
            placeholder="Assessor Parcel Number"
            data-testid="input-property-apn"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="occupancy">Occupancy</Label>
          <Select value={formData.occupancy} onValueChange={(value) => setFormData({ ...formData, occupancy: value })}>
            <SelectTrigger data-testid="select-property-occupancy">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="unknown">Unknown</SelectItem>
              <SelectItem value="owner_occupied">Owner Occupied</SelectItem>
              <SelectItem value="tenant_occupied">Tenant Occupied</SelectItem>
              <SelectItem value="vacant">Vacant</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="flex justify-end gap-2 pt-4 border-t">
        <Button type="button" variant="outline" onClick={onClose} data-testid="button-cancel-property">
          Cancel
        </Button>
        <Button type="submit" data-testid="button-save-property">
          {property ? "Update Property" : "Add Property"}
        </Button>
      </div>
    </form>
  );
}

export default function Opportunities() {
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingProperty, setEditingProperty] = useState<Property | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [noteOpportunity, setNoteOpportunity] = useState<Property | null>(null);
  const [noteText, setNoteText] = useState("");
  const [isNoteDialogOpen, setIsNoteDialogOpen] = useState(false);
  const [activityPropertyId, setActivityPropertyId] = useState<number | null>(null);
  const [isActivityDialogOpen, setIsActivityDialogOpen] = useState(false);

  const { data: properties = [], isLoading } = useQuery<Property[]>({
    queryKey: ["/api/opportunities"],
    queryFn: async () => {
      const res = await fetch("/api/opportunities");
      if (!res.ok) throw new Error("Failed to fetch opportunities");
      return res.json();
    }
  });

  const { data: opportunityPipelineConfig } = useQuery({
    queryKey: ["/api/pipeline-config", "opportunity"],
    queryFn: async () => {
      const res = await fetch(`/api/pipeline-config?entityType=opportunity`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch pipeline config");
      return res.json();
    },
  });

  const pipelineColumns = useMemo(() => {
    const cols = (opportunityPipelineConfig as any)?.columns;
    if (Array.isArray(cols) && cols.length) {
      return cols.map((c: any) => ({ value: String(c.value || ""), label: String(c.label || "") })).filter((c: any) => c.value && c.label);
    }
    return [
      { value: "active", label: "Active" },
      { value: "negotiation", label: "Negotiation" },
      { value: "under_contract", label: "Under Contract" },
      { value: "pending", label: "Pending" },
      { value: "sold", label: "Sold" },
      { value: "withdrawn", label: "Withdrawn" },
    ];
  }, [opportunityPipelineConfig]);

  const createPropertyMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await fetch("/api/opportunities", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error("Failed to create opportunity");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/opportunities"] });
      queryClient.invalidateQueries({ queryKey: ["team-activity"] });
      setIsDialogOpen(false);
      toast.success("Opportunity added successfully!");
    },
    onError: () => {
      toast.error("Failed to add opportunity");
    },
  });

  const updatePropertyMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: any }) => {
      const res = await fetch(`/api/opportunities/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error("Failed to update opportunity");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/opportunities"] });
      queryClient.invalidateQueries({ queryKey: ["team-activity"] });
      setIsDialogOpen(false);
      setEditingProperty(null);
      toast.success("Opportunity updated successfully!");
    },
    onError: () => {
      toast.error("Failed to update opportunity");
    },
  });

  const quickUpdatePropertyMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: any }) => {
      const res = await fetch(`/api/opportunities/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error("Failed to update opportunity");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/opportunities"] });
      toast.success("Opportunity updated");
    },
    onError: () => {
      toast.error("Failed to update opportunity");
    },
  });

  const deletePropertyMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(`/api/opportunities/${id}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("Failed to delete opportunity");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/opportunities"] });
      queryClient.invalidateQueries({ queryKey: ["team-activity"] });
      toast.success("Opportunity deleted");
    },
    onError: () => {
      toast.error("Failed to delete opportunity");
    },
  });

  const handleSubmit = (data: any) => {
    if (editingProperty) {
      updatePropertyMutation.mutate({ id: editingProperty.id, data });
    } else {
      createPropertyMutation.mutate(data);
    }
  };

  const openEditDialog = (property: Property) => {
    setEditingProperty(property);
    setIsDialogOpen(true);
  };

  const openNewDialog = () => {
    setEditingProperty(null);
    setIsDialogOpen(true);
  };

  const filteredProperties = properties.filter((prop) => {
    const matchesSearch = 
      prop.address.toLowerCase().includes(searchQuery.toLowerCase()) ||
      prop.city.toLowerCase().includes(searchQuery.toLowerCase()) ||
      prop.state.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesStatus = statusFilter === "all" || prop.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const getStatusColor = (status: string) => {
    switch (status) {
      case "active": return "bg-green-600 text-white";
      case "under_contract": return "bg-blue-600 text-white";
      case "pending": return "bg-yellow-600 text-white";
      case "sold": return "bg-purple-600 text-white";
      case "withdrawn": return "bg-gray-600 text-white";
      default: return "bg-primary text-primary-foreground";
    }
  };

  if (isLoading) {
    return (
      <Layout>
        <div className="text-center py-12">Loading opportunities...</div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-3xl font-bold tracking-tight">Opportunities</h1>
          <p className="text-muted-foreground">Browse and manage all opportunities in your pipeline.</p>
        </div>
        <div className="flex items-center gap-2">
          <CrmImportExportDialog entityType="opportunity" />
          <div className="relative hidden md:block">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input 
              placeholder="Search opportunities..." 
              className="w-[200px] pl-9"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              data-testid="input-search-opportunities"
            />
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[140px]" data-testid="select-filter-status">
              <Filter className="mr-2 h-4 w-4" />
              <SelectValue placeholder="Filter" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              {pipelineColumns.map((c) => (
                <SelectItem key={c.value} value={c.value}>
                  {c.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Dialog open={isDialogOpen} onOpenChange={(open) => {
            setIsDialogOpen(open);
            if (!open) setEditingProperty(null);
          }}>
            <DialogTrigger asChild>
              <Button size="sm" onClick={openNewDialog} data-testid="button-add-opportunity">
                <Plus className="mr-2 h-4 w-4" /> Add Opportunity
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl">
              <DialogHeader>
                <DialogTitle>{editingProperty ? "Edit Opportunity" : "Add New Opportunity"}</DialogTitle>
              </DialogHeader>
              <PropertyForm
                property={editingProperty || undefined}
                statusOptions={pipelineColumns}
                onClose={() => {
                  setIsDialogOpen(false);
                  setEditingProperty(null);
                }}
                onSubmit={handleSubmit}
              />
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
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {filteredProperties.map((prop) => (
              <Card key={prop.id} className="overflow-hidden hover:shadow-lg transition-shadow group" data-testid={`card-opportunity-${prop.id}`}>
                <div className="relative h-40 bg-muted overflow-hidden">
                  <PropertyImageCarousel images={prop.images || []} />
                  <div className="absolute top-2 right-2">
                    <Badge className={getStatusColor(prop.status || "active")}>
                      {(prop.status || "active").replace("_", " ")}
                    </Badge>
                  </div>
                  <div className="absolute top-2 left-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <Button
                      size="icon"
                      variant="secondary"
                      className="h-7 w-7"
                      onClick={(e) => {
                        e.stopPropagation();
                        openEditDialog(prop);
                      }}
                      data-testid={`button-edit-opportunity-${prop.id}`}
                    >
                      <Edit className="h-3 w-3" />
                    </Button>
                    <Button
                      size="icon"
                      variant="destructive"
                      className="h-7 w-7"
                      onClick={(e) => {
                        e.stopPropagation();
                        if (confirm("Delete this opportunity?")) {
                          deletePropertyMutation.mutate(prop.id);
                        }
                      }}
                      data-testid={`button-delete-opportunity-${prop.id}`}
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                  {prop.images && prop.images.length > 0 && (
                    <div className="absolute bottom-2 right-2 bg-black/60 text-white text-xs px-2 py-0.5 rounded">
                      {prop.images.length} photo{prop.images.length > 1 ? "s" : ""}
                    </div>
                  )}
                </div>
                <CardHeader className="pb-2">
                  <CardTitle className="text-lg line-clamp-1">{prop.address}</CardTitle>
                  <p className="text-sm text-muted-foreground">{prop.city}, {prop.state} {prop.zipCode}</p>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex justify-between items-center">
                    <div className="text-2xl font-bold text-primary">
                      ${prop.price ? parseInt(prop.price).toLocaleString() : "—"}
                    </div>
                    {prop.arv && (
                      <div className="text-right">
                        <p className="text-xs text-muted-foreground">ARV</p>
                        <p className="text-sm font-semibold text-green-600">
                          ${parseInt(prop.arv).toLocaleString()}
                        </p>
                      </div>
                    )}
                  </div>
                  <div className="grid grid-cols-3 gap-2 text-sm">
                    <div>
                      <p className="text-muted-foreground">Beds</p>
                      <p className="font-medium">{prop.beds || "—"}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Baths</p>
                      <p className="font-medium">{prop.baths || "—"}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">SqFt</p>
                      <p className="font-medium">{prop.sqft ? prop.sqft.toLocaleString() : "—"}</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 mb-2 overflow-x-auto pb-1">
                    {["active", "negotiation", "under_contract", "closed"].map((stage) => (
                      <div
                        key={stage}
                        className={`h-1.5 flex-1 rounded-full ${
                          (prop.status === stage)
                            ? "bg-primary"
                            : (["active", "negotiation", "under_contract", "closed"].indexOf(prop.status || "active") > ["active", "negotiation", "under_contract", "closed"].indexOf(stage))
                              ? "bg-primary/40"
                              : "bg-secondary"
                        }`}
                      />
                    ))}
                  </div>

                  {prop.repairCost && (
                    <div className="text-sm">
                      <span className="text-muted-foreground">Repairs: </span>
                      <span className="font-medium text-orange-600">${parseInt(prop.repairCost).toLocaleString()}</span>
                    </div>
                  )}
                  <Button
                    className="w-full bg-primary hover:bg-primary/90 text-white"
                    onClick={() => setLocation(`/opportunities/${prop.id}`)}
                    data-testid={`button-view-opportunity-${prop.id}`}
                  >
                    View Details
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>

          {filteredProperties.length === 0 && (
            <div className="text-center py-12">
              <Home className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <h3 className="text-lg font-semibold mb-2">No opportunities found</h3>
              <p className="text-muted-foreground mb-4">
                {searchQuery || statusFilter !== "all"
                  ? "Try adjusting your search or filter criteria."
                  : "Get started by adding your first opportunity."}
              </p>
              {!searchQuery && statusFilter === "all" && (
                <Button onClick={openNewDialog} data-testid="button-add-first-opportunity">
                  <Plus className="mr-2 h-4 w-4" /> Add Opportunity
                </Button>
              )}
            </div>
          )}
        </TabsContent>

        <TabsContent value="pipeline" className="mt-4">
          <PipelineBoard
            columns={pipelineColumns}
            items={filteredProperties}
            getId={(p: any) => p.id}
            getStatus={(p: any) => p.status}
            emptyText="No opportunities"
            renderItem={(p: any) => (
              <OpportunityPipelineCard
                opportunity={p}
                columns={pipelineColumns}
                onUpdateStatus={(id, status) => quickUpdatePropertyMutation.mutate({ id, data: { status } })}
                onAddNote={(op) => {
                  setNoteOpportunity(op as any);
                  setNoteText("");
                  setIsNoteDialogOpen(true);
                }}
                onOpenActivity={(op) => {
                  setActivityPropertyId((op as any).id);
                  setIsActivityDialogOpen(true);
                }}
              />
            )}
          />
        </TabsContent>
      </Tabs>

      <Dialog open={isNoteDialogOpen} onOpenChange={setIsNoteDialogOpen}>
        <DialogContent className="sm:max-w-[520px]">
          <DialogHeader>
            <DialogTitle>Add Note</DialogTitle>
            <DialogDescription>{noteOpportunity?.address ? `Opportunity: ${noteOpportunity.address}` : ""}</DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="opp-note-text">Note</Label>
            <Textarea id="opp-note-text" value={noteText} onChange={(e) => setNoteText(e.target.value)} placeholder="Type a note…" />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsNoteDialogOpen(false)}>Cancel</Button>
            <Button
              className="bg-primary hover:bg-primary/90 text-white"
              disabled={!noteOpportunity || !noteText.trim() || quickUpdatePropertyMutation.isPending}
              onClick={async () => {
                if (!noteOpportunity) return;
                const existing = String(noteOpportunity.notes || "").trim();
                const stamped = `[${new Date().toLocaleString()}] ${noteText.trim()}`;
                const notes = existing ? `${existing}\n\n${stamped}` : stamped;
                await quickUpdatePropertyMutation.mutateAsync({ id: noteOpportunity.id, data: { notes } });
                setIsNoteDialogOpen(false);
                setNoteOpportunity(null);
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
          {activityPropertyId ? <EntityActivity propertyId={activityPropertyId} /> : null}
        </DialogContent>
      </Dialog>
    </Layout>
  );
}
