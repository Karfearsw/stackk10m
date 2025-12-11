import { Layout } from "@/components/layout/Layout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useEffect, useState } from "react";
import { History as HistoryIcon } from "lucide-react";

interface CallLog { id: number; number: string; direction: string; status: string; startedAt?: string; durationMs?: number; }

export default function History() {
  const [items, setItems] = useState<CallLog[]>([]);
  const [q, setQ] = useState("");
  const [direction, setDirection] = useState<string>("");

  const load = async () => {
    const params = new URLSearchParams();
    params.set("limit", "100");
    if (direction) params.set("direction", direction);
    const res = await fetch(`/api/telephony/history?${params.toString()}`);
    const json = await res.json();
    setItems(json || []);
  };

  useEffect(() => { load(); }, [direction]);

  const filtered = items.filter(i => (i.number || "").includes(q));

  return (
    <Layout>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><HistoryIcon className="h-4 w-4" /> Call History</CardTitle>
          <CardDescription>Filter and redial</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-2 mb-3">
            <Input placeholder="Filter by number" value={q} onChange={(e) => setQ(e.target.value)} />
            <select className="border rounded-md px-2 py-1 text-sm" value={direction} onChange={(e) => setDirection(e.target.value)}>
              <option value="">All</option>
              <option value="outbound">Outbound</option>
              <option value="inbound">Inbound</option>
            </select>
            <Button variant="outline" onClick={load}>Refresh</Button>
          </div>
          <ScrollArea className="h-72 border rounded-md p-2">
            {filtered.map(h => (
              <div key={h.id} className="flex items-center justify-between py-2">
                <div>
                  <div className="font-medium">{h.number}</div>
                  <div className="text-xs text-muted-foreground">{h.direction} • {h.status} • {h.startedAt ? new Date(h.startedAt).toLocaleString() : ""}</div>
                </div>
                <div className="text-xs text-muted-foreground">{h.durationMs ? Math.round(h.durationMs/1000) + 's' : ''}</div>
              </div>
            ))}
            {filtered.length === 0 && (
              <p className="text-sm text-muted-foreground">No history</p>
            )}
          </ScrollArea>
        </CardContent>
      </Card>
    </Layout>
  );
}

