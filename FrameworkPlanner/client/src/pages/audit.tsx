import { Layout } from "@/components/layout/Layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";

type AuditRun = { id: number; scopeJson: any; createdAt: string };
type AuditFinding = {
  id: number;
  runId: number;
  severity: "critical" | "major" | "minor" | "polish";
  area: string;
  title: string;
  description: string;
  recommendation: string | null;
  technicalNotes: string | null;
  status: "open" | "accepted" | "fixed" | "wontfix";
  createdAt: string;
  updatedAt: string;
};

export default function AuditPage() {
  const { toast } = useToast();
  const [activeRunId, setActiveRunId] = useState<number | null>(null);
  const [severity, setSeverity] = useState<AuditFinding["severity"]>("major");
  const [area, setArea] = useState("Leads");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [recommendation, setRecommendation] = useState("");
  const [technicalNotes, setTechnicalNotes] = useState("");

  const runsQuery = useQuery<{ items: AuditRun[] }>({
    queryKey: ["/api/audit/runs"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/audit/runs?limit=50");
      return await res.json();
    },
  });

  const runs = useMemo(() => (Array.isArray(runsQuery.data?.items) ? runsQuery.data?.items : []), [runsQuery.data?.items]);
  const activeRun = useMemo(() => runs.find((r) => r.id === activeRunId) || null, [runs, activeRunId]);

  const createRunMutation = useMutation({
    mutationFn: async () => {
      const scopeJson = { modules: ["Leads", "Opps", "Phone", "Contacts", "Shared UI"], createdAt: new Date().toISOString() };
      const res = await apiRequest("POST", "/api/audit/runs", { scopeJson });
      return await res.json();
    },
    onSuccess: async (row: any) => {
      await runsQuery.refetch();
      setActiveRunId(Number(row?.id) || null);
      toast({ title: "Audit run created", description: "Add findings as you review the app." });
    },
    onError: (e: any) => toast({ title: "Create failed", description: String(e?.message || e), variant: "destructive" }),
  });

  const findingsQuery = useQuery<{ items: AuditFinding[] }>({
    queryKey: ["/api/audit/runs", activeRunId, "findings"],
    enabled: Boolean(activeRunId),
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/audit/runs/${activeRunId}/findings`);
      return await res.json();
    },
  });

  const findings = useMemo(() => (Array.isArray(findingsQuery.data?.items) ? findingsQuery.data?.items : []), [findingsQuery.data?.items]);

  const createFindingMutation = useMutation({
    mutationFn: async () => {
      if (!activeRunId) throw new Error("No active run");
      const res = await apiRequest("POST", `/api/audit/runs/${activeRunId}/findings`, {
        severity,
        area,
        title: title.trim(),
        description: description.trim(),
        recommendation: recommendation.trim() || null,
        technicalNotes: technicalNotes.trim() || null,
      });
      return await res.json();
    },
    onSuccess: async () => {
      await findingsQuery.refetch();
      setTitle("");
      setDescription("");
      setRecommendation("");
      setTechnicalNotes("");
      toast({ title: "Finding saved", description: "Recorded in this audit run." });
    },
    onError: (e: any) => toast({ title: "Save failed", description: String(e?.message || e), variant: "destructive" }),
  });

  return (
    <Layout>
      <div className="flex flex-col gap-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Audit</h1>
            <p className="text-muted-foreground">Create runs, log issues, and track fixes.</p>
          </div>
          <Button onClick={() => createRunMutation.mutate()} disabled={createRunMutation.isPending}>
            {createRunMutation.isPending ? "Creating…" : "New run"}
          </Button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <Card className="lg:col-span-1">
            <CardHeader>
              <CardTitle>Runs</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {runs.map((r) => (
                <Button
                  key={r.id}
                  type="button"
                  variant={r.id === activeRunId ? "default" : "outline"}
                  className="w-full justify-start"
                  onClick={() => setActiveRunId(r.id)}
                >
                  Run #{r.id}
                </Button>
              ))}
              {!runs.length ? <div className="text-sm text-muted-foreground">No runs yet.</div> : null}
            </CardContent>
          </Card>

          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle>{activeRun ? `Run #${activeRun.id}` : "Select a run"}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              {activeRun ? (
                <>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-2">
                      <Label>Severity</Label>
                      <Select value={severity} onValueChange={(v) => setSeverity(v as any)}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="critical">Critical</SelectItem>
                          <SelectItem value="major">Major</SelectItem>
                          <SelectItem value="minor">Minor</SelectItem>
                          <SelectItem value="polish">Polish</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>Area</Label>
                      <Input value={area} onChange={(e) => setArea(e.target.value)} placeholder="Leads, Phone, Contacts…" />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label>Title</Label>
                    <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Short issue title" />
                  </div>
                  <div className="space-y-2">
                    <Label>Description</Label>
                    <Textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Current issue + why it matters" />
                  </div>
                  <div className="space-y-2">
                    <Label>Recommendation</Label>
                    <Textarea value={recommendation} onChange={(e) => setRecommendation(e.target.value)} placeholder="Recommended fix" />
                  </div>
                  <div className="space-y-2">
                    <Label>Technical notes</Label>
                    <Textarea value={technicalNotes} onChange={(e) => setTechnicalNotes(e.target.value)} placeholder="Files, edge cases, data notes" />
                  </div>
                  <Button
                    onClick={() => createFindingMutation.mutate()}
                    disabled={!title.trim() || !description.trim() || createFindingMutation.isPending}
                  >
                    {createFindingMutation.isPending ? "Saving…" : "Add finding"}
                  </Button>

                  <div className="border-t pt-4 space-y-2">
                    <div className="text-sm font-medium">Findings</div>
                    {findings.map((f) => (
                      <div key={f.id} className="rounded-md border p-3">
                        <div className="flex items-center justify-between gap-2">
                          <div className="font-medium">{f.title}</div>
                          <div className="text-xs text-muted-foreground">
                            {f.severity} · {f.status}
                          </div>
                        </div>
                        <div className="text-sm text-muted-foreground whitespace-pre-wrap mt-1">{f.description}</div>
                      </div>
                    ))}
                    {!findings.length ? <div className="text-sm text-muted-foreground">No findings yet.</div> : null}
                  </div>
                </>
              ) : (
                <div className="text-sm text-muted-foreground">Create a run or select one to start logging findings.</div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </Layout>
  );
}
