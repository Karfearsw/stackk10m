import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";
import { Layout } from "@/components/layout/Layout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import {
  ArrowLeft, ArrowUp, ArrowDown, Plus, Pencil, Trash2, Play, Users,
  AlertTriangle, CheckCircle2, FlaskConical, Zap, ShieldCheck, MapPin, RefreshCw,
} from "lucide-react";

const RULE_TYPES = [
  { value: "round_robin", label: "Round Robin", icon: RefreshCw, desc: "Cycle leads evenly across selected agents." },
  { value: "territory", label: "Territory (State)", icon: MapPin, desc: "Route by lead state to covering agents." },
  { value: "capacity_check", label: "Capacity Check", icon: Users, desc: "Guard: never assign over an agent's max leads." },
  { value: "availability_check", label: "Availability Check", icon: ShieldCheck, desc: "Guard: skip agents marked unavailable." },
  { value: "market_eligibility", label: "Market Eligibility", icon: CheckCircle2, desc: "Guard: lead state must be in agent's markets." },
] as const;

const SELECTOR_TYPES = ["round_robin", "territory"];

function ruleTypeMeta(t: string) {
  return RULE_TYPES.find((r) => r.value === t) || { value: t, label: t, desc: "" };
}

export default function AssignmentSettings() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [builderOpen, setBuilderOpen] = useState(false);
  const [editing, setEditing] = useState<any | null>(null);
  const [testLeadId, setTestLeadId] = useState("");
  const [testResult, setTestResult] = useState<any | null>(null);

  const { data: rulesData, isLoading: rulesLoading } = useQuery({
    queryKey: ["/api/assignment/rules"],
    queryFn: async () => (await apiRequest("GET", "/api/assignment/rules")).json(),
  });
  const rules: any[] = rulesData?.rules || [];

  const { data: unassignedData } = useQuery({
    queryKey: ["/api/assignment/unassigned"],
    queryFn: async () => (await apiRequest("GET", "/api/assignment/unassigned?limit=50")).json(),
    refetchInterval: 30000,
  });
  const unassignedCount: number = unassignedData?.count || 0;
  const unassignedLeads: any[] = unassignedData?.leads || [];

  const { data: capacityData } = useQuery({
    queryKey: ["/api/assignment/capacity"],
    queryFn: async () => (await apiRequest("GET", "/api/assignment/capacity")).json(),
  });
  const agents: any[] = capacityData?.agents || [];

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["/api/assignment/rules"] });
    queryClient.invalidateQueries({ queryKey: ["/api/assignment/capacity"] });
    queryClient.invalidateQueries({ queryKey: ["/api/assignment/unassigned"] });
  };

  const saveRule = useMutation({
    mutationFn: async (payload: { id?: number; body: any }) => {
      const res = payload.id
        ? await apiRequest("PUT", `/api/assignment/rules/${payload.id}`, payload.body)
        : await apiRequest("POST", "/api/assignment/rules", payload.body);
      return res.json();
    },
    onSuccess: () => { invalidate(); setBuilderOpen(false); setEditing(null); toast({ title: "Rule saved" }); },
    onError: (e: any) => toast({ title: "Save failed", description: e.message, variant: "destructive" }),
  });

  const deleteRule = useMutation({
    mutationFn: async (id: number) => (await apiRequest("DELETE", `/api/assignment/rules/${id}`)).json(),
    onSuccess: () => { invalidate(); toast({ title: "Rule deleted" }); },
    onError: (e: any) => toast({ title: "Delete failed", description: e.message, variant: "destructive" }),
  });

  const moveRule = useMutation({
    mutationFn: async ({ rule, dir }: { rule: any; dir: -1 | 1 }) => {
      const sorted = [...rules].sort((a, b) => a.priorityOrder - b.priorityOrder || a.id - b.id);
      const idx = sorted.findIndex((r) => r.id === rule.id);
      const swapWith = sorted[idx + dir];
      if (!swapWith) return;
      await apiRequest("PUT", `/api/assignment/rules/${rule.id}`, { priorityOrder: swapWith.priorityOrder });
      await apiRequest("PUT", `/api/assignment/rules/${swapWith.id}`, { priorityOrder: rule.priorityOrder });
    },
    onSuccess: invalidate,
    onError: (e: any) => toast({ title: "Reorder failed", description: e.message, variant: "destructive" }),
  });

  const toggleActive = useMutation({
    mutationFn: async (rule: any) =>
      (await apiRequest("PUT", `/api/assignment/rules/${rule.id}`, { isActive: !rule.isActive })).json(),
    onSuccess: invalidate,
  });

  const autoAssign = useMutation({
    mutationFn: async () => (await apiRequest("POST", "/api/assignment/auto-assign", { limit: 200 })).json(),
    onSuccess: (d: any) => {
      invalidate();
      toast({ title: `Auto-assign complete`, description: `${d.assigned} assigned, ${d.skipped} still unassigned` });
    },
    onError: (e: any) => toast({ title: "Auto-assign failed", description: e.message, variant: "destructive" }),
  });

  const dryRun = useMutation({
    mutationFn: async (leadId: number) =>
      (await apiRequest("POST", "/api/assignment/dry-run", { leadId })).json(),
    onSuccess: (d: any) => setTestResult(d),
    onError: (e: any) => toast({ title: "Test failed", description: e.message, variant: "destructive" }),
  });

  const saveCapacity = useMutation({
    mutationFn: async (p: { userId: number; body: any }) =>
      (await apiRequest("PUT", `/api/assignment/capacity/${p.userId}`, p.body)).json(),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/assignment/capacity"] }); toast({ title: "Agent updated" }); },
    onError: (e: any) => toast({ title: "Update failed", description: e.message, variant: "destructive" }),
  });

  const sortedRules = useMemo(
    () => [...rules].sort((a, b) => a.priorityOrder - b.priorityOrder || a.id - b.id),
    [rules],
  );

  return (
    <Layout>
      <div className="p-6 max-w-6xl mx-auto space-y-6">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <Link href="/settings"><Button variant="ghost" size="icon"><ArrowLeft className="h-4 w-4" /></Button></Link>
            <div>
              <h1 className="text-2xl font-bold">Lead Assignment & Routing</h1>
              <p className="text-sm text-muted-foreground">Ordered, versioned rules route every lead to the right agent.</p>
            </div>
          </div>
          <Button onClick={() => { setEditing(null); setBuilderOpen(true); }}>
            <Plus className="h-4 w-4 mr-2" /> New Rule
          </Button>
        </div>

        {unassignedCount > 0 && (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>{unassignedCount} unassigned lead{unassignedCount === 1 ? "" : "s"}</AlertTitle>
            <AlertDescription className="flex items-center justify-between flex-wrap gap-2">
              <span>Leads with no owner go cold. Run the engine to assign them now.</span>
              <Button size="sm" variant="outline" onClick={() => autoAssign.mutate()} disabled={autoAssign.isPending}>
                <Zap className="h-4 w-4 mr-2" /> {autoAssign.isPending ? "Assigning…" : "Auto-assign now"}
              </Button>
            </AlertDescription>
          </Alert>
        )}

        {/* Rules list */}
        <Card>
          <CardHeader>
            <CardTitle>Routing rules</CardTitle>
            <CardDescription>Evaluated top to bottom. The first selector rule that finds an eligible agent wins. Guards filter every candidate.</CardDescription>
          </CardHeader>
          <CardContent>
            {rulesLoading ? <p className="text-sm text-muted-foreground">Loading…</p> : sortedRules.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <Users className="h-10 w-10 mx-auto mb-3 opacity-50" />
                <p className="font-medium">No rules yet</p>
                <p className="text-sm mb-4">Create a Round Robin rule to start assigning leads.</p>
                <Button onClick={() => { setEditing(null); setBuilderOpen(true); }}><Plus className="h-4 w-4 mr-2" /> New Rule</Button>
              </div>
            ) : (
              <div className="space-y-2">
                {sortedRules.map((rule, i) => {
                  const meta: any = ruleTypeMeta(rule.ruleType);
                  const Icon = meta.icon || Users;
                  const isSelector = SELECTOR_TYPES.includes(rule.ruleType);
                  return (
                    <div key={rule.id} className={`flex items-center gap-3 p-3 rounded-lg border ${rule.isActive ? "" : "opacity-50"}`}>
                      <div className="flex flex-col gap-1">
                        <Button variant="ghost" size="icon" className="h-6 w-6" disabled={i === 0}
                          onClick={() => moveRule.mutate({ rule, dir: -1 })}><ArrowUp className="h-3 w-3" /></Button>
                        <Button variant="ghost" size="icon" className="h-6 w-6" disabled={i === sortedRules.length - 1}
                          onClick={() => moveRule.mutate({ rule, dir: 1 })}><ArrowDown className="h-3 w-3" /></Button>
                      </div>
                      <div className="h-8 w-8 rounded-md bg-primary/10 flex items-center justify-center shrink-0">
                        <Icon className="h-4 w-4 text-primary" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-medium">{i + 1}. {rule.name}</span>
                          <Badge variant={isSelector ? "default" : "secondary"}>{meta.label}</Badge>
                          <Badge variant="outline">v{rule.version}</Badge>
                          {!rule.isActive && <Badge variant="outline">disabled</Badge>}
                        </div>
                        <p className="text-xs text-muted-foreground truncate">{meta.desc}</p>
                      </div>
                      <Switch checked={rule.isActive} onCheckedChange={() => toggleActive.mutate(rule)} />
                      <Button variant="ghost" size="icon" onClick={() => { setEditing(rule); setBuilderOpen(true); }}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => { if (confirm(`Delete rule "${rule.name}"?`)) deleteRule.mutate(rule.id); }}>
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Test mode */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><FlaskConical className="h-5 w-5" /> Test mode</CardTitle>
            <CardDescription>Pick a lead to see exactly which rule would fire — nothing is assigned.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex gap-2 flex-wrap">
              <Select value={testLeadId} onValueChange={setTestLeadId}>
                <SelectTrigger className="w-72">
                  <SelectValue placeholder="Select an unassigned lead…" />
                </SelectTrigger>
                <SelectContent>
                  {unassignedLeads.map((l: any) => (
                    <SelectItem key={l.id} value={String(l.id)}>
                      #{l.id} — {l.address}, {l.city} {l.state}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button variant="outline" onClick={() => testLeadId && dryRun.mutate(Number(testLeadId))} disabled={!testLeadId || dryRun.isPending}>
                <Play className="h-4 w-4 mr-2" /> {dryRun.isPending ? "Testing…" : "Test"}
              </Button>
            </div>
            {testResult && (
              <div className="rounded-lg border p-4 space-y-3 bg-muted/30">
                <div className="flex items-center gap-2">
                  {testResult.decision.assignedToUserId ? (
                    <><CheckCircle2 className="h-5 w-5 text-green-600" />
                    <span className="font-medium">Would assign to {testResult.decision.winnerEmail}</span>
                    <Badge>{testResult.decision.ruleName}</Badge></>
                  ) : (
                    <><AlertTriangle className="h-5 w-5 text-yellow-600" />
                    <span className="font-medium">Would stay unassigned</span></>
                  )}
                </div>
                <p className="text-sm text-muted-foreground">{testResult.decision.reason}</p>
                <div className="space-y-1">
                  {testResult.decision.trace.map((t: any) => (
                    <div key={t.ruleId} className="flex items-start gap-2 text-xs">
                      <Badge variant={t.fired ? "default" : "outline"} className="shrink-0">{t.fired ? "fired" : "skipped"}</Badge>
                      <span><strong>{t.ruleName}</strong> ({t.ruleType}) — {t.detail}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Agent capacity */}
        <Card>
          <CardHeader>
            <CardTitle>Agent capacity & availability</CardTitle>
            <CardDescription>Guards read this. Over-capacity or unavailable agents never receive leads. Empty markets = all markets.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {agents.map((a: any) => (
                <AgentRow key={a.id} agent={a} onSave={(body: any) => saveCapacity.mutate({ userId: a.id, body })} saving={saveCapacity.isPending} />
              ))}
              {agents.length === 0 && <p className="text-sm text-muted-foreground">No active agents found.</p>}
            </div>
          </CardContent>
        </Card>
      </div>

      <RuleBuilderDialog
        open={builderOpen}
        onClose={() => { setBuilderOpen(false); setEditing(null); }}
        editing={editing}
        agents={agents}
        onSave={(body: any) => saveRule.mutate({ id: editing?.id, body })}
        saving={saveRule.isPending}
      />
    </Layout>
  );
}

function AgentRow({ agent, onSave, saving }: { agent: any; onSave: (b: any) => void; saving: boolean }) {
  const [maxLeads, setMaxLeads] = useState(String(agent.maxLeads ?? 50));
  const [markets, setMarkets] = useState((agent.markets || []).join(", "));
  const [available, setAvailable] = useState(agent.isAvailable !== false);
  const dirty = maxLeads !== String(agent.maxLeads ?? 50) || markets !== (agent.markets || []).join(", ") || available !== (agent.isAvailable !== false);
  const name = [agent.firstName, agent.lastName].filter(Boolean).join(" ") || agent.email;
  const atCap = agent.currentLeads >= (agent.maxLeads ?? 50);
  return (
    <div className="flex items-center gap-3 p-3 rounded-lg border flex-wrap">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-medium text-sm">{name}</span>
          <Badge variant="outline" className="text-xs">{agent.currentLeads}/{agent.maxLeads ?? 50} leads</Badge>
          {atCap && <Badge variant="destructive" className="text-xs">at capacity</Badge>}
          {!agent.isAvailable && <Badge variant="secondary" className="text-xs">unavailable</Badge>}
        </div>
        <p className="text-xs text-muted-foreground">{agent.email}</p>
      </div>
      <div className="flex items-center gap-2">
        <Label className="text-xs">Available</Label>
        <Switch checked={available} onCheckedChange={setAvailable} />
      </div>
      <div className="flex items-center gap-2">
        <Label className="text-xs">Max</Label>
        <Input type="number" min={0} max={10000} value={maxLeads} onChange={(e) => setMaxLeads(e.target.value)} className="w-20 h-8" />
      </div>
      <div className="flex items-center gap-2">
        <Label className="text-xs">Markets</Label>
        <Input value={markets} onChange={(e) => setMarkets(e.target.value)} placeholder="FL, MI" className="w-28 h-8" />
      </div>
      <Button size="sm" disabled={!dirty || saving} onClick={() => onSave({
        maxLeads: Number(maxLeads), isAvailable: available,
        markets: markets.split(",").map((s: string) => s.trim()).filter(Boolean),
      })}>Save</Button>
    </div>
  );
}

function RuleBuilderDialog({ open, onClose, editing, agents, onSave, saving }:
  { open: boolean; onClose: () => void; editing: any | null; agents: any[]; onSave: (b: any) => void; saving: boolean }) {
  const [name, setName] = useState("");
  const [ruleType, setRuleType] = useState<string>("round_robin");
  const [userIds, setUserIds] = useState<string>("");
  const [territories, setTerritories] = useState("");

  // Seed from editing rule when opened.
  const [seededFor, setSeededFor] = useState<number | null>(null);
  if (open && editing && seededFor !== editing.id) {
    setSeededFor(editing.id);
    setName(editing.name || "");
    setRuleType(editing.ruleType || "round_robin");
    const cfg = editing.config || {};
    setUserIds((cfg.userIds || []).join(", "));
    setTerritories(JSON.stringify(cfg.territories || [], null, 2));
  }
  if (open && !editing && seededFor !== 0) {
    setSeededFor(0);
    setName(""); setRuleType("round_robin"); setUserIds(""); setTerritories("");
  }
  if (!open && seededFor !== null) setSeededFor(null);

  const buildConfig = (): any => {
    if (ruleType === "round_robin") {
      const ids = userIds.split(",").map((s) => Number(s.trim())).filter((n) => Number.isInteger(n) && n > 0);
      if (!ids.length) throw new Error("Enter at least one agent user id (comma-separated).");
      return { userIds: ids };
    }
    if (ruleType === "territory") {
      let parsed: any;
      try { parsed = JSON.parse(territories || "[]"); }
      catch { throw new Error("Territories must be valid JSON."); }
      if (!Array.isArray(parsed) || !parsed.length) throw new Error("Add at least one territory.");
      return { territories: parsed };
    }
    return {};
  };

  const [err, setErr] = useState("");
  const submit = () => {
    try {
      setErr("");
      const body: any = { name: name.trim(), ruleType, config: buildConfig() };
      if (!body.name) throw new Error("Rule name is required.");
      onSave(body);
    } catch (e: any) { setErr(e.message); }
  };

  const toggleAgent = (id: number) => {
    const ids = userIds.split(",").map((s) => s.trim()).filter(Boolean);
    const s = String(id);
    setUserIds(ids.includes(s) ? ids.filter((x) => x !== s).join(", ") : [...ids, s].join(", "));
  };
  const selectedIds = new Set(userIds.split(",").map((s) => s.trim()).filter(Boolean));

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{editing ? "Edit rule" : "New routing rule"}</DialogTitle>
          <DialogDescription>Rules run top to bottom. Guards need no config — they read agent capacity.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label>Rule name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Florida round robin" />
          </div>
          <div className="space-y-2">
            <Label>Rule type</Label>
            <Select value={ruleType} onValueChange={setRuleType} disabled={!!editing}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {RULE_TYPES.map((t) => (
                  <SelectItem key={t.value} value={t.value}>
                    <span className="font-medium">{t.label}</span>
                    <span className="text-muted-foreground"> — {t.desc}</span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {!!editing && <p className="text-xs text-muted-foreground">Type can't change after creation — delete and recreate to switch types.</p>}
          </div>

          {ruleType === "round_robin" && (
            <div className="space-y-2">
              <Label>Agents in rotation (click to toggle)</Label>
              <div className="flex flex-wrap gap-2">
                {agents.map((a: any) => {
                  const on = selectedIds.has(String(a.id));
                  const label = [a.firstName, a.lastName].filter(Boolean).join(" ") || a.email;
                  return (
                    <Badge key={a.id} variant={on ? "default" : "outline"}
                      className="cursor-pointer px-3 py-1" onClick={() => toggleAgent(a.id)}>
                      {label}
                    </Badge>
                  );
                })}
              </div>
              {agents.length === 0 && <p className="text-xs text-muted-foreground">No active agents to choose from.</p>}
            </div>
          )}

          {ruleType === "territory" && (
            <div className="space-y-2">
              <Label>Territories (JSON)</Label>
              <textarea
                value={territories}
                onChange={(e) => setTerritories(e.target.value)}
                rows={7}
                spellCheck={false}
                placeholder={'[\n  { "name": "Florida", "states": ["FL"], "userIds": [3, 7] },\n  { "name": "Michigan", "states": ["MI"], "userIds": [5] }\n]'}
                className="w-full rounded-md border bg-background p-2 font-mono text-xs"
              />
              <p className="text-xs text-muted-foreground">Each territory: name, states (2-letter codes), userIds (agent ids).</p>
            </div>
          )}

          {err && <p className="text-sm text-destructive">{err}</p>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} disabled={saving}>{saving ? "Saving…" : editing ? "Save changes" : "Create rule"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
