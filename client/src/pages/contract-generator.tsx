import { useState } from "react";
import { Layout } from "@/components/layout/Layout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FileText, Download, Plus, Eye, Save, FileSignature } from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";

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
          <TabsList className="grid w-full grid-cols-4 lg:w-auto">
            <TabsTrigger value="list" data-testid="tab-contracts">
              <FileText className="w-4 h-4 mr-2" />
              Contracts
            </TabsTrigger>
            <TabsTrigger value="create" data-testid="tab-create">
              <Plus className="w-4 h-4 mr-2" />
              Create New
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
            <Card>
              <CardHeader>
                <CardTitle>Active Contracts</CardTitle>
                <CardDescription>View and manage all contract documents</CardDescription>
              </CardHeader>
              <CardContent>
                {contractsLoading ? (
                  <div className="text-center py-8 text-muted-foreground">Loading contracts...</div>
                ) : contracts.length === 0 ? (
                  <div className="text-center py-12">
                    <FileText className="w-12 h-12 mx-auto text-muted-foreground/50 mb-3" />
                    <p className="text-muted-foreground mb-4">No contracts yet</p>
                    <Button onClick={() => setActiveTab("create")} data-testid="button-create-first">
                      <Plus className="w-4 h-4 mr-2" />
                      Create Your First Contract
                    </Button>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {contracts.map((contract: any) => (
                      <div
                        key={contract.id}
                        className="flex items-center justify-between p-4 border border-border rounded-lg hover:bg-accent/5 transition-colors"
                        data-testid={`contract-${contract.id}`}
                      >
                        <div className="flex-1">
                          <h3 className="font-semibold text-foreground">{contract.title}</h3>
                          <div className="flex items-center gap-4 mt-1 text-sm text-muted-foreground">
                            <span>Type: {contract.documentType}</span>
                            <span className="capitalize">Status: {contract.status}</span>
                            <span>Version: {contract.version}</span>
                          </div>
                        </div>
                        <div className="flex gap-2">
                          <Button variant="outline" size="sm" data-testid={`button-view-${contract.id}`}>
                            <Eye className="w-4 h-4 mr-2" />
                            View
                          </Button>
                          {contract.pdfUrl && (
                            <Button variant="outline" size="sm" data-testid={`button-download-${contract.id}`}>
                              <Download className="w-4 h-4 mr-2" />
                              Download
                            </Button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
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
