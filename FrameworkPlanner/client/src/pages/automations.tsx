import { Layout } from "@/components/layout/Layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { QueryError } from "@/components/ui/query-state";
import { useAuth } from "@/contexts/AuthContext";
import { apiRequest } from "@/lib/queryClient";
import {
  AUTOMATION_ACTIONS,
  AUTOMATION_CONDITION_FIELDS,
  AUTOMATION_TRIGGERS,
  buildAutomationPayload,
  describeAutomation,
  describeStoredAutomation,
  type WizardAction,
  type WizardCondition,
} from "@/lib/automation-wizard";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Loader2, Plus, RefreshCw, Zap } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

type Automation = {
  id: number;
  teamId: number;
  name: string;
  description: string | null;
  enabled: boolean | null;
  createdAt: string | null;
  updatedAt: string | null;
};

const WIZARD_STEPS = ["trigger", "conditions", "actions", "review"] as const;
type WizardStep = (typeof WIZARD_STEPS)[number];

export function AutomationsContent() {
  const { user } = useAuth();
  const qc = useQueryClient();

  const listKey = "/api/automations?limit=200&offset=0";
  const { data, isLoading, isError, isFetching, refetch } = useQuery<Automation[]>({ queryKey: [listKey], enabled: !!user });

  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<WizardStep>("trigger");
  const [selectedId, setSelectedId] = useState<number | null>(null);

  const [form, setForm] = useState({
    name: "",
    description: "",
    enabled: true,
    trigger: AUTOMATION_TRIGGERS[0].value,
    conditions: [] as WizardCondition[],
    actions: [] as WizardAction[],
  });

  const [newCondition, setNewCondition] = useState<WizardCondition>({ field: "lead.source", op: "eq", value: "" });
  const [pendingActionType, setPendingActionType] = useState<string>(AUTOMATION_ACTIONS[0].value);

  const detailKey = useMemo(() => (selectedId ? `/api/automations/${selectedId}` : null), [selectedId]);
  const { data: detail } = useQuery<any>({
    queryKey: detailKey ? [detailKey] : [""],
    enabled: !!user && !!detailKey,
  });

  const runsKey = useMemo(() => (selectedId ? `/api/automations/${selectedId}/runs?limit=50&offset=0` : null), [selectedId]);
  const { data: runs, refetch: refetchRuns } = useQuery<any[]>({
    queryKey: runsKey ? [runsKey] : [""],
    enabled: !!user && !!runsKey,
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      const payload = buildAutomationPayload(form);
      if (!payload.name) throw new Error("Name is required");
      if (!payload.triggers.length) throw new Error("Pick a trigger");
      if (!payload.actions.length) throw new Error("Add at least one action");
      const res = await apiRequest("POST", "/api/automations", payload);
      return await res.json();
    },
    onSuccess: async () => {
      toast.success("Automation created");
      setOpen(false);
      setStep("trigger");
      setForm({ name: "", description: "", enabled: true, trigger: AUTOMATION_TRIGGERS[0].value, conditions: [], actions: [] });
      await qc.invalidateQueries({ queryKey: [listKey] });
    },
    onError: (e: any) => toast.error(String(e?.message || e)),
  });

  const toggleMutation = useMutation({
    mutationFn: async (a: Automation) => {
      const res = await apiRequest("PATCH", `/api/automations/${a.id}`, { enabled: !a.enabled });
      return await res.json();
    },
    onSuccess: async () => {
      toast.success("Automation updated");
      await qc.invalidateQueries({ queryKey: [listKey] });
    },
    onError: (e: any) => toast.error(String(e?.message || e)),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await apiRequest("DELETE", `/api/automations/${id}`);
      return await res.json();
    },
    onSuccess: async () => {
      toast.success("Automation deleted");
      setSelectedId(null);
      await qc.invalidateQueries({ queryKey: [listKey] });
    },
    onError: (e: any) => toast.error(String(e?.message || e)),
  });

  const items = data || [];

  const addCondition = () => {
    if (!newCondition.value.trim()) return toast.error("Enter a value for the condition");
    setForm((p) => ({ ...p, conditions: [...p.conditions, newCondition] }));
    setNewCondition({ field: "lead.source", op: "eq", value: "" });
  };

  const addAction = () => {
    const def = AUTOMATION_ACTIONS.find((a) => a.value === pendingActionType);
    if (!def) return;
    const config: Record<string, string | number> = {};
    for (const f of def.fields) {
      if (typeof f.default !== "undefined") config[f.key] = f.default;
      else config[f.key] = f.type === "number" ? 0 : "";
    }
    setForm((p) => ({ ...p, actions: [...p.actions, { actionType: def.value, config }] }));
    setPendingActionType(AUTOMATION_ACTIONS[0].value);
  };

  const setActionConfig = (idx: number, key: string, value: string) => {
    setForm((p) => {
      const actions = p.actions.map((a, i) =>
        i === idx ? { ...a, config: { ...a.config, [key]: key === "dueInMinutes" || key === "timeoutMs" ? (parseInt(value, 10) || 0) : value } } : a
      );
      return { ...p, actions };
    });
  };

  const externalActions = form.actions.filter((a) => a.actionType === "webhook.post");
  const summary = describeAutomation(form);

  return (
    <>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Zap className="h-6 w-6" />
            <h1 className="text-2xl font-semibold">Automations</h1>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={() => refetch()} disabled={isFetching}>
              <RefreshCw className={isFetching ? "h-4 w-4 animate-spin" : "h-4 w-4"} />
            </Button>
            <Dialog open={open} onOpenChange={setOpen}>
              <DialogTrigger asChild>
                <Button data-testid="button-new-automation">
                  <Plus className="h-4 w-4" />
                  New Automation
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-2xl max-h-[85vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle>New automation</DialogTitle>
                </DialogHeader>

                <div className="flex items-center gap-1 text-xs text-muted-foreground mb-4">
                  {WIZARD_STEPS.map((s) => (
                    <span key={s} className="flex items-center gap-1">
                      <span className={`px-2 py-0.5 rounded-full capitalize ${WIZARD_STEPS.indexOf(s) <= WIZARD_STEPS.indexOf(step) ? "bg-primary/10 text-primary" : ""}`}>
                        {s}
                      </span>
                      {s !== "review" && <span className="text-muted-foreground/40">→</span>}
                    </span>
                  ))}
                </div>

                {step === "trigger" && (
                  <div className="space-y-3">
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      <div className="space-y-2">
                        <Label>Name</Label>
                        <Input value={form.name} onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))} placeholder="e.g. Follow up on new leads" data-testid="automation-name" />
                      </div>
                      <div className="space-y-2">
                        <Label>Description</Label>
                        <Input value={form.description} onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))} placeholder="Optional" />
                      </div>
                    </div>
                    <Label>Trigger</Label>
                    <div className="space-y-2">
                      {AUTOMATION_TRIGGERS.map((t) => (
                        <button
                          key={t.value}
                          type="button"
                          onClick={() => setForm((p) => ({ ...p, trigger: t.value }))}
                          className={`w-full text-left rounded-md border p-3 transition-colors ${form.trigger === t.value ? "border-primary bg-primary/5" : "hover:bg-muted"}`}
                          data-testid={`trigger-${t.value}`}
                        >
                          <div className="font-medium text-sm">{t.label}</div>
                          <div className="text-xs text-muted-foreground">{t.description}</div>
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {step === "conditions" && (
                  <div className="space-y-3">
                    <Label>Conditions (optional — run only when all are true)</Label>
                    {form.conditions.length === 0 && (
                      <p className="text-sm text-muted-foreground">No conditions — this automation will run on every matching trigger.</p>
                    )}
                    {form.conditions.map((c, i) => (
                      <div key={i} className="flex items-center gap-2 text-sm">
                        <span className="text-muted-foreground capitalize">{AUTOMATION_CONDITION_FIELDS.find((f) => f.value === c.field)?.label || c.field}</span>
                        <span className="text-muted-foreground">{c.op === "gte" ? "≥" : c.op === "lte" ? "≤" : "="}</span>
                        <span className="font-medium">“{c.value}”</span>
                        <Button variant="ghost" size="sm" onClick={() => setForm((p) => ({ ...p, conditions: p.conditions.filter((_, j) => j !== i) }))}>
                          Remove
                        </Button>
                      </div>
                    ))}
                    <div className="flex flex-wrap items-end gap-2 border rounded-md p-3">
                      <div className="space-y-1">
                        <Label className="text-xs">Field</Label>
                        <Select value={newCondition.field} onValueChange={(v) => setNewCondition((p) => ({ ...p, field: v }))}>
                          <SelectTrigger className="w-44">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {AUTOMATION_CONDITION_FIELDS.map((f) => (
                              <SelectItem key={f.value} value={f.value}>
                                {f.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">Operator</Label>
                        <Select value={newCondition.op} onValueChange={(v) => setNewCondition((p) => ({ ...p, op: v as WizardCondition["op"] }))}>
                          <SelectTrigger className="w-28">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="eq">is</SelectItem>
                            <SelectItem value="gte">is at least</SelectItem>
                            <SelectItem value="lte">is at most</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-1 flex-1 min-w-32">
                        <Label className="text-xs">Value</Label>
                        <Input value={newCondition.value} onChange={(e) => setNewCondition((p) => ({ ...p, value: e.target.value }))} placeholder="e.g. Zillow, negotiating, 60" data-testid="condition-value" />
                      </div>
                      <Button variant="outline" size="sm" onClick={addCondition}>
                        Add condition
                      </Button>
                    </div>
                  </div>
                )}

                {step === "actions" && (
                  <div className="space-y-3">
                    <Label>Actions</Label>
                    {form.actions.length === 0 && (
                      <p className="text-sm text-muted-foreground">Add at least one action.</p>
                    )}
                    {form.actions.map((a, i) => {
                      const def = AUTOMATION_ACTIONS.find((d) => d.value === a.actionType);
                      return (
                        <div key={i} className="border rounded-md p-3 space-y-2">
                          <div className="flex items-center justify-between">
                            <div className="text-sm font-medium">{def?.label || a.actionType}</div>
                            <Button variant="ghost" size="sm" onClick={() => setForm((p) => ({ ...p, actions: p.actions.filter((_, j) => j !== i) }))}>
                              Remove
                            </Button>
                          </div>
                          {def?.fields.map((f) => (
                            <div key={f.key} className="space-y-1">
                              <Label className="text-xs">{f.label}</Label>
                              <Input
                                value={String(a.config[f.key] ?? "")}
                                onChange={(e) => setActionConfig(i, f.key, e.target.value)}
                                placeholder={f.key === "url" ? "https://example.com/webhook" : f.label}
                                data-testid={`action-${f.key}`}
                              />
                            </div>
                          ))}
                        </div>
                      );
                    })}
                    <div className="flex flex-wrap items-end gap-2 border rounded-md p-3">
                      <div className="space-y-1">
                        <Label className="text-xs">Action type</Label>
                        <Select value={pendingActionType} onValueChange={setPendingActionType}>
                          <SelectTrigger className="w-56">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {AUTOMATION_ACTIONS.map((a) => (
                              <SelectItem key={a.value} value={a.value}>
                                {a.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <Button variant="outline" size="sm" onClick={addAction}>
                        Add action
                      </Button>
                    </div>
                  </div>
                )}

                {step === "review" && (
                  <div className="space-y-3">
                    <div className="rounded-md border border-primary/30 bg-primary/5 p-4">
                      <div className="text-sm font-medium mb-1">When this happens…</div>
                      <p className="text-sm text-foreground" data-testid="automation-summary">
                        {summary}
                      </p>
                    </div>
                    <div className="flex items-center gap-3">
                      <Switch checked={form.enabled} onCheckedChange={(v) => setForm((p) => ({ ...p, enabled: v }))} />
                      <div className="text-sm">Enabled immediately after creation</div>
                    </div>
                    {externalActions.length > 0 && (
                      <div className="flex items-start gap-2 rounded-md border border-amber-500/30 bg-amber-500/5 p-3 text-sm text-amber-700">
                        <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
                        <span>This automation calls an external webhook. External actions run only when the automation fires; test with a controlled payload first.</span>
                      </div>
                    )}
                    <div className="text-xs text-muted-foreground">
                      Automations run server-side on matching events. Task and notification actions are safe and idempotent; webhooks are external.
                    </div>
                  </div>
                )}

                <DialogFooter className="flex items-center justify-between">
                  <div className="flex gap-2">
                    {step !== "trigger" && (
                      <Button variant="outline" onClick={() => setStep(WIZARD_STEPS[WIZARD_STEPS.indexOf(step) - 1])}>
                        Back
                      </Button>
                    )}
                    {step !== "review" && (
                      <Button onClick={() => setStep(WIZARD_STEPS[WIZARD_STEPS.indexOf(step) + 1])}>
                        Next
                      </Button>
                    )}
                    {step === "review" && (
                      <Button onClick={() => createMutation.mutate()} disabled={createMutation.isPending} data-testid="button-create-automation">
                        {createMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                        Create automation
                      </Button>
                    )}
                  </div>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        </div>
        <div className="space-y-4" data-testid="automations-list">
          {isLoading ? (
            <div className="flex items-center justify-center py-12 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin mr-2" />
              Loading automations…
            </div>
          ) : isError ? (
            <QueryError message="Could not load automations. Check your connection and try again." onRetry={() => refetch()} />
          ) : items.length === 0 ? (
            <div className="rounded-md border border-dashed p-10 text-center">
              <Zap className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
              <p className="font-medium">No automations yet</p>
              <p className="text-sm text-muted-foreground max-w-md mx-auto mt-1">
                Automations run when an event happens — for example a lead is created or an opportunity stage changes —
                and can create tasks, send notifications, or call a webhook. Click “New Automation” to build your first one.
              </p>
            </div>
          ) : (
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Enabled</TableHead>
                    <TableHead>Updated</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.map((a) => (
                    <TableRow key={a.id}>
                      <TableCell>
                        <div className="font-medium">{a.name}</div>
                        {a.description ? <div className="text-xs text-muted-foreground">{a.description}</div> : null}
                      </TableCell>
                      <TableCell>
                        <Switch checked={!!a.enabled} onCheckedChange={() => toggleMutation.mutate(a)} disabled={toggleMutation.isPending} data-testid={`toggle-${a.id}`} />
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {a.updatedAt ? new Date(a.updatedAt).toLocaleString() : "—"}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          <Button variant="outline" size="sm" onClick={() => setSelectedId(a.id)} data-testid={`view-${a.id}`}>
                            View
                          </Button>
                          <Button variant="ghost" size="sm" className="text-destructive" onClick={() => deleteMutation.mutate(a.id)}>
                            Delete
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </div>

        <Dialog open={!!selectedId} onOpenChange={(o) => { if (!o) setSelectedId(null); }}>
          <DialogContent className="sm:max-w-2xl max-h-[85vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{detail?.automation?.name || "Automation details"}</DialogTitle>
            </DialogHeader>
            {detail ? (
              <div className="space-y-1">
                <p className="text-sm" data-testid="automation-detail-summary">
                  {describeStoredAutomation(detail)}
                </p>
                <p className="text-xs text-muted-foreground">
                  Enabled: {detail.automation?.enabled ? "yes" : "no"} · Created {detail.automation?.createdAt ? new Date(detail.automation.createdAt).toLocaleString() : "—"}
                </p>
              </div>
            ) : (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading details…
              </div>
            )}
            <div className="text-sm font-medium mt-2">Recent runs</div>
            {!runs ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading runs…
              </div>
            ) : runs.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No runs yet. Runs appear when the automation fires or is executed.
              </p>
            ) : (
              <div className="space-y-2">
                {runs.map((r: any) => (
                  <div key={r.id} className="rounded-md border p-2 text-sm flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <div className="font-medium capitalize">{String(r.status || "unknown")}</div>
                      <div className="text-xs text-muted-foreground truncate">
                        {r.eventType || "—"}
                        {r.error ? <span className="text-destructive"> · {r.error}</span> : null}
                      </div>
                    </div>
                    <div className="text-xs text-muted-foreground shrink-0">
                      {r.createdAt ? new Date(r.createdAt).toLocaleString() : ""}
                    </div>
                  </div>
                ))}
              </div>
            )}
            <DialogFooter className="flex items-center justify-between">
              <Button variant="outline" onClick={() => refetchRuns()}>
                <RefreshCw className="h-4 w-4" />
                Refresh runs
              </Button>
              <Button onClick={() => setSelectedId(null)}>Close</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </>
  );
}

export default function AutomationsPage() {
  return <AutomationsContent />;
}
