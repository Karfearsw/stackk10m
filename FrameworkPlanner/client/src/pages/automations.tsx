import { Layout } from "@/components/layout/Layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { useAuth } from "@/contexts/AuthContext";
import { apiRequest } from "@/lib/queryClient";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, RefreshCw, Zap } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

type Automation = {
  id: number;
  teamId: number;
  name: string;
  description: string | null;
  enabled: boolean | null;
  createdAt: string | null;
  updatedAt: string | null;
};

export default function AutomationsPage() {
  const { user } = useAuth();
  const qc = useQueryClient();

  const listKey = "/api/automations?limit=200&offset=0";
  const { data, isLoading, isFetching, refetch } = useQuery<Automation[]>({ queryKey: [listKey], enabled: !!user });

  const [open, setOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<number | null>(null);

  const [form, setForm] = useState({
    name: "",
    description: "",
    enabled: true,
    triggersJson: JSON.stringify([{ eventType: "lead.created", config: {} }], null, 2),
    conditionJson: JSON.stringify({ op: "and", rules: [] }, null, 2),
    actionsJson: JSON.stringify(
      [
        { actionType: "task.create", sortOrder: 0, config: { title: "New lead follow-up", dueInMinutes: 60, assignTo: "actor" } },
        { actionType: "notification.create", sortOrder: 1, config: { title: "New lead created", description: "A new lead was created", toUserId: "actor" } },
        { actionType: "webhook.post", sortOrder: 2, config: { url: "https://example.com/webhook", secret: "replace-me", timeoutMs: 5000, retries: 2 } },
      ],
      null,
      2,
    ),
  });

  const detailKey = useMemo(() => (selectedId ? `/api/automations/${selectedId}` : null), [selectedId]);
  const { data: detail } = useQuery<any>({
    queryKey: detailKey ? [detailKey] : [""],
    enabled: !!user && !!detailKey,
  });

  const runsKey = useMemo(() => (selectedId ? `/api/automations/${selectedId}/runs?limit=50&offset=0` : null), [selectedId]);
  const { data: runs } = useQuery<any[]>({
    queryKey: runsKey ? [runsKey] : [""],
    enabled: !!user && !!runsKey,
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      const triggers = JSON.parse(form.triggersJson);
      const condition = JSON.parse(form.conditionJson);
      const actions = JSON.parse(form.actionsJson);
      const payload = {
        name: form.name.trim(),
        description: form.description.trim() || null,
        enabled: form.enabled,
        triggers,
        condition,
        actions,
      };
      const res = await apiRequest("POST", "/api/automations", payload);
      return await res.json();
    },
    onSuccess: async () => {
      toast.success("Automation created");
      setOpen(false);
      await qc.invalidateQueries({ queryKey: [listKey] });
    },
    onError: (e: any) => toast.error(String(e?.message || e)),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await apiRequest("DELETE", `/api/automations/${id}`);
      return await res.json();
    },
    onSuccess: async () => {
      toast.success("Automation deleted");
      setSelectedId(null);
      await qc.invalidateQueries({ queryKey: [listKey] });
    },
    onError: (e: any) => toast.error(String(e?.message || e)),
  });

  const items = data || [];

  return (
    <Layout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Zap className="h-6 w-6" />
            <h1 className="text-2xl font-semibold">Automations</h1>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={() => refetch()} disabled={isFetching}>
              <RefreshCw className={isFetching ? "h-4 w-4 animate-spin" : "h-4 w-4"} />
            </Button>
            <Dialog open={open} onOpenChange={setOpen}>
              <DialogTrigger asChild>
                <Button>
                  <Plus className="h-4 w-4" />
                  Add
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-3xl">
                <DialogHeader>
                  <DialogTitle>Create automation</DialogTitle>
                </DialogHeader>
                <div className="space-y-4">
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label>Name</Label>
                      <Input value={form.name} onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))} />
                    </div>
                    <div className="flex items-center gap-3 pt-7">
                      <Switch checked={form.enabled} onCheckedChange={(v) => setForm((p) => ({ ...p, enabled: v }))} />
                      <div className="text-sm">Enabled</div>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label>Description</Label>
                    <Input value={form.description} onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))} />
                  </div>
                  <div className="space-y-2">
                    <Label>Triggers (JSON)</Label>
                    <Textarea value={form.triggersJson} onChange={(e) => setForm((p) => ({ ...p, triggersJson: e.target.value }))} className="min-h-32 font-mono text-xs" />
                  </div>
                  <div className="space-y-2">
                    <Label>Condition (JSON)</Label>
                    <Textarea value={form.conditionJson} onChange={(e) => setForm((p) => ({ ...p, conditionJson: e.target.value }))} className="min-h-32 font-mono text-xs" />
                  </div>
                  <div className="space-y-2">
                    <Label>Actions (JSON)</Label>
                    <Textarea value={form.actionsJson} onChange={(e) => setForm((p) => ({ ...p, actionsJson: e.target.value }))} className="min-h-32 font-mono text-xs" />
                  </div>
                </div>
                <DialogFooter>
                  <Button
                    onClick={() => {
                      if (!form.name.trim()) return toast.error("Name is required");
                      createMutation.mutate();
                    }}
                    disabled={createMutation.isPending}
                  >
                    Create
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        </div>

        <div className="text-sm text-muted-foreground">{isLoading ? "Loading…" : `${items.length}`}</div>

        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Enabled</TableHead>
              <TableHead>Description</TableHead>
              <TableHead className="w-28" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((a) => (
              <TableRow key={a.id}>
                <TableCell className="font-medium">{a.name}</TableCell>
                <TableCell>{a.enabled ? "Yes" : "No"}</TableCell>
                <TableCell>{a.description || "—"}</TableCell>
                <TableCell className="flex justify-end gap-2">
                  <Button variant="outline" onClick={() => setSelectedId(a.id)}>
                    View
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => {
                      if (confirm("Delete this automation?")) deleteMutation.mutate(a.id);
                    }}
                    disabled={deleteMutation.isPending}
                  >
                    Delete
                  </Button>
                </TableCell>
              </TableRow>
            ))}
            {!items.length && !isLoading && (
              <TableRow>
                <TableCell colSpan={4} className="text-center text-muted-foreground">
                  No automations found
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>

        <Dialog open={selectedId !== null} onOpenChange={(v) => !v && setSelectedId(null)}>
          <DialogContent className="sm:max-w-3xl">
            <DialogHeader>
              <DialogTitle>Automation</DialogTitle>
            </DialogHeader>
            {!detail ? (
              <div className="text-sm text-muted-foreground">Loading…</div>
            ) : (
              <div className="space-y-4">
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div className="space-y-1">
                    <div className="text-xs text-muted-foreground">Name</div>
                    <div className="text-sm">{detail.automation?.name || "—"}</div>
                  </div>
                  <div className="space-y-1">
                    <div className="text-xs text-muted-foreground">Enabled</div>
                    <div className="text-sm">{detail.automation?.enabled ? "Yes" : "No"}</div>
                  </div>
                </div>
                <div className="space-y-2">
                  <div className="text-sm font-medium">Triggers</div>
                  <pre className="rounded-md bg-muted p-3 text-xs overflow-auto">{JSON.stringify(detail.triggers || [], null, 2)}</pre>
                </div>
                <div className="space-y-2">
                  <div className="text-sm font-medium">Condition</div>
                  <pre className="rounded-md bg-muted p-3 text-xs overflow-auto">{JSON.stringify(detail.condition || {}, null, 2)}</pre>
                </div>
                <div className="space-y-2">
                  <div className="text-sm font-medium">Actions</div>
                  <pre className="rounded-md bg-muted p-3 text-xs overflow-auto">{JSON.stringify(detail.actions || [], null, 2)}</pre>
                </div>
                <div className="space-y-2">
                  <div className="text-sm font-medium">Recent runs</div>
                  <pre className="rounded-md bg-muted p-3 text-xs overflow-auto">{JSON.stringify(runs || [], null, 2)}</pre>
                </div>
              </div>
            )}
            <DialogFooter>
              <Button
                variant="outline"
                onClick={async () => {
                  if (!selectedId) return;
                  await qc.invalidateQueries({ queryKey: [detailKey || ""] });
                  await qc.invalidateQueries({ queryKey: [runsKey || ""] });
                }}
              >
                Refresh
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </Layout>
  );
}

