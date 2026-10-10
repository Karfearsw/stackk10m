import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Layout } from "@/components/layout/Layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import {
  AlertTriangle,
  FileUp,
  MapPin,
  Plus,
  Search,
  Trash2,
  History,
  Flame,
  Droplets,
  Home,
  Gavel,
  FileText,
  Building,
  Scale,
  ScrollText,
} from "lucide-react";

const SIGNAL_TYPE_META: Record<string, { label: string; icon: any }> = {
  code_violation: { label: "Code Violation", icon: AlertTriangle },
  tax_delinquent: { label: "Tax Delinquent", icon: FileText },
  vacancy: { label: "Vacancy", icon: Home },
  court_filing: { label: "Court Filing", icon: Gavel },
  permit: { label: "Permit", icon: Building },
  water_shutoff: { label: "Water Shutoff", icon: Droplets },
  fire_damage: { label: "Fire Damage", icon: Flame },
  eviction: { label: "Eviction", icon: Scale },
  probate: { label: "Probate", icon: ScrollText },
  lien: { label: "Lien", icon: FileText },
};

const SEVERITY_COLORS: Record<string, string> = {
  info: "bg-blue-500/15 text-blue-600 border-blue-500/30",
  watch: "bg-yellow-500/15 text-yellow-600 border-yellow-500/30",
  alert: "bg-orange-500/15 text-orange-600 border-orange-500/30",
  critical: "bg-red-500/15 text-red-600 border-red-500/30",
};

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

function SignalCard({ signal, onDelete }: { signal: any; onDelete: (id: number) => void }) {
  const meta = SIGNAL_TYPE_META[signal.signalType] || { label: signal.signalType, icon: FileText };
  const Icon = meta.icon;
  return (
    <Card>
      <CardContent className="pt-4">
        <div className="flex items-start gap-3">
          <div className="p-2 rounded-lg bg-muted shrink-0">
            <Icon className="h-4 w-4" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <Badge variant="outline" className={SEVERITY_COLORS[signal.severity] || ""}>
                {signal.severity}
              </Badge>
              <Badge variant="secondary">{meta.label}</Badge>
              {signal.occurredAt && (
                <span className="text-xs text-muted-foreground">
                  {new Date(signal.occurredAt).toLocaleDateString()}
                </span>
              )}
            </div>
            <div className="font-medium mt-1">{signal.title}</div>
            {signal.description && (
              <p className="text-sm text-muted-foreground mt-1 break-words">{signal.description}</p>
            )}
            <div className="text-xs text-muted-foreground mt-2 flex items-center gap-1 flex-wrap">
              <MapPin className="h-3 w-3 shrink-0" />
              <span className="break-all">{signal.parcelKey.replace(/\|/g, ", ")}</span>
              <span className="mx-1">·</span>
              <span>via {signal.source}</span>
            </div>
          </div>
          <Button variant="ghost" size="sm" onClick={() => onDelete(signal.id)} title="Delete signal">
            <Trash2 className="h-4 w-4 text-muted-foreground" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function AddSignalDialog({ onDone }: { onDone: () => void }) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    signalType: "code_violation", severity: "watch", title: "", description: "",
    source: "", sourceUrl: "", occurredAt: "", address: "", city: "", state: "", zipCode: "",
  });

  const mutation = useMutation({
    mutationFn: () => api("/api/distress-signals", { method: "POST", body: JSON.stringify(form) }),
    onSuccess: () => {
      toast({ title: "Signal added" });
      setOpen(false);
      setForm({ signalType: "code_violation", severity: "watch", title: "", description: "", source: "", sourceUrl: "", occurredAt: "", address: "", city: "", state: "", zipCode: "" });
      onDone();
    },
    onError: (e: any) => toast({ title: "Failed", description: e.message, variant: "destructive" }),
  });

  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button><Plus className="h-4 w-4 mr-2" />Add Signal</Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>Log Distress Signal</DialogTitle></DialogHeader>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>Signal type</Label>
            <Select value={form.signalType} onValueChange={(v) => set("signalType", v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {Object.entries(SIGNAL_TYPE_META).map(([k, m]) => (
                  <SelectItem key={k} value={k}>{m.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Severity</Label>
            <Select value={form.severity} onValueChange={(v) => set("severity", v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="info">Info</SelectItem>
                <SelectItem value="watch">Watch</SelectItem>
                <SelectItem value="alert">Alert</SelectItem>
                <SelectItem value="critical">Critical</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2 sm:col-span-2">
            <Label>Title *</Label>
            <Input value={form.title} onChange={(e) => set("title", e.target.value)} placeholder="e.g. Overgrown lot citation #2024-1182" />
          </div>
          <div className="space-y-2 sm:col-span-2">
            <Label>Description</Label>
            <Textarea value={form.description} onChange={(e) => set("description", e.target.value)} rows={2} />
          </div>
          <div className="space-y-2">
            <Label>Source *</Label>
            <Input value={form.source} onChange={(e) => set("source", e.target.value)} placeholder="e.g. Detroit BSEED" />
          </div>
          <div className="space-y-2">
            <Label>Date occurred</Label>
            <Input type="date" value={form.occurredAt} onChange={(e) => set("occurredAt", e.target.value)} />
          </div>
          <div className="space-y-2 sm:col-span-2">
            <Label>Source URL</Label>
            <Input value={form.sourceUrl} onChange={(e) => set("sourceUrl", e.target.value)} placeholder="https://…" />
          </div>
          <div className="space-y-2 sm:col-span-2">
            <Label>Address *</Label>
            <Input value={form.address} onChange={(e) => set("address", e.target.value)} placeholder="123 Main St" />
          </div>
          <div className="space-y-2"><Label>City *</Label><Input value={form.city} onChange={(e) => set("city", e.target.value)} /></div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2"><Label>State *</Label><Input value={form.state} onChange={(e) => set("state", e.target.value)} maxLength={2} placeholder="MI" /></div>
            <div className="space-y-2"><Label>ZIP *</Label><Input value={form.zipCode} onChange={(e) => set("zipCode", e.target.value)} placeholder="48201" /></div>
          </div>
        </div>
        <Button onClick={() => mutation.mutate()} disabled={mutation.isPending || !form.title || !form.source || !form.address} className="w-full mt-4">
          {mutation.isPending ? "Saving…" : "Save Signal"}
        </Button>
      </DialogContent>
    </Dialog>
  );
}

function ImportTab({ onDone }: { onDone: () => void }) {
  const { toast } = useToast();
  const [result, setResult] = useState<any>(null);
  const [importing, setImporting] = useState(false);

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImporting(true);
    setResult(null);
    try {
      const text = await file.text();
      const lines = text.split(/\r?\n/).filter((l) => l.trim());
      if (lines.length < 2) throw new Error("CSV needs a header row and at least one data row");
      const headers = lines[0].split(",").map((h) => h.trim().toLowerCase().replace(/["']/g, ""));
      const idx = (name: string) => headers.findIndex((h) => h === name || h.replace(/_/g, "") === name.replace(/_/g, ""));
      const rows = lines.slice(1).map((line) => {
        // Simple CSV parse (handles quoted commas)
        const cells: string[] = [];
        let cur = "", inQ = false;
        for (const ch of line) {
          if (ch === '"') inQ = !inQ;
          else if (ch === "," && !inQ) { cells.push(cur.trim()); cur = ""; }
          else cur += ch;
        }
        cells.push(cur.trim());
        const g = (n: string) => { const i = idx(n); return i >= 0 ? cells[i]?.replace(/^"|"$/g, "") : ""; };
        return {
          signalType: g("signaltype") || g("type"),
          severity: g("severity") || "info",
          title: g("title"),
          description: g("description"),
          source: g("source"),
          sourceUrl: g("sourceurl"),
          occurredAt: g("occurredat") || g("date"),
          address: g("address"),
          city: g("city"),
          state: g("state"),
          zipCode: g("zipcode") || g("zip"),
          apn: g("apn"),
          ownerName: g("ownername"),
        };
      });
      const j = await api("/api/distress-signals/import", { method: "POST", body: JSON.stringify({ rows }) });
      setResult(j);
      toast({ title: `Imported ${j.created} signals`, description: j.skipped ? `${j.skipped} skipped` : undefined });
      onDone();
    } catch (err: any) {
      toast({ title: "Import failed", description: err.message, variant: "destructive" });
    } finally {
      setImporting(false);
    }
  };

  return (
    <Card>
      <CardHeader><CardTitle>Bulk CSV Import</CardTitle></CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Upload a CSV from code enforcement, tax office, or court records. Expected columns:{" "}
          <code className="text-xs bg-muted px-1 rounded">signalType, severity, title, description, source, sourceUrl, occurredAt, address, city, state, zipCode, apn, ownerName</code>
        </p>
        <div className="text-xs text-muted-foreground">
          signalType must be one of: {Object.keys(SIGNAL_TYPE_META).join(", ")}
        </div>
        <label className="flex items-center justify-center gap-2 border-2 border-dashed rounded-lg p-8 cursor-pointer hover:bg-muted/50">
          <FileUp className="h-5 w-5" />
          <span>{importing ? "Importing…" : "Choose CSV file"}</span>
          <Input type="file" accept=".csv" className="hidden" onChange={handleFile} disabled={importing} />
        </label>
        {result && (
          <div className="text-sm space-y-1">
            <div>Created: <strong>{result.created}</strong> · Skipped: <strong>{result.skipped}</strong></div>
            {result.errors?.length > 0 && (
              <div className="text-destructive text-xs max-h-32 overflow-y-auto">
                {result.errors.map((e: any, i: number) => <div key={i}>Row {e.row}: {e.error}</div>)}
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function TimelineTab() {
  const { toast } = useToast();
  const [q, setQ] = useState({ address: "", city: "", state: "", zipCode: "" });
  const [timeline, setTimeline] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  const load = async () => {
    if (!q.address || !q.city || !q.state || !q.zipCode) {
      toast({ title: "Enter full address", variant: "destructive" });
      return;
    }
    setLoading(true);
    try {
      const params = new URLSearchParams(q);
      const j = await api(`/api/parcels/timeline?${params}`);
      setTimeline(j);
    } catch (e: any) {
      toast({ title: "Failed", description: e.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2"><History className="h-5 w-5" />Parcel Timeline</CardTitle></CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
            <Input placeholder="Address" value={q.address} onChange={(e) => setQ({ ...q, address: e.target.value })} />
            <Input placeholder="City" value={q.city} onChange={(e) => setQ({ ...q, city: e.target.value })} />
            <div className="grid grid-cols-2 gap-3">
              <Input placeholder="ST" maxLength={2} value={q.state} onChange={(e) => setQ({ ...q, state: e.target.value })} />
              <Input placeholder="ZIP" value={q.zipCode} onChange={(e) => setQ({ ...q, zipCode: e.target.value })} />
            </div>
            <Button onClick={load} disabled={loading} className="lg:col-span-1 sm:col-span-2">
              <Search className="h-4 w-4 mr-2" />{loading ? "Loading…" : "View Timeline"}
            </Button>
          </div>
        </CardContent>
      </Card>

      {timeline && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between flex-wrap gap-2">
              <CardTitle>{timeline.parcel?.address || "Parcel"}</CardTitle>
              <div className="flex gap-2">
                <Badge variant="outline">Distress score: {timeline.score}</Badge>
                <Badge variant="secondary">{timeline.signalCount} signals</Badge>
              </div>
            </div>
            {timeline.parcel?.ownerName && <p className="text-sm text-muted-foreground">Owner: {timeline.parcel.ownerName}</p>}
          </CardHeader>
          <CardContent>
            {timeline.signals.length === 0 ? (
              <p className="text-muted-foreground text-sm">No signals recorded for this parcel yet.</p>
            ) : (
              <div className="relative pl-6 space-y-4 before:absolute before:left-2 before:top-2 before:bottom-2 before:w-px before:bg-border">
                {timeline.signals.map((s: any) => {
                  const meta = SIGNAL_TYPE_META[s.signalType] || { label: s.signalType, icon: FileText };
                  const Icon = meta.icon;
                  return (
                    <div key={s.id} className="relative">
                      <div className="absolute -left-6 top-1 p-1 rounded-full bg-background border">
                        <Icon className="h-3 w-3" />
                      </div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <Badge variant="outline" className={SEVERITY_COLORS[s.severity] || ""}>{s.severity}</Badge>
                        <Badge variant="secondary">{meta.label}</Badge>
                        {s.occurredAt && <span className="text-xs text-muted-foreground">{new Date(s.occurredAt).toLocaleDateString()}</span>}
                      </div>
                      <div className="font-medium mt-1">{s.title}</div>
                      {s.description && <p className="text-sm text-muted-foreground break-words">{s.description}</p>}
                      <div className="text-xs text-muted-foreground mt-1">via {s.source}</div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

export default function Signals() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [tab, setTab] = useState("signals");
  const [filters, setFilters] = useState({ type: "", severity: "", search: "" });

  const { data, isLoading } = useQuery({
    queryKey: ["distress-signals", filters],
    queryFn: () => {
      const p = new URLSearchParams();
      if (filters.type) p.set("type", filters.type);
      if (filters.severity) p.set("severity", filters.severity);
      if (filters.search) p.set("search", filters.search);
      return api(`/api/distress-signals?${p}`);
    },
  });

  const { data: watchlist } = useQuery({
    queryKey: ["parcel-watchlist"],
    queryFn: () => api("/api/parcel-watchlist"),
  });

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ["distress-signals"] });
    queryClient.invalidateQueries({ queryKey: ["parcel-watchlist"] });
  };

  const deleteMutation = useMutation({
    mutationFn: (id: number) => api(`/api/distress-signals/${id}`, { method: "DELETE" }),
    onSuccess: () => { toast({ title: "Signal deleted" }); refresh(); },
    onError: (e: any) => toast({ title: "Failed", description: e.message, variant: "destructive" }),
  });

  return (
    <Layout>
      <div className="space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Distress Signals</h1>
            <p className="text-muted-foreground text-sm mt-1">
              Municipal data — code violations, tax delinquency, vacancy, court &amp; permit signals stacked on parcels.
            </p>
          </div>
          <AddSignalDialog onDone={refresh} />
        </div>

        <Tabs value={tab} onValueChange={setTab}>
          <TabsList className="grid w-full grid-cols-4 max-w-lg">
            <TabsTrigger value="signals">Signals</TabsTrigger>
            <TabsTrigger value="watchlist">Watchlist</TabsTrigger>
            <TabsTrigger value="timeline">Timeline</TabsTrigger>
            <TabsTrigger value="import">Import</TabsTrigger>
          </TabsList>

          <TabsContent value="signals" className="space-y-4 mt-4">
            <Card>
              <CardContent className="pt-4">
                <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                  <div className="relative sm:col-span-2">
                    <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input placeholder="Search signals…" className="pl-9" value={filters.search}
                      onChange={(e) => setFilters({ ...filters, search: e.target.value })} />
                  </div>
                  <Select value={filters.type || "all"} onValueChange={(v) => setFilters({ ...filters, type: v === "all" ? "" : v })}>
                    <SelectTrigger><SelectValue placeholder="All types" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All types</SelectItem>
                      {Object.entries(SIGNAL_TYPE_META).map(([k, m]) => (
                        <SelectItem key={k} value={k}>{m.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Select value={filters.severity || "all"} onValueChange={(v) => setFilters({ ...filters, severity: v === "all" ? "" : v })}>
                    <SelectTrigger><SelectValue placeholder="All severities" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All severities</SelectItem>
                      <SelectItem value="info">Info</SelectItem>
                      <SelectItem value="watch">Watch</SelectItem>
                      <SelectItem value="alert">Alert</SelectItem>
                      <SelectItem value="critical">Critical</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </CardContent>
            </Card>

            {isLoading ? (
              <p className="text-muted-foreground text-sm">Loading…</p>
            ) : data?.signals?.length ? (
              <div className="grid gap-3">
                {data.signals.map((s: any) => (
                  <SignalCard key={s.id} signal={s} onDelete={(id) => deleteMutation.mutate(id)} />
                ))}
              </div>
            ) : (
              <Card><CardContent className="pt-6 text-center text-muted-foreground text-sm">
                No signals yet. Add one manually or import a CSV.
              </CardContent></Card>
            )}
          </TabsContent>

          <TabsContent value="watchlist" className="mt-4">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {watchlist?.parcels?.map((p: any) => (
                <Card key={p.id}>
                  <CardContent className="pt-4">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="font-medium break-words">{p.address}</div>
                        <div className="text-sm text-muted-foreground">{p.city}, {p.state} {p.zipCode}</div>
                        {p.ownerName && <div className="text-xs text-muted-foreground mt-1">Owner: {p.ownerName}</div>}
                      </div>
                      <Badge variant="secondary" className="shrink-0">{p.signalCount} signals</Badge>
                    </div>
                  </CardContent>
                </Card>
              )) || <p className="text-muted-foreground text-sm">No parcels tracked yet.</p>}
            </div>
          </TabsContent>

          <TabsContent value="timeline" className="mt-4">
            <TimelineTab />
          </TabsContent>

          <TabsContent value="import" className="mt-4">
            <ImportTab onDone={refresh} />
          </TabsContent>
        </Tabs>
      </div>
    </Layout>
  );
}
