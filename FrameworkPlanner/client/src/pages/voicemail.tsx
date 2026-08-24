import { Layout } from "@/components/layout/Layout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useEffect, useState } from "react";
import { QueryError } from "@/components/ui/query-state";
import { Voicemail } from "lucide-react";

interface VoicemailItem {
  id: number;
  e164?: string | null;
  number?: string | null;
  durationSeconds?: number | null;
  transcript?: string | null;
  isRead?: boolean;
  createdAt?: string | null;
  audioUrl?: string | null;
}

function formatDuration(sec?: number | null): string {
  if (!sec || sec <= 0) return "";
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

export default function VoicemailPage() {
  const [items, setItems] = useState<VoicemailItem[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoadError(null);
    setLoading(true);
    try {
      const res = await fetch(`/api/telephony/voicemail?limit=50`, { credentials: "include" });
      if (res.status === 401) throw new Error("Please sign in to view voicemail");
      if (!res.ok) throw new Error("Failed to load voicemail");
      const json = await res.json();
      setItems(Array.isArray(json) ? json : []);
    } catch (e: any) {
      setLoadError(String(e?.message || "Failed to load voicemail"));
      setItems([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  return (
    <Layout>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Voicemail className="h-4 w-4" /> Voicemail</CardTitle>
          <CardDescription>Listen and review messages</CardDescription>
        </CardHeader>
        <CardContent>
          {loadError && (
            <div className="rounded-md border border-destructive/40 mb-3">
              <QueryError message={loadError} onRetry={load} />
            </div>
          )}
          {loading && !loadError ? (
            <p className="text-sm text-muted-foreground py-4">Loading voicemail…</p>
          ) : (
            <ScrollArea className="h-72 border rounded-md p-2">
              {items.map(v => (
                <div key={v.id} className="space-y-1 py-2 border-b last:border-0">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="font-medium">{v.e164 || v.number || "Unknown number"}</div>
                      <div className="text-xs text-muted-foreground">
                        {v.createdAt ? new Date(v.createdAt).toLocaleString() : ""}
                        {formatDuration(v.durationSeconds) ? ` · ${formatDuration(v.durationSeconds)}` : ""}
                      </div>
                    </div>
                    {v.isRead === false && (
                      <span className="text-xs rounded-full bg-primary/10 text-primary px-2 py-0.5">New</span>
                    )}
                  </div>
                  {v.audioUrl ? (
                    <audio controls src={v.audioUrl} className="w-full" />
                  ) : (
                    <p className="text-xs text-muted-foreground">No recording available</p>
                  )}
                  {v.transcript ? (
                    <p className="text-xs text-muted-foreground italic line-clamp-2">{v.transcript}</p>
                  ) : null}
                </div>
              ))}
              {items.length === 0 && (
                <p className="text-sm text-muted-foreground">No voicemails yet</p>
              )}
            </ScrollArea>
          )}
        </CardContent>
      </Card>
    </Layout>
  );
}
