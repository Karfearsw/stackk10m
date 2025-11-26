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
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Filter, Plus, Search, Building2 } from "lucide-react";
import { useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

export default function Leads() {
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
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
        estimatedValue: lead.estimatedValue || null,
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
    }
  });

  const handleAddLead = async () => {
    if (newLead.address && newLead.city && newLead.zipCode && newLead.ownerName) {
      await createMutation.mutateAsync(newLead);
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
          
          <Dialog>
            <DialogTrigger asChild>
              <Button size="sm" className="bg-primary hover:bg-primary/90">
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
                  <Input id="address" placeholder="123 Main St" className="col-span-3" value={newLead.address} onChange={(e) => setNewLead({...newLead, address: e.target.value})} />
                </div>
                <div className="grid grid-cols-4 items-center gap-4">
                  <Label htmlFor="city" className="text-right">City</Label>
                  <Input id="city" placeholder="Orlando" className="col-span-3" value={newLead.city} onChange={(e) => setNewLead({...newLead, city: e.target.value})} />
                </div>
                <div className="grid grid-cols-4 items-center gap-4">
                  <Label htmlFor="zipCode" className="text-right">Zip Code</Label>
                  <Input id="zipCode" placeholder="32801" className="col-span-3" value={newLead.zipCode} onChange={(e) => setNewLead({...newLead, zipCode: e.target.value})} />
                </div>
                <div className="grid grid-cols-4 items-center gap-4">
                  <Label htmlFor="owner" className="text-right">Owner</Label>
                  <Input id="owner" placeholder="John Doe" className="col-span-3" value={newLead.ownerName} onChange={(e) => setNewLead({...newLead, ownerName: e.target.value})} />
                </div>
                <div className="grid grid-cols-4 items-center gap-4">
                  <Label htmlFor="phone" className="text-right">Phone</Label>
                  <Input id="phone" placeholder="(555) 123-4567" className="col-span-3" value={newLead.ownerPhone} onChange={(e) => setNewLead({...newLead, ownerPhone: e.target.value})} />
                </div>
              </div>
              <DialogFooter>
                <Button onClick={handleAddLead} disabled={createMutation.isPending} className="bg-primary hover:bg-primary/90 text-white">
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
              <TableHead className="text-right">Contact</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {leads.map((lead: any) => (
              <TableRow key={lead.id} className="hover:bg-muted/50 cursor-pointer transition-colors" onClick={() => setLocation(`/properties/${lead.id}`)}>
                <TableCell className="font-medium">{lead.address}, {lead.city}</TableCell>
                <TableCell>{lead.ownerName}</TableCell>
                <TableCell>
                  <Badge className={lead.status === "negotiation" ? "bg-primary text-primary-foreground" : "bg-secondary"}>{lead.status}</Badge>
                </TableCell>
                <TableCell>{lead.relasScore || "—"}</TableCell>
                <TableCell>${lead.estimatedValue ? parseInt(lead.estimatedValue).toLocaleString() : "—"}</TableCell>
                <TableCell className="text-right text-muted-foreground">{lead.ownerPhone || "—"}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        {leads.length === 0 && (
          <div className="text-center py-8 text-muted-foreground">No leads yet. Create one to get started!</div>
        )}
      </div>
    </Layout>
  );
}
