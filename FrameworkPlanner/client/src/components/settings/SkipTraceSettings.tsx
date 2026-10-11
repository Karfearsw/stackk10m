/**
 * Skip Trace Settings card (system tab).
 *
 * Read-only overview for everyone: provider key status (booleans only),
 * spend caps, today's/month's spend, quota guidance, unresolved alerts.
 * Managers can change the default provider, default mode, and the kill switch.
 */
import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { apiRequest } from "@/lib/queryClient";
import { Radar, AlertTriangle, CheckCircle2, XCircle, RefreshCw } from "lucide-react";

type Config = {
  enabled: boolean;
  providerName: string | null;
  defaultProvider: string;
  defaultMode: string;
  killSwitch: boolean;
  killSwitchSource: string;
  dailySpendCapCents: number;
  monthlySpendCapCents: number;
  todaySpendCents: number;
  monthSpendCents: number;
  tracerfyConfigured: boolean;
  courtlistenerConfigured: boolean;
  validationKeysConfigured: boolean;
  quotaGuidance: Record<string, string>;
  alerts?: Array<{ id: number; type: string; message: string; createdAt: string }>;
};

function cents(n: unknown) {
  const v = Number(n) || 0;
  return `$${(v / 100).toFixed(2)}`;
}

function KeyBadge(props: { ok: boolean; label: string }) {
  return (
    <Badge variant="outline" className={props.ok ? "border-emerald-500/30 text-emerald-700" : "border-slate-300 text-slate-500"}>
      <span className="mr-1 inline-flex">{props.ok ? <CheckCircle2 className="h-3 w-3" /> : <XCircle className="h-3 w-3" />}</span>
      {props.label}
    </Badge>
  );
}

export function SkipTraceSettings() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const isManager = Boolean(user?.isSuperAdmin) || ["admin", "manager", "owner"].includes(String(user?.role || ""));

  const configQuery = useQuery<Config>({
    queryKey: ["/api/skip-trace/config"],
    queryFn: async () => (await apiRequest("GET", "/api/skip-trace/config")).json(),
  });
  const cfg = configQuery.data;

  const [defaultProvider, setDefaultProvider] = useState("auto");
  const [defaultMode, setDefaultMode] = useState("both");
  const [killSwitch, setKillSwitch] = useState(false);

  useEffect(() => {
    if (cfg) {
      setDefaultProvider(cfg.defaultProvider || "auto");
      setDefaultMode(cfg.defaultMode || "both");
      setKillSwitch(Boolean(cfg.killSwitch));
    }
  }, [cfg]);

  const saveMutation = useMutation({
    mutationFn: async (body: { defaultProvider: string; defaultMode: string; killSwitch: boolean }) => {
      const res = await apiRequest("PUT", "/api/skip-trace/config", body);
      if (!res.ok) throw new Error((await res.json().catch(() => ({})))?.message || "Save failed");
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Skip trace settings saved" });
      queryClient.invalidateQueries({ queryKey: ["/api/skip-trace/config"] });
    },
    onError: (e: any) => toast({ title: e?.message || "Save failed", variant: "destructive" }),
  });

  const resolveMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await apiRequest("POST", `/api/skip-trace/alerts/${id}/resolve`);
      if (!res.ok) throw new Error("Resolve failed");
      return res.json();
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/skip-trace/config"] }),
    onError: (e: any) => toast({ title: e?.message || "Resolve failed", variant: "destructive" }),
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Radar className="h-5 w-5" /> Skip Trace Settings
        </CardTitle>
        <CardDescription>
          Free-lane and paid skip-trace providers, spend guardrails, and key status. Keys themselves live in deployment
          environment variables — only their configured state is shown here.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        {configQuery.isLoading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <RefreshCw className="h-4 w-4 animate-spin" /> Loading skip trace configuration…
          </div>
        ) : configQuery.isError || !cfg ? (
          <Alert variant="destructive">
            <AlertTitle>Configuration unavailable</AlertTitle>
            <AlertDescription>Could not load the skip trace configuration.</AlertDescription>
          </Alert>
        ) : (
          <>
            {Array.isArray(cfg.alerts) && cfg.alerts.length > 0 ? (
              <Alert className="border-amber-200 bg-amber-50 text-amber-950">
                <AlertTriangle className="h-4 w-4" />
                <AlertTitle>Active alerts ({cfg.alerts.length})</AlertTitle>
                <AlertDescription className="space-y-2">
                  {cfg.alerts.slice(0, 5).map((a) => (
                    <div key={a.id} className="flex items-start justify-between gap-2">
                      <div className="break-words text-xs">
                        <Badge variant="outline" className="mr-2 text-[10px]">{a.type}</Badge>
                        {a.message}
                      </div>
                      {isManager ? (
                        <Button variant="ghost" size="sm" className="h-6 shrink-0 text-xs" onClick={() => resolveMutation.mutate(a.id)}>
                          Resolve
                        </Button>
                      ) : null}
                    </div>
                  ))}
                </AlertDescription>
              </Alert>
            ) : null}

            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs text-muted-foreground">Keys:</span>
              <KeyBadge ok={cfg.tracerfyConfigured} label="Tracerfy" />
              <KeyBadge ok={cfg.courtlistenerConfigured} label="CourtListener" />
              <KeyBadge ok={cfg.validationKeysConfigured} label="Phone validation" />
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div className="rounded-md border p-3">
                <div className="text-xs text-muted-foreground">Active provider (env)</div>
                <div className="mt-1 text-sm font-medium">{cfg.providerName || "—"}</div>
              </div>
              <div className="rounded-md border p-3">
                <div className="text-xs text-muted-foreground">Spend today / cap</div>
                <div className="mt-1 text-sm font-medium">
                  {cents(cfg.todaySpendCents)} / {cfg.dailySpendCapCents > 0 ? cents(cfg.dailySpendCapCents) : "unlimited"}
                </div>
              </div>
              <div className="rounded-md border p-3">
                <div className="text-xs text-muted-foreground">Spend this month / cap</div>
                <div className="mt-1 text-sm font-medium">
                  {cents(cfg.monthSpendCents)} / {cfg.monthlySpendCapCents > 0 ? cents(cfg.monthlySpendCapCents) : "unlimited"}
                </div>
              </div>
            </div>

            {cfg.quotaGuidance ? (
              <div className="rounded-md border bg-muted/10 p-3">
                <div className="text-xs font-medium text-muted-foreground">Free-lane quotas</div>
                <ul className="mt-1 space-y-1 text-xs text-muted-foreground">
                  {Object.entries(cfg.quotaGuidance).map(([k, v]) => (
                    <li key={k}>• {v}</li>
                  ))}
                </ul>
              </div>
            ) : null}

            {isManager ? (
              <div className="space-y-4 rounded-md border p-4">
                <div className="text-sm font-medium">Manager controls</div>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label>Default provider</Label>
                    <Select value={defaultProvider} onValueChange={setDefaultProvider}>
                      <SelectTrigger data-testid="select-skip-trace-default-provider">
                        <SelectValue placeholder="Default provider" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="auto">Auto (environment)</SelectItem>
                        <SelectItem value="free-web">Free web</SelectItem>
                        <SelectItem value="courtlistener">CourtListener</SelectItem>
                        <SelectItem value="tracerfy">Tracerfy instant</SelectItem>
                        <SelectItem value="tracerfy-batch">Tracerfy batch</SelectItem>
                        <SelectItem value="enformiongo">EnformionGO</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Default mode</Label>
                    <Select value={defaultMode} onValueChange={setDefaultMode}>
                      <SelectTrigger data-testid="select-skip-trace-default-mode">
                        <SelectValue placeholder="Default mode" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="provider">Provider</SelectItem>
                        <SelectItem value="public_research">Public research</SelectItem>
                        <SelectItem value="both">Both</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="flex items-center justify-between gap-3 rounded-md border border-red-200 bg-red-50/50 p-3">
                  <div>
                    <div className="text-sm font-medium text-red-900">Kill switch — block all paid lookups</div>
                    <div className="text-xs text-red-700">
                      Stops every paid provider immediately. Free public research keeps running. Currently{" "}
                      {cfg.killSwitch ? "ON" : "OFF"} (source: {cfg.killSwitchSource}).
                    </div>
                  </div>
                  <Switch
                    checked={killSwitch}
                    onCheckedChange={setKillSwitch}
                    data-testid="switch-skip-trace-kill"
                    aria-label="Kill switch"
                  />
                </div>
                <Button
                  onClick={() => saveMutation.mutate({ defaultProvider, defaultMode, killSwitch })}
                  disabled={saveMutation.isPending}
                  data-testid="button-skip-trace-settings-save"
                >
                  {saveMutation.isPending ? "Saving…" : "Save settings"}
                </Button>
              </div>
            ) : (
              <div className="text-xs text-muted-foreground">Manager controls are visible to admins and managers only.</div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
