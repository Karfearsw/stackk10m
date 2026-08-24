import { Layout } from "@/components/layout/Layout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { useState } from "react";
import { useParams, useLocation } from "wouter";
import { FileText, Download, Send, Eye, CheckCircle, AlertCircle, Users, Clock, History, Paperclip, StickyNote, ListTodo } from "lucide-react";

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

export default function ContractDetail() {
  const { id } = useParams();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const contractId = parseInt(id || "0", 10);
  const [sendOpen, setSendOpen] = useState(false);
  const [signerName, setSignerName] = useState("");
  const [signerEmail, setSignerEmail] = useState("");
  const [signerUrl, setSignerUrl] = useState("");
  const [voidReason, setVoidReason] = useState("");
  const [voidOpen, setVoidOpen] = useState(false);

  const { data: contract, isLoading } = useQuery<any>({
    queryKey: [`/api/contracts/${contractId}`],
    enabled: Number.isFinite(contractId) && contractId > 0,
  });

  const { data: signers = [] } = useQuery<any[]>({
    queryKey: [`/api/contracts/${contractId}/signers`],
    enabled: Number.isFinite(contractId) && contractId > 0,
  });

  const { data: events = [] } = useQuery<any[]>({
    queryKey: [`/api/contracts/${contractId}/events`],
    enabled: Number.isFinite(contractId) && contractId > 0,
  });

  const sendMutation = useMutation({
    mutationFn: async () => {
      if (!contractId) throw new Error("Missing contract");
      const res = await fetch(`/api/contracts/${contractId}/send`, { method: "POST", credentials: "include" });
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(text || `Failed to send (${res.status})`);
      }
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Contract sent for signature" });
      queryClient.invalidateQueries({ queryKey: [`/api/contracts/${contractId}`] });
      setSendOpen(false);
    },
    onError: (e: any) => toast({ title: e?.message || "Failed to send", variant: "destructive" }),
  });

  const voidMutation = useMutation({
    mutationFn: async () => {
      if (!contractId) throw new Error("Missing contract");
      const res = await fetch(`/api/contracts/${contractId}/void`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ reason: voidReason }),
      });
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(text || `Failed to void (${res.status})`);
      }
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Contract voided" });
      queryClient.invalidateQueries({ queryKey: [`/api/contracts/${contractId}`] });
      setVoidOpen(false);
      setVoidReason("");
    },
    onError: (e: any) => toast({ title: e?.message || "Failed to void", variant: "destructive" }),
  });

  const executeMutation = useMutation({
    mutationFn: async () => {
      if (!contractId) throw new Error("Missing contract");
      const res = await fetch(`/api/contracts/${contractId}/execute`, { method: "POST", credentials: "include" });
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(text || `Failed to execute (${res.status})`);
      }
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Contract executed" });
      queryClient.invalidateQueries({ queryKey: [`/api/contracts/${contractId}`] });
    },
    onError: (e: any) => toast({ title: e?.message || "Failed to execute", variant: "destructive" }),
  });

  const uploadMutation = useMutation({
    mutationFn: async () => {
      if (!contractId) throw new Error("Missing contract");
      const res = await fetch(`/api/contracts/${contractId}/upload-signed`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ documentId: contract?.executedDocumentId || null, reason: "manual upload" }),
      });
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(text || `Failed to upload (${res.status})`);
      }
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Signed copy uploaded" });
      queryClient.invalidateQueries({ queryKey: [`/api/contracts/${contractId}`] });
    },
    onError: (e: any) => toast({ title: e?.message || "Failed to upload", variant: "destructive" }),
  });

  const copySigningLink = async (signer: any) => {
    if (!signer.tokenHash) return;
    const url = `${window.location.origin}/api/sign/signers/${signer.tokenHash}`;
    try {
      await navigator.clipboard.writeText(url);
      toast({ title: "Signing link copied" });
    } catch {
      toast({ title: "Copy failed", variant: "destructive" });
    }
  };

  if (isLoading) {
    return (
      <Layout>
        <div className="flex items-center justify-center min-h-[400px]">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
        </div>
      </Layout>
    );
  }

  if (!contract) {
    return (
      <Layout>
        <div className="text-center py-12">
          <AlertCircle className="w-12 h-12 mx-auto text-muted-foreground/50 mb-3" />
          <p className="text-muted-foreground">Contract not found</p>
        </div>
      </Layout>
    );
  }

  const progress = signers.length > 0 ? Math.round((signers.filter((s: any) => s.status === "signed").length / signers.length) * 100) : 0;

  return (
    <Layout>
      <div className="p-4 md:p-8 space-y-6">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <h1 className="text-2xl md:text-4xl font-display font-bold text-foreground" data-testid="page-title">
                {contract.title || `Contract #${contract.id}`}
              </h1>
              <Badge className={`${STATUS_COLORS[contract.status] || "bg-gray-500"} text-white capitalize`}>{contract.status}</Badge>
            </div>
            <p className="text-muted-foreground">Contract #{contract.id} • {contract.contractType || "Contract"}</p>
          </div>
          <div className="flex items-center gap-2">
            {contract.status === "draft" || contract.status === "ready_to_send" ? (
              <Button size="sm" onClick={() => setSendOpen(true)} data-testid="button-send">
                <Send className="w-4 h-4 mr-2" /> Send for Signature
              </Button>
            ) : null}
            {contract.status === "signed" ? (
              <Button size="sm" onClick={() => executeMutation.mutate()} data-testid="button-execute">
                <CheckCircle className="w-4 h-4 mr-2" /> Execute
              </Button>
            ) : null}
            {contract.status !== "executed" && contract.status !== "voided" ? (
              <Button size="sm" variant="outline" onClick={() => setVoidOpen(true)} data-testid="button-void">
                Void
              </Button>
            ) : null}
            {contract.status === "executed" ? (
              <Button size="sm" variant="secondary" onClick={() => uploadMutation.mutate()} data-testid="button-upload-signed">
                <Paperclip className="w-4 h-4 mr-2" /> Upload Signed Copy
              </Button>
            ) : null}
          </div>
        </div>

        <div className="grid gap-6 lg:grid-cols-3">
          <div className="lg:col-span-2 space-y-6">
            <Tabs defaultValue="overview" className="space-y-4">
              <TabsList>
                <TabsTrigger value="overview" data-testid="tab-overview">Overview</TabsTrigger>
                <TabsTrigger value="signers" data-testid="tab-signers">Signers</TabsTrigger>
                <TabsTrigger value="timeline" data-testid="tab-timeline">Timeline</TabsTrigger>
                <TabsTrigger value="related" data-testid="tab-related">Related</TabsTrigger>
              </TabsList>

              <TabsContent value="overview" className="space-y-4">
                <Card>
                  <CardHeader>
                    <CardTitle>Terms</CardTitle>
                  </CardHeader>
                  <CardContent className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <span className="text-muted-foreground">Purchase Price</span>
                      <div className="font-medium">${parseFloat(contract.purchasePrice || contract.amount || "0").toLocaleString()}</div>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Earnest Money</span>
                      <div className="font-medium">${parseFloat(contract.earnestMoney || "0").toLocaleString()}</div>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Closing Date</span>
                      <div className="font-medium">{contract.executedAt ? new Date(contract.executedAt).toLocaleDateString() : "—"}</div>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Inspection Deadline</span>
                      <div className="font-medium">{contract.inspectionDeadline ? new Date(contract.inspectionDeadline).toLocaleDateString() : "—"}</div>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Sent At</span>
                      <div className="font-medium">{contract.sentAt ? new Date(contract.sentAt).toLocaleString() : "—"}</div>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Executed At</span>
                      <div className="font-medium">{contract.executedAt ? new Date(contract.executedAt).toLocaleString() : "—"}</div>
                    </div>
                  </CardContent>
                </Card>

                {contract.notes && (
                  <Card>
                    <CardHeader>
                      <CardTitle>Notes</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <p className="text-sm whitespace-pre-wrap">{contract.notes}</p>
                    </CardContent>
                  </Card>
                )}
              </TabsContent>

              <TabsContent value="signers" className="space-y-4">
                <Card>
                  <CardHeader>
                    <CardTitle>Signer Progress</CardTitle>
                    <CardDescription>{signers.length} signer(s) • {progress}% complete</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-3">
                      {signers.map((signer: any) => (
                        <div key={signer.id} className="flex items-center justify-between p-3 border border-border rounded-lg">
                          <div className="flex items-center gap-3">
                            <div className={`p-2 rounded-full ${STATUS_COLORS[signer.status] || "bg-gray-500"}`}>
                              <Users className="w-4 h-4 text-white" />
                            </div>
                            <div>
                              <div className="font-medium">{signer.name}</div>
                              <div className="text-sm text-muted-foreground">{signer.email} • {signer.role}</div>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <Badge variant="outline" className="capitalize">{signer.status}</Badge>
                            {signer.tokenHash && (
                              <Button variant="outline" size="sm" onClick={() => copySigningLink(signer)}>
                                Copy Link
                              </Button>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="timeline" className="space-y-4">
                <Card>
                  <CardHeader>
                    <CardTitle>Activity Timeline</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-4">
                      {events.map((event: any) => (
                        <div key={event.id} className="flex gap-3">
                          <div className="mt-1">
                            <History className="w-4 h-4 text-muted-foreground" />
                          </div>
                          <div>
                            <div className="text-sm font-medium capitalize">{event.eventType.replace(/_/g, " ")}</div>
                            <div className="text-xs text-muted-foreground">{new Date(event.createdAt).toLocaleString()}</div>
                            {event.actorType === "user" && <div className="text-xs text-muted-foreground">By user #{event.actorUserId}</div>}
                          </div>
                        </div>
                      ))}
                      {events.length === 0 && (
                        <div className="text-center text-muted-foreground py-8">No events yet</div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="related" className="space-y-4">
                <Card>
                  <CardHeader>
                    <CardTitle>Related Records</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2 text-sm">
                    <div><span className="text-muted-foreground">Property:</span> #{contract.propertyId}</div>
                    {contract.leadId && <div><span className="text-muted-foreground">Lead:</span> #{contract.leadId}</div>}
                    {contract.buyerId && <div><span className="text-muted-foreground">Buyer:</span> #{contract.buyerId}</div>}
                    {contract.sellerContactId && <div><span className="text-muted-foreground">Seller Contact:</span> #{contract.sellerContactId}</div>}
                    {contract.generatedDocumentId && <div><span className="text-muted-foreground">Generated Document:</span> #{contract.generatedDocumentId}</div>}
                    {contract.executedDocumentId && <div><span className="text-muted-foreground">Executed Document:</span> #{contract.executedDocumentId}</div>}
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>
          </div>

          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Quick Actions</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <Button variant="outline" className="w-full justify-start" size="sm" onClick={() => setSendOpen(true)} disabled={contract.status !== "draft" && contract.status !== "ready_to_send"}>
                  <Send className="w-4 h-4 mr-2" /> Send for Signature
                </Button>
                <Button variant="outline" className="w-full justify-start" size="sm" disabled={contract.status !== "signed"} onClick={() => executeMutation.mutate()}>
                  <CheckCircle className="w-4 h-4 mr-2" /> Execute Contract
                </Button>
                <Button variant="outline" className="w-full justify-start" size="sm" onClick={() => uploadMutation.mutate()} disabled={contract.status !== "executed"}>
                  <Paperclip className="w-4 h-4 mr-2" /> Upload Signed Copy
                </Button>
                <Button variant="outline" className="w-full justify-start" size="sm" onClick={() => setVoidOpen(true)} disabled={contract.status === "executed" || contract.status === "voided"}>
                  <AlertCircle className="w-4 h-4 mr-2" /> Void Contract
                </Button>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Status</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-2">
                  <div className={`w-3 h-3 rounded-full ${STATUS_COLORS[contract.status] || "bg-gray-500"}`} />
                  <span className="font-medium capitalize">{contract.status}</span>
                </div>
                <div className="mt-2 text-sm text-muted-foreground">
                  Created: {new Date(contract.createdAt).toLocaleDateString()}
                </div>
              </CardContent>
            </Card>
          </div>
        </div>

        <Dialog open={sendOpen} onOpenChange={setSendOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Send for Signature</DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              <div className="text-sm text-muted-foreground">{contract.title}</div>
              <div className="grid gap-2">
                <Label>Signer name</Label>
                <Input value={signerName} onChange={(e) => setSignerName(e.target.value)} placeholder="Seller name" />
              </div>
              <div className="grid gap-2">
                <Label>Signer email</Label>
                <Input value={signerEmail} onChange={(e) => setSignerEmail(e.target.value)} placeholder="seller@email.com" />
              </div>
            </div>
            <DialogFooter>
              <Button onClick={() => sendMutation.mutate()} disabled={!signerName.trim() || !signerEmail.trim() || sendMutation.isPending}>
                {sendMutation.isPending ? "Sending..." : "Send"}
              </Button>
              <Button variant="outline" onClick={() => setSendOpen(false)}>Close</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={voidOpen} onOpenChange={setVoidOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Void Contract</DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              <div className="text-sm text-muted-foreground">This action cannot be undone.</div>
              <div className="grid gap-2">
                <Label>Reason</Label>
                <Textarea value={voidReason} onChange={(e) => setVoidReason(e.target.value)} placeholder="Reason for voiding..." />
              </div>
            </div>
            <DialogFooter>
              <Button variant="destructive" onClick={() => voidMutation.mutate()} disabled={voidMutation.isPending}>
                {voidMutation.isPending ? "Voiding..." : "Void Contract"}
              </Button>
              <Button variant="outline" onClick={() => setVoidOpen(false)}>Cancel</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </Layout>
  );
}
