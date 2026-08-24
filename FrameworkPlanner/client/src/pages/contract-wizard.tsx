import { useState, useEffect, useMemo, useRef } from "react";
import { Layout } from "@/components/layout/Layout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocation, useSearch } from "wouter";
import { apiRequest } from "@/lib/queryClient";
import { FileText, Plus, Send, Save, Eye, ChevronRight, ChevronLeft, CheckCircle, AlertCircle, Users, FileSignature } from "lucide-react";

const STEPS = ["Template", "Records", "Review", "Signers", "Send"] as const;
type Step = typeof STEPS[number];

export default function ContractWizard() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [location, setLocation] = useLocation();
  const [step, setStep] = useState<Step>("Template");
  const [contractId, setContractId] = useState<number | null>(null);
  const [previewContent, setPreviewContent] = useState("");
  const [previewOpen, setPreviewOpen] = useState(false);
  const [validationErrors, setValidationErrors] = useState<string[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);

  const [form, setForm] = useState({
    templateId: "",
    propertyId: "",
    leadId: "",
    buyerId: "",
    sellerContactId: "",
    purchasePrice: "",
    earnestMoney: "",
    closingDate: "",
    inspectionDeadline: "",
    title: "",
    contractType: "",
  });

  const [signers, setSigners] = useState<Array<{ name: string; email: string; role: string; signingOrder: number }>>([
    { name: "", email: "", role: "signer", signingOrder: 0 },
  ]);

  const { data: templates = [] } = useQuery<any[]>({ queryKey: ["/api/contract-templates"] });
  const { data: properties = [] } = useQuery<any[]>({ queryKey: ["/api/properties"] });
  const { data: leadsResp = {} } = useQuery<any>({ queryKey: ["/api/leads"] });
  const leads = Array.isArray((leadsResp as any)?.items) ? (leadsResp as any).items : Array.isArray(leadsResp) ? leadsResp : [];
  const { data: buyers = [] } = useQuery<any[]>({ queryKey: ["/api/buyers"] });
  const { data: contacts = [] } = useQuery<any[]>({ queryKey: ["/api/contacts"] });

  const selectedTemplate = useMemo(() => templates.find((t: any) => String(t.id) === form.templateId), [templates, form.templateId]);
  const selectedProperty = useMemo(() => properties.find((p: any) => String(p.id) === form.propertyId), [properties, form.propertyId]);
  const selectedLead = useMemo(() => leads.find((l: any) => String(l.id) === form.leadId), [leads, form.leadId]);
  const selectedBuyer = useMemo(() => buyers.find((b: any) => String(b.id) === form.buyerId), [buyers, form.buyerId]);
  const selectedSeller = useMemo(() => contacts.find((c: any) => String(c.id) === form.sellerContactId), [contacts, form.sellerContactId]);


  // Phase 6: honor ?opportunityId=&propertyId= launch context so Generate
  // Contract from an Opportunity prefills the deal.
  const search = useSearch();
  const searchParams = useMemo(() => new URLSearchParams(search || ""), [search]);
  const rawOpportunityId = searchParams.get("opportunityId");
  const rawPropertyId = searchParams.get("propertyId");
  const [opportunityId, setOpportunityId] = useState<number | null>(
    rawOpportunityId ? parseInt(rawOpportunityId, 10) || null : null
  );
  const prefilledOnce = useRef(false);

  const [propFilter, setPropFilter] = useState("");
  const [leadFilter, setLeadFilter] = useState("");
  const [buyerFilter, setBuyerFilter] = useState("");

  const filteredProperties = useMemo(
    () =>
      properties.filter((p: any) =>
        !propFilter || `${p.address || ""} ${p.city || ""}`.toLowerCase().includes(propFilter.toLowerCase())
      ),
    [properties, propFilter]
  );
  const filteredLeads = useMemo(
    () =>
      leads
        .filter((l: any) =>
          !leadFilter || `${l.address || ""} ${l.ownerName || ""}`.toLowerCase().includes(leadFilter.toLowerCase())
        )
        .slice(0, 300),
    [leads, leadFilter]
  );
  const filteredBuyers = useMemo(
    () =>
      buyers.filter((b: any) =>
        !buyerFilter || `${b.name || ""} ${b.company || ""}`.toLowerCase().includes(buyerFilter.toLowerCase())
      ),
    [buyers, buyerFilter]
  );

  useEffect(() => {
    if (prefilledOnce.current) return;
    prefilledOnce.current = true;
    if (rawPropertyId && !form.propertyId) {
      setForm((f) => ({ ...f, propertyId: rawPropertyId }));
    }
    if (opportunityId) {
      (async () => {
        try {
          const res = await apiRequest("GET", `/api/opportunities/${opportunityId}`);
          const opp = await res.json();
          if (opp?.property) {
            setForm((f) => ({
              ...f,
              propertyId: String(opp.property.id || "") || f.propertyId,
              leadId: opp.lead?.id ? String(opp.lead.id) : f.leadId,
              purchasePrice: opp.property.purchasePrice ? String(opp.property.purchasePrice) : f.purchasePrice,
              title: (f.title || opp.property.address)
                ? `${opp.property.address || "Opportunity"} ${opp.property.city || ""}`.trim()
                : f.title,
            }));
          }
        } catch {
          /* prefill is best-effort */
        }
      })();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [opportunityId, rawPropertyId]);

  const createContractMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await fetch("/api/contracts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(text || `Failed to create contract (${res.status})`);
      }
      return res.json();
    },
  });

  const updateContractMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: any }) => {
      const res = await fetch(`/api/contracts/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(text || `Failed to update contract (${res.status})`);
      }
      return res.json();
    },
  });

  const addSignerMutation = useMutation({
    mutationFn: async ({ contractId, signer }: { contractId: number; signer: any }) => {
      const res = await fetch(`/api/contracts/${contractId}/signers`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(signer),
      });
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(text || `Failed to add signer (${res.status})`);
      }
      return res.json();
    },
  });

  const validateMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(`/api/contracts/${id}/validate`, {
        method: "POST",
        credentials: "include",
      });
      if (!res.ok) throw new Error("Validation failed");
      return res.json();
    },
  });

  const sendMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(`/api/contracts/${id}/send`, {
        method: "POST",
        credentials: "include",
      });
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(text || `Failed to send (${res.status})`);
      }
      return res.json();
    },
  });

  const generateDocumentMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(`/api/contracts/${id}/generate-document`, {
        method: "POST",
        credentials: "include",
      });
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(text || `Failed to generate document (${res.status})`);
      }
      return res.json();
    },
  });

  useEffect(() => {
    if (form.propertyId && selectedProperty) {
      setForm((f) => ({
        ...f,
        title: f.title || `Purchase Agreement - ${selectedProperty.address}`,
        purchasePrice: f.purchasePrice || String(selectedProperty.price || selectedProperty.arv || ""),
      }));
    }
  }, [form.propertyId, selectedProperty]);

  const canGoNext = (): boolean => {
    if (step === "Template") return !!form.templateId;
    if (step === "Records") return !!form.propertyId;
    if (step === "Review") return true;
    if (step === "Signers") return signers.some((s) => s.name.trim() && s.email.trim());
    return true;
  };

  const handleNext = async () => {
    if (step === "Review") {
      setValidationErrors([]);
      if (!contractId) {
        const contract = await createContractMutation.mutateAsync({
          templateId: form.templateId ? parseInt(form.templateId) : undefined,
          propertyId: form.propertyId ? parseInt(form.propertyId) : undefined,
          opportunityId: opportunityId || undefined,
          leadId: form.leadId ? parseInt(form.leadId) : undefined,
          buyerId: form.buyerId ? parseInt(form.buyerId) : undefined,
          sellerContactId: form.sellerContactId ? parseInt(form.sellerContactId) : undefined,
          purchasePrice: form.purchasePrice || undefined,
          earnestMoney: form.earnestMoney || undefined,
          closingDate: form.closingDate || undefined,
          inspectionDeadline: form.inspectionDeadline || undefined,
          contractType: form.contractType || undefined,
          title: form.title,
          status: "draft",
          ownerUserId: 0,
        });
        setContractId(contract.id);
      } else {
        const contract = await updateContractMutation.mutateAsync({
          id: contractId,
          data: {
            templateId: form.templateId ? parseInt(form.templateId) : undefined,
            propertyId: form.propertyId ? parseInt(form.propertyId) : undefined,
            leadId: form.leadId ? parseInt(form.leadId) : undefined,
            buyerId: form.buyerId ? parseInt(form.buyerId) : undefined,
            sellerContactId: form.sellerContactId ? parseInt(form.sellerContactId) : undefined,
            purchasePrice: form.purchasePrice || undefined,
            earnestMoney: form.earnestMoney || undefined,
            closingDate: form.closingDate || undefined,
            inspectionDeadline: form.inspectionDeadline || undefined,
            contractType: form.contractType || undefined,
            title: form.title,
          },
        });
      }
    }
    if (step === "Signers" && contractId) {
      for (const signer of signers.filter((s) => s.name.trim() && s.email.trim())) {
        await addSignerMutation.mutateAsync({ contractId, signer });
      }
    }
    const next: Step = STEPS[STEPS.indexOf(step) + 1];
    setStep(next);
  };

  const handleBack = () => {
    const prev: Step = STEPS[STEPS.indexOf(step) - 1];
    setStep(prev);
  };

  useEffect(() => {
    if (step === "Review" && !contractId && form.propertyId) {
      createContractMutation.mutate(
        {
          templateId: form.templateId ? parseInt(form.templateId) : undefined,
          propertyId: form.propertyId ? parseInt(form.propertyId) : undefined,
          opportunityId: opportunityId || undefined,
          leadId: form.leadId ? parseInt(form.leadId) : undefined,
          buyerId: form.buyerId ? parseInt(form.buyerId) : undefined,
          sellerContactId: form.sellerContactId ? parseInt(form.sellerContactId) : undefined,
          purchasePrice: form.purchasePrice || undefined,
          earnestMoney: form.earnestMoney || undefined,
          closingDate: form.closingDate || undefined,
          inspectionDeadline: form.inspectionDeadline || undefined,
          contractType: form.contractType || undefined,
          title: form.title,
          status: "draft",
          ownerUserId: 0,
        },
        {
          onSuccess: (contract) => {
            setContractId(contract.id);
          },
          onError: (e: any) => {
            toast({ title: e?.message || "Failed to create contract", variant: "destructive" });
          },
        }
      );
    }
  }, [step, contractId, form.propertyId]);

  const handleValidate = async () => {
    if (!contractId) return;
    const result = await validateMutation.mutateAsync(contractId);
    setValidationErrors(result.errors || []);
    if (result.valid) {
      toast({ title: "Contract is valid and ready to send" });
    } else {
      toast({ title: "Validation issues found", variant: "destructive" });
    }
  };

  const handleGenerateDocument = async () => {
    if (!contractId) return;
    setIsGenerating(true);
    try {
      const doc = await generateDocumentMutation.mutateAsync(contractId);
      toast({ title: "Document generated" });
      setPreviewContent(doc.content || "");
      setPreviewOpen(true);
    } catch (e: any) {
      toast({ title: e?.message || "Failed to generate document", variant: "destructive" });
    } finally {
      setIsGenerating(false);
    }
  };

  const handleSend = async () => {
    if (!contractId) return;
    await handleValidate();
    if (validationErrors.length === 0) {
      const result = await sendMutation.mutateAsync(contractId);
      toast({ title: "Contract sent for signature" });
      setContractId(result.id);
      setStep("Template");
    }
  };

  const renderStep = () => {
    switch (step) {
      case "Template":
        return (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Template</Label>
              <Select value={form.templateId} onValueChange={(v) => setForm({ ...form, templateId: v })}>
                <SelectTrigger data-testid="select-template">
                  <SelectValue placeholder="Select a template" />
                </SelectTrigger>
                <SelectContent>
                  {templates.map((t: any) => (
                    <SelectItem key={t.id} value={String(t.id)}>
                      {t.name} {t.status !== "approved" && <Badge variant="outline" className="ml-2">{t.status}</Badge>}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {selectedTemplate?.status !== "approved" && (
                <div className="flex items-start gap-2 text-sm text-yellow-600 bg-yellow-50 p-3 rounded-md">
                  <AlertCircle className="w-4 h-4 mt-0.5" />
                  <span>This template requires attorney review before operational use.</span>
                </div>
              )}
            </div>
            <div className="space-y-2">
              <Label>Contract Title</Label>
              <Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Purchase Agreement - 123 Main St" />
            </div>
            <div className="space-y-2">
              <Label>Contract Type</Label>
              <Select value={form.contractType} onValueChange={(v) => setForm({ ...form, contractType: v })}>
                <SelectTrigger>
                  <SelectValue placeholder="Select type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="purchase_agreement">Purchase Agreement</SelectItem>
                  <SelectItem value="loi">Letter of Intent</SelectItem>
                  <SelectItem value="assignment">Assignment</SelectItem>
                  <SelectItem value="addendum">Addendum</SelectItem>
                  <SelectItem value="nda">NDA / Non-Circumvention</SelectItem>
                  <SelectItem value="custom">Custom</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        );

      case "Records":
        return (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Property *</Label>
              <Input value={propFilter} onChange={(e) => setPropFilter(e.target.value)} placeholder="Search property…" className="mb-1" />
              <Select value={form.propertyId} onValueChange={(v) => setForm({ ...form, propertyId: v })}>
                <SelectTrigger data-testid="select-property">
                  <SelectValue placeholder="Select property" />
                </SelectTrigger>
                <SelectContent className="max-h-72 overflow-y-auto">
                  {filteredProperties.length === 0 && (
                    <div className="px-2 py-1.5 text-sm text-muted-foreground">No properties found</div>
                  )}
                  {filteredProperties.map((p: any) => (
                    <SelectItem key={p.id} value={String(p.id)}>{p.address}, {p.city}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Lead</Label>
              <Input value={leadFilter} onChange={(e) => setLeadFilter(e.target.value)} placeholder="Search lead…" className="mb-1" />
              <Select value={form.leadId} onValueChange={(v) => setForm({ ...form, leadId: v })}>
                <SelectTrigger>
                  <SelectValue placeholder="Select lead" />
                </SelectTrigger>
                <SelectContent className="max-h-72 overflow-y-auto">
                  {filteredLeads.length === 0 && (
                    <div className="px-2 py-1.5 text-sm text-muted-foreground">No leads found</div>
                  )}
                  {filteredLeads.map((l: any) => (
                    <SelectItem key={l.id} value={String(l.id)}>{l.address} - {l.ownerName}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Buyer</Label>
              <Input value={buyerFilter} onChange={(e) => setBuyerFilter(e.target.value)} placeholder="Search buyer…" className="mb-1" />
              <Select value={form.buyerId} onValueChange={(v) => setForm({ ...form, buyerId: v })}>
                <SelectTrigger>
                  <SelectValue placeholder="Select buyer" />
                </SelectTrigger>
                <SelectContent className="max-h-72 overflow-y-auto">
                  {filteredBuyers.length === 0 && (
                    <div className="px-2 py-1.5 text-sm text-muted-foreground">No buyers found</div>
                  )}
                  {filteredBuyers.map((b: any) => (
                    <SelectItem key={b.id} value={String(b.id)}>{b.name} {b.company ? `(${b.company})` : ""}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Seller Contact</Label>
              <Select value={form.sellerContactId} onValueChange={(v) => setForm({ ...form, sellerContactId: v })}>
                <SelectTrigger>
                  <SelectValue placeholder="Select seller contact" />
                </SelectTrigger>
                <SelectContent className="max-h-72 overflow-y-auto">
                  {contacts.map((c: any) => (
                    <SelectItem key={c.id} value={String(c.id)}>{c.name} {c.company ? `(${c.company})` : ""}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        );

      case "Review":
        return (
          <div className="space-y-4">
            <div className="p-4 bg-accent/5 rounded-lg space-y-2">
              <h4 className="font-semibold">Contract Details</h4>
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div><span className="text-muted-foreground">Title:</span> {form.title || "—"}</div>
                <div><span className="text-muted-foreground">Type:</span> {form.contractType || "—"}</div>
                <div><span className="text-muted-foreground">Property:</span> {selectedProperty?.address || "—"}</div>
                <div><span className="text-muted-foreground">Lead:</span> {selectedLead?.address || "—"}</div>
                <div><span className="text-muted-foreground">Buyer:</span> {selectedBuyer?.name || "—"}</div>
                <div><span className="text-muted-foreground">Seller:</span> {selectedSeller?.name || "—"}</div>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Purchase Price</Label>
                <Input type="number" value={form.purchasePrice} onChange={(e) => setForm({ ...form, purchasePrice: e.target.value })} placeholder="150000" />
              </div>
              <div className="space-y-2">
                <Label>Earnest Money</Label>
                <Input type="number" value={form.earnestMoney} onChange={(e) => setForm({ ...form, earnestMoney: e.target.value })} placeholder="5000" />
              </div>
              <div className="space-y-2">
                <Label>Closing Date</Label>
                <Input type="date" value={form.closingDate} onChange={(e) => setForm({ ...form, closingDate: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>Inspection Deadline</Label>
                <Input type="date" value={form.inspectionDeadline} onChange={(e) => setForm({ ...form, inspectionDeadline: e.target.value })} />
              </div>
            </div>
            {validationErrors.length > 0 && (
              <div className="space-y-2">
                <Label>Validation Errors</Label>
                <div className="p-3 bg-red-50 border border-red-200 rounded-md space-y-1">
                  {validationErrors.map((err, i) => (
                    <div key={i} className="flex items-center gap-2 text-sm text-red-700">
                      <AlertCircle className="w-4 h-4" />
                      {err}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        );

      case "Signers":
        return (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <Label>Signers</Label>
              <Button type="button" size="sm" variant="outline" onClick={() => setSigners([...signers, { name: "", email: "", role: "signer", signingOrder: signers.length }])}>
                <Plus className="w-4 h-4 mr-1" /> Add Signer
              </Button>
            </div>
            {signers.map((signer, idx) => (
              <div key={idx} className="grid grid-cols-12 gap-2 items-end">
                <div className="col-span-4 space-y-1">
                  <Label className="text-xs">Name</Label>
                  <Input value={signer.name} onChange={(e) => {
                    const next = [...signers]; next[idx] = { ...next[idx], name: e.target.value }; setSigners(next);
                  }} placeholder="John Doe" />
                </div>
                <div className="col-span-4 space-y-1">
                  <Label className="text-xs">Email</Label>
                  <Input value={signer.email} onChange={(e) => {
                    const next = [...signers]; next[idx] = { ...next[idx], email: e.target.value }; setSigners(next);
                  }} placeholder="john@email.com" />
                </div>
                <div className="col-span-2 space-y-1">
                  <Label className="text-xs">Role</Label>
                  <Select value={signer.role} onValueChange={(v) => {
                    const next = [...signers]; next[idx] = { ...next[idx], role: v }; setSigners(next);
                  }}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="seller">Seller</SelectItem>
                      <SelectItem value="buyer">Buyer</SelectItem>
                      <SelectItem value="witness">Witness</SelectItem>
                      <SelectItem value="signer">Signer</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="col-span-2 space-y-1">
                  <Label className="text-xs">Order</Label>
                  <Input type="number" value={signer.signingOrder} onChange={(e) => {
                    const next = [...signers]; next[idx] = { ...next[idx], signingOrder: parseInt(e.target.value) || 0 }; setSigners(next);
                  }} />
                </div>
              </div>
            ))}
          </div>
        );

      case "Send":
        return (
          <div className="space-y-4">
            <div className="p-4 bg-accent/5 rounded-lg space-y-2">
              <h4 className="font-semibold flex items-center gap-2"><CheckCircle className="w-4 h-4" /> Ready to Send</h4>
              <p className="text-sm text-muted-foreground">Review your contract and send it for signature.</p>
            </div>
            <div className="space-y-2">
              <Label>Contract Title</Label>
              <div className="text-sm font-medium">{form.title || "Untitled Contract"}</div>
            </div>
            <div className="space-y-2">
              <Label>Template</Label>
              <div className="text-sm font-medium">{selectedTemplate?.name || "—"}</div>
            </div>
            <div className="space-y-2">
              <Label>Signers ({signers.filter((s) => s.name.trim()).length})</Label>
              {signers.filter((s) => s.name.trim()).map((s, i) => (
                <div key={i} className="flex items-center gap-2 text-sm">
                  <Users className="w-4 h-4" />
                  <span>{s.name} ({s.email}) — {s.role}</span>
                </div>
              ))}
            </div>
            {validationErrors.length > 0 && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-md space-y-1">
                {validationErrors.map((err, i) => (
                  <div key={i} className="flex items-center gap-2 text-sm text-red-700">
                    <AlertCircle className="w-4 h-4" />
                    {err}
                  </div>
                ))}
              </div>
            )}
          </div>
        );
    }
  };

  const stepIndex = STEPS.indexOf(step);

  return (
    <Layout>
      <div className="p-4 md:p-8 space-y-6">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-2xl md:text-4xl font-display font-bold text-foreground mb-2" data-testid="page-title">
              New Deal Document
            </h1>
            <p className="text-muted-foreground">Create a contract from a template and send for signature</p>
          </div>
        </div>

        <div className="flex items-center justify-between mb-6">
          {STEPS.map((s, i) => (
            <div key={s} className="flex items-center gap-2">
              <div className={`flex items-center justify-center w-8 h-8 rounded-full text-sm font-medium ${i <= stepIndex ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}>
                {i + 1}
              </div>
              <span className={`text-sm hidden sm:inline ${i <= stepIndex ? "text-foreground" : "text-muted-foreground"}`}>{s}</span>
              {i < STEPS.length - 1 && <ChevronRight className="w-4 h-4 text-muted-foreground mx-2" />}
            </div>
          ))}
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Step {stepIndex + 1}: {step}</CardTitle>
            <CardDescription>
              {step === "Template" && "Choose a contract template"}
              {step === "Records" && "Link CRM records to this contract"}
              {step === "Review" && "Review terms and contract variables"}
              {step === "Signers" && "Add signers for this contract"}
              {step === "Send" && "Finalize and send for signature"}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {renderStep()}

            <div className="flex justify-between pt-4">
              <div>
                {step !== "Template" && (
                  <Button type="button" variant="outline" onClick={handleBack}>
                    <ChevronLeft className="w-4 h-4 mr-2" /> Back
                  </Button>
                )}
              </div>
              <div className="flex gap-2">
                {step === "Review" && (
                  <Button type="button" variant="outline" onClick={handleGenerateDocument} disabled={isGenerating || !contractId}>
                    <FileText className="w-4 h-4 mr-2" /> {isGenerating ? "Generating..." : "Generate Document"}
                  </Button>
                )}
                {step === "Send" && (
                  <>
                    <Button type="button" variant="outline" onClick={handleValidate}>
                      <AlertCircle className="w-4 h-4 mr-2" /> Validate
                    </Button>
                    <Button type="button" onClick={handleSend} disabled={sendMutation.isPending || validateMutation.isPending}>
                      <Send className="w-4 h-4 mr-2" /> {sendMutation.isPending ? "Sending..." : "Send for Signature"}
                    </Button>
                  </>
                )}
                {step !== "Send" && (
                  <Button type="button" onClick={handleNext} disabled={!canGoNext() || createContractMutation.isPending || updateContractMutation.isPending}>
                    Next <ChevronRight className="w-4 h-4 ml-2" />
                  </Button>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
          <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Document Preview</DialogTitle>
            </DialogHeader>
            <div className="prose prose-sm max-w-none" dangerouslySetInnerHTML={{ __html: previewContent || "<p>No content</p>" }} />
          </DialogContent>
        </Dialog>
      </div>
    </Layout>
  );
}
