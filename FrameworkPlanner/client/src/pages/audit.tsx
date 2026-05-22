import { Layout } from "@/components/layout/Layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { apiRequest } from "@/lib/queryClient";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";

type AuditRun = {
  id: number;
  createdAt: string;
  scopeJson: any;
};

type AuditFinding = {
  id: number;
  runId: number;
  severity: string;
  area: string;
  title: string;
  description: string;
  recommendation: string | null;
  technicalNotes: string | null;
  affectedPages: string[];
  fixPlan: string | null;
  ownerUserId: number | null;
  prdSection: string | null;
  status: string;
  createdAt: string;
  updatedAt: string;
};

export default function AuditPage() {
  const queryClient = useQueryClient();
  const [selectedRunId, setSelectedRunId] = useState<number | null>(null);

  const [newRunScope, setNewRunScope] = useState<string>('{"area":"app","notes":""}');
  const [seedMode, setSeedMode] = useState<"append" | "replace">("append");

  const { data: runsResp } = useQuery<{ items: AuditRun[] }>({
    queryKey: ["/api/audit/runs"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/audit/runs");
      return await res.json();
    },
  });

  const runs = useMemo(() => (Array.isArray(runsResp?.items) ? runsResp!.items : []), [runsResp]);

  const activeRunId = selectedRunId ?? (runs[0]?.id ?? null);

  const { data: findingsResp } = useQuery<{ items: AuditFinding[] }>({
    queryKey: ["/api/audit/runs", activeRunId, "findings"],
    enabled: !!activeRunId,
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/audit/runs/${activeRunId}/findings`);
      return await res.json();
    },
  });

  const findings = useMemo(() => (Array.isArray(findingsResp?.items) ? findingsResp!.items : []), [findingsResp]);

  const createRun = useMutation({
    mutationFn: async () => {
      let scopeJson: any = {};
      try {
        scopeJson = JSON.parse(newRunScope || "{}");
      } catch {
        scopeJson = { raw: newRunScope };
      }
      const res = await apiRequest("POST", "/api/audit/runs", { scopeJson });
      return await res.json();
    },
    onSuccess: async (row: AuditRun) => {
      await queryClient.invalidateQueries({ queryKey: ["/api/audit/runs"] });
      setSelectedRunId(row.id);
    },
  });

  const [newFinding, setNewFinding] = useState({
    severity: "medium",
    area: "leads",
    title: "",
    description: "",
    recommendation: "",
    technicalNotes: "",
    affectedPages: "",
    fixPlan: "",
    prdSection: "",
  });

  const createFinding = useMutation({
    mutationFn: async () => {
      if (!activeRunId) throw new Error("Select a run");
      const res = await apiRequest("POST", `/api/audit/runs/${activeRunId}/findings`, {
        severity: newFinding.severity,
        area: newFinding.area,
        title: newFinding.title,
        description: newFinding.description,
        recommendation: newFinding.recommendation || null,
        technicalNotes: newFinding.technicalNotes || null,
        affectedPages: newFinding.affectedPages
          ? newFinding.affectedPages
              .split(",")
              .map((p) => p.trim())
              .filter(Boolean)
          : [],
        fixPlan: newFinding.fixPlan || null,
        prdSection: newFinding.prdSection || null,
      });
      return await res.json();
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["/api/audit/runs", activeRunId, "findings"] });
      setNewFinding((v) => ({ ...v, title: "", description: "", recommendation: "", technicalNotes: "", affectedPages: "", fixPlan: "", prdSection: "" }));
    },
  });

  const seedPages = useMutation({
    mutationFn: async () => {
      if (!activeRunId) throw new Error("Select a run");
      const res = await apiRequest("POST", `/api/audit/runs/${activeRunId}/seed-pages`, { mode: seedMode });
      return await res.json();
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["/api/audit/runs", activeRunId, "findings"] });
    },
  });

  const patchFinding = useMutation({
    mutationFn: async (input: { id: number; patch: Partial<AuditFinding> }) => {
      const res = await apiRequest("PATCH", `/api/audit/findings/${input.id}`, input.patch);
      return await res.json();
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["/api/audit/runs", activeRunId, "findings"] });
    },
  });

  return (
    <Layout>
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Audit</h1>
          <p className="text-sm text-muted-foreground">Runs and findings to track app issues and fixes.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-1">
          <CardHeader>
            <CardTitle>Runs</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Textarea value={newRunScope} onChange={(e) => setNewRunScope(e.target.value)} rows={4} />
              <Button onClick={() => createRun.mutate()} disabled={createRun.isPending}>
                Create Run
              </Button>
            </div>
            {activeRunId && (
              <div className="space-y-2">
                <div className="text-sm font-medium">Seed Backlog</div>
                <Select value={seedMode} onValueChange={(v: any) => setSeedMode(v)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="append">Append</SelectItem>
                    <SelectItem value="replace">Replace</SelectItem>
                  </SelectContent>
                </Select>
                <Button variant="outline" onClick={() => seedPages.mutate()} disabled={seedPages.isPending}>
                  {seedPages.isPending ? "Seeding..." : "Seed Page Inventory"}
                </Button>
              </div>
            )}
            <div className="space-y-2">
              {runs.length === 0 && <div className="text-sm text-muted-foreground">No runs yet.</div>}
              {runs.map((r) => (
                <button
                  key={r.id}
                  className={`w-full rounded-md border px-3 py-2 text-left text-sm ${activeRunId === r.id ? "border-primary" : "border-border"}`}
                  onClick={() => setSelectedRunId(r.id)}
                >
                  <div className="flex items-center justify-between">
                    <div className="font-medium">Run #{r.id}</div>
                    <div className="text-xs text-muted-foreground">{new Date(r.createdAt).toLocaleString()}</div>
                  </div>
                </button>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Findings</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <div className="space-y-2">
                <div className="text-sm font-medium">Severity</div>
                <Select value={newFinding.severity} onValueChange={(v) => setNewFinding((s) => ({ ...s, severity: v }))}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="low">Low</SelectItem>
                    <SelectItem value="medium">Medium</SelectItem>
                    <SelectItem value="high">High</SelectItem>
                    <SelectItem value="critical">Critical</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <div className="text-sm font-medium">Area</div>
                <Input value={newFinding.area} onChange={(e) => setNewFinding((s) => ({ ...s, area: e.target.value }))} />
              </div>
              <div className="space-y-2 md:col-span-2">
                <div className="text-sm font-medium">Title</div>
                <Input value={newFinding.title} onChange={(e) => setNewFinding((s) => ({ ...s, title: e.target.value }))} />
              </div>
              <div className="space-y-2 md:col-span-2">
                <div className="text-sm font-medium">Description</div>
                <Textarea value={newFinding.description} onChange={(e) => setNewFinding((s) => ({ ...s, description: e.target.value }))} rows={4} />
              </div>
              <div className="space-y-2 md:col-span-2">
                <div className="text-sm font-medium">Recommendation</div>
                <Textarea value={newFinding.recommendation} onChange={(e) => setNewFinding((s) => ({ ...s, recommendation: e.target.value }))} rows={3} />
              </div>
              <div className="space-y-2 md:col-span-2">
                <div className="text-sm font-medium">Technical Notes</div>
                <Textarea value={newFinding.technicalNotes} onChange={(e) => setNewFinding((s) => ({ ...s, technicalNotes: e.target.value }))} rows={3} />
              </div>
              <div className="space-y-2 md:col-span-2">
                <div className="text-sm font-medium">Affected Pages (comma-separated)</div>
                <Input value={newFinding.affectedPages} onChange={(e) => setNewFinding((s) => ({ ...s, affectedPages: e.target.value }))} placeholder="/leads, /opportunities/:id" />
              </div>
              <div className="space-y-2 md:col-span-2">
                <div className="text-sm font-medium">Fix Plan</div>
                <Textarea value={newFinding.fixPlan} onChange={(e) => setNewFinding((s) => ({ ...s, fixPlan: e.target.value }))} rows={3} />
              </div>
              <div className="space-y-2 md:col-span-2">
                <div className="text-sm font-medium">PRD Section</div>
                <Input value={newFinding.prdSection} onChange={(e) => setNewFinding((s) => ({ ...s, prdSection: e.target.value }))} placeholder="e.g. Leads PRD / Key upgrades" />
              </div>
              <div className="md:col-span-2">
                <Button onClick={() => createFinding.mutate()} disabled={!activeRunId || createFinding.isPending}>
                  Add Finding
                </Button>
              </div>
            </div>

            <div className="space-y-3">
              {findings.length === 0 && <div className="text-sm text-muted-foreground">No findings for this run.</div>}
              {findings.map((f) => (
                <div key={f.id} className="rounded-md border border-border p-4 space-y-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="font-semibold">{f.title}</div>
                    <div className="flex items-center gap-2">
                      <Badge variant="secondary">{f.severity}</Badge>
                      <Badge variant="outline">{f.status}</Badge>
                    </div>
                  </div>
                  <div className="text-sm text-muted-foreground">{f.area}</div>
                  {Array.isArray(f.affectedPages) && f.affectedPages.length > 0 && (
                    <div className="flex flex-wrap gap-2">
                      {f.affectedPages.slice(0, 8).map((p) => (
                        <Badge key={p} variant="outline">
                          {p}
                        </Badge>
                      ))}
                    </div>
                  )}
                  <div className="text-sm whitespace-pre-wrap">{f.description}</div>
                  {f.recommendation && <div className="text-sm whitespace-pre-wrap"><span className="font-medium">Recommendation: </span>{f.recommendation}</div>}
                  {f.technicalNotes && <div className="text-sm whitespace-pre-wrap"><span className="font-medium">Technical: </span>{f.technicalNotes}</div>}
                  {f.fixPlan && <div className="text-sm whitespace-pre-wrap"><span className="font-medium">Fix plan: </span>{f.fixPlan}</div>}
                  <div className="flex items-center gap-2">
                    <Select value={f.status} onValueChange={(v) => patchFinding.mutate({ id: f.id, patch: { status: v } as any })}>
                      <SelectTrigger className="w-[180px]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="open">Open</SelectItem>
                        <SelectItem value="in_progress">In Progress</SelectItem>
                        <SelectItem value="resolved">Resolved</SelectItem>
                        <SelectItem value="ignored">Ignored</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
}
