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
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Filter, Plus, Search, Building2, MoreHorizontal, Pencil, Trash2 } from "lucide-react";
import { useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useToast } from "@/hooks/use-toast";

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
  const [newLead, setNewLead] = useState({
    address: "",
    city: "",
    state: "FL",
    zipCode: "",
    ownerName: "",
    ownerPhone: "",
    ownerEmail: "",
    estimatedValue: "",
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
      setNewLead({ address: "", city: "", state: "FL", zipCode: "", ownerName: "", ownerPhone: "", ownerEmail: "", estimatedValue: "", status: "new" });
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
    if (newLead.address && newLead.city && newLead.zipCode && newLead.ownerName) {
      await createMutation.mutateAsync(newLead);
    }
  };

  const handleUpdateLead = async () => {
    if (editingLead) {
      await updateMutation.mutateAsync({ 
        id: editingLead.id, 
        data: editingLead 
      });
    }
  };

  const handleConvertToProperty = async (lead: any, e: React.MouseEvent) => {
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
          <div className="relative hidden md:block">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Filter leads..." className="w-[200px] pl-9" />
          </div>
          <Button variant="outline" size="sm">
            <Filter className="mr-2 h-4 w-4" /> Filter
          </Button>
          
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
                  <Label htmlFor="status" className="text-right">Status</Label>
                  <Select value={newLead.status} onValueChange={(value) => setNewLead({...newLead, status: value})}>
                    <SelectTrigger className="col-span-3" data-testid="select-lead-status">
                      <SelectValue placeholder="Select status" />
                    </SelectTrigger>
                    <SelectContent>
                      {statusOptions.map((option) => (
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
            {leads.map((lead: any) => (
              <TableRow key={lead.id} className="hover:bg-muted/50 transition-colors" data-testid={`row-lead-${lead.id}`}>
                <TableCell className="font-medium">{lead.address}, {lead.city}</TableCell>
                <TableCell>{lead.ownerName}</TableCell>
                <TableCell>
                  <Badge variant="outline" className={getStatusBadgeColor(lead.status)}>
                    {statusOptions.find(s => s.value === lead.status)?.label || lead.status}
                  </Badge>
                </TableCell>
                <TableCell>{lead.relasScore || "—"}</TableCell>
                <TableCell>${lead.estimatedValue ? parseInt(lead.estimatedValue).toLocaleString() : "—"}</TableCell>
                <TableCell className="text-muted-foreground">{lead.ownerPhone || "—"}</TableCell>
                <TableCell className="text-right">
                  <div className="flex items-center justify-end gap-2">
                    {lead.status?.toLowerCase().trim() === "under_contract" && (
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
                    )}
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-8 w-8" data-testid={`menu-lead-${lead.id}`}>
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => setEditingLead({...lead, estimatedValue: lead.estimatedValue || ""})}>
                          <Pencil className="mr-2 h-4 w-4" />
                          Edit
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
                <Label htmlFor="edit-status" className="text-right">Status</Label>
                <Select value={editingLead.status} onValueChange={(value) => setEditingLead({...editingLead, status: value})}>
                  <SelectTrigger className="col-span-3" data-testid="select-edit-status">
                    <SelectValue placeholder="Select status" />
                  </SelectTrigger>
                  <SelectContent>
                    {statusOptions.map((option) => (
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
    </Layout>
  );
}
