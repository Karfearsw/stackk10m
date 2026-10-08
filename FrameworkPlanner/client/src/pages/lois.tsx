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
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { format } from "date-fns";
import { FileText, Plus, Trash2, Download, FileSignature, Send } from "lucide-react";

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
  // Item 5 (2026-09-16 audit): the delete icon opened a native window.confirm
  // that never rendered in-context — the button looked dead. Delete intent now
  // flows through this state into an AlertDialog, same as lead delete.
  const [loiToDelete, setLoiToDelete] = useState<any>(null);
  const [loiToSign, setLoiToSign] = useState<any>(null);
  const [signers, setSigners] = useState([{ name: "", email: "", phone: "" }]);
  const [signingMode, setSigningMode] = useState<"sequential" | "parallel">("sequential");
  const [form, setForm] = useState({
    propertyId: "",
    opportunityId: "",
    buyerName: "",
    sellerName: "",
    offerAmount: "",
    earnestMoney: "",
    closingDate: "",
    expiresAt: "",
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

  const { data: opportunities = [] } = useQuery<any[]>({
    queryKey: ["/api/opportunities"],
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
      setForm({ propertyId: "", opportunityId: "", buyerName: "", sellerName: "", offerAmount: "", earnestMoney: "", closingDate: "", expiresAt: "", specialTerms: "" });
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

  const sendForSignatureMutation = useMutation({
    mutationFn: async ({ id, signers, signingMode }: any) => {
      const res = await apiRequest("POST", `/api/lois/${id}/send-for-signature`, {
        signers: signers.filter((s: any) => s.name.trim() && s.email.trim()),
        signingMode,
        expiresInDays: 14,
      });
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "LOI sent for signature", description: "Signers have been notified by email/SMS." });
      setLoiToSign(null);
      setSigners([{ name: "", email: "", phone: "" }]);
      invalidate();
    },
    onError: (e: any) => toast({ title: e?.message || "Failed to send for signature", variant: "destructive" }),
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
      opportunityId: form.opportunityId ? parseInt(form.opportunityId, 10) : null,
      buyerName: form.buyerName.trim(),
      sellerName: form.sellerName.trim(),
      offerAmount: form.offerAmount,
      earnestMoney: form.earnestMoney || null,
      closingDate: form.closingDate || null,
      expiresAt: form.expiresAt || null,
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
                    <div className="flex items-center gap-2 shrink-0 flex-wrap">
                      <Button
                        size="sm"
                        variant="outline"
                        title="Download LOI as PDF"
                        onClick={() => window.open(`/api/lois/${loi.id}/pdf`, "_blank")}
                      >
                        <Download className="h-4 w-4 mr-1" /> PDF
                      </Button>
                      {!loi.envelopeId && loi.status === "draft" && (
                        <Button
                          size="sm"
                          variant="default"
                          title="Send LOI for electronic signature"
                          onClick={() => {
                            setLoiToSign(loi);
                            // Pre-fill buyer and seller as signers
                            setSigners([
                              { name: loi.buyerName || "", email: "", phone: "" },
                              { name: loi.sellerName || "", email: "", phone: "" },
                            ]);
                          }}
                        >
                          <FileSignature className="h-4 w-4 mr-1" /> Send for Signature
                        </Button>
                      )}
                      {loi.envelopeId && (
                        <Button
                          size="sm"
                          variant="secondary"
                          title="View e-sign envelope"
                          onClick={() => window.location.href = "/esign"}
                        >
                          <Send className="h-4 w-4 mr-1" /> In E-Sign
                        </Button>
                      )}
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
                        title="Delete LOI"
                        aria-label={`Delete LOI ${loi.buyerName} to ${loi.sellerName}`}
                        onClick={() => setLoiToDelete(loi)}
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
                <Label>Linked Deal / Opportunity (optional)</Label>
                <Select value={form.opportunityId} onValueChange={(v) => setForm({ ...form, opportunityId: v })}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select a deal (optional)" />
                  </SelectTrigger>
                  <SelectContent>
                    {opportunities.map((o: any) => (
                      <SelectItem key={o.id} value={String(o.id)}>
                        {o.title || o.name || `Deal #${o.id}`}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Closing Date</Label>
                <Input type="date" value={form.closingDate} onChange={(e) => setForm({ ...form, closingDate: e.target.value })} data-testid="input-loi-closing" />
              </div>
              <div className="space-y-1.5">
                <Label>Offer Expires</Label>
                <Input type="date" value={form.expiresAt} onChange={(e) => setForm({ ...form, expiresAt: e.target.value })} />
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

        {/* Send for Signature Dialog */}
        <Dialog open={!!loiToSign} onOpenChange={(open) => { if (!open) setLoiToSign(null); }}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>Send LOI for Electronic Signature</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <p className="text-sm text-muted-foreground">
                This will create an e-sign envelope from the LOI and notify each signer by email and SMS.
              </p>
              <div>
                <Label>Signing Order</Label>
                <Select value={signingMode} onValueChange={(v: any) => setSigningMode(v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="sequential">Sequential (buyer signs first, then seller)</SelectItem>
                    <SelectItem value="parallel">Parallel (everyone at once)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-3">
                <Label>Signers</Label>
                {signers.map((s, idx) => (
                  <div key={idx} className="grid grid-cols-1 gap-2 p-3 border rounded-lg">
                    <Input
                      placeholder={`Signer ${idx + 1} name *`}
                      value={s.name}
                      onChange={(e) => {
                        const u = [...signers]; u[idx] = { ...u[idx], name: e.target.value }; setSigners(u);
                      }}
                    />
                    <Input
                      placeholder="Email *"
                      type="email"
                      value={s.email}
                      onChange={(e) => {
                        const u = [...signers]; u[idx] = { ...u[idx], email: e.target.value }; setSigners(u);
                      }}
                    />
                    <Input
                      placeholder="Phone (for SMS notification)"
                      value={s.phone}
                      onChange={(e) => {
                        const u = [...signers]; u[idx] = { ...u[idx], phone: e.target.value }; setSigners(u);
                      }}
                    />
                  </div>
                ))}
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setLoiToSign(null)}>Cancel</Button>
              <Button
                onClick={() => loiToSign && sendForSignatureMutation.mutate({
                  id: loiToSign.id,
                  signers: signers.map((s, i) => ({ ...s, order: i + 1 })),
                  signingMode,
                })}
                disabled={sendForSignatureMutation.isPending || !signers.some((s) => s.name.trim() && s.email.trim())}
              >
                {sendForSignatureMutation.isPending ? "Sending..." : "Send for Signature"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <AlertDialog open={!!loiToDelete} onOpenChange={(open) => { if (!open) setLoiToDelete(null); }}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete this LOI?</AlertDialogTitle>
              <AlertDialogDescription>
                {loiToDelete ? (
                  <>Delete the LOI from <span className="font-medium text-foreground">{loiToDelete.buyerName}</span> to <span className="font-medium text-foreground">{loiToDelete.sellerName}</span>? This cannot be undone.</>
                ) : (
                  "This cannot be undone."
                )}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={deleteMutation.isPending}>Cancel</AlertDialogCancel>
              <AlertDialogAction
                disabled={deleteMutation.isPending}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                onClick={() => {
                  if (!loiToDelete) return;
                  deleteMutation.mutate(loiToDelete.id, {
                    onSuccess: () => setLoiToDelete(null),
                  });
                }}
              >
                {deleteMutation.isPending ? "Deleting…" : "Delete LOI"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </Layout>
  );
}
