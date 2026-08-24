import { Layout } from "@/components/layout/Layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useQuery } from "@tanstack/react-query";
import { Loader2, Server, Database, Phone, Shield, ActivitySquare, Key, ToggleLeft, ToggleRight } from "lucide-react";

export default function SystemHealthPage() {
  const { data, refetch, isFetching, error } = useQuery<any>({
    queryKey: ["/api/system/health"],
    queryFn: async () => {
      const res = await fetch("/api/system/health", { credentials: "include" });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
  });

  const { data: version } = useQuery<any>({
    queryKey: ["/api/version"],
    queryFn: async () => {
      const res = await fetch("/api/version", { credentials: "include" });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
  });

  const copyJson = async () => {
    try {
      await navigator.clipboard.writeText(JSON.stringify(data, null, 2));
    } catch {}
  };

  return (
    <Layout>
      <div className="space-y-1 mb-6">
        <h1 className="text-3xl font-bold tracking-tight">System Health</h1>
        <p className="text-muted-foreground">Comprehensive diagnostics for environment, database, telephony and runtime.</p>
      </div>

      {!data && isFetching && (
        <div className="flex items-center justify-center h-64">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      )}

      {error && (
        <Card>
          <CardContent className="p-6">
            <p className="text-destructive">Failed to load diagnostics</p>
            <Button variant="outline" onClick={() => refetch()} className="mt-3">Retry</Button>
          </CardContent>
        </Card>
      )}

      {data && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><Server className="w-5 h-5" /> Version</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <div className="flex justify-between"><span>App</span><span className="font-medium">v{String(version?.version || "0.0.0")}</span></div>
              <div className="flex justify-between"><span>Commit</span><span className="text-muted-foreground">{version?.commitSha ? String(version.commitSha).slice(0, 7) : "unknown"}</span></div>
              <div className="flex justify-between"><span>Build</span><span className="text-muted-foreground">{version?.buildId ? String(version.buildId) : "unknown"}</span></div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><Server className="w-5 h-5" /> Environment</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <div className="flex justify-between"><span>NODE_ENV</span><span className="font-medium">{data.env?.nodeEnv || "unknown"}</span></div>
              <div>
                <p className="text-xs text-muted-foreground">Missing Env</p>
                <p className="text-xs">{Array.isArray(data.env?.missing) && data.env.missing.length ? data.env.missing.join(", ") : "None"}</p>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><Database className="w-5 h-5" /> Database</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <div className="flex justify-between"><span>Status</span><span className={data.db === "connected" ? "text-green-600" : "text-red-600"}>{data.db}</span></div>
              <div className="flex justify-between"><span>Checked</span><span className="text-muted-foreground">{new Date(data.timestamp).toLocaleString()}</span></div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><Phone className="w-5 h-5" /> Telephony</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <div className="flex justify-between"><span>Telnyx</span><span className={data.telnyx?.status === "reachable" ? "text-green-600" : data.telnyx?.status === "unconfigured" ? "text-yellow-600" : "text-red-600"}>{data.telnyx?.status || "unknown"}</span></div>
              <div className="flex justify-between"><span>HTTP Status</span><span className="text-muted-foreground">{String(data.telnyx?.httpStatus ?? data.telnyx?.code ?? "-")}</span></div>
              <div className="flex justify-between"><span>Message</span><span className="text-muted-foreground">{String(data.telnyx?.message || "-")}</span></div>
              <div><p className="text-xs text-muted-foreground">Default From</p><p className="text-xs">{data.defaultFrom || "not set"}</p></div>
              <div><p className="text-xs text-muted-foreground">Numbers</p><p className="text-xs">{Array.isArray(data.numbers) && data.numbers.length ? data.numbers.join(", ") : "-"}</p></div>
            </CardContent>
          </Card>

          {data.telnyxDiag && (
            <Card className="md:col-span-2 lg:col-span-3">
              <CardHeader>
                <CardTitle className="flex items-center gap-2"><Key className="w-5 h-5" /> Telnyx Diagnostics</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                <div className="flex justify-between"><span>Configured</span><span className={data.telnyxDiag.telnyxConfigured ? "text-green-600" : "text-red-600"}>{String(data.telnyxDiag.telnyxConfigured)}</span></div>
                <div className="flex justify-between"><span>API Key Prefix</span><span className="text-muted-foreground">{String(data.telnyxDiag.apiKeyPrefix || "-")}...</span></div>
                <div className="flex justify-between"><span>Used Public Key Instead</span><span className={data.telnyxDiag.usedPublicKey ? "text-red-600" : "text-green-600"}>{String(data.telnyxDiag.usedPublicKey)}</span></div>
                <div className="flex justify-between"><span>Base URL</span><span className="text-muted-foreground">{String(data.telnyxDiag.baseUrl || "-")}</span></div>
                <div className="flex justify-between"><span>Connection ID</span><span className="text-muted-foreground">{String(data.telnyxDiag.connectionId || "-")}</span></div>
                <div className="flex justify-between"><span>Messaging Profile ID</span><span className="text-muted-foreground">{String(data.telnyxDiag.messagingProfileId || "-")}</span></div>
                <div className="flex justify-between"><span>Default From</span><span className="text-muted-foreground">{String(data.telnyxDiag.defaultFrom || "-")}</span></div>
                <div className="flex justify-between"><span>Webhook URL</span><span className="text-muted-foreground">{String(data.telnyxDiag.webhookUrl || "-")}</span></div>
              </CardContent>
            </Card>
          )}

          <Card className="md:col-span-2 lg:col-span-3">
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><ActivitySquare className="w-5 h-5" /> Module Status</CardTitle>
            </CardHeader>
            <CardContent>
              {Array.isArray(data.modules) ? (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                  {data.modules.map((m: any) => (
                    <div key={m.key} className="rounded-md border border-border p-3">
                      <div className="flex items-center justify-between">
                        <span className="font-medium text-sm">{m.label}</span>
                        <span
                          className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                            m.state === "healthy"
                              ? "bg-green-100 text-green-700"
                              : m.state === "unconfigured"
                                ? "bg-yellow-100 text-yellow-700"
                                : "bg-red-100 text-red-700"
                          }`}
                        >
                          {m.state}
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground mt-2">{m.detail}</p>
                      <p className="text-[10px] text-muted-foreground mt-1">Checked {new Date(m.lastChecked).toLocaleString()}</p>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">Module matrix unavailable.</p>
              )}
            </CardContent>
          </Card>

      {/* Feature Flags Matrix (Phase 7) */}
      {Array.isArray(data.features) && data.features.length > 0 && (
        <Card className="md:col-span-2 lg:col-span-3">
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><ToggleRight className="w-5 h-5" /> Feature Flags</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
              {data.features.map((f: any) => (
                <div key={f.key} className="rounded-md border border-border p-3">
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-sm">{f.label}</span>
                    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${f.enabled ? "bg-green-100 text-green-700" : "bg-yellow-100 text-yellow-700"}`}>
                      {f.enabled ? "enabled" : "disabled"}
                    </span>
                  </div>
                  {!f.enabled && f.action && (
                    <p className="text-xs text-muted-foreground mt-2">{f.action}</p>
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><Shield className="w-5 h-5" /> Sessions</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <div className="flex justify-between"><span>Store</span><span className={data.sessions?.ok ? "text-green-600" : "text-red-600"}>{data.sessions?.ok ? "ok" : "error"}</span></div>
            </CardContent>
          </Card>

          <Card className="md:col-span-2 lg:col-span-3">
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><ActivitySquare className="w-5 h-5" /> Next Steps</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              {Array.isArray(data.nextSteps) && data.nextSteps.length ? (
                <ul className="list-disc ml-5">
                  {data.nextSteps.map((s: string, i: number) => (<li key={i}>{s}</li>))}
                </ul>
              ) : (
                <p className="text-muted-foreground">No actions required</p>
              )}
              <div className="flex gap-2 mt-3">
                <Button variant="outline" onClick={() => refetch()} disabled={isFetching}>{isFetching && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}Refresh</Button>
                <Button variant="outline" onClick={copyJson}>Copy JSON</Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </Layout>
  );
}
