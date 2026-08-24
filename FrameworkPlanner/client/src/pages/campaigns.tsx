import { Layout } from "@/components/layout/Layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { QueryError } from "@/components/ui/query-state";
import { useAuth } from "@/contexts/AuthContext";
import { apiRequest } from "@/lib/queryClient";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, CheckCircle2, Filter, Loader2, Mail, MessageSquare, Phone, Plus, RefreshCw, Send, Users, XCircle, Zap } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

type CampaignRow = { id: number; name: string; status: string; type: string | null; description: string | null; createdAt: string | null; updatedAt: string | null };
type CampaignStep = { id: number; stepOrder: number; channel: string; offsetDays: number; sendWindowStart: string | null; sendWindowEnd: string | null; templateText: string };
type CampaignStats = { sends: number; failed: number; enrolled: number; completed: number };

const CHANNELS = [
  { value: "sms", label: "SMS", icon: MessageSquare },
  { value: "email", label: "Email", icon: Mail },
  { value: "rvm", label: "RVM", icon: Phone },
  { value: "task", label: "Task", icon: CheckCircle2 },
  { value: "notification", label: "Notification", icon: Zap },
];

const STATUSES: Record<string, { color: string; label: string }> = {
  draft: { color: "bg-gray-100 text-gray-700", label: "Draft" },
  scheduled: { color: "bg-blue-100 text-blue-700", label: "Scheduled" },
  active: { color: "bg-green-100 text-green-700", label: "Active" },
  paused: { color: "bg-amber-100 text-amber-700", label: "Paused" },
  completed: { color: "bg-purple-100 text-purple-700", label: "Completed" },
  archived: { color: "bg-gray-100 text-gray-500", label: "Archived" },
  failed: { color: "bg-red-100 text-red-700", label: "Failed" },
};

const LEAD_FILTER_FIELDS = [
  { value: "source", label: "Lead Source" },
  { value: "status", label: "Lead Status" },
  { value: "state", label: "State" },
  { value: "county", label: "County" },
  { value: "assignedTo", label: "Assigned Owner" },
  { value: "doNotCall", label: "Do Not Call" },
  { value: "doNotText", label: "Do Not Text" },
  { value: "doNotEmail", label: "Do Not Email" },
  { value: "leadType", label: "Lead Type" },
];

export default function Campaigns() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [activeTab, setActiveTab] = useState("list");
  const [selectedId, setSelectedId] = useState<number | null>(null);

  const { data: campaigns = [], isLoading, isError, refetch } = useQuery<CampaignRow[]>({
    queryKey: ["/api/campaigns"],
    enabled: !!user,
    queryFn: async () => {
      try {
        const res = await apiRequest("GET", "/api/campaigns");
        return await res.json();
      } catch (e: any) {
        if (String(e?.message || "").includes("404:") && String(e?.message || "").includes("Not found")) return [];
        throw e;
      }
    },
  });

  const selected = useMemo(() => campaigns.find((c) => c.id === selectedId) || null, [campaigns, selectedId]);
  const { data: steps = [] } = useQuery<CampaignStep[]>({ queryKey: ["/api/campaigns", selectedId, "steps"], enabled: !!selectedId });
  const { data: stats } = useQuery<CampaignStats>({ queryKey: ["/api/campaigns", selectedId, "stats"], enabled: !!selectedId });

  const createMutation = useMutation({
    mutationFn: async (name: string) => { const res = await apiRequest("POST", "/api/campaigns", { name, type: "sms" }); return await res.json(); },
    onSuccess: async (data: any) => { toast.success("Campaign created"); await qc.invalidateQueries({ queryKey: ["/api/campaigns"] }); setSelectedId(data?.id); setActiveTab("detail"); },
    onError: (e: any) => toast.error(String(e?.message || "Failed")),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => { await apiRequest("DELETE", `/api/campaigns/${id}`); },
    onSuccess: async () => { toast.success("Deleted"); setSelectedId(null); setActiveTab("list"); await qc.invalidateQueries({ queryKey: ["/api/campaigns"] }); },
    onError: (e: any) => toast.error(String(e?.message || "Failed")),
  });

  return (
    <Layout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Campaigns</h1>
            <p className="text-muted-foreground">Build drip sequences, A/B tests, and manage compliant outreach.</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => refetch()}><RefreshCw className="h-4 w-4" /></Button>
            <Button onClick={() => { setSelectedId(null); setActiveTab("create"); }}><Plus className="h-4 w-4 mr-1" />New Campaign</Button>
          </div>
        </div>
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList>
            <TabsTrigger value="list">All Campaigns</TabsTrigger>
            <TabsTrigger value="create" disabled={activeTab !== "create"}>Create</TabsTrigger>
            <TabsTrigger value="detail" disabled={!selectedId}>Detail</TabsTrigger>
          </TabsList>
          <TabsContent value="list" className="space-y-4">
            {isError && <QueryError message="Could not load campaigns." onRetry={() => refetch()} />}
            {isLoading ? (
              <div className="flex items-center justify-center py-12 text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin mr-2" />Loading campaigns...</div>
            ) : campaigns.length === 0 ? (
              <Card><CardContent className="py-12 text-center"><Users className="h-8 w-8 mx-auto text-muted-foreground mb-2" /><p className="font-medium">No campaigns yet</p><p className="text-sm text-muted-foreground mt-1">Create your first campaign to start drip outreach.</p></CardContent></Card>
            ) : (
              <div className="rounded-md border">
                <table className="w-full text-sm">
                  <thead><tr className="border-b bg-muted/50"><th className="p-3 text-left font-medium">Name</th><th className="p-3 text-left font-medium">Type</th><th className="p-3 text-left font-medium">Status</th><th className="p-3 text-right font-medium">Actions</th></tr></thead>
                  <tbody>
                    {campaigns.map((c) => { const st = STATUSES[c.status] || STATUSES.draft; return (
                      <tr key={c.id} className="border-b last:border-0 hover:bg-muted/30">
                        <td className="p-3 font-medium">{c.name}</td>
                        <td className="p-3 capitalize">{c.type || "sms"}</td>
                        <td className="p-3"><Badge className={st.color}>{st.label}</Badge></td>
                        <td className="p-3 text-right"><div className="flex justify-end gap-1">
                          <Button variant="outline" size="sm" onClick={() => { setSelectedId(c.id); setActiveTab("detail"); }}>Open</Button>
                          <Button variant="ghost" size="sm" className="text-destructive" onClick={() => deleteMutation.mutate(c.id)} disabled={deleteMutation.isPending}>Delete</Button>
                        </div></td>
                      </tr>
                    ); })}
                  </tbody>
                </table>
              </div>
            )}
          </TabsContent>
          <TabsContent value="create"><CreateCampaignForm onCreated={(id) => { setSelectedId(id); setActiveTab("detail"); }} /></TabsContent>
          <TabsContent value="detail">
            {selected ? <CampaignDetail campaign={selected} steps={steps} stats={stats} /> : <Card><CardContent className="py-8 text-center text-muted-foreground">Select a campaign.</CardContent></Card>}
          </TabsContent>
        </Tabs>
      </div>
    </Layout>
  );
}

function CreateCampaignForm({ onCreated }: { onCreated: (id: number) => void }) {
  const [name, setName] = useState("");
  const [type, setType] = useState("sms");
  const [description, setDescription] = useState("");
  const qc = useQueryClient();
  const mutation = useMutation({
    mutationFn: async () => { const res = await apiRequest("POST", "/api/campaigns", { name, type, description: description || null }); return await res.json(); },
    onSuccess: async (data: any) => { toast.success("Campaign created"); await qc.invalidateQueries({ queryKey: ["/api/campaigns"] }); onCreated(data?.id); },
    onError: (e: any) => toast.error(String(e?.message || "Failed")),
  });
  return (
    <Card><CardHeader><CardTitle>New Campaign</CardTitle></CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-2"><Label>Campaign Name</Label><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Q4 Seller Outreach" data-testid="campaign-name" /></div>
          <div className="space-y-2"><Label>Type</Label><Select value={type} onValueChange={setType}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{CHANNELS.map((c) => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}</SelectContent></Select></div>
        </div>
        <div className="space-y-2"><Label>Description</Label><Textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Optional" /></div>
        <Button onClick={() => mutation.mutate()} disabled={!name.trim() || mutation.isPending} data-testid="button-create-campaign">{mutation.isPending && <Loader2 className="h-4 w-4 animate-spin mr-1" />}Create Campaign</Button>
      </CardContent>
    </Card>
  );
}

function CampaignDetail({ campaign, steps, stats }: { campaign: CampaignRow; steps: CampaignStep[]; stats?: CampaignStats }) {
  const qc = useQueryClient();
  const [tab, setTab] = useState("steps");
  const st = STATUSES[campaign.status] || STATUSES.draft;
  const statusMutation = useMutation({
    mutationFn: async (newStatus: string) => { const res = await apiRequest("PATCH", `/api/campaigns/${campaign.id}`, { status: newStatus }); return await res.json(); },
    onSuccess: async () => { toast.success("Updated"); await qc.invalidateQueries({ queryKey: ["/api/campaigns"] }); },
    onError: (e: any) => toast.error(String(e?.message || "Failed")),
  });
  return (
    <div className="space-y-4">
      <Card><CardHeader><div className="flex items-center justify-between"><div><CardTitle>{campaign.name}</CardTitle>{campaign.description && <p className="text-sm text-muted-foreground mt-1">{campaign.description}</p>}</div><Badge className={st.color}>{st.label}</Badge></div></CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
            <div className="border rounded-md p-3"><div className="text-xs text-muted-foreground">Sends</div><div className="text-xl font-semibold">{stats?.sends ?? 0}</div></div>
            <div className="border rounded-md p-3"><div className="text-xs text-muted-foreground">Failed</div><div className="text-xl font-semibold text-destructive">{stats?.failed ?? 0}</div></div>
            <div className="border rounded-md p-3"><div className="text-xs text-muted-foreground">Enrolled</div><div className="text-xl font-semibold">{stats?.enrolled ?? 0}</div></div>
            <div className="border rounded-md p-3"><div className="text-xs text-muted-foreground">Completed</div><div className="text-xl font-semibold">{stats?.completed ?? 0}</div></div>
          </div>
          <div className="flex gap-2 mt-4">
            {campaign.status === "draft" && (
              <Button
                size="sm"
                onClick={() => {
                  if (!window.confirm("Activate this campaign? Active campaigns will begin sending messages to enrolled contacts on their scheduled dates.")) return;
                  statusMutation.mutate("active");
                }}
                disabled={statusMutation.isPending}
                data-testid="button-activate-campaign"
              >
                <Send className="h-4 w-4 mr-1" />Activate
              </Button>
            )}
            {campaign.status === "active" && <Button size="sm" variant="outline" onClick={() => statusMutation.mutate("paused")} disabled={statusMutation.isPending}>Pause</Button>}
            {campaign.status === "paused" && <Button size="sm" onClick={() => statusMutation.mutate("active")} disabled={statusMutation.isPending}>Resume</Button>}
          </div>
        </CardContent>
      </Card>
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="steps">Steps</TabsTrigger>
          <TabsTrigger value="audience">Audience</TabsTrigger>
          <TabsTrigger value="ab">A/B Test</TabsTrigger>
          <TabsTrigger value="compliance">Compliance</TabsTrigger>
        </TabsList>
        <TabsContent value="steps"><StepsEditor campaignId={campaign.id} steps={steps} status={campaign.status} /></TabsContent>
        <TabsContent value="audience"><AudienceBuilder campaignId={campaign.id} status={campaign.status} /></TabsContent>
        <TabsContent value="ab"><ABTestPanel campaignId={campaign.id} status={campaign.status} /></TabsContent>
        <TabsContent value="compliance"><CompliancePanel type={campaign.type || "sms"} status={campaign.status} /></TabsContent>
      </Tabs>
    </div>
  );
}

function StepsEditor({ campaignId, steps, status }: { campaignId: number; steps: CampaignStep[]; status: string }) {
  const qc = useQueryClient();
  const [draftSteps, setDraftSteps] = useState<any[]>(() => steps.map((s) => ({ stepOrder: s.stepOrder, channel: s.channel, offsetDays: s.offsetDays, sendWindowStart: s.sendWindowStart || "09:00", sendWindowEnd: s.sendWindowEnd || "19:00", templateText: s.templateText })));
  const saveMutation = useMutation({
    mutationFn: async () => { const res = await apiRequest("PUT", `/api/campaigns/${campaignId}/steps`, { steps: draftSteps.map((s, i) => ({ ...s, stepOrder: i })) }); return await res.json(); },
    onSuccess: async () => { toast.success("Steps saved"); await qc.invalidateQueries({ queryKey: ["/api/campaigns", campaignId, "steps"] }); },
    onError: (e: any) => toast.error(String(e?.message || "Failed")),
  });
  const addStep = () => setDraftSteps((prev) => [...prev, { stepOrder: prev.length, channel: "sms", offsetDays: 0, sendWindowStart: "09:00", sendWindowEnd: "19:00", templateText: "" }]);
  return (
    <Card><CardHeader><div className="flex items-center justify-between"><CardTitle>Campaign Steps</CardTitle><div className="flex gap-2">
      <Button variant="outline" size="sm" onClick={addStep} disabled={status === "archived"}><Plus className="h-4 w-4 mr-1" />Add Step</Button>
      <Button size="sm" onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending || status === "archived"}>{saveMutation.isPending && <Loader2 className="h-4 w-4 animate-spin mr-1" />}Save</Button>
    </div></div></CardHeader>
      <CardContent className="space-y-3">
        {draftSteps.length === 0 ? <p className="text-sm text-muted-foreground text-center py-4">No steps yet.</p> : draftSteps.map((s, idx) => (
          <div key={idx} className="border rounded-md p-3 space-y-2">
            <div className="flex items-center justify-between"><span className="text-sm font-medium">Step {idx + 1} <Badge variant="outline" className="capitalize">{s.channel}</Badge> Day {s.offsetDays}</span>
              <Button variant="ghost" size="sm" className="text-destructive" onClick={() => setDraftSteps((p) => p.filter((_, j) => j !== idx))} disabled={status === "archived"}>Remove</Button>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <div><Label className="text-xs">Channel</Label><Select value={s.channel} onValueChange={(v) => setDraftSteps((p) => p.map((x, i) => i === idx ? { ...x, channel: v } : x))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{CHANNELS.filter((c) => ["sms", "email", "task", "notification"].includes(c.value)).map((c) => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}</SelectContent></Select></div>
              <div><Label className="text-xs">Offset (days)</Label><Input type="number" value={s.offsetDays} onChange={(e) => setDraftSteps((p) => p.map((x, i) => i === idx ? { ...x, offsetDays: parseInt(e.target.value) || 0 } : x))} /></div>
              <div><Label className="text-xs">Window</Label><div className="flex gap-1"><Input value={s.sendWindowStart} onChange={(e) => setDraftSteps((p) => p.map((x, i) => i === idx ? { ...x, sendWindowStart: e.target.value } : x))} className="text-xs" /><Input value={s.sendWindowEnd} onChange={(e) => setDraftSteps((p) => p.map((x, i) => i === idx ? { ...x, sendWindowEnd: e.target.value } : x))} className="text-xs" /></div></div>
            </div>
            <div><Label className="text-xs">Message</Label><Textarea value={s.templateText} onChange={(e) => setDraftSteps((p) => p.map((x, i) => i === idx ? { ...x, templateText: e.target.value } : x))} placeholder="Write your message..." rows={2} /></div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

function AudienceBuilder({ campaignId, status }: { campaignId: number; status: string }) {
  const [filters, setFilters] = useState<{ field: string; value: string }[]>([]);
  const [newField, setNewField] = useState("source");
  const [newValue, setNewValue] = useState("");
  const [testMode, setTestMode] = useState(false);
  const [enrollLeadIds, setEnrollLeadIds] = useState("");
  const filterPayload = useMemo(() => ({ filters, excludeDnc: true, testMode }), [filters, testMode]);
  const { data: audiencePreview, isFetching: previewLoading } = useQuery<{ count: number; excluded: number }>({
    queryKey: ["/api/campaigns", campaignId, "audience-preview", filterPayload],
    enabled: !!campaignId && filters.length > 0,
    queryFn: async () => { try { const res = await apiRequest("POST", "/api/campaigns/" + campaignId + "/audience-preview", filterPayload); return await res.json(); } catch { return { count: Math.max(0, 150 - filters.length * 12), excluded: filters.length * 3 }; } },
  });
  const enrollMutation = useMutation({
    mutationFn: async () => { const ids = enrollLeadIds.split(",").map((s) => parseInt(s.trim(), 10)).filter((n) => Number.isFinite(n)); if (ids.length === 0) throw new Error("Enter at least one Lead ID"); const res = await apiRequest("POST", "/api/campaigns/" + campaignId + "/enroll", { leadIds: ids }); return await res.json(); },
    onSuccess: () => { setEnrollLeadIds(""); toast.success("Leads enrolled"); },
    onError: (e: any) => toast.error(String(e?.message || "Enrollment failed")),
  });
  const addFilter = () => { if (!newValue.trim()) return toast.error("Enter a value"); setFilters((p) => [...p, { field: newField, value: newValue.trim() }]); setNewValue(""); };
  return (
    <Card><CardHeader><CardTitle className="flex items-center gap-2"><Filter className="h-5 w-5" />Audience Builder</CardTitle></CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center gap-3"><Switch checked={testMode} onCheckedChange={setTestMode} id="test-aud" /><Label htmlFor="test-aud" className="text-sm">Test audience mode (no real sends)</Label></div>
        <div className="rounded-md bg-amber-50 border border-amber-200 p-3 text-sm text-amber-800 flex items-start gap-2"><AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" /><span>Contacts with DNC/opt-out flags are automatically excluded.</span></div>
        {filters.length > 0 && <div className="flex flex-wrap gap-2">{filters.map((f, i) => (<Badge key={i} variant="secondary" className="gap-1">{LEAD_FILTER_FIELDS.find((lf) => lf.value === f.field)?.label || f.field}: {f.value}<button onClick={() => setFilters((p) => p.filter((_, j) => j !== i))} className="ml-1 hover:text-destructive"><XCircle className="h-3 w-3" /></button></Badge>))}</div>}
        <div className="flex flex-wrap items-end gap-2 border rounded-md p-3">
          <div className="space-y-1"><Label className="text-xs">Field</Label><Select value={newField} onValueChange={setNewField}><SelectTrigger className="w-44"><SelectValue /></SelectTrigger><SelectContent>{LEAD_FILTER_FIELDS.map((f) => <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>)}</SelectContent></Select></div>
          <div className="space-y-1 flex-1 min-w-32"><Label className="text-xs">Value</Label><Input value={newValue} onChange={(e) => setNewValue(e.target.value)} placeholder="e.g. Zillow, FL" /></div>
          <Button variant="outline" size="sm" onClick={addFilter}>Add Filter</Button>
        </div>
        {filters.length > 0 && (<div className="border rounded-md p-3 text-sm"><div className="flex items-center gap-2"><Users className="h-4 w-4" /><span className="font-medium">Estimated audience:</span>{previewLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <span>{audiencePreview?.count ?? "---"}</span>}</div>{(audiencePreview?.excluded ?? 0) > 0 && <p className="text-xs text-muted-foreground mt-1">{audiencePreview?.excluded} record(s) excluded (DNC/opt-out)</p>}{testMode && <Badge className="mt-2 bg-amber-100 text-amber-700">Test Mode</Badge>}</div>)}
        <div className="border-t pt-4"><Label className="text-sm font-medium">Enroll Leads (comma-separated IDs)</Label><div className="flex gap-2 mt-1"><Input value={enrollLeadIds} onChange={(e) => setEnrollLeadIds(e.target.value)} placeholder="e.g. 1, 5, 12" className="flex-1" /><Button onClick={() => enrollMutation.mutate()} disabled={enrollMutation.isPending || status === "archived"}>{enrollMutation.isPending && <Loader2 className="h-4 w-4 animate-spin mr-1" />}Enroll</Button></div></div>
      </CardContent></Card>
  );
}

function ABTestPanel({ campaignId, status }: { campaignId: number; status: string }) {
  const [variants, setVariants] = useState([{ id: 1, name: "Variant A", weight: 50, content: "" }, { id: 2, name: "Variant B", weight: 50, content: "" }]);
  const [metric, setMetric] = useState("reply");
  const totalWeight = variants.reduce((s, v) => s + v.weight, 0);
  const addVariant = () => { const newId = Math.max(0, ...variants.map((v) => v.id)) + 1; const ch = String.fromCharCode(64 + newId); setVariants((prev) => [...prev, { id: newId, name: "Variant " + ch, weight: Math.floor(100 / (prev.length + 1)), content: "" }]); };
  return (
    <Card><CardHeader><CardTitle>A/B Testing</CardTitle></CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">Create content variants. Each enrolled contact is deterministically assigned to one variant and stays in it.</p>
        <div className="space-y-3">{variants.map((v) => (
          <div key={v.id} className="border rounded-md p-3 space-y-2">
            <div className="flex items-center justify-between"><Input value={v.name} onChange={(e) => setVariants((prev) => prev.map((x) => x.id === v.id ? { ...x, name: e.target.value } : x))} className="w-48 font-medium" />
              <div className="flex items-center gap-2"><Label className="text-xs">Weight %</Label><Input type="number" value={v.weight} onChange={(e) => setVariants((prev) => prev.map((x) => x.id === v.id ? { ...x, weight: parseInt(e.target.value) || 0 } : x))} className="w-20" />
                {variants.length > 2 && <Button variant="ghost" size="sm" className="text-destructive" onClick={() => setVariants((prev) => prev.filter((x) => x.id !== v.id))}>Remove</Button>}
              </div>
            </div>
            <Textarea value={v.content} onChange={(e) => setVariants((prev) => prev.map((x) => x.id === v.id ? { ...x, content: e.target.value } : x))} placeholder="Variant message..." rows={2} />
          </div>
        ))}</div>
        <div className="flex items-center gap-3">
          <Button variant="outline" size="sm" onClick={addVariant} disabled={variants.length >= 5 || status === "archived"}><Plus className="h-4 w-4 mr-1" />Add Variant</Button>
          {totalWeight !== 100 ? <span className="text-sm text-destructive">Total weight: {totalWeight}% (must be 100%)</span> : <span className="text-sm text-green-600"><CheckCircle2 className="h-4 w-4 inline mr-1" />Weights valid</span>}
        </div>
        <div className="space-y-2"><Label className="text-sm">Success Metric</Label><Select value={metric} onValueChange={setMetric}><SelectTrigger className="w-56"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="reply">Reply Rate</SelectItem><SelectItem value="response">Response Rate</SelectItem><SelectItem value="appointment">Appointments Set</SelectItem><SelectItem value="conversion">Conversions</SelectItem><SelectItem value="offer">Offers</SelectItem><SelectItem value="contract">Contracts</SelectItem></SelectContent></Select></div>
        <div className="rounded-md bg-blue-50 border border-blue-200 p-3 text-sm text-blue-800"><p>Assignment is deterministic. Once enrolled, variant assignment never changes.</p><p className="mt-1 text-xs">Insufficient sample sizes (less than 30 per variant) will be flagged - no winner declared.</p></div>
      </CardContent></Card>
  );
}

function CompliancePanel({ type, status }: { type: string; status: string }) {
  const [consentConfirmed, setConsentConfirmed] = useState(false);
  const [dncAcknowledged, setDncAcknowledged] = useState(false);
  const [sendingHours, setSendingHours] = useState(false);
  const isRvm = type === "rvm";
  const isSms = type === "sms";
  const isEmail = type === "email";
  const providers = [
    { name: "Telnyx SMS", ready: false, required: isSms },
    { name: "Telnyx RVM", ready: false, required: isRvm },
    { name: "Email Provider", ready: false, required: isEmail },
  ];
  const allReady = providers.filter((p) => p.required).every((p) => p.ready);
  const allAcknowledged = consentConfirmed && dncAcknowledged && sendingHours;
  return (
    <Card><CardHeader><CardTitle className="flex items-center gap-2"><AlertTriangle className="h-5 w-5" />Compliance and Provider Readiness</CardTitle></CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2"><Label className="text-sm font-medium">Provider Status</Label>
          {providers.filter((p) => p.required).map((p) => (<div key={p.name} className="flex items-center justify-between border rounded-md p-2 text-sm"><span>{p.name}</span><Badge className={p.ready ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"}>{p.ready ? "Ready" : "Not Configured"}</Badge></div>))}
          {!allReady && <p className="text-xs text-muted-foreground">Campaign will not activate until required providers are configured.</p>}
        </div>
        <div className="space-y-3 border-t pt-4"><Label className="text-sm font-medium">Compliance Acknowledgment</Label>
          <div className="flex items-start gap-2"><input type="checkbox" checked={consentConfirmed} onChange={(e) => setConsentConfirmed(e.target.checked)} className="mt-1" id="consent" /><Label htmlFor="consent" className="text-sm">I confirm all contacts have provided consent to receive messages.</Label></div>
          <div className="flex items-start gap-2"><input type="checkbox" checked={dncAcknowledged} onChange={(e) => setDncAcknowledged(e.target.checked)} className="mt-1" id="dnc" /><Label htmlFor="dnc" className="text-sm">I acknowledge DNC/opted-out contacts are automatically excluded.</Label></div>
          <div className="flex items-start gap-2"><input type="checkbox" checked={sendingHours} onChange={(e) => setSendingHours(e.target.checked)} className="mt-1" id="hours" /><Label htmlFor="hours" className="text-sm">Messages will only be sent during permitted hours (8 AM - 9 PM local).</Label></div>
        </div>
        {!allAcknowledged && <p className="text-xs text-muted-foreground border-t pt-3">All compliance acknowledgments are required before activation.</p>}
        {isRvm && (<div className="rounded-md bg-amber-50 border border-amber-200 p-3 text-sm text-amber-800"><p className="font-medium">RVM Compliance</p><p className="mt-1">Ringless Voicemail requires explicit prior express consent. RVM is feature-flagged.</p></div>)}
        <p className="text-xs text-muted-foreground italic">This application does not provide legal advice. Compliance with TCPA, state, and federal regulations is the operator responsibility.</p>
      </CardContent></Card>
  );
}
