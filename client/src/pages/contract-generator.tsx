import { useState } from "react";
import { Layout } from "@/components/layout/Layout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { FileText, Download, Plus, Eye, Save, FileSignature, CheckCircle, Send, Clock, DollarSign, ChevronRight, ArrowRight } from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";

const statusColors: Record<string, string> = {
  draft: "bg-gray-500",
  sent: "bg-blue-500", 
  executed: "bg-green-500",
  closed: "bg-purple-500",
};

export default function ContractGenerator() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState("list");

  // Fetch contracts
  const { data: contracts = [], isLoading: contractsLoading } = useQuery<any[]>({
    queryKey: ['/api/contract-documents'],
  });

  // Fetch templates
  const { data: templates = [], isLoading: templatesLoading } = useQuery<any[]>({
    queryKey: ['/api/contract-templates'],
  });

  // Fetch LOIs
  const { data: lois = [], isLoading: loisLoading } = useQuery<any[]>({
    queryKey: ['/api/lois'],
  });

  // Fetch properties for dropdown
  const { data: properties = [] } = useQuery<any[]>({
    queryKey: ['/api/properties'],
  });

  return (
    <Layout>
      <div className="p-8 space-y-6">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-4xl font-display font-bold text-foreground mb-2" data-testid="page-title">
              Document Management
            </h1>
            <p className="text-muted-foreground">
              Create and manage contracts, templates, and letters of intent
            </p>
          </div>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
          <TabsList className="grid w-full grid-cols-5 lg:w-auto">
            <TabsTrigger value="list" data-testid="tab-contracts">
              <FileText className="w-4 h-4 mr-2" />
              Contracts
            </TabsTrigger>
            <TabsTrigger value="create" data-testid="tab-create">
              <Plus className="w-4 h-4 mr-2" />
              Create New
            </TabsTrigger>
            <TabsTrigger value="closing" data-testid="tab-closing">
              <CheckCircle className="w-4 h-4 mr-2" />
              Closing
            </TabsTrigger>
            <TabsTrigger value="templates" data-testid="tab-templates">
              <FileSignature className="w-4 h-4 mr-2" />
              Templates
            </TabsTrigger>
            <TabsTrigger value="lois" data-testid="tab-lois">
              <FileText className="w-4 h-4 mr-2" />
              LOIs
            </TabsTrigger>
          </TabsList>

          {/* Contracts List Tab */}
          <TabsContent value="list" className="space-y-4">
            <ContractsList contracts={contracts} isLoading={contractsLoading} onCreateNew={() => setActiveTab("create")} />
          </TabsContent>
          
          {/* Closing Tab */}
          <TabsContent value="closing" className="space-y-4">
            <ClosingModule contracts={contracts} properties={properties} />
          </TabsContent>

          {/* Create Contract Tab */}
          <TabsContent value="create" className="space-y-4">
            <ContractCreator templates={templates} properties={properties} />
          </TabsContent>

          {/* Templates Tab */}
          <TabsContent value="templates" className="space-y-4">
            <TemplatesManager templates={templates} isLoading={templatesLoading} />
          </TabsContent>

          {/* LOIs Tab */}
          <TabsContent value="lois" className="space-y-4">
            <LOIManager lois={lois} properties={properties} isLoading={loisLoading} />
          </TabsContent>
        </Tabs>
      </div>
    </Layout>
  );
}

// Contract Creator Component
function ContractCreator({ templates, properties }: { templates: any[], properties: any[] }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [selectedTemplate, setSelectedTemplate] = useState("");
  const [formData, setFormData] = useState({
    title: "",
    propertyId: "",
    buyerName: "",
    sellerName: "",
    amount: "",
    terms: "",
  });

  const createMutation = useMutation({
    mutationFn: async (data: any) => {
      const response = await fetch('/api/contract-documents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (!response.ok) throw new Error('Failed to create contract');
      return response.json();
    },
    onSuccess: () => {
      toast({ title: "Contract created successfully" });
      queryClient.invalidateQueries({ queryKey: ['/api/contract-documents'] });
      setFormData({ title: "", propertyId: "", buyerName: "", sellerName: "", amount: "", terms: "" });
    },
    onError: () => {
      toast({ title: "Failed to create contract", variant: "destructive" });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const template = templates.find(t => t.id.toString() === selectedTemplate);
    createMutation.mutate({
      templateId: selectedTemplate ? parseInt(selectedTemplate) : null,
      propertyId: formData.propertyId ? parseInt(formData.propertyId) : null,
      title: formData.title,
      content: template?.content || formData.terms,
      mergeData: JSON.stringify(formData),
      status: 'draft',
    });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Create New Contract</CardTitle>
        <CardDescription>Generate a contract from a template or create a custom one</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="template">Template (Optional)</Label>
              <Select value={selectedTemplate} onValueChange={setSelectedTemplate}>
                <SelectTrigger data-testid="select-template">
                  <SelectValue placeholder="Select a template" />
                </SelectTrigger>
                <SelectContent>
                  {templates.map((template: any) => (
                    <SelectItem key={template.id} value={template.id.toString()}>
                      {template.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="title">Contract Title</Label>
              <Input
                id="title"
                data-testid="input-title"
                value={formData.title}
                onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                placeholder="Purchase Agreement - 123 Main St"
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="property">Property</Label>
              <Select value={formData.propertyId} onValueChange={(value) => setFormData({ ...formData, propertyId: value })}>
                <SelectTrigger data-testid="select-property">
                  <SelectValue placeholder="Select property" />
                </SelectTrigger>
                <SelectContent>
                  {properties.map((property: any) => (
                    <SelectItem key={property.id} value={property.id.toString()}>
                      {property.address}, {property.city}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="buyer">Buyer Name</Label>
              <Input
                id="buyer"
                data-testid="input-buyer"
                value={formData.buyerName}
                onChange={(e) => setFormData({ ...formData, buyerName: e.target.value })}
                placeholder="John Doe"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="seller">Seller Name</Label>
              <Input
                id="seller"
                data-testid="input-seller"
                value={formData.sellerName}
                onChange={(e) => setFormData({ ...formData, sellerName: e.target.value })}
                placeholder="Jane Smith"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="amount">Contract Amount</Label>
              <Input
                id="amount"
                data-testid="input-amount"
                type="number"
                value={formData.amount}
                onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
                placeholder="150000"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="terms">Contract Terms & Content</Label>
            <Textarea
              id="terms"
              data-testid="textarea-terms"
              value={formData.terms}
              onChange={(e) => setFormData({ ...formData, terms: e.target.value })}
              placeholder="Enter contract terms and conditions..."
              className="min-h-[200px] font-mono text-sm"
            />
          </div>

          <div className="flex gap-3">
            <Button type="submit" data-testid="button-save-draft" disabled={createMutation.isPending}>
              <Save className="w-4 h-4 mr-2" />
              {createMutation.isPending ? "Saving..." : "Save as Draft"}
            </Button>
            <Button type="button" variant="outline" data-testid="button-preview">
              <Eye className="w-4 h-4 mr-2" />
              Preview
            </Button>
            <Button type="button" variant="outline" data-testid="button-export-pdf">
              <Download className="w-4 h-4 mr-2" />
              Export as PDF
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

// Templates Manager Component
function TemplatesManager({ templates, isLoading }: { templates: any[], isLoading: boolean }) {
  const [showCreate, setShowCreate] = useState(false);

  return (
    <Card>
      <CardHeader>
        <div className="flex justify-between items-center">
          <div>
            <CardTitle>Contract Templates</CardTitle>
            <CardDescription>Manage reusable contract templates</CardDescription>
          </div>
          <Button onClick={() => setShowCreate(!showCreate)} data-testid="button-new-template">
            <Plus className="w-4 h-4 mr-2" />
            New Template
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {showCreate && <TemplateCreator onClose={() => setShowCreate(false)} />}
        
        {isLoading ? (
          <div className="text-center py-8 text-muted-foreground">Loading templates...</div>
        ) : templates.length === 0 ? (
          <div className="text-center py-12">
            <FileSignature className="w-12 h-12 mx-auto text-muted-foreground/50 mb-3" />
            <p className="text-muted-foreground mb-4">No templates yet</p>
            <Button onClick={() => setShowCreate(true)} data-testid="button-create-first-template">
              <Plus className="w-4 h-4 mr-2" />
              Create Your First Template
            </Button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
            {templates.map((template: any) => (
              <div
                key={template.id}
                className="p-4 border border-border rounded-lg hover:border-primary/50 transition-colors"
                data-testid={`template-${template.id}`}
              >
                <h3 className="font-semibold text-foreground mb-1">{template.name}</h3>
                <p className="text-sm text-muted-foreground mb-3">{template.description}</p>
                <div className="flex justify-between items-center">
                  <span className="text-xs text-muted-foreground capitalize">{template.category}</span>
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" data-testid={`button-edit-${template.id}`}>
                      Edit
                    </Button>
                    <Button variant="outline" size="sm" data-testid={`button-use-${template.id}`}>
                      Use
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// Template Creator Component
function TemplateCreator({ onClose }: { onClose: () => void }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [formData, setFormData] = useState({
    name: "",
    description: "",
    category: "purchase",
    content: "",
    mergeFields: "",
  });

  const createMutation = useMutation({
    mutationFn: async (data: any) => {
      const response = await fetch('/api/contract-templates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (!response.ok) throw new Error('Failed to create template');
      return response.json();
    },
    onSuccess: () => {
      toast({ title: "Template created successfully" });
      queryClient.invalidateQueries({ queryKey: ['/api/contract-templates'] });
      onClose();
    },
    onError: () => {
      toast({ title: "Failed to create template", variant: "destructive" });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    createMutation.mutate({
      ...formData,
      mergeFields: formData.mergeFields ? formData.mergeFields.split(',').map(f => f.trim()) : [],
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4 p-4 bg-accent/5 rounded-lg mb-4">
      <h3 className="font-semibold text-lg">Create New Template</h3>
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="template-name">Template Name</Label>
          <Input
            id="template-name"
            data-testid="input-template-name"
            value={formData.name}
            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            placeholder="e.g., Standard Purchase Agreement"
            required
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="template-category">Category</Label>
          <Select value={formData.category} onValueChange={(value) => setFormData({ ...formData, category: value })}>
            <SelectTrigger data-testid="select-template-category">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="purchase">Purchase Agreement</SelectItem>
              <SelectItem value="assignment">Assignment Contract</SelectItem>
              <SelectItem value="option">Option Contract</SelectItem>
              <SelectItem value="loi">Letter of Intent</SelectItem>
              <SelectItem value="other">Other</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="space-y-2">
        <Label htmlFor="template-description">Description</Label>
        <Input
          id="template-description"
          data-testid="input-template-description"
          value={formData.description}
          onChange={(e) => setFormData({ ...formData, description: e.target.value })}
          placeholder="Brief description of this template"
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="template-content">Template Content</Label>
        <Textarea
          id="template-content"
          data-testid="textarea-template-content"
          value={formData.content}
          onChange={(e) => setFormData({ ...formData, content: e.target.value })}
          placeholder="Enter template content with merge fields like {{buyerName}}, {{sellerName}}, etc."
          className="min-h-[200px] font-mono text-sm"
          required
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="template-merge-fields">Merge Fields (comma-separated)</Label>
        <Input
          id="template-merge-fields"
          data-testid="input-template-merge-fields"
          value={formData.mergeFields}
          onChange={(e) => setFormData({ ...formData, mergeFields: e.target.value })}
          placeholder="e.g., buyerName, sellerName, propertyAddress, purchasePrice"
        />
      </div>
      <div className="flex gap-3">
        <Button type="submit" data-testid="button-save-template" disabled={createMutation.isPending}>
          <Save className="w-4 h-4 mr-2" />
          {createMutation.isPending ? "Saving..." : "Save Template"}
        </Button>
        <Button type="button" variant="outline" onClick={onClose} data-testid="button-cancel-template">
          Cancel
        </Button>
      </div>
    </form>
  );
}

// LOI Manager Component
function LOIManager({ lois, properties, isLoading }: { lois: any[], properties: any[], isLoading: boolean }) {
  const [showCreate, setShowCreate] = useState(false);

  return (
    <Card>
      <CardHeader>
        <div className="flex justify-between items-center">
          <div>
            <CardTitle>Letters of Intent</CardTitle>
            <CardDescription>Create and track LOIs for property acquisitions</CardDescription>
          </div>
          <Button onClick={() => setShowCreate(!showCreate)} data-testid="button-new-loi">
            <Plus className="w-4 h-4 mr-2" />
            New LOI
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {showCreate && <LOICreator properties={properties} onClose={() => setShowCreate(false)} />}
        
        {isLoading ? (
          <div className="text-center py-8 text-muted-foreground">Loading LOIs...</div>
        ) : lois.length === 0 ? (
          <div className="text-center py-12">
            <FileText className="w-12 h-12 mx-auto text-muted-foreground/50 mb-3" />
            <p className="text-muted-foreground">No LOIs yet</p>
          </div>
        ) : (
          <div className="space-y-3 mt-4">
            {lois.map((loi: any) => (
              <div
                key={loi.id}
                className="flex items-center justify-between p-4 border border-border rounded-lg"
                data-testid={`loi-${loi.id}`}
              >
                <div className="flex-1">
                  <h3 className="font-semibold text-foreground">{loi.buyerName} → {loi.sellerName}</h3>
                  <div className="flex items-center gap-4 mt-1 text-sm text-muted-foreground">
                    <span>Offer: ${parseFloat(loi.offerAmount).toLocaleString()}</span>
                    <span className="capitalize">Status: {loi.status}</span>
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" data-testid={`button-view-loi-${loi.id}`}>
                    View
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// LOI Creator Component
function LOICreator({ properties, onClose }: { properties: any[], onClose: () => void }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [formData, setFormData] = useState({
    propertyId: "",
    buyerName: "",
    sellerName: "",
    offerAmount: "",
    earnestMoney: "",
    closingDate: "",
    specialTerms: "",
  });

  const createMutation = useMutation({
    mutationFn: async (data: any) => {
      const response = await fetch('/api/lois', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (!response.ok) throw new Error('Failed to create LOI');
      return response.json();
    },
    onSuccess: () => {
      toast({ title: "LOI created successfully" });
      queryClient.invalidateQueries({ queryKey: ['/api/lois'] });
      onClose();
    },
    onError: () => {
      toast({ title: "Failed to create LOI", variant: "destructive" });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    createMutation.mutate({
      ...formData,
      propertyId: parseInt(formData.propertyId),
      offerAmount: formData.offerAmount,
      earnestMoney: formData.earnestMoney || null,
      closingDate: formData.closingDate || null,
      status: 'draft',
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4 p-4 bg-accent/5 rounded-lg mb-4">
      <h3 className="font-semibold text-lg">Create New LOI</h3>
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="loi-property">Property</Label>
          <Select value={formData.propertyId} onValueChange={(value) => setFormData({ ...formData, propertyId: value })} required>
            <SelectTrigger data-testid="select-loi-property">
              <SelectValue placeholder="Select property" />
            </SelectTrigger>
            <SelectContent>
              {properties.map((property: any) => (
                <SelectItem key={property.id} value={property.id.toString()}>
                  {property.address}, {property.city}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label htmlFor="loi-buyer">Buyer Name</Label>
          <Input
            id="loi-buyer"
            data-testid="input-loi-buyer"
            value={formData.buyerName}
            onChange={(e) => setFormData({ ...formData, buyerName: e.target.value })}
            required
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="loi-seller">Seller Name</Label>
          <Input
            id="loi-seller"
            data-testid="input-loi-seller"
            value={formData.sellerName}
            onChange={(e) => setFormData({ ...formData, sellerName: e.target.value })}
            required
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="loi-offer">Offer Amount</Label>
          <Input
            id="loi-offer"
            data-testid="input-loi-offer"
            type="number"
            value={formData.offerAmount}
            onChange={(e) => setFormData({ ...formData, offerAmount: e.target.value })}
            required
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="loi-earnest">Earnest Money</Label>
          <Input
            id="loi-earnest"
            data-testid="input-loi-earnest"
            type="number"
            value={formData.earnestMoney}
            onChange={(e) => setFormData({ ...formData, earnestMoney: e.target.value })}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="loi-closing">Closing Date</Label>
          <Input
            id="loi-closing"
            data-testid="input-loi-closing"
            type="date"
            value={formData.closingDate}
            onChange={(e) => setFormData({ ...formData, closingDate: e.target.value })}
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="loi-terms">Special Terms</Label>
        <Textarea
          id="loi-terms"
          data-testid="textarea-loi-terms"
          value={formData.specialTerms}
          onChange={(e) => setFormData({ ...formData, specialTerms: e.target.value })}
          placeholder="Enter any special terms or conditions..."
          className="min-h-[100px]"
        />
      </div>

      <div className="flex gap-3">
        <Button type="submit" data-testid="button-create-loi" disabled={createMutation.isPending}>
          {createMutation.isPending ? "Creating..." : "Create LOI"}
        </Button>
        <Button type="button" variant="outline" onClick={onClose} data-testid="button-cancel-loi">
          Cancel
        </Button>
      </div>
    </form>
  );
}

function ContractsList({ contracts, isLoading, onCreateNew }: { contracts: any[], isLoading: boolean, onCreateNew: () => void }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const updateStatusMutation = useMutation({
    mutationFn: async ({ id, status }: { id: number, status: string }) => {
      const response = await fetch(`/api/contract-documents/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });
      if (!response.ok) throw new Error('Failed to update status');
      return response.json();
    },
    onSuccess: () => {
      toast({ title: "Contract status updated" });
      queryClient.invalidateQueries({ queryKey: ['/api/contract-documents'] });
    },
  });

  const getNextStatus = (current: string): string | null => {
    const flow: Record<string, string> = {
      draft: 'sent',
      sent: 'executed',
      executed: 'closed',
    };
    return flow[current] || null;
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'draft': return <Clock className="w-4 h-4" />;
      case 'sent': return <Send className="w-4 h-4" />;
      case 'executed': return <FileSignature className="w-4 h-4" />;
      case 'closed': return <CheckCircle className="w-4 h-4" />;
      default: return <FileText className="w-4 h-4" />;
    }
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex justify-between items-center">
          <div>
            <CardTitle>Active Contracts</CardTitle>
            <CardDescription>View and manage all contract documents</CardDescription>
          </div>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2 text-sm">
              <span className="text-muted-foreground">Pipeline:</span>
              <Badge variant="outline" className="bg-gray-500/10">Draft</Badge>
              <ArrowRight className="w-3 h-3 text-muted-foreground" />
              <Badge variant="outline" className="bg-blue-500/10">Sent</Badge>
              <ArrowRight className="w-3 h-3 text-muted-foreground" />
              <Badge variant="outline" className="bg-green-500/10">Executed</Badge>
              <ArrowRight className="w-3 h-3 text-muted-foreground" />
              <Badge variant="outline" className="bg-purple-500/10">Closed</Badge>
            </div>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="text-center py-8 text-muted-foreground">Loading contracts...</div>
        ) : contracts.length === 0 ? (
          <div className="text-center py-12">
            <FileText className="w-12 h-12 mx-auto text-muted-foreground/50 mb-3" />
            <p className="text-muted-foreground mb-4">No contracts yet</p>
            <Button onClick={onCreateNew} data-testid="button-create-first">
              <Plus className="w-4 h-4 mr-2" />
              Create Your First Contract
            </Button>
          </div>
        ) : (
          <div className="space-y-3">
            {contracts.map((contract: any) => {
              const nextStatus = getNextStatus(contract.status);
              return (
                <div
                  key={contract.id}
                  className="flex items-center justify-between p-4 border border-border rounded-lg hover:bg-accent/5 transition-colors"
                  data-testid={`contract-${contract.id}`}
                >
                  <div className="flex items-center gap-4 flex-1">
                    <div className={`p-2 rounded-full ${statusColors[contract.status] || 'bg-gray-500'}`}>
                      {getStatusIcon(contract.status)}
                    </div>
                    <div>
                      <h3 className="font-semibold text-foreground">{contract.title}</h3>
                      <div className="flex items-center gap-4 mt-1 text-sm text-muted-foreground">
                        <span>Type: {contract.documentType || 'contract'}</span>
                        <Badge variant="outline" className={`${statusColors[contract.status]}/10 capitalize`}>
                          {contract.status}
                        </Badge>
                        <span>Version: {contract.version || 1}</span>
                      </div>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    {nextStatus && (
                      <Button 
                        variant="outline" 
                        size="sm" 
                        onClick={() => updateStatusMutation.mutate({ id: contract.id, status: nextStatus })}
                        disabled={updateStatusMutation.isPending}
                        data-testid={`button-advance-${contract.id}`}
                      >
                        <ChevronRight className="w-4 h-4 mr-1" />
                        Mark as {nextStatus.charAt(0).toUpperCase() + nextStatus.slice(1)}
                      </Button>
                    )}
                    <Button variant="outline" size="sm" data-testid={`button-view-${contract.id}`}>
                      <Eye className="w-4 h-4 mr-2" />
                      View
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function ClosingModule({ contracts, properties }: { contracts: any[], properties: any[] }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [selectedContract, setSelectedContract] = useState<any>(null);
  const [closingData, setClosingData] = useState({
    assignmentFee: "",
    closingCosts: "",
    buyerPaid: false,
    titleReceived: false,
    fundsWired: false,
    docsRecorded: false,
    notes: "",
  });

  const executedContracts = contracts.filter(c => c.status === 'executed');

  const closeContractMutation = useMutation({
    mutationFn: async ({ contractId, data }: { contractId: number, data: any }) => {
      const response = await fetch(`/api/contract-documents/${contractId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          status: 'closed',
          mergeData: JSON.stringify({
            ...JSON.parse(data.mergeData || '{}'),
            closingData: data.closingData,
          }),
        }),
      });
      if (!response.ok) throw new Error('Failed to close contract');
      return response.json();
    },
    onSuccess: () => {
      toast({ title: "Deal closed successfully!", description: "The contract has been marked as closed." });
      queryClient.invalidateQueries({ queryKey: ['/api/contract-documents'] });
      setSelectedContract(null);
      setClosingData({
        assignmentFee: "",
        closingCosts: "",
        buyerPaid: false,
        titleReceived: false,
        fundsWired: false,
        docsRecorded: false,
        notes: "",
      });
    },
  });

  const handleCloseDeal = () => {
    if (!selectedContract) return;
    const allChecked = closingData.buyerPaid && closingData.titleReceived && closingData.fundsWired && closingData.docsRecorded;
    if (!allChecked) {
      toast({ title: "Please complete all checklist items", variant: "destructive" });
      return;
    }
    closeContractMutation.mutate({
      contractId: selectedContract.id,
      data: {
        mergeData: selectedContract.mergeData,
        closingData,
      },
    });
  };

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CheckCircle className="w-5 h-5 text-primary" />
            Deals Ready to Close
          </CardTitle>
          <CardDescription>Executed contracts awaiting final closing</CardDescription>
        </CardHeader>
        <CardContent>
          {executedContracts.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <FileSignature className="w-12 h-12 mx-auto mb-3 opacity-50" />
              <p>No executed contracts ready to close</p>
              <p className="text-sm mt-1">Contracts appear here after being marked as "Executed"</p>
            </div>
          ) : (
            <div className="space-y-3">
              {executedContracts.map((contract: any) => (
                <div
                  key={contract.id}
                  onClick={() => setSelectedContract(contract)}
                  className={`p-4 border rounded-lg cursor-pointer transition-colors ${
                    selectedContract?.id === contract.id 
                      ? 'border-primary bg-primary/5' 
                      : 'border-border hover:border-primary/50'
                  }`}
                  data-testid={`closing-contract-${contract.id}`}
                >
                  <h3 className="font-semibold">{contract.title}</h3>
                  <p className="text-sm text-muted-foreground mt-1">
                    Ready for closing procedures
                  </p>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <DollarSign className="w-5 h-5 text-green-500" />
            Closing Checklist
          </CardTitle>
          <CardDescription>
            {selectedContract 
              ? `Complete closing for: ${selectedContract.title}` 
              : 'Select a contract to begin closing process'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {!selectedContract ? (
            <div className="text-center py-8 text-muted-foreground">
              <CheckCircle className="w-12 h-12 mx-auto mb-3 opacity-50" />
              <p>Select a contract from the left panel</p>
            </div>
          ) : (
            <div className="space-y-6">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Assignment Fee</Label>
                  <Input
                    type="number"
                    placeholder="10000"
                    value={closingData.assignmentFee}
                    onChange={(e) => setClosingData({ ...closingData, assignmentFee: e.target.value })}
                    data-testid="input-assignment-fee"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Closing Costs</Label>
                  <Input
                    type="number"
                    placeholder="500"
                    value={closingData.closingCosts}
                    onChange={(e) => setClosingData({ ...closingData, closingCosts: e.target.value })}
                    data-testid="input-closing-costs"
                  />
                </div>
              </div>

              <div className="space-y-4 p-4 bg-accent/5 rounded-lg">
                <h4 className="font-semibold flex items-center gap-2">
                  <CheckCircle className="w-4 h-4" />
                  Closing Checklist
                </h4>
                <div className="space-y-3">
                  <div className="flex items-center gap-3">
                    <Checkbox 
                      id="buyerPaid" 
                      checked={closingData.buyerPaid}
                      onCheckedChange={(checked) => setClosingData({ ...closingData, buyerPaid: !!checked })}
                      data-testid="checkbox-buyer-paid"
                    />
                    <label htmlFor="buyerPaid" className="text-sm cursor-pointer">
                      Buyer has submitted payment
                    </label>
                  </div>
                  <div className="flex items-center gap-3">
                    <Checkbox 
                      id="titleReceived" 
                      checked={closingData.titleReceived}
                      onCheckedChange={(checked) => setClosingData({ ...closingData, titleReceived: !!checked })}
                      data-testid="checkbox-title-received"
                    />
                    <label htmlFor="titleReceived" className="text-sm cursor-pointer">
                      Title documents received
                    </label>
                  </div>
                  <div className="flex items-center gap-3">
                    <Checkbox 
                      id="fundsWired" 
                      checked={closingData.fundsWired}
                      onCheckedChange={(checked) => setClosingData({ ...closingData, fundsWired: !!checked })}
                      data-testid="checkbox-funds-wired"
                    />
                    <label htmlFor="fundsWired" className="text-sm cursor-pointer">
                      Funds wired to escrow/title company
                    </label>
                  </div>
                  <div className="flex items-center gap-3">
                    <Checkbox 
                      id="docsRecorded" 
                      checked={closingData.docsRecorded}
                      onCheckedChange={(checked) => setClosingData({ ...closingData, docsRecorded: !!checked })}
                      data-testid="checkbox-docs-recorded"
                    />
                    <label htmlFor="docsRecorded" className="text-sm cursor-pointer">
                      Documents recorded with county
                    </label>
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                <Label>Closing Notes</Label>
                <Textarea
                  placeholder="Any additional notes about this closing..."
                  value={closingData.notes}
                  onChange={(e) => setClosingData({ ...closingData, notes: e.target.value })}
                  data-testid="textarea-closing-notes"
                />
              </div>

              <Button 
                className="w-full" 
                onClick={handleCloseDeal}
                disabled={closeContractMutation.isPending}
                data-testid="button-close-deal"
              >
                <CheckCircle className="w-4 h-4 mr-2" />
                {closeContractMutation.isPending ? "Closing Deal..." : "Close Deal & Record Revenue"}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
