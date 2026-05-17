import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { ExternalLink, RefreshCw } from "lucide-react";

type EntityType = "lead" | "opportunity";
type Mode = "provider" | "public_research" | "both";

type PollResponse = {
  job?: any;
  events?: any[];
  evidence?: any[];
  providerResult?: any | null;
  scoreSnapshot?: any | null;
  merged?: any | null;
};

function toStr(v: unknown) {
  return typeof v === "string" ? v : v === null || v === undefined ? "" : String(v);
}

function formatMode(m: string) {
  if (m === "public_research") return "Public";
  if (m === "provider") return "Provider";
  if (m === "both") return "Both";
  return m || "—";
}

function statusTone(status: string) {
  const s = status.toLowerCase();
  if (s === "completed") return "bg-emerald-500/10 text-emerald-700 border-emerald-500/20";
  if (s === "failed") return "bg-red-500/10 text-red-700 border-red-500/20";
  if (s === "running") return "bg-blue-500/10 text-blue-700 border-blue-500/20";
  if (s === "queued") return "bg-slate-500/10 text-slate-700 border-slate-500/20";
  return "bg-muted";
}

function confidenceTone(confidence: string) {
  const c = confidence.toLowerCase();
  if (c === "high") return "bg-emerald-500/10 text-emerald-700 border-emerald-500/20";
  if (c === "medium") return "bg-amber-500/10 text-amber-800 border-amber-500/20";
  if (c === "low") return "bg-red-500/10 text-red-700 border-red-500/20";
  return "bg-muted";
}

function safeNumber(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const n = parseFloat(v);
    if (Number.isFinite(n)) return n;
  }
  return null;
}

function parseReasons(factorsJson: unknown): { label: string; points: number }[] {
  const factors = Array.isArray(factorsJson) ? factorsJson : [];
  const rows = factors
    .map((f: any) => ({
      label: toStr(f?.label || f?.key).trim(),
      points: safeNumber(f?.points) ?? 0,
    }))
    .filter((r) => r.label && r.points > 0)
    .sort((a, b) => (b.points - a.points) || a.label.localeCompare(b.label));
  const out: { label: string; points: number }[] = [];
  const seen = new Set<string>();
  for (const r of rows) {
    if (seen.has(r.label)) continue;
    seen.add(r.label);
    out.push(r);
    if (out.length >= 8) break;
  }
  return out;
}

export function SkipTraceJobPanel(props: { entityType: EntityType; entityId: number; className?: string }) {
  const { toast } = useToast();
  const storageKey = `skipTrace:lastJob:${props.entityType}:${props.entityId}`;
  const [mode, setMode] = useState<Mode>("both");
  const [jobId, setJobId] = useState<number | null>(null);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(storageKey) || "";
      const n = raw ? parseInt(raw, 10) : 0;
      if (Number.isFinite(n) && n > 0) setJobId(n);
    } catch {}
  }, [storageKey]);

  const createJobMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/skip-trace/jobs", {
        entityType: props.entityType,
        entityId: props.entityId,
        mode,
      });
      return (await res.json()) as { jobId: number; status: string };
    },
    onSuccess: (out) => {
      setJobId(out.jobId);
      try {
        localStorage.setItem(storageKey, String(out.jobId));
      } catch {}
    },
    onError: (e: any) => {
      toast({ title: e?.message || "Skip trace failed", variant: "destructive" });
    },
  });

  const pollQuery = useQuery<PollResponse>({
    queryKey: ["/api/skip-trace/jobs", jobId],
    enabled: !!jobId,
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/skip-trace/jobs/${jobId}`);
      return (await res.json()) as PollResponse;
    },
    refetchInterval: (q) => {
      const status = toStr((q.state.data as any)?.job?.status).toLowerCase();
      if (!status) return 2000;
      if (status === "completed" || status === "failed") return false;
      return status === "queued" ? 1500 : 2500;
    },
  });

  const runJobMutation = useMutation({
    mutationFn: async () => {
      if (!jobId) throw new Error("Missing job id");
      const res = await apiRequest("POST", `/api/skip-trace/jobs/${jobId}/run`);
      try {
        return (await res.json()) as { jobId: number; status: string };
      } catch {
        return { jobId, status: "running" };
      }
    },
    onSuccess: () => {
      pollQuery.refetch();
    },
    onError: (e: any) => {
      toast({ title: e?.message || "Skip trace failed", variant: "destructive" });
    },
  });

  const job = pollQuery.data?.job || null;
  const events = Array.isArray(pollQuery.data?.events) ? pollQuery.data!.events! : [];
  const evidence = Array.isArray(pollQuery.data?.evidence) ? pollQuery.data!.evidence! : [];
  const scoreSnapshot = pollQuery.data?.scoreSnapshot ?? null;
  const merged = pollQuery.data?.merged ?? null;
  const providerResult = pollQuery.data?.providerResult ?? null;

  const contacts = useMemo(() => {
    const mergedPhones = Array.isArray(merged?.contacts?.phones) ? merged.contacts.phones : [];
    const mergedEmails = Array.isArray(merged?.contacts?.emails) ? merged.contacts.emails : [];
    const providerPhones = Array.isArray(providerResult?.phones) ? providerResult.phones : [];
    const providerEmails = Array.isArray(providerResult?.emails) ? providerResult.emails : [];
    const uniq = (arr: string[]) => Array.from(new Set(arr.map((s) => toStr(s).trim()).filter(Boolean)));
    return {
      phones: uniq([...mergedPhones, ...providerPhones]),
      emails: uniq([...mergedEmails, ...providerEmails]),
    };
  }, [merged?.contacts?.emails, merged?.contacts?.phones, providerResult?.emails, providerResult?.phones]);

  const hasLowConfidence = String(scoreSnapshot?.confidence || "").toLowerCase() === "low";
  const reasons = useMemo(() => parseReasons(scoreSnapshot?.factorsJson), [scoreSnapshot?.factorsJson]);
  const scoreTotal = typeof scoreSnapshot?.scoreTotal === "number" ? scoreSnapshot.scoreTotal : safeNumber(scoreSnapshot?.scoreTotal) ?? null;
  const urgencyTier = toStr(scoreSnapshot?.urgencyTier).trim() || null;
  const confidence = toStr(scoreSnapshot?.confidence).trim() || null;
  const reasonSummary = toStr(scoreSnapshot?.reasonSummary).trim() || null;

  const latestEvent = useMemo(() => {
    if (!events.length) return null;
    const byCreated = [...events].sort((a: any, b: any) => {
      const at = new Date(toStr(a?.createdAt) || 0).getTime();
      const bt = new Date(toStr(b?.createdAt) || 0).getTime();
      return bt - at;
    });
    return byCreated[0] ?? null;
  }, [events]);

  const modeLabel = formatMode(toStr(job?.mode) || mode);
  const jobStatus = toStr(job?.status) || (createJobMutation.data?.status ? toStr(createJobMutation.data.status) : "");
  const isQueued = jobId ? jobStatus.toLowerCase() === "queued" : false;

  return (
    <div className={props.className}>
      <div className="flex flex-col gap-3">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2">
            <div className="text-sm font-medium">Skip Trace</div>
            {jobStatus ? (
              <Badge variant="outline" className={statusTone(jobStatus)}>
                {jobStatus}
              </Badge>
            ) : null}
            {modeLabel ? (
              <Badge variant="outline" className="text-xs">
                {modeLabel}
              </Badge>
            ) : null}
          </div>
          <div className="flex items-center gap-2">
            <Select value={mode} onValueChange={(v) => setMode(v as Mode)}>
              <SelectTrigger className="h-9 w-[160px]" data-testid="select-skip-trace-mode">
                <SelectValue placeholder="Mode" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="provider">Provider</SelectItem>
                <SelectItem value="public_research">Public</SelectItem>
                <SelectItem value="both">Both</SelectItem>
              </SelectContent>
            </Select>
            <Button
              variant="secondary"
              className="h-9"
              onClick={() => (isQueued ? runJobMutation.mutate() : createJobMutation.mutate())}
              disabled={isQueued ? runJobMutation.isPending || !jobId : createJobMutation.isPending || props.entityId <= 0}
              data-testid="button-skip-trace-run"
            >
              {isQueued ? (runJobMutation.isPending ? "Starting…" : "Start") : createJobMutation.isPending ? "Running…" : "Run"}
            </Button>
            <Button
              variant="outline"
              size="icon"
              className="h-9 w-9"
              onClick={() => pollQuery.refetch()}
              disabled={!jobId || pollQuery.isFetching}
              data-testid="button-skip-trace-refresh"
            >
              <RefreshCw className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {job?.errorMessage ? (
          <Alert variant="destructive">
            <AlertTitle>Skip trace failed</AlertTitle>
            <AlertDescription>{toStr(job.errorMessage)}</AlertDescription>
          </Alert>
        ) : null}

        {hasLowConfidence ? (
          <Alert className="border-amber-200 bg-amber-50 text-amber-950">
            <AlertTitle>Compliance notice</AlertTitle>
            <AlertDescription>
              Confidence is low. Do not contact without verifying identity with additional sources and confirming opt-in/permissions for your outreach channel.
            </AlertDescription>
          </Alert>
        ) : null}

        <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
          <div className="rounded-md border p-3 lg:col-span-1">
            <div className="text-xs text-muted-foreground">Contacts</div>
            <div className="mt-2 space-y-2 text-sm">
              <div>
                <div className="text-xs text-muted-foreground">Phones</div>
                <div className="mt-1 flex flex-col gap-1">
                  {contacts.phones.length ? (
                    contacts.phones.map((p) => (
                      <a key={p} className="underline underline-offset-2" href={`tel:${p}`}>
                        {p}
                      </a>
                    ))
                  ) : (
                    <div className="text-muted-foreground">—</div>
                  )}
                </div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">Emails</div>
                <div className="mt-1 flex flex-col gap-1">
                  {contacts.emails.length ? (
                    contacts.emails.map((e) => (
                      <a key={e} className="underline underline-offset-2 break-all" href={`mailto:${e}`}>
                        {e}
                      </a>
                    ))
                  ) : (
                    <div className="text-muted-foreground">—</div>
                  )}
                </div>
              </div>
              {typeof providerResult?.costCents === "number" ? (
                <div className="pt-1 text-xs text-muted-foreground">
                  Provider cost: ${(providerResult.costCents / 100).toFixed(2)}
                </div>
              ) : null}
            </div>
          </div>

          <div className="rounded-md border p-3 lg:col-span-2">
            <div className="flex items-center justify-between gap-3">
              <div className="text-xs text-muted-foreground">Score</div>
              {confidence ? (
                <Badge variant="outline" className={confidenceTone(confidence)}>
                  {confidence}
                </Badge>
              ) : null}
            </div>

            <div className="mt-2 grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div className="rounded-md bg-muted/20 p-3">
                <div className="text-xs text-muted-foreground">Total</div>
                <div className="mt-1 text-2xl font-semibold">{scoreTotal === null ? "—" : scoreTotal}</div>
                <div className="text-xs text-muted-foreground">0–100</div>
              </div>
              <div className="rounded-md bg-muted/20 p-3">
                <div className="text-xs text-muted-foreground">Urgency</div>
                <div className="mt-1 text-lg font-semibold">{urgencyTier || "—"}</div>
              </div>
              <div className="rounded-md bg-muted/20 p-3">
                <div className="text-xs text-muted-foreground">Evidence</div>
                <div className="mt-1 text-lg font-semibold">{evidence.length.toLocaleString()}</div>
              </div>
            </div>

            {reasons.length || reasonSummary ? (
              <div className="mt-3 space-y-2">
                <div className="text-xs text-muted-foreground">Reasons</div>
                {reasons.length ? (
                  <div className="grid grid-cols-1 gap-1 text-sm">
                    {reasons.map((r) => (
                      <div key={`${r.label}:${r.points}`} className="flex items-center justify-between gap-3">
                        <span className="truncate">{r.label}</span>
                        <span className="text-muted-foreground">+{r.points}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-sm">{reasonSummary}</div>
                )}
              </div>
            ) : (
              <div className="mt-3 text-sm text-muted-foreground">No score snapshot yet.</div>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          <div className="rounded-md border p-3">
            <div className="flex items-center justify-between">
              <div className="text-xs text-muted-foreground">Evidence</div>
              <div className="text-xs text-muted-foreground">{evidence.length ? `${evidence.length} items` : "—"}</div>
            </div>
            <div className="mt-2 max-h-40 overflow-y-auto pr-2 scroll-y-container">
              <div className="space-y-2">
                {evidence.length ? (
                  evidence.map((ev: any) => {
                    const url = toStr(ev?.sourceUrl).trim();
                    const label = toStr(ev?.sourceType || "source").trim() || "source";
                    const notes = toStr(ev?.notes).trim();
                    const when = toStr(ev?.collectedAt).trim();
                    return (
                      <div key={String(ev?.id || `${label}:${url}:${when}`)} className="rounded-md border bg-muted/10 p-2">
                        <div className="flex items-center justify-between gap-2">
                          <Badge variant="outline" className="text-xs">
                            {label}
                          </Badge>
                          {url ? (
                            <a
                              className="inline-flex items-center gap-1 text-xs underline underline-offset-2"
                              href={url}
                              target="_blank"
                              rel="noreferrer"
                            >
                              Source <ExternalLink className="h-3 w-3" />
                            </a>
                          ) : null}
                        </div>
                        {notes ? <div className="mt-1 text-xs text-muted-foreground">{notes}</div> : null}
                        {when ? <div className="mt-1 text-[11px] text-muted-foreground">{new Date(when).toLocaleString()}</div> : null}
                      </div>
                    );
                  })
                ) : (
                  <div className="text-sm text-muted-foreground">No evidence yet.</div>
                )}
              </div>
            </div>
          </div>

          <div className="rounded-md border p-3">
            <div className="flex items-center justify-between gap-3">
              <div className="text-xs text-muted-foreground">Progress</div>
              {latestEvent ? (
                <div className="text-xs text-muted-foreground">
                  {toStr(latestEvent?.status)} {toStr(latestEvent?.message).trim() ? `— ${toStr(latestEvent.message)}` : ""}
                </div>
              ) : (
                <div className="text-xs text-muted-foreground">—</div>
              )}
            </div>
            <div className="mt-2 max-h-40 overflow-y-auto pr-2 scroll-y-container">
              <div className="space-y-2">
                {events.length ? (
                  [...events]
                    .sort((a: any, b: any) => new Date(toStr(b?.createdAt) || 0).getTime() - new Date(toStr(a?.createdAt) || 0).getTime())
                    .slice(0, 50)
                    .map((ev: any) => (
                      <div key={String(ev?.id || `${ev?.status}:${ev?.createdAt}`)} className="rounded-md border bg-muted/10 p-2">
                        <div className="flex items-center justify-between gap-2">
                          <Badge variant="outline" className="text-xs">
                            {toStr(ev?.status) || "event"}
                          </Badge>
                          <div className="text-[11px] text-muted-foreground">
                            {ev?.createdAt ? new Date(toStr(ev.createdAt)).toLocaleTimeString() : "—"}
                          </div>
                        </div>
                        {toStr(ev?.message).trim() ? <div className="mt-1 text-xs text-muted-foreground">{toStr(ev.message)}</div> : null}
                      </div>
                    ))
                ) : (
                  <div className="text-sm text-muted-foreground">No events yet.</div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
