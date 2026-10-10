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
import {
  FileSignature,
  Plus,
  Send,
  XCircle,
  Download,
  RefreshCw,
  Clock,
  CheckCircle2,
  AlertCircle,
  User,
  Mail,
  Phone,
} from "lucide-react";

const STATUS_CONFIG: Record<string, { variant: "default" | "secondary" | "outline" | "destructive"; icon: any; label: string }> = {
  draft: { variant: "outline", icon: Clock, label: "Draft" },
  sent: { variant: "secondary", icon: Send, label: "Sent" },
  viewed: { variant: "secondary", icon: Clock, label: "Viewed" },
  signed: { variant: "default", icon: CheckCircle2, label: "Signed" },
  declined: { variant: "destructive", icon: XCircle, label: "Declined" },
  expired: { variant: "destructive", icon: AlertCircle, label: "Expired" },
  voided: { variant: "destructive", icon: XCircle, label: "Voided" },
};

type SignerInput = {
  name: string;
  email: string;
  phone: string;
  order: number;
};

export default function EsignPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [showNewDialog, setShowNewDialog] = useState(false);
  const [selectedEnvelope, setSelectedEnvelope] = useState<any>(null);

  // New envelope form
  const [title, setTitle] = useState("");
  const [templateId, setTemplateId] = useState("");
  const [contractId, setContractId] = useState("");
  const [signingMode, setSigningMode] = useState<"sequential" | "parallel">("sequential");
  const [expiresInDays, setExpiresInDays] = useState(14);
  const [message, setMessage] = useState("");
  const [signers, setSigners] = useState<SignerInput[]>([{ name: "", email: "", phone: "", order: 1 }]);

  const { data: contracts } = useQuery<any[]>({
    queryKey: ["/api/contracts"],
  });

  const { data: envelopes, isLoading } = useQuery<any[]>({
    queryKey: ["/api/esign/envelopes"],
  });

  const { data: templates } = useQuery<any[]>({
    queryKey: ["/api/contract-templates"],
  });

  const { data: envelopeDetail } = useQuery<any>({
    queryKey: ["/api/esign/envelopes", selectedEnvelope?.id],
    enabled: !!selectedEnvelope?.id,
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/esign/envelopes", {
        templateId: parseInt(templateId, 10),
        title: title || undefined,
        contractId: contractId ? parseInt(contractId, 10) : undefined,
        signers: signers
          .filter((s) => s.name.trim() && s.email.trim())
          .map((s) => ({
            name: s.name.trim(),
            email: s.email.trim() || undefined,
            phone: s.phone.trim() || undefined,
            order: s.order,
          })),
        signingMode,
        expiresInDays,
        message: message.trim() || undefined,
      });
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/esign/envelopes"] });
      setShowNewDialog(false);
      resetForm();
      setSelectedEnvelope(data);
      toast({ title: "Envelope created", description: "Review and send when ready." });
    },
    onError: (e: any) => {
      toast({ title: "Failed to create envelope", description: e.message, variant: "destructive" });
    },
  });

  const sendMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await apiRequest("POST", `/api/esign/envelopes/${id}/send`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/esign/envelopes"] });
      queryClient.invalidateQueries({ queryKey: ["/api/esign/envelopes", selectedEnvelope?.id] });
      toast({ title: "Envelope sent", description: "Signers have been notified." });
    },
    onError: (e: any) => {
      toast({ title: "Failed to send", description: e.message, variant: "destructive" });
    },
  });

  const voidMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await apiRequest("POST", `/api/esign/envelopes/${id}/void`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/esign/envelopes"] });
      queryClient.invalidateQueries({ queryKey: ["/api/esign/envelopes", selectedEnvelope?.id] });
      toast({ title: "Envelope voided" });
    },
    onError: (e: any) => {
      toast({ title: "Failed to void", description: e.message, variant: "destructive" });
    },
  });

  const resetForm = () => {
    setTitle("");
    setTemplateId("");
    setContractId("");
    setSigningMode("sequential");
    setExpiresInDays(14);
    setMessage("");
    setSigners([{ name: "", email: "", phone: "", order: 1 }]);
  };

  const addSigner = () => {
    setSigners([...signers, { name: "", email: "", phone: "", order: signers.length + 1 }]);
  };

  const updateSigner = (idx: number, field: keyof SignerInput, value: string | number) => {
    const updated = [...signers];
    updated[idx] = { ...updated[idx], [field]: value };
    setSigners(updated);
  };

  const removeSigner = (idx: number) => {
    if (signers.length <= 1) return;
    const updated = signers.filter((_, i) => i !== idx).map((s, i) => ({ ...s, order: i + 1 }));
    setSigners(updated);
  };

  return (
    <Layout>
      <div className="container mx-auto p-6 max-w-7xl">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-3xl font-bold flex items-center gap-2">
              <FileSignature className="h-8 w-8" />
              E-Signatures
            </h1>
            <p className="text-muted-foreground mt-1">
              Create, send, and track electronic signature envelopes
            </p>
          </div>
          <Button onClick={() => setShowNewDialog(true)}>
            <Plus className="h-4 w-4 mr-2" />
            New Envelope
          </Button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Envelope list */}
          <div className="lg:col-span-1">
            <Card>
              <CardHeader>
                <CardTitle>Envelopes</CardTitle>
                <CardDescription>{envelopes?.length || 0} total</CardDescription>
              </CardHeader>
              <CardContent className="space-y-2 max-h-[600px] overflow-y-auto">
                {isLoading && <p className="text-muted-foreground">Loading...</p>}
                {envelopes?.map((env: any) => {
                  const cfg = STATUS_CONFIG[env.status] || STATUS_CONFIG.draft;
                  const Icon = cfg.icon;
                  return (
                    <div
                      key={env.id}
                      onClick={() => setSelectedEnvelope(env)}
                      className={`p-3 rounded-lg border cursor-pointer transition-colors ${
                        selectedEnvelope?.id === env.id
                          ? "border-primary bg-primary/5"
                          : "hover:bg-muted/50"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <p className="font-medium truncate">{env.title || `Envelope #${env.id}`}</p>
                          <p className="text-xs text-muted-foreground">
                            {env.createdAt ? format(new Date(env.createdAt), "MMM d, yyyy") : ""}
                          </p>
                        </div>
                        <Badge variant={cfg.variant} className="shrink-0">
                          <Icon className="h-3 w-3 mr-1" />
                          {cfg.label}
                        </Badge>
                      </div>
                    </div>
                  );
                })}
                {envelopes?.length === 0 && (
                  <p className="text-muted-foreground text-sm text-center py-8">
                    No envelopes yet. Create one to get started.
                  </p>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Envelope detail */}
          <div className="lg:col-span-2">
            {selectedEnvelope ? (
              <EnvelopeDetail
                envelope={envelopeDetail || selectedEnvelope}
                onSend={() => sendMutation.mutate(selectedEnvelope.id)}
                onVoid={() => voidMutation.mutate(selectedEnvelope.id)}
                sendPending={sendMutation.isPending}
                voidPending={voidMutation.isPending}
              />
            ) : (
              <Card>
                <CardContent className="py-16 text-center">
                  <FileSignature className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                  <p className="text-muted-foreground">
                    Select an envelope to view details, or create a new one.
                  </p>
                </CardContent>
              </Card>
            )}
          </div>
        </div>

        {/* New envelope dialog */}
        <Dialog open={showNewDialog} onOpenChange={setShowNewDialog}>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>New Signature Envelope</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div>
                <Label>Document Title</Label>
                <Input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="e.g., Purchase Agreement - 123 Main St"
                />
              </div>
              <div>
                <Label>Template</Label>
                <Select value={templateId} onValueChange={setTemplateId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select a contract template" />
                  </SelectTrigger>
                  <SelectContent>
                    {templates?.map((t: any) => (
                      <SelectItem key={t.id} value={String(t.id)}>
                        {t.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Link to Contract (optional)</Label>
                <Select value={contractId} onValueChange={setContractId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select a contract to anchor this envelope" />
                  </SelectTrigger>
                  <SelectContent>
                    {contracts?.map((c: any) => (
                      <SelectItem key={c.id} value={String(c.id)}>
                        {c.title || `Contract #${c.id}`}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground mt-1">
                  Linking anchors the audit trail. Leave empty for standalone envelopes.
                </p>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <Label>Signing Order</Label>
                  <Select value={signingMode} onValueChange={(v: any) => setSigningMode(v)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="sequential">Sequential (one at a time)</SelectItem>
                      <SelectItem value="parallel">Parallel (all at once)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Expires In (days)</Label>
                  <Input
                    type="number"
                    min={1}
                    max={120}
                    value={expiresInDays}
                    onChange={(e) => setExpiresInDays(parseInt(e.target.value, 10) || 14)}
                  />
                </div>
              </div>
              <div>
                <Label>Message to Signers (optional)</Label>
                <Textarea
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder="Please review and sign at your earliest convenience."
                  rows={2}
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-2">
                  <Label>Signers</Label>
                  <Button variant="outline" size="sm" onClick={addSigner}>
                    <Plus className="h-3 w-3 mr-1" /> Add Signer
                  </Button>
                </div>
                <div className="space-y-3">
                  {signers.map((s, idx) => (
                    <Card key={idx} className="p-3">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-sm font-medium flex items-center gap-1">
                          <User className="h-3 w-3" /> Signer {idx + 1}
                        </span>
                        {signers.length > 1 && (
                          <Button variant="ghost" size="sm" onClick={() => removeSigner(idx)}>
                            Remove
                          </Button>
                        )}
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                        <Input
                          placeholder="Full name *"
                          value={s.name}
                          onChange={(e) => updateSigner(idx, "name", e.target.value)}
                        />
                        <Input
                          placeholder="Email *"
                          type="email"
                          value={s.email}
                          onChange={(e) => updateSigner(idx, "email", e.target.value)}
                        />
                        <Input
                          placeholder="Phone (optional)"
                          value={s.phone}
                          onChange={(e) => updateSigner(idx, "phone", e.target.value)}
                        />
                      </div>
                    </Card>
                  ))}
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowNewDialog(false)}>
                Cancel
              </Button>
              <Button
                onClick={() => createMutation.mutate()}
                disabled={createMutation.isPending || !templateId || !signers.some((s) => s.name.trim() && s.email.trim())}
              >
                {createMutation.isPending ? "Creating..." : "Create Envelope"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </Layout>
  );
}

function EnvelopeDetail({ envelope, onSend, onVoid, sendPending, voidPending }: any) {
  const cfg = STATUS_CONFIG[envelope.status] || STATUS_CONFIG.draft;
  const Icon = cfg.icon;
  const signers = envelope.signers || [];

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between">
          <div>
            <CardTitle>{envelope.title || `Envelope #${envelope.id}`}</CardTitle>
            <CardDescription>
              Created {envelope.createdAt ? format(new Date(envelope.createdAt), "MMM d, yyyy h:mm a") : ""}
              {envelope.expiresAt && ` · Expires ${format(new Date(envelope.expiresAt), "MMM d, yyyy")}`}
            </CardDescription>
          </div>
          <Badge variant={cfg.variant}>
            <Icon className="h-3 w-3 mr-1" />
            {cfg.label}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Signers */}
        <div>
          <h3 className="font-medium mb-3">Signers ({signers.length})</h3>
          <div className="space-y-2">
            {signers.map((s: any, idx: number) => {
              const sCfg = STATUS_CONFIG[s.status] || STATUS_CONFIG.draft;
              const SIcon = sCfg.icon;
              return (
                <div key={s.id || idx} className="flex items-center justify-between p-3 rounded-lg border">
                  <div className="flex items-center gap-3">
                    <div className="h-8 w-8 rounded-full bg-muted flex items-center justify-center">
                      <User className="h-4 w-4" />
                    </div>
                    <div>
                      <p className="font-medium text-sm">{s.name}</p>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        {s.email && (
                          <span className="flex items-center gap-1">
                            <Mail className="h-3 w-3" /> {s.email}
                          </span>
                        )}
                        {s.phone && (
                          <span className="flex items-center gap-1">
                            <Phone className="h-3 w-3" /> {s.phone}
                          </span>
                        )}
                      </div>
                      {s.signedAt && (
                        <p className="text-xs text-green-600">
                          Signed {format(new Date(s.signedAt), "MMM d, yyyy h:mm a")}
                        </p>
                      )}
                    </div>
                  </div>
                  <Badge variant={sCfg.variant}>
                    <SIcon className="h-3 w-3 mr-1" />
                    {sCfg.label}
                  </Badge>
                </div>
              );
            })}
          </div>
        </div>

        {/* Actions */}
        <div className="flex flex-wrap gap-2 pt-4 border-t">
          {envelope.status === "draft" && (
            <Button onClick={onSend} disabled={sendPending}>
              <Send className="h-4 w-4 mr-2" />
              {sendPending ? "Sending..." : "Send for Signature"}
            </Button>
          )}
          {(envelope.status === "sent" || envelope.status === "viewed") && (
            <Button variant="outline" onClick={onSend} disabled={sendPending}>
              <RefreshCw className="h-4 w-4 mr-2" />
              Resend Invitations
            </Button>
          )}
          {envelope.status === "signed" && (
            <Button
              variant="outline"
              onClick={() => window.open(`/api/esign/envelopes/${envelope.id}/pdf`, "_blank")}
            >
              <Download className="h-4 w-4 mr-2" />
              Download Signed PDF
            </Button>
          )}
          {envelope.status === "signed" && (
            <Button
              variant="outline"
              onClick={() => window.open(`/api/esign/envelopes/${envelope.id}/certificate`, "_blank")}
            >
              <CheckCircle2 className="h-4 w-4 mr-2" />
              Certificate of Completion
            </Button>
          )}
          {!["signed", "voided", "declined", "expired"].includes(envelope.status) && (
            <Button variant="destructive" onClick={onVoid} disabled={voidPending}>
              <XCircle className="h-4 w-4 mr-2" />
              {voidPending ? "Voiding..." : "Void Envelope"}
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
