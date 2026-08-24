import { Layout } from "@/components/layout/Layout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useEffect, useState } from "react";
import { QueryError } from "@/components/ui/query-state";
import { Voicemail } from "lucide-react";

interface CallLog { id: number; number: string; status: string; metadata?: string; startedAt?: string; }

export default function VoicemailPage() {
  const [items, setItems] = useState<CallLog[]>([]);

  const [loadError, setLoadError] = useState<string | null>(null);

  const load = async () => {
    setLoadError(null);
    try {
      const res = await fetch(`/api/telephony/history?status=voicemail&limit=50`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load voicemail");
      const json = await res.json();
      setItems(Array.isArray(json) ? json : []);
    } catch (e: any) {
      setLoadError(String(e?.message || "Failed to load voicemail"));
      setItems([]);
    }
  };

  useEffect(() => { load(); }, []);

  const parseAudio = (meta?: string) => {
    try { const m = meta ? JSON.parse(meta) : {}; return m.audioUrl || m.RecordingUrl || null; } catch { return null; }
  };

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
          <ScrollArea className="h-72 border rounded-md p-2">
            {items.map(v => {
              const audio = parseAudio(v.metadata);
              return (
                <div key={v.id} className="space-y-1 py-2">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="font-medium">{v.number}</div>
                      <div className="text-xs text-muted-foreground">{v.startedAt ? new Date(v.startedAt).toLocaleString() : ""}</div>
                    </div>
                  </div>
                  {audio ? (
                    <audio controls src={audio} className="w-full" />
                  ) : (
                    <p className="text-xs text-muted-foreground">No recording available</p>
                  )}
                </div>
              );
            })}
            {items.length === 0 && (
              <p className="text-sm text-muted-foreground">No voicemails</p>
            )}
          </ScrollArea>
        </CardContent>
      </Card>
    </Layout>
  );
}

