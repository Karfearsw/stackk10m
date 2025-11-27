import { Layout } from "@/components/layout/Layout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { 
  Users, 
  Plus, 
  Search, 
  Phone, 
  Mail, 
  Building2, 
  DollarSign, 
  Star, 
  MessageSquare,
  Trash2,
  Edit,
  CheckCircle,
  XCircle,
  TrendingUp,
  Calendar,
  Send
} from "lucide-react";
import { useState } from "react";
import { apiRequest } from "@/lib/queryClient";

interface Buyer {
  id: number;
  name: string;
  company: string | null;
  email: string | null;
  phone: string | null;
  preferredPropertyTypes: string[] | null;
  preferredAreas: string[] | null;
  minBudget: string | null;
  maxBudget: string | null;
  dealsPerMonth: number | null;
  proofOfFunds: boolean | null;
  proofOfFundsVerifiedAt: string | null;
  proofOfFundsNotes: string | null;
  isVip: boolean | null;
  status: string | null;
  totalDeals: number | null;
  totalRevenue: string | null;
  notes: string | null;
  tags: string[] | null;
  lastContactDate: string | null;
  createdAt: string;
}

interface BuyerCommunication {
  id: number;
  buyerId: number;
  userId: number;
  type: string;
  subject: string | null;
  content: string | null;
  direction: string | null;
  createdAt: string;
}

const propertyTypeOptions = [
  "Single Family",
  "Multi-Family",
  "Land",
  "Commercial",
  "Industrial",
  "Mixed Use",
  "Mobile Homes",
  "Condos/Townhomes"
];

export default function Buyers() {
  const { toast } = useToast();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedBuyer, setSelectedBuyer] = useState<Buyer | null>(null);
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [commType, setCommType] = useState("call");
  const [commSubject, setCommSubject] = useState("");
  const [commContent, setCommContent] = useState("");

  const [formData, setFormData] = useState({
    name: "",
    company: "",
    email: "",
    phone: "",
    preferredPropertyTypes: [] as string[],
    preferredAreas: "",
    minBudget: "",
    maxBudget: "",
    dealsPerMonth: "",
    proofOfFunds: false,
    proofOfFundsNotes: "",
    isVip: false,
    notes: "",
    tags: ""
  });

  const { data: buyers = [], isLoading } = useQuery<Buyer[]>({
    queryKey: ["/api/buyers"],
  });

  const { data: communications = [] } = useQuery<BuyerCommunication[]>({
    queryKey: [`/api/buyers/${selectedBuyer?.id}/communications`],
    enabled: !!selectedBuyer,
  });

  const createBuyerMutation = useMutation({
    mutationFn: async (data: any) => {
      return apiRequest("POST", "/api/buyers", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/buyers"] });
      setIsAddDialogOpen(false);
      resetForm();
      toast({ title: "Buyer added successfully" });
    },
    onError: (error: any) => {
      toast({ title: "Error adding buyer", description: error.message, variant: "destructive" });
    }
  });

  const updateBuyerMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: any }) => {
      return apiRequest("PATCH", `/api/buyers/${id}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/buyers"] });
      setIsEditDialogOpen(false);
      setSelectedBuyer(null);
      resetForm();
      toast({ title: "Buyer updated successfully" });
    },
    onError: (error: any) => {
      toast({ title: "Error updating buyer", description: error.message, variant: "destructive" });
    }
  });

  const deleteBuyerMutation = useMutation({
    mutationFn: async (id: number) => {
      return apiRequest("DELETE", `/api/buyers/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/buyers"] });
      setSelectedBuyer(null);
      toast({ title: "Buyer deleted" });
    },
    onError: (error: any) => {
      toast({ title: "Error deleting buyer", description: error.message, variant: "destructive" });
    }
  });

  const addCommunicationMutation = useMutation({
    mutationFn: async (data: any) => {
      return apiRequest("POST", `/api/buyers/${selectedBuyer?.id}/communications`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/buyers/${selectedBuyer?.id}/communications`] });
      setCommType("call");
      setCommSubject("");
      setCommContent("");
      toast({ title: "Communication logged" });
    },
    onError: (error: any) => {
      toast({ title: "Error logging communication", description: error.message, variant: "destructive" });
    }
  });

  const resetForm = () => {
    setFormData({
      name: "",
      company: "",
      email: "",
      phone: "",
      preferredPropertyTypes: [],
      preferredAreas: "",
      minBudget: "",
      maxBudget: "",
      dealsPerMonth: "",
      proofOfFunds: false,
      proofOfFundsNotes: "",
      isVip: false,
      notes: "",
      tags: ""
    });
  };

  const handleEditClick = (buyer: Buyer) => {
    setFormData({
      name: buyer.name,
      company: buyer.company || "",
      email: buyer.email || "",
      phone: buyer.phone || "",
      preferredPropertyTypes: buyer.preferredPropertyTypes || [],
      preferredAreas: buyer.preferredAreas?.join(", ") || "",
      minBudget: buyer.minBudget || "",
      maxBudget: buyer.maxBudget || "",
      dealsPerMonth: buyer.dealsPerMonth?.toString() || "",
      proofOfFunds: buyer.proofOfFunds || false,
      proofOfFundsNotes: buyer.proofOfFundsNotes || "",
      isVip: buyer.isVip || false,
      notes: buyer.notes || "",
      tags: buyer.tags?.join(", ") || ""
    });
    setSelectedBuyer(buyer);
    setIsEditDialogOpen(true);
  };

  const handleSubmit = (isEdit: boolean) => {
    const buyerData: any = {
      name: formData.name,
      company: formData.company || null,
      email: formData.email || null,
      phone: formData.phone || null,
      preferredPropertyTypes: formData.preferredPropertyTypes.length > 0 ? formData.preferredPropertyTypes : null,
      preferredAreas: formData.preferredAreas ? formData.preferredAreas.split(",").map(s => s.trim()) : null,
      minBudget: formData.minBudget || null,
      maxBudget: formData.maxBudget || null,
      dealsPerMonth: formData.dealsPerMonth ? parseInt(formData.dealsPerMonth) : null,
      proofOfFunds: formData.proofOfFunds,
      isVip: formData.isVip,
      notes: formData.notes || null,
      tags: formData.tags ? formData.tags.split(",").map(s => s.trim()) : null
    };
    
    if (formData.proofOfFunds) {
      buyerData.proofOfFundsNotes = formData.proofOfFundsNotes || null;
      if (!isEdit || (isEdit && selectedBuyer && !selectedBuyer.proofOfFundsVerifiedAt)) {
        buyerData.proofOfFundsVerifiedAt = new Date().toISOString();
      }
    } else {
      buyerData.proofOfFundsNotes = null;
      buyerData.proofOfFundsVerifiedAt = null;
    }

    if (isEdit && selectedBuyer) {
      updateBuyerMutation.mutate({ id: selectedBuyer.id, data: buyerData });
    } else {
      createBuyerMutation.mutate(buyerData);
    }
  };

  const handleLogCommunication = () => {
    if (!selectedBuyer || !user) return;
    addCommunicationMutation.mutate({
      userId: user.id,
      type: commType,
      subject: commSubject || null,
      content: commContent || null,
      direction: "outbound"
    });
  };

  const filteredBuyers = buyers.filter(buyer => 
    buyer.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    buyer.company?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    buyer.email?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const vipBuyers = filteredBuyers.filter(b => b.isVip);
  const activeBuyers = filteredBuyers.filter(b => b.status === "active");

  const formatCurrency = (value: string | null) => {
    if (!value) return "-";
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(parseFloat(value));
  };

  const BuyerForm = ({ isEdit = false }: { isEdit?: boolean }) => (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label>Name *</Label>
          <Input
            value={formData.name}
            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            placeholder="John Smith"
            data-testid="input-buyer-name"
          />
        </div>
        <div>
          <Label>Company</Label>
          <Input
            value={formData.company}
            onChange={(e) => setFormData({ ...formData, company: e.target.value })}
            placeholder="ABC Investments LLC"
            data-testid="input-buyer-company"
          />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label>Email</Label>
          <Input
            type="email"
            value={formData.email}
            onChange={(e) => setFormData({ ...formData, email: e.target.value })}
            placeholder="john@example.com"
            data-testid="input-buyer-email"
          />
        </div>
        <div>
          <Label>Phone</Label>
          <Input
            value={formData.phone}
            onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
            placeholder="(555) 123-4567"
            data-testid="input-buyer-phone"
          />
        </div>
      </div>
      <div>
        <Label>Preferred Property Types</Label>
        <div className="flex flex-wrap gap-2 mt-2">
          {propertyTypeOptions.map((type) => (
            <Badge
              key={type}
              variant={formData.preferredPropertyTypes.includes(type) ? "default" : "outline"}
              className="cursor-pointer"
              onClick={() => {
                const types = formData.preferredPropertyTypes.includes(type)
                  ? formData.preferredPropertyTypes.filter(t => t !== type)
                  : [...formData.preferredPropertyTypes, type];
                setFormData({ ...formData, preferredPropertyTypes: types });
              }}
            >
              {type}
            </Badge>
          ))}
        </div>
      </div>
      <div>
        <Label>Preferred Areas (comma-separated)</Label>
        <Input
          value={formData.preferredAreas}
          onChange={(e) => setFormData({ ...formData, preferredAreas: e.target.value })}
          placeholder="Orlando, Tampa, Miami"
          data-testid="input-buyer-areas"
        />
      </div>
      <div className="grid grid-cols-3 gap-4">
        <div>
          <Label>Min Budget</Label>
          <Input
            type="number"
            value={formData.minBudget}
            onChange={(e) => setFormData({ ...formData, minBudget: e.target.value })}
            placeholder="50000"
            data-testid="input-buyer-min-budget"
          />
        </div>
        <div>
          <Label>Max Budget</Label>
          <Input
            type="number"
            value={formData.maxBudget}
            onChange={(e) => setFormData({ ...formData, maxBudget: e.target.value })}
            placeholder="500000"
            data-testid="input-buyer-max-budget"
          />
        </div>
        <div>
          <Label>Deals/Month</Label>
          <Input
            type="number"
            value={formData.dealsPerMonth}
            onChange={(e) => setFormData({ ...formData, dealsPerMonth: e.target.value })}
            placeholder="5"
            data-testid="input-buyer-deals-per-month"
          />
        </div>
      </div>
      <div className={`p-3 rounded-lg border-2 ${formData.proofOfFunds ? 'border-red-500 bg-red-50 dark:bg-red-950/20' : 'border-border'}`}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Switch
              checked={formData.proofOfFunds}
              onCheckedChange={(checked) => setFormData({ ...formData, proofOfFunds: checked })}
              data-testid="switch-proof-of-funds"
            />
            <div>
              <Label className="font-semibold">Flipstackk Verified</Label>
              <p className="text-xs text-muted-foreground">Mark when buyer has submitted proof of funds</p>
            </div>
          </div>
          {formData.proofOfFunds && (
            <Badge className="bg-red-600 text-white hover:bg-red-700 border-0">
              <CheckCircle className="h-3 w-3 mr-1" /> Verified
            </Badge>
          )}
        </div>
        {formData.proofOfFunds && (
          <div className="mt-3">
            <Label className="text-xs">Verification Notes</Label>
            <Input
              value={formData.proofOfFundsNotes}
              onChange={(e) => setFormData({ ...formData, proofOfFundsNotes: e.target.value })}
              placeholder="Bank statement received, credit line letter, etc."
              className="mt-1"
              data-testid="input-pof-notes"
            />
          </div>
        )}
      </div>
      <div className="flex items-center gap-2">
        <Switch
          checked={formData.isVip}
          onCheckedChange={(checked) => setFormData({ ...formData, isVip: checked })}
          data-testid="switch-vip"
        />
        <Label>VIP Buyer</Label>
      </div>
      <div>
        <Label>Tags (comma-separated)</Label>
        <Input
          value={formData.tags}
          onChange={(e) => setFormData({ ...formData, tags: e.target.value })}
          placeholder="cash buyer, quick close, rehab"
          data-testid="input-buyer-tags"
        />
      </div>
      <div>
        <Label>Notes</Label>
        <Textarea
          value={formData.notes}
          onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
          placeholder="Additional notes about this buyer..."
          data-testid="textarea-buyer-notes"
        />
      </div>
      <Button 
        className="w-full" 
        onClick={() => handleSubmit(isEdit)}
        disabled={!formData.name || createBuyerMutation.isPending || updateBuyerMutation.isPending}
        data-testid="button-save-buyer"
      >
        {isEdit ? "Update Buyer" : "Add Buyer"}
      </Button>
    </div>
  );

  return (
    <Layout>
      <div className="flex flex-col gap-2 mb-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2" data-testid="page-title">
              <Users className="h-8 w-8 text-primary" />
              Cash Buyers CRM
            </h1>
            <p className="text-muted-foreground">Manage your buyer relationships and track deals</p>
          </div>
          <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
            <DialogTrigger asChild>
              <Button data-testid="button-add-buyer">
                <Plus className="h-4 w-4 mr-2" /> Add Buyer
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Add New Buyer</DialogTitle>
                <DialogDescription>Add a cash buyer to your network</DialogDescription>
              </DialogHeader>
              <BuyerForm />
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Total Buyers</p>
                <p className="text-2xl font-bold">{buyers.length}</p>
              </div>
              <Users className="h-8 w-8 text-primary opacity-80" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">VIP Buyers</p>
                <p className="text-2xl font-bold">{vipBuyers.length}</p>
              </div>
              <Star className="h-8 w-8 text-yellow-500 opacity-80" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Active Buyers</p>
                <p className="text-2xl font-bold">{activeBuyers.length}</p>
              </div>
              <CheckCircle className="h-8 w-8 text-green-500 opacity-80" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Total Revenue</p>
                <p className="text-2xl font-bold">
                  {formatCurrency(buyers.reduce((sum, b) => sum + parseFloat(b.totalRevenue || "0"), 0).toString())}
                </p>
              </div>
              <TrendingUp className="h-8 w-8 text-green-500 opacity-80" />
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>Buyer List</CardTitle>
                <div className="relative w-64">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search buyers..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-9"
                    data-testid="input-search-buyers"
                  />
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="text-center py-8 text-muted-foreground">Loading buyers...</div>
              ) : filteredBuyers.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <Users className="h-12 w-12 mx-auto mb-3 opacity-50" />
                  <p>No buyers found</p>
                  <p className="text-sm">Add your first cash buyer to get started</p>
                </div>
              ) : (
                <ScrollArea className="h-[500px]">
                  <div className="space-y-3">
                    {filteredBuyers.map((buyer) => (
                      <div
                        key={buyer.id}
                        className={`p-4 rounded-lg border cursor-pointer transition-colors ${
                          selectedBuyer?.id === buyer.id ? "bg-primary/10 border-primary" : "hover:bg-muted"
                        }`}
                        onClick={() => setSelectedBuyer(buyer)}
                        data-testid={`buyer-card-${buyer.id}`}
                      >
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <div className="flex items-center gap-2">
                              <span className="font-semibold">{buyer.name}</span>
                              {buyer.isVip && (
                                <Badge variant="secondary" className="bg-yellow-100 text-yellow-800">
                                  <Star className="h-3 w-3 mr-1" /> VIP
                                </Badge>
                              )}
                              {buyer.proofOfFunds && (
                                <Badge className="bg-red-600 text-white hover:bg-red-700 border-0">
                                  <CheckCircle className="h-3 w-3 mr-1" /> Flipstackk Verified
                                </Badge>
                              )}
                            </div>
                            {buyer.company && (
                              <p className="text-sm text-muted-foreground flex items-center gap-1">
                                <Building2 className="h-3 w-3" /> {buyer.company}
                              </p>
                            )}
                            <div className="flex items-center gap-4 mt-2 text-sm text-muted-foreground">
                              {buyer.phone && (
                                <span className="flex items-center gap-1">
                                  <Phone className="h-3 w-3" /> {buyer.phone}
                                </span>
                              )}
                              {buyer.email && (
                                <span className="flex items-center gap-1">
                                  <Mail className="h-3 w-3" /> {buyer.email}
                                </span>
                              )}
                            </div>
                          </div>
                          <div className="text-right">
                            <p className="text-sm font-medium">
                              {formatCurrency(buyer.minBudget)} - {formatCurrency(buyer.maxBudget)}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {buyer.totalDeals || 0} deals closed
                            </p>
                          </div>
                        </div>
                        {buyer.preferredPropertyTypes && buyer.preferredPropertyTypes.length > 0 && (
                          <div className="flex flex-wrap gap-1 mt-2">
                            {buyer.preferredPropertyTypes.map((type, i) => (
                              <Badge key={i} variant="outline" className="text-xs">
                                {type}
                              </Badge>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="lg:col-span-1">
          {selectedBuyer ? (
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="text-lg">Buyer Details</CardTitle>
                  <div className="flex gap-2">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleEditClick(selectedBuyer)}
                      data-testid="button-edit-buyer"
                    >
                      <Edit className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => {
                        if (confirm("Delete this buyer?")) {
                          deleteBuyerMutation.mutate(selectedBuyer.id);
                        }
                      }}
                      data-testid="button-delete-buyer"
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <Tabs defaultValue="info">
                  <TabsList className="w-full">
                    <TabsTrigger value="info" className="flex-1">Info</TabsTrigger>
                    <TabsTrigger value="comms" className="flex-1">Communications</TabsTrigger>
                  </TabsList>

                  <TabsContent value="info" className="mt-4 space-y-4">
                    <div>
                      <h3 className="font-semibold flex items-center gap-2">
                        {selectedBuyer.name}
                        {selectedBuyer.isVip && <Star className="h-4 w-4 text-yellow-500" />}
                      </h3>
                      {selectedBuyer.company && (
                        <p className="text-sm text-muted-foreground">{selectedBuyer.company}</p>
                      )}
                      {selectedBuyer.proofOfFunds && (
                        <div className="mt-2">
                          <Badge className="bg-red-600 text-white hover:bg-red-700 border-0">
                            <CheckCircle className="h-3 w-3 mr-1" /> Flipstackk Verified
                          </Badge>
                          {selectedBuyer.proofOfFundsVerifiedAt && (
                            <p className="text-xs text-muted-foreground mt-1">
                              Verified {new Date(selectedBuyer.proofOfFundsVerifiedAt).toLocaleDateString()}
                            </p>
                          )}
                        </div>
                      )}
                    </div>

                    <div className="space-y-2 text-sm">
                      {selectedBuyer.phone && (
                        <div className="flex items-center gap-2">
                          <Phone className="h-4 w-4 text-muted-foreground" />
                          <a href={`tel:${selectedBuyer.phone}`} className="text-primary hover:underline">
                            {selectedBuyer.phone}
                          </a>
                        </div>
                      )}
                      {selectedBuyer.email && (
                        <div className="flex items-center gap-2">
                          <Mail className="h-4 w-4 text-muted-foreground" />
                          <a href={`mailto:${selectedBuyer.email}`} className="text-primary hover:underline">
                            {selectedBuyer.email}
                          </a>
                        </div>
                      )}
                    </div>

                    <div className="grid grid-cols-2 gap-4 p-3 bg-muted/50 rounded-lg">
                      <div>
                        <p className="text-xs text-muted-foreground">Budget Range</p>
                        <p className="font-medium text-sm">
                          {formatCurrency(selectedBuyer.minBudget)} - {formatCurrency(selectedBuyer.maxBudget)}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">Deals/Month</p>
                        <p className="font-medium text-sm">{selectedBuyer.dealsPerMonth || "-"}</p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">Total Deals</p>
                        <p className="font-medium text-sm">{selectedBuyer.totalDeals || 0}</p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">Total Revenue</p>
                        <p className="font-medium text-sm">{formatCurrency(selectedBuyer.totalRevenue)}</p>
                      </div>
                    </div>

                    {selectedBuyer.preferredAreas && selectedBuyer.preferredAreas.length > 0 && (
                      <div>
                        <p className="text-xs text-muted-foreground mb-1">Preferred Areas</p>
                        <div className="flex flex-wrap gap-1">
                          {selectedBuyer.preferredAreas.map((area, i) => (
                            <Badge key={i} variant="secondary" className="text-xs">{area}</Badge>
                          ))}
                        </div>
                      </div>
                    )}

                    {selectedBuyer.notes && (
                      <div>
                        <p className="text-xs text-muted-foreground mb-1">Notes</p>
                        <p className="text-sm">{selectedBuyer.notes}</p>
                      </div>
                    )}
                  </TabsContent>

                  <TabsContent value="comms" className="mt-4">
                    <div className="space-y-4">
                      <div className="space-y-2">
                        <div className="flex gap-2">
                          <Select value={commType} onValueChange={setCommType}>
                            <SelectTrigger className="w-24" data-testid="select-comm-type">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="call">Call</SelectItem>
                              <SelectItem value="text">Text</SelectItem>
                              <SelectItem value="email">Email</SelectItem>
                              <SelectItem value="meeting">Meeting</SelectItem>
                            </SelectContent>
                          </Select>
                          <Input
                            placeholder="Subject..."
                            value={commSubject}
                            onChange={(e) => setCommSubject(e.target.value)}
                            className="flex-1"
                            data-testid="input-comm-subject"
                          />
                        </div>
                        <Textarea
                          placeholder="Log your communication..."
                          value={commContent}
                          onChange={(e) => setCommContent(e.target.value)}
                          className="min-h-[80px]"
                          data-testid="textarea-comm-content"
                        />
                        <Button 
                          size="sm" 
                          className="w-full"
                          onClick={handleLogCommunication}
                          disabled={addCommunicationMutation.isPending}
                          data-testid="button-log-comm"
                        >
                          <Send className="h-4 w-4 mr-2" /> Log Communication
                        </Button>
                      </div>

                      <ScrollArea className="h-[200px]">
                        <div className="space-y-2">
                          {communications.length === 0 ? (
                            <p className="text-center text-sm text-muted-foreground py-4">
                              No communications logged
                            </p>
                          ) : (
                            communications.map((comm) => (
                              <div key={comm.id} className="p-2 border rounded-lg text-sm">
                                <div className="flex items-center justify-between">
                                  <Badge variant="outline" className="text-xs capitalize">
                                    {comm.type}
                                  </Badge>
                                  <span className="text-xs text-muted-foreground">
                                    {new Date(comm.createdAt).toLocaleDateString()}
                                  </span>
                                </div>
                                {comm.subject && <p className="font-medium mt-1">{comm.subject}</p>}
                                {comm.content && <p className="text-muted-foreground">{comm.content}</p>}
                              </div>
                            ))
                          )}
                        </div>
                      </ScrollArea>
                    </div>
                  </TabsContent>
                </Tabs>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                <Users className="h-12 w-12 mb-3 opacity-50" />
                <p className="font-medium">Select a buyer</p>
                <p className="text-sm">Click on a buyer to view details</p>
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit Buyer</DialogTitle>
            <DialogDescription>Update buyer information</DialogDescription>
          </DialogHeader>
          <BuyerForm isEdit />
        </DialogContent>
      </Dialog>
    </Layout>
  );
}
