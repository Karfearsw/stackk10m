import { useState } from "react";
import { Layout } from "@/components/layout/Layout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { format } from "date-fns";
import { FileText, Plus, Trash2 } from "lucide-react";

// M22/M29: LOIs could be created inside Document Management but then
// dead-ended at Draft with no lifecycle UI and no standalone route
// (/lois 404'd). This page owns the lifecycle: draft → sent → accepted /
// declined, plus delete for cleanup.

const STATUS_VARIANT: Record<string, "default" | "secondary" | "outline" | "destructive"> = {
  draft: "outline",
  sent: "secondary",
  accepted: "default",
  declined: "destructive",
};

function money(v: any): string {
  const n = Number(v);
  return Number.isFinite(n) ? `$${n.toLocaleString(undefined, { maximumFractionDigits: 0 })}` : "—";
}

export default function LoisPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState({
    propertyId: "",
    buyerName: "",
    sellerName: "",
    offerAmount: "",
    earnestMoney: "",
    closingDate: "",
    specialTerms: "",
  });

  const { data: lois = [], isLoading } = useQuery<any[]>({
    queryKey: ["/api/lois"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/lois");
      return res.json();
    },
  });

  const { data: properties = [] } = useQuery<any[]>({
    queryKey: ["/api/properties"],
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["/api/lois"] });

  const createMutation = useMutation({
    mutationFn: async (payload: any) => {
      const res = await apiRequest("POST", "/api/lois", payload);
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "LOI created" });
      setCreateOpen(false);
      setForm({ propertyId: "", buyerName: "", sellerName: "", offerAmount: "", earnestMoney: "", closingDate: "", specialTerms: "" });
      invalidate();
    },
    onError: (e: any) => toast({ title: e?.message || "Failed to create LOI", variant: "destructive" }),
  });

  const setStatusMutation = useMutation({
    mutationFn: async ({ id, status }: { id: number; status: string }) => {
      const res = await apiRequest("PATCH", `/api/lois/${id}`, {
        status,
        ...(status === "sent" ? { sentDate: new Date().toISOString() } : {}),
        ...(status === "accepted" || status === "declined" ? { responseDate: new Date().toISOString() } : {}),
      });
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "LOI updated" });
      invalidate();
    },
    onError: (e: any) => toast({ title: e?.message || "Failed to update LOI", variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await apiRequest("DELETE", `/api/lois/${id}`);
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "LOI deleted" });
      invalidate();
    },
    onError: (e: any) => toast({ title: e?.message || "Failed to delete LOI", variant: "destructive" }),
  });

  const submit = () => {
    if (!form.propertyId || !form.buyerName.trim() || !form.sellerName.trim() || !form.offerAmount.trim()) {
      toast({ title: "Property, buyer, seller, and offer amount are required", variant: "destructive" });
      return;
    }
    createMutation.mutate({
      propertyId: parseInt(form.propertyId, 10),
      buyerName: form.buyerName.trim(),
      sellerName: form.sellerName.trim(),
      offerAmount: form.offerAmount,
      earnestMoney: form.earnestMoney || null,
      closingDate: form.closingDate || null,
      specialTerms: form.specialTerms.trim() || null,
      status: "draft",
    });
  };

  const transition = (loi: any): Array<{ label: string; status: string }> => {
    const s = String(loi.status || "draft");
    if (s === "draft") return [{ label: "Mark Sent", status: "sent" }];
    if (s === "sent") return [
      { label: "Accept", status: "accepted" },
      { label: "Decline", status: "declined" },
    ];
    return [];
  };

  return (
    <Layout>
      <div className="p-4 md:p-8 space-y-6">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-2xl md:text-4xl font-display font-bold text-foreground mb-2" data-testid="page-title">
              Letters of Intent
            </h1>
            <p className="text-muted-foreground">Non-binding offers: draft, send, and track responses</p>
          </div>
          <Button onClick={() => setCreateOpen(true)} data-testid="button-new-loi">
            <Plus className="mr-2 h-4 w-4" /> New LOI
          </Button>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5 text-primary" /> All LOIs
            </CardTitle>
            <CardDescription>{lois.length} letter{lois.length === 1 ? "" : "s"} of intent</CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="py-8 text-center text-muted-foreground">Loading…</div>
            ) : lois.length === 0 ? (
              <div className="py-10 text-center">
                <FileText className="mx-auto h-12 w-12 text-muted-foreground/40 mb-3" />
                <p className="font-medium">No letters of intent yet</p>
                <p className="text-sm text-muted-foreground mt-1">Create one to open a negotiation without a binding contract.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {lois.map((loi: any) => (
                  <div key={loi.id} className="flex flex-col gap-3 rounded-lg border p-4 sm:flex-row sm:items-center sm:justify-between" data-testid={`loi-card-${loi.id}`}>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-medium truncate">
                          {money(loi.offerAmount)} — {loi.buyerName} → {loi.sellerName}
                        </span>
                        <Badge variant={STATUS_VARIANT[String(loi.status || "draft")] || "outline"}>
                          {String(loi.status || "draft")}
                        </Badge>
                      </div>
                      <div className="text-xs text-muted-foreground mt-1">
                        {properties.find((p: any) => String(p.id) === String(loi.propertyId))
                          ? `${properties.find((p: any) => String(p.id) === String(loi.propertyId)).address}${properties.find((p: any) => String(p.id) === String(loi.propertyId)).city ? `, ${properties.find((p: any) => String(p.id) === String(loi.propertyId)).city}` : ""}`
                          : `Property #${loi.propertyId}`}
                        {loi.closingDate ? ` · closes ${format(new Date(loi.closingDate), "MMM d, yyyy")}` : ""}
                        {loi.sentDate ? ` · sent ${format(new Date(loi.sentDate), "MMM d")}` : ""}
                      </div>
                      {loi.specialTerms ? (
                        <div className="text-xs text-muted-foreground mt-1 truncate" title={loi.specialTerms}>{loi.specialTerms}</div>
                      ) : null}
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {transition(loi).map((t) => (
                        <Button
                          key={t.status}
                          size="sm"
                          variant={t.status === "declined" ? "outline" : "secondary"}
                          onClick={() => setStatusMutation.mutate({ id: loi.id, status: t.status })}
                          disabled={setStatusMutation.isPending}
                          data-testid={`button-loi-${loi.id}-${t.status}`}
                        >
                          {t.label}
                        </Button>
                      ))}
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-destructive hover:text-destructive"
                        onClick={() => {
                          if (window.confirm(`Delete this LOI (${loi.buyerName} → ${loi.sellerName})? This cannot be undone.`)) {
                            deleteMutation.mutate(loi.id);
                          }
                        }}
                        disabled={deleteMutation.isPending}
                        data-testid={`button-loi-delete-${loi.id}`}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>New Letter of Intent</DialogTitle>
            </DialogHeader>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-1.5 sm:col-span-2">
                <Label>Property</Label>
                <Select value={form.propertyId} onValueChange={(v) => setForm({ ...form, propertyId: v })}>
                  <SelectTrigger data-testid="select-loi-property">
                    <SelectValue placeholder="Select property" />
                  </SelectTrigger>
                  <SelectContent>
                    {properties.map((p: any) => (
                      <SelectItem key={p.id} value={String(p.id)}>{p.address}{p.city ? `, ${p.city}` : ""}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Buyer Name</Label>
                <Input value={form.buyerName} onChange={(e) => setForm({ ...form, buyerName: e.target.value })} data-testid="input-loi-buyer" />
              </div>
              <div className="space-y-1.5">
                <Label>Seller Name</Label>
                <Input value={form.sellerName} onChange={(e) => setForm({ ...form, sellerName: e.target.value })} data-testid="input-loi-seller" />
              </div>
              <div className="space-y-1.5">
                <Label>Offer Amount</Label>
                <Input type="number" value={form.offerAmount} onChange={(e) => setForm({ ...form, offerAmount: e.target.value })} placeholder="150000" data-testid="input-loi-offer" />
              </div>
              <div className="space-y-1.5">
                <Label>Earnest Money</Label>
                <Input type="number" value={form.earnestMoney} onChange={(e) => setForm({ ...form, earnestMoney: e.target.value })} placeholder="5000" data-testid="input-loi-earnest" />
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label>Closing Date</Label>
                <Input type="date" value={form.closingDate} onChange={(e) => setForm({ ...form, closingDate: e.target.value })} data-testid="input-loi-closing" />
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label>Special Terms</Label>
                <Textarea value={form.specialTerms} onChange={(e) => setForm({ ...form, specialTerms: e.target.value })} placeholder="Inspection period, financing, contingencies…" data-testid="textarea-loi-terms" />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
              <Button onClick={submit} disabled={createMutation.isPending} data-testid="button-create-loi">
                {createMutation.isPending ? "Creating…" : "Create LOI"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </Layout>
  );
}
