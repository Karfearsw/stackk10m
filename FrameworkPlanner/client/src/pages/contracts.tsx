import { Layout } from "@/components/layout/Layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Plus, Filter, FileText, Download, Eye, AlertCircle, ChevronRight } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { toast } from "sonner";
import { useMemo, useState } from "react";
import { apiRequest } from "@/lib/queryClient";

const CONTRACT_STATUSES = [
  { value: "draft", label: "Draft" },
  { value: "ready_to_send", label: "Ready to Send" },
  { value: "sent", label: "Sent" },
  { value: "viewed", label: "Viewed" },
  { value: "partially_signed", label: "Partially Signed" },
  { value: "signed", label: "Signed" },
  { value: "executed", label: "Executed" },
  { value: "declined", label: "Declined" },
  { value: "expired", label: "Expired" },
  { value: "voided", label: "Voided" },
] as const;

const STATUS_COLORS: Record<string, string> = {
  draft: "bg-gray-500",
  ready_to_send: "bg-blue-400",
  sent: "bg-blue-600",
  viewed: "bg-blue-400",
  partially_signed: "bg-yellow-600",
  signed: "bg-green-600",
  executed: "bg-green-700",
  declined: "bg-red-600",
  expired: "bg-gray-600",
  voided: "bg-red-700",
};

type Contract = {
  id: number;
  propertyId: number | null;
  buyerId: number | null;
  sellerId: number | null;
  amount: string;
  status: string;
  signDate: string | null;
  closeDate: string | null;
  notes: string | null;
  createdAt?: string;
  updatedAt?: string;
  contractType?: string;
  title?: string;
  purchasePrice?: string;
  earnestMoney?: string;
  sentAt?: string;
  executedAt?: string;
};

export default function Contracts() {
  const queryClient = useQueryClient();
  const [location] = useLocation();
  const [createOpen, setCreateOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    propertyId: "",
    buyerId: "",
    sellerId: "",
    amount: "",
    status: "draft",
    notes: "",
  });

  const parseStatusIn = (raw: string | null): string[] => {
    if (!raw) return [];
    return raw.split(",").map((s) => s.trim()).filter(Boolean);
  };

  const urlParams = useMemo(() => {
    const params = new URLSearchParams(location.split("?")[1] || "");
    return {
      tab: params.get("tab") || "list",
      statusIn: parseStatusIn(params.get("statusIn")),
    };
  }, [location]);

  const { data: contracts = [], isLoading } = useQuery({
    queryKey: ["/api/contracts", urlParams.statusIn],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (urlParams.statusIn.length > 0) {
        params.set("statusIn", urlParams.statusIn.join(","));
      }
      const url = `/api/contracts${params.toString() ? `?${params.toString()}` : ""}`;
      const res = await fetch(url, { credentials: "include" });
      if (!res.ok) throw new Error(`Failed to fetch contracts (${res.status})`);
      return res.json();
    },
  });

  const createMutation = useMutation({
    mutationFn: async (data: typeof form) => {
      const res = await apiRequest("POST", "/api/contracts", {
        propertyId: data.propertyId ? parseInt(data.propertyId) : undefined,
        buyerId: data.buyerId ? parseInt(data.buyerId) : undefined,
        sellerId: data.sellerId ? parseInt(data.sellerId) : undefined,
        amount: data.amount,
        status: data.status,
        notes: data.notes || null,
      });
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(text || `Failed to create contract (${res.status})`);
      }
      return res.json();
    },
    onSuccess: () => {
      toast.success("Contract created");
      setCreateOpen(false);
      setForm({ propertyId: "", buyerId: "", sellerId: "", amount: "", status: "draft", notes: "" });
      queryClient.invalidateQueries({ queryKey: ["/api/contracts"] });
    },
    onError: (e: any) => {
      let msg = e?.message || "Failed to create contract";
      try {
        const parsed = JSON.parse(msg);
        if (Array.isArray(parsed) && parsed[0]?.message) {
          msg = parsed[0].message;
        }
      } catch {}
      toast.error(msg);
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!form.propertyId) {
      setError("Property ID is required");
      return;
    }
    if (!form.amount) {
      setError("Amount is required");
      return;
    }
    createMutation.mutate(form);
  };

  const filtered = useMemo(() => {
    if (urlParams.statusIn.length === 0) return contracts;
    return contracts.filter((c: Contract) => urlParams.statusIn.includes(c.status));
  }, [contracts, urlParams.statusIn]);

  const totalContracts = filtered.length;
  const signedContracts = filtered.filter((c: Contract) => c.status === "signed" || c.status === "executed").length;
  const pendingContracts = filtered.filter((c: Contract) => ["sent", "viewed", "partially_signed"].includes(c.status)).length;
  const completedContracts = filtered.filter((c: Contract) => c.status === "executed").length;

  return (
    <Layout>
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-3xl font-bold tracking-tight">Contracts</h1>
          <p className="text-muted-foreground">Manage purchase agreements and contracts.</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" asChild>
            <a href="/contract-generator"><Plus className="mr-2 h-4 w-4" /> New Contract</a>
          </Button>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-4 mb-6">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">Total Contracts</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{totalContracts}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">Pending Signature</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-primary">{pendingContracts}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">Signed / Executed</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{signedContracts}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">Executed</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{completedContracts}</div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <div className="flex justify-between items-center">
            <div>
              <CardTitle>All Contracts</CardTitle>
              <CardDescription>View and manage all contracts</CardDescription>
            </div>
            <div className="flex gap-2">
              <Select value={urlParams.statusIn[0] || "__all__"} onValueChange={(v) => {
                const params = new URLSearchParams(window.location.search);
                if (v && v !== "__all__") params.set("statusIn", v); else params.delete("statusIn");
                window.location.search = params.toString();
              }}>
                <SelectTrigger className="w-40">
                  <SelectValue placeholder="Filter status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">All</SelectItem>
                  {CONTRACT_STATUSES.map((s) => (
                    <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
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
              <Button asChild>
                <a href="/contracts/new">Create Your First Contract</a>
              </Button>
            </div>
          ) : (
            <div className="space-y-3">
              {contracts.map((contract: Contract) => (
                <div
                  key={contract.id}
                  className="flex items-center justify-between p-4 border border-border rounded-lg hover:bg-accent/5 transition-colors"
                  data-testid={`contract-${contract.id}`}
                >
                  <div className="flex items-center gap-4 flex-1">
                    <div className={`p-2 rounded-full ${STATUS_COLORS[contract.status] || "bg-gray-500"}`}>
                      <FileText className="w-4 h-4 text-white" />
                    </div>
                    <div>
                      <h3 className="font-semibold text-foreground">{contract.title || `Contract #${contract.id}`}</h3>
                      <div className="flex items-center gap-4 mt-1 text-sm text-muted-foreground">
                        <span className="capitalize">{contract.contractType || "Contract"}</span>
                        <Badge variant="outline" className={`${STATUS_COLORS[contract.status]}/10 capitalize`}>
                          {contract.status}
                        </Badge>
                        <span>Property: {contract.propertyId}</span>
                      </div>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" asChild>
                      <a href={`/contracts/${contract.id}`}><Eye className="w-4 h-4 mr-2" /> View</a>
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New Contract</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label>Property ID</Label>
              <Input value={form.propertyId} onChange={(e) => setForm({ ...form, propertyId: e.target.value })} placeholder="1" required />
            </div>
            <div className="space-y-2">
              <Label>Amount</Label>
              <Input value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} placeholder="150000" required />
            </div>
            <div className="space-y-2">
              <Label>Notes</Label>
              <Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="Optional notes..." />
            </div>
            {error && <div className="text-sm text-red-600">{error}</div>}
            <DialogFooter>
              <Button type="submit" disabled={createMutation.isPending}>
                {createMutation.isPending ? "Creating..." : "Create Contract"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </Layout>
  );
}
