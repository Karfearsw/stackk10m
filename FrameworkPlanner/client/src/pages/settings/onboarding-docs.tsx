/**
 * Onboarding Documents — Offer Letter, ICA, W-9 workflow.
 *
 * Managers: view templates, see per-agent document status, send for signature.
 * Agents: view and sign pending documents (W-9 is agent-filled).
 */
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Layout } from "@/components/layout/Layout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { FileText, Send, Eye, CheckCircle, Clock, AlertCircle, PenLine } from "lucide-react";

const DOC_LABELS: Record<string, string> = {
  offer_letter: "Offer Letter",
  ica: "Independent Contractor Agreement",
  w9: "IRS Form W-9",
};

const STATUS_COLORS: Record<string, string> = {
  pending: "bg-gray-500",
  sent: "bg-blue-500",
  viewed: "bg-yellow-500",
  signed: "bg-purple-500",
  completed: "bg-green-500",
};

async function api(path: string, opts?: RequestInit) {
  const res = await fetch(path, { credentials: "include", headers: { "Content-Type": "application/json" }, ...opts });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.message || `Request failed (${res.status})`);
  return json;
}

function isManager(user: any) {
  return ["admin", "super_admin", "manager", "team_leader"].includes(user?.role);
}

export default function OnboardingDocs() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const manager = isManager(user);

  const [selectedUserId, setSelectedUserId] = useState<string>("");
  const [viewDoc, setViewDoc] = useState<any | null>(null);
  const [signOpen, setSignOpen] = useState<any | null>(null);

  const { data: templatesData } = useQuery({
    queryKey: ["onboarding-doc-templates"],
    queryFn: () => api("/api/onboarding/docs/templates"),
  });

  const { data: usersData } = useQuery({
    queryKey: ["/api/users"],
    queryFn: () => api("/api/users"),
    enabled: manager,
  });
  const users: any[] = usersData?.users ?? usersData ?? [];

  const { data: docsData, refetch: refetchDocs } = useQuery({
    queryKey: ["onboarding-docs", selectedUserId],
    queryFn: () => api(`/api/onboarding/docs/${selectedUserId}`),
    enabled: manager && !!selectedUserId,
  });

  const { data: myPending } = useQuery({
    queryKey: ["onboarding-docs-pending-mine"],
    queryFn: () => api("/api/onboarding/docs/pending/mine"),
    enabled: !manager,
  });

  const { data: myDocs } = useQuery({
    queryKey: ["onboarding-docs-mine"],
    queryFn: () => api(`/api/onboarding/docs/${(user as any)?.id}`),
    enabled: !!user && !manager,
  });

  const sendMutation = useMutation({
    mutationFn: ({ userId, docType }: { userId: number; docType: string }) =>
      api(`/api/onboarding/docs/send/${userId}`, { method: "POST", body: JSON.stringify({ docType }) }),
    onSuccess: () => { toast({ title: "Document sent" }); refetchDocs(); },
    onError: (e: any) => toast({ title: "Send failed", description: e.message, variant: "destructive" }),
  });

  const completeMutation = useMutation({
    mutationFn: (docId: number) => api(`/api/onboarding/docs/${docId}/complete`, { method: "POST" }),
    onSuccess: () => { toast({ title: "Marked completed — checklist updated" }); refetchDocs(); queryClient.invalidateQueries({ queryKey: ["onboarding-docs-pending-mine"] }); },
    onError: (e: any) => toast({ title: "Failed", description: e.message, variant: "destructive" }),
  });

  return (
    <Layout>
      <div className="p-6 max-w-6xl mx-auto space-y-6">
        <div>
          <h1 className="text-2xl font-bold">Onboarding Documents</h1>
          <p className="text-muted-foreground">Offer Letter, Independent Contractor Agreement, and W-9 — tracked against the onboarding checklist.</p>
        </div>

        {manager ? (
          <Tabs defaultValue="agents">
            <TabsList>
              <TabsTrigger value="agents">Agent Documents</TabsTrigger>
              <TabsTrigger value="templates">Templates</TabsTrigger>
            </TabsList>

            <TabsContent value="agents" className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle>Select Agent</CardTitle>
                </CardHeader>
                <CardContent>
                  <Select value={selectedUserId} onValueChange={setSelectedUserId}>
                    <SelectTrigger className="max-w-sm"><SelectValue placeholder="Choose an agent…" /></SelectTrigger>
                    <SelectContent>
                      {users.map((u: any) => (
                        <SelectItem key={u.id} value={String(u.id)}>{u.firstName} {u.lastName} ({u.email})</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </CardContent>
              </Card>

              {selectedUserId && (
                <Card>
                  <CardHeader>
                    <CardTitle>Documents</CardTitle>
                    <CardDescription>Send the Offer Letter and ICA. The W-9 is filled out by the agent.</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="flex gap-2">
                      <Button size="sm" onClick={() => sendMutation.mutate({ userId: Number(selectedUserId), docType: "offer_letter" })} disabled={sendMutation.isPending}>
                        <Send className="h-4 w-4 mr-1" /> Send Offer Letter
                      </Button>
                      <Button size="sm" onClick={() => sendMutation.mutate({ userId: Number(selectedUserId), docType: "ica" })} disabled={sendMutation.isPending}>
                        <Send className="h-4 w-4 mr-1" /> Send ICA
                      </Button>
                    </div>
                    {(docsData?.documents ?? []).map((d: any) => (
                      <div key={d.id} className="flex items-center justify-between border rounded-lg p-3">
                        <div className="flex items-center gap-3">
                          <FileText className="h-5 w-5 text-muted-foreground" />
                          <div>
                            <p className="font-medium">{DOC_LABELS[d.doc_type] ?? d.doc_type}</p>
                            <p className="text-xs text-muted-foreground">
                              Sent {d.sent_at ? new Date(d.sent_at).toLocaleDateString() : "—"}
                              {d.signed_at ? ` · Signed ${new Date(d.signed_at).toLocaleDateString()}` : ""}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge className={STATUS_COLORS[d.status] ?? ""}>{d.status}</Badge>
                          <Button size="sm" variant="outline" onClick={() => setViewDoc(d)}><Eye className="h-4 w-4 mr-1" /> View</Button>
                          {d.status === "signed" && (
                            <Button size="sm" onClick={() => completeMutation.mutate(d.id)}><CheckCircle className="h-4 w-4 mr-1" /> Complete</Button>
                          )}
                        </div>
                      </div>
                    ))}
                    {(docsData?.documents ?? []).length === 0 && (
                      <p className="text-sm text-muted-foreground">No documents yet for this agent.</p>
                    )}
                  </CardContent>
                </Card>
              )}
            </TabsContent>

            <TabsContent value="templates" className="space-y-4">
              {(templatesData?.templates ?? []).map((t: any) => (
                <Card key={t.docType}>
                  <CardHeader>
                    <CardTitle>{t.label}</CardTitle>
                    <CardDescription>
                      {t.docType === "w9" ? "Agent-filled IRS form — no template needed." : (
                        t.template
                          ? `Template v${t.template.version} · Status: ${t.template.status} · ${t.template.mergeFields?.length ?? 0} merge fields`
                          : "Template not seeded — run migration 0092."
                      )}
                    </CardDescription>
                  </CardHeader>
                  {t.docType === "w9" && (
                    <CardContent>
                      <p className="text-sm text-muted-foreground mb-2">Fields the agent completes:</p>
                      <div className="flex flex-wrap gap-1">
                        {(t.formFields ?? []).map((f: any) => (
                          <Badge key={f.key} variant="outline">{f.label}{f.required ? " *" : ""}</Badge>
                        ))}
                      </div>
                    </CardContent>
                  )}
                </Card>
              ))}
              <p className="text-xs text-muted-foreground flex items-center gap-1">
                <AlertCircle className="h-3 w-3" /> Offer Letter and ICA templates require attorney review before production use.
              </p>
            </TabsContent>
          </Tabs>
        ) : (
          <div className="space-y-4">
            {(myPending?.pending ?? []).length > 0 && (
              <Card className="border-yellow-500">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2"><Clock className="h-5 w-5 text-yellow-500" /> Action Needed</CardTitle>
                  <CardDescription>You have onboarding documents waiting for your signature.</CardDescription>
                </CardHeader>
              </Card>
            )}
            {(myDocs?.documents ?? []).map((d: any) => (
              <Card key={d.id}>
                <CardContent className="flex items-center justify-between p-4">
                  <div className="flex items-center gap-3">
                    <FileText className="h-5 w-5 text-muted-foreground" />
                    <div>
                      <p className="font-medium">{DOC_LABELS[d.doc_type] ?? d.doc_type}</p>
                      <p className="text-xs text-muted-foreground">{d.doc_type === "w9" ? "Fill out and sign" : "Review and sign"}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge className={STATUS_COLORS[d.status] ?? ""}>{d.status}</Badge>
                    {["sent", "viewed"].includes(d.status) && (
                      <Button size="sm" onClick={() => setSignOpen(d)}><PenLine className="h-4 w-4 mr-1" /> {d.doc_type === "w9" ? "Fill Out & Sign" : "Review & Sign"}</Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
            {(myDocs?.documents ?? []).length === 0 && (
              <p className="text-sm text-muted-foreground">No onboarding documents assigned to you yet.</p>
            )}
          </div>
        )}

        {/* View dialog (manager + agent) */}
        <Dialog open={!!viewDoc} onOpenChange={() => setViewDoc(null)}>
          <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{viewDoc && (DOC_LABELS[viewDoc.doc_type] ?? viewDoc.doc_type)}</DialogTitle>
              <DialogDescription>Status: {viewDoc?.status}</DialogDescription>
            </DialogHeader>
            {viewDoc?.doc_type === "w9" ? (
              <W9Summary formData={viewDoc.form_data} />
            ) : (
              <pre className="whitespace-pre-wrap text-sm bg-muted p-4 rounded-lg">{viewDoc?.rendered_body || "No content"}</pre>
            )}
            {viewDoc?.signature_data && (
              <div className="mt-4 border-t pt-3">
                <p className="text-sm font-medium">Signature ({viewDoc.signature_type})</p>
                <p className="text-lg italic">{viewDoc.signature_type === "typed" ? viewDoc.signature_data : "[signature on file]"}</p>
                <p className="text-xs text-muted-foreground">Signed {viewDoc.signed_at ? new Date(viewDoc.signed_at).toLocaleString() : ""}</p>
              </div>
            )}
          </DialogContent>
        </Dialog>

        {/* Sign dialog (agent) */}
        {signOpen && (
          <SignDialog
            doc={signOpen}
            onClose={() => setSignOpen(null)}
            onSigned={() => {
              setSignOpen(null);
              queryClient.invalidateQueries({ queryKey: ["onboarding-docs-mine"] });
              queryClient.invalidateQueries({ queryKey: ["onboarding-docs-pending-mine"] });
            }}
          />
        )}
      </div>
    </Layout>
  );
}

function W9Summary({ formData }: { formData: any }) {
  const fd = formData || {};
  const rows: Array<[string, string]> = [
    ["Name", fd.name], ["Business name", fd.business_name], ["Tax classification", fd.tax_classification],
    ["Address", [fd.address, fd.city, fd.state, fd.zip].filter(Boolean).join(", ")],
    ["TIN", fd.tin ? "***-**-" + String(fd.tin).slice(-4) : ""],
  ];
  return (
    <div className="space-y-2">
      {rows.map(([k, v]) => (
        <div key={k} className="flex justify-between text-sm border-b pb-1">
          <span className="text-muted-foreground">{k}</span><span className="font-medium">{v || "—"}</span>
        </div>
      ))}
    </div>
  );
}

function SignDialog({ doc, onClose, onSigned }: { doc: any; onClose: () => void; onSigned: () => void }) {
  const { toast } = useToast();
  const [body, setBody] = useState<string | null>(null);
  const [formData, setFormData] = useState<Record<string, any>>({});
  const [sigType, setSigType] = useState("typed");
  const [sigData, setSigData] = useState("");
  const [w9Fields, setW9Fields] = useState<any[]>([]);

  const { isLoading } = useQuery({
    queryKey: ["onboarding-doc-view", doc.id],
    queryFn: async () => {
      const j = await api(`/api/onboarding/docs/view/${doc.id}`);
      setBody(j.document?.rendered_body || null);
      if (doc.doc_type === "w9") {
        const t = await api("/api/onboarding/docs/templates");
        setW9Fields(t.templates?.find((x: any) => x.docType === "w9")?.formFields ?? []);
      }
      return j;
    },
  });

  const signMutation = useMutation({
    mutationFn: () => api(`/api/onboarding/docs/${doc.id}/sign`, {
      method: "POST",
      body: JSON.stringify({ signatureType: sigType, signatureData: sigData, formData: doc.doc_type === "w9" ? formData : undefined }),
    }),
    onSuccess: () => { toast({ title: doc.doc_type === "w9" ? "W-9 submitted" : "Document signed" }); onSigned(); },
    onError: (e: any) => toast({ title: "Failed", description: e.message, variant: "destructive" }),
  });

  const setF = (key: string, val: any) => setFormData((p) => ({ ...p, [key]: val }));

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{DOC_LABELS[doc.doc_type] ?? doc.doc_type}</DialogTitle>
          <DialogDescription>
            {doc.doc_type === "w9" ? "Complete all required fields, then sign." : "Read carefully, then sign below."}
          </DialogDescription>
        </DialogHeader>

        {isLoading ? <p className="text-sm text-muted-foreground">Loading…</p> : (
          <>
            {doc.doc_type === "w9" ? (
              <div className="space-y-4">
                {w9Fields.map((f: any) => (
                  <div key={f.key}>
                    <Label>{f.label}{f.required && " *"}</Label>
                    {f.type === "select" ? (
                      <Select value={formData[f.key] || ""} onValueChange={(v) => setF(f.key, v)}>
                        <SelectTrigger><SelectValue placeholder="Select…" /></SelectTrigger>
                        <SelectContent>{(f.options ?? []).map((o: string) => <SelectItem key={o} value={o}>{o}</SelectItem>)}</SelectContent>
                      </Select>
                    ) : f.type === "checkbox" ? (
                      <div className="flex items-start gap-2 mt-1">
                        <Checkbox checked={!!formData[f.key]} onCheckedChange={(v) => setF(f.key, !!v)} />
                        <span className="text-sm">I agree</span>
                      </div>
                    ) : (
                      <Input
                        type={f.sensitive ? "password" : "text"}
                        value={formData[f.key] || ""}
                        onChange={(e) => setF(f.key, e.target.value)}
                        placeholder={f.label}
                      />
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <pre className="whitespace-pre-wrap text-sm bg-muted p-4 rounded-lg max-h-96 overflow-y-auto">{body || "Loading…"}</pre>
            )}

            <div className="border-t pt-4 space-y-3">
              <Label>Signature</Label>
              <Select value={sigType} onValueChange={setSigType}>
                <SelectTrigger className="max-w-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="typed">Type my name</SelectItem>
                  <SelectItem value="drawn">Draw (paste data URI — MVP)</SelectItem>
                </SelectContent>
              </Select>
              {sigType === "typed" ? (
                <Input value={sigData} onChange={(e) => setSigData(e.target.value)} placeholder="Type your full legal name" className="italic text-lg" />
              ) : (
                <Textarea value={sigData} onChange={(e) => setSigData(e.target.value)} placeholder="Paste signature data URI (drawing pad coming in v2)" rows={2} />
              )}
              <p className="text-xs text-muted-foreground">
                By signing, you agree to the terms above. Your IP address and timestamp are recorded.
              </p>
              <div className="flex gap-2">
                <Button onClick={() => signMutation.mutate()} disabled={signMutation.isPending || !sigData.trim()}>
                  {doc.doc_type === "w9" ? "Submit W-9" : "Sign Document"}
                </Button>
                <Button variant="outline" onClick={onClose}>Cancel</Button>
              </div>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
