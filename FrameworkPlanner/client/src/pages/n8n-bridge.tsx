import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Layout } from "@/components/layout/Layout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import {
  Webhook,
  Plus,
  Trash2,
  Play,
  CheckCircle2,
  XCircle,
  Clock,
  Copy,
  Server,
} from "lucide-react";

async function api(path: string, opts?: RequestInit) {
  const res = await fetch(path, {
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    ...opts,
  });
  if (!res.ok) {
    const j = await res.json().catch(() => ({}));
    throw new Error(j.message || `Request failed (${res.status})`);
  }
  return res.json();
}

const EVENT_LABELS: Record<string, string> = {
  "signal.created": "Signal created — any new distress signal",
  "parcel.high_score": "Parcel high score — distress score ≥ 8 (hot lead)",
  "lead.created": "Lead created",
  "lead.status_changed": "Lead status changed",
};

function AddWebhookDialog({ onDone }: { onDone: () => void }) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: "", url: "", secret: "", events: [] as string[] });

  const { data: eventsData } = useQuery({
    queryKey: ["automation-events"],
    queryFn: () => api("/api/automation/events"),
  });

  const mutation = useMutation({
    mutationFn: () => api("/api/automation/webhooks", { method: "POST", body: JSON.stringify(form) }),
    onSuccess: () => {
      toast({ title: "Webhook added" });
      setOpen(false);
      setForm({ name: "", url: "", secret: "", events: [] });
      onDone();
    },
    onError: (e: any) => toast({ title: "Failed", description: e.message, variant: "destructive" }),
  });

  const toggleEvent = (ev: string) =>
    setForm((f) => ({
      ...f,
      events: f.events.includes(ev) ? f.events.filter((e) => e !== ev) : [...f.events, ev],
    }));

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button><Plus className="h-4 w-4 mr-2" />Add Webhook</Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>Add n8n Webhook</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Name</Label>
            <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="e.g. n8n — hot lead alerts" />
          </div>
          <div className="space-y-2">
            <Label>n8n Webhook URL</Label>
            <Input value={form.url} onChange={(e) => setForm({ ...form, url: e.target.value })}
              placeholder="https://n8n.yourdomain.com/webhook/…" />
          </div>
          <div className="space-y-2">
            <Label>Signing secret (optional)</Label>
            <Input value={form.secret} onChange={(e) => setForm({ ...form, secret: e.target.value })}
              placeholder="Shared secret for X-Luxe-Signature" type="password" />
          </div>
          <div className="space-y-2">
            <Label>Events</Label>
            <div className="space-y-2">
              {(eventsData?.events || []).map((ev: string) => (
                <label key={ev} className="flex items-start gap-2 text-sm cursor-pointer">
                  <Checkbox checked={form.events.includes(ev)} onCheckedChange={() => toggleEvent(ev)} />
                  <span>
                    <span className="font-mono text-xs">{ev}</span>
                    <span className="block text-muted-foreground text-xs">{EVENT_LABELS[ev]}</span>
                  </span>
                </label>
              ))}
            </div>
          </div>
          <Button onClick={() => mutation.mutate()} disabled={mutation.isPending || !form.name || !form.url} className="w-full">
            {mutation.isPending ? "Saving…" : "Save Webhook"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function WebhooksTab({ onChanged }: { onChanged: () => void }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ["automation-webhooks"],
    queryFn: () => api("/api/automation/webhooks"),
  });

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ["automation-webhooks"] });
    onChanged();
  };

  const toggleMutation = useMutation({
    mutationFn: ({ id, active }: { id: number; active: boolean }) =>
      api(`/api/automation/webhooks/${id}`, { method: "PATCH", body: JSON.stringify({ active }) }),
    onSuccess: refresh,
    onError: (e: any) => toast({ title: "Failed", description: e.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => api(`/api/automation/webhooks/${id}`, { method: "DELETE" }),
    onSuccess: () => { toast({ title: "Webhook deleted" }); refresh(); },
    onError: (e: any) => toast({ title: "Failed", description: e.message, variant: "destructive" }),
  });

  const testMutation = useMutation({
    mutationFn: (id: number) => api(`/api/automation/webhooks/${id}/test`, { method: "POST" }),
    onSuccess: (d: any) => {
      toast({
        title: d.status === "delivered" ? "Test delivered" : "Test failed",
        description: d.status === "delivered" ? `HTTP ${d.httpStatus}` : (d.responseBody || "Check the URL"),
        variant: d.status === "delivered" ? "default" : "destructive",
      });
      onChanged();
    },
    onError: (e: any) => toast({ title: "Failed", description: e.message, variant: "destructive" }),
  });

  return (
    <div className="space-y-3">
      <div className="flex justify-end"><AddWebhookDialog onDone={refresh} /></div>
      {isLoading ? <p className="text-sm text-muted-foreground">Loading…</p>
        : data?.webhooks?.length ? data.webhooks.map((w: any) => (
          <Card key={w.id}>
            <CardContent className="pt-4">
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div className="min-w-0">
                  <div className="font-medium flex items-center gap-2">
                    <Webhook className="h-4 w-4 shrink-0" />{w.name}
                    {!w.active && <Badge variant="secondary">paused</Badge>}
                  </div>
                  <div className="text-xs text-muted-foreground break-all mt-1">{w.url}</div>
                  <div className="flex gap-1 flex-wrap mt-2">
                    {(w.events || []).map((e: string) => (
                      <Badge key={e} variant="outline" className="font-mono text-[10px]">{e}</Badge>
                    ))}
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <Switch checked={w.active} onCheckedChange={(v) => toggleMutation.mutate({ id: w.id, active: v })} />
                  <Button variant="outline" size="sm" onClick={() => testMutation.mutate(w.id)} disabled={testMutation.isPending}>
                    <Play className="h-3 w-3 mr-1" />Test
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => deleteMutation.mutate(w.id)}>
                    <Trash2 className="h-4 w-4 text-muted-foreground" />
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        ))
        : <Card><CardContent className="pt-6 text-center text-sm text-muted-foreground">
          No webhooks yet. Add your n8n webhook URL to start receiving CRM events.
        </CardContent></Card>}
    </div>
  );
}

function DeliveriesTab() {
  const { data } = useQuery({
    queryKey: ["automation-deliveries"],
    queryFn: () => api("/api/automation/deliveries?limit=50"),
    refetchInterval: 15000,
  });

  const icon = (s: string) =>
    s === "delivered" ? <CheckCircle2 className="h-4 w-4 text-green-600" />
      : s === "failed" ? <XCircle className="h-4 w-4 text-red-600" />
      : <Clock className="h-4 w-4 text-yellow-600" />;

  return (
    <Card>
      <CardHeader><CardTitle className="text-base">Delivery Log</CardTitle></CardHeader>
      <CardContent>
        <div className="space-y-2 text-sm">
          {data?.deliveries?.length ? data.deliveries.map((d: any) => (
            <div key={d.id} className="flex items-center gap-3 py-2 border-b last:border-0">
              {icon(d.status)}
              <span className="font-mono text-xs">{d.event}</span>
              <span className="text-muted-foreground text-xs ml-auto">
                {d.httpStatus ? `HTTP ${d.httpStatus} · ` : ""}{d.attempts} attempt(s) ·{" "}
                {new Date(d.createdAt).toLocaleString()}
              </span>
            </div>
          )) : <p className="text-muted-foreground text-sm">No deliveries yet.</p>}
        </div>
      </CardContent>
    </Card>
  );
}

function SetupTab() {
  const { toast } = useToast();
  const compose = `services:
  n8n:
    image: n8nio/n8n:latest
    restart: unless-stopped
    ports:
      - "5678:5678"
    environment:
      - N8N_HOST=n8n.yourdomain.com
      - N8N_PROTOCOL=https
      - WEBHOOK_URL=https://n8n.yourdomain.com/
    volumes:
      - n8n_data:/home/node/.n8n
volumes:
  n8n_data:`;

  const copy = (text: string) => {
    navigator.clipboard.writeText(text);
    toast({ title: "Copied" });
  };

  const curlExample = `curl -X POST https://crm.oceanluxe.org/api/v1/signals \\
  -H "Authorization: Bearer lxrm_..." \\
  -H "Content-Type: application/json" \\
  -d '{"signalType":"code_violation","severity":"alert",
       "title":"Overgrown lot citation",
       "source":"Detroit BSEED",
       "address":"123 Main St","city":"Detroit",
       "state":"MI","zipCode":"48201"}'`;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base"><Server className="h-5 w-5" />1. Self-host n8n (free)</CardTitle>
          <CardDescription>One docker-compose file on any cheap VPS or your own server.</CardDescription>
        </CardHeader>
        <CardContent>
          <pre className="text-xs bg-muted p-3 rounded overflow-x-auto">{compose}</pre>
          <Button variant="outline" size="sm" className="mt-2" onClick={() => copy(compose)}>
            <Copy className="h-3 w-3 mr-1" />Copy
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">2. Create an API key for n8n</CardTitle>
          <CardDescription>
            Go to <span className="font-mono">Settings → API Keys</span> and create a key named "n8n".
            n8n uses it as <span className="font-mono">Authorization: Bearer lxrm_…</span> on the inbound API.
          </CardDescription>
        </CardHeader>
        <CardContent className="text-sm space-y-2">
          <div><span className="font-mono text-xs bg-muted px-1 rounded">GET /api/v1/health</span> — connectivity check</div>
          <div><span className="font-mono text-xs bg-muted px-1 rounded">POST /api/v1/signals</span> — push one signal from a scraper</div>
          <div><span className="font-mono text-xs bg-muted px-1 rounded">POST /api/v1/signals/bulk</span> — push up to 500 at once</div>
          <pre className="text-xs bg-muted p-3 rounded overflow-x-auto">{curlExample}</pre>
          <Button variant="outline" size="sm" onClick={() => copy(curlExample)}>
            <Copy className="h-3 w-3 mr-1" />Copy
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">3. Receive CRM events in n8n</CardTitle>
          <CardDescription>
            Add a webhook here (Webhooks tab), paste your n8n Webhook node URL, subscribe to events.
            The CRM signs each payload with <span className="font-mono">X-Luxe-Signature</span> (HMAC-SHA256 of the body using your secret).
          </CardDescription>
        </CardHeader>
        <CardContent className="text-sm space-y-2">
          <div className="font-medium">Suggested workflows:</div>
          <ul className="list-disc pl-5 space-y-1 text-muted-foreground">
            <li><span className="text-foreground">Hot-lead Discord alert</span> — Webhook trigger on <span className="font-mono text-xs">parcel.high_score</span> → format message → Discord node → #hot-leads channel</li>
            <li><span className="text-foreground">FOIA list ingestor</span> — Schedule trigger (weekly) → fetch city CSV → split in batches → <span className="font-mono text-xs">POST /api/v1/signals/bulk</span></li>
            <li><span className="text-foreground">New-signal digest</span> — Webhook on <span className="font-mono text-xs">signal.created</span> → aggregate hourly → email/SMS summary to acquisitions team</li>
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}

export default function N8nBridge() {
  const queryClient = useQueryClient();
  const refreshDeliveries = () => queryClient.invalidateQueries({ queryKey: ["automation-deliveries"] });

  return (
    <Layout>
      <div className="space-y-4 max-w-4xl">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">n8n Bridge</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Connect self-hosted n8n (free) — push data into the CRM and react to CRM events.
          </p>
        </div>

        <Tabs defaultValue="webhooks">
          <TabsList className="grid w-full grid-cols-3 max-w-md">
            <TabsTrigger value="webhooks">Webhooks</TabsTrigger>
            <TabsTrigger value="deliveries">Deliveries</TabsTrigger>
            <TabsTrigger value="setup">n8n Setup</TabsTrigger>
          </TabsList>
          <TabsContent value="webhooks" className="mt-4"><WebhooksTab onChanged={refreshDeliveries} /></TabsContent>
          <TabsContent value="deliveries" className="mt-4"><DeliveriesTab /></TabsContent>
          <TabsContent value="setup" className="mt-4"><SetupTab /></TabsContent>
        </Tabs>
      </div>
    </Layout>
  );
}
