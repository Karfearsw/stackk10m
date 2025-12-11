import { Layout } from "@/components/layout/Layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useQuery } from "@tanstack/react-query";
import { Loader2, Server, Database, Phone, Shield, ActivitySquare } from "lucide-react";

export default function SystemHealthPage() {
  const { data, refetch, isFetching, error } = useQuery<any>({
    queryKey: ["/api/system/health"],
    queryFn: async () => {
      const res = await fetch("/api/system/health", { credentials: "include" });
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
              <div className="flex justify-between"><span>SignalWire</span><span className={data.signalwire === "reachable" ? "text-green-600" : data.signalwire === "unconfigured" ? "text-yellow-600" : "text-red-600"}>{data.signalwire}</span></div>
              <div><p className="text-xs text-muted-foreground">Default From</p><p className="text-xs">{data.defaultFrom || "not set"}</p></div>
              <div><p className="text-xs text-muted-foreground">Numbers</p><p className="text-xs">{Array.isArray(data.numbers) && data.numbers.length ? data.numbers.join(", ") : "-"}</p></div>
            </CardContent>
          </Card>

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
