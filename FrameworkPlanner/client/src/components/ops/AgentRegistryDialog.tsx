import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { fetchJson } from "@/lib/fetchJson";
import { useToast } from "@/hooks/use-toast";
import type { TeamOption } from "./types";

type CreateAgentResponse = {
  heartbeatSecret: string;
};

const initialForm = {
  teamId: "",
  slug: "",
  displayName: "",
  hostname: "",
  provider: "VPS",
  region: "",
  environment: "production",
  agentType: "hermes",
  model: "tinyllama",
  expectedHeartbeatIntervalSeconds: "60",
};

export function AgentRegistryDialog({
  teams,
  onCreated,
}: {
  teams: TeamOption[];
  onCreated: () => Promise<void> | void;
}) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState(initialForm);
  const [heartbeatSecret, setHeartbeatSecret] = useState<string | null>(null);
  const { toast } = useToast();

  const teamOptions = useMemo(
    () => teams.slice().sort((a, b) => a.name.localeCompare(b.name)),
    [teams],
  );

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    try {
      const result = await fetchJson<CreateAgentResponse>("/api/ops/agents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          teamId: Number(form.teamId),
          expectedHeartbeatIntervalSeconds: Number(form.expectedHeartbeatIntervalSeconds),
        }),
      });
      setHeartbeatSecret(result.heartbeatSecret);
      await onCreated();
      toast({ title: "Agent registered" });
    } catch (error: any) {
      toast({ title: "Registration failed", description: String(error?.message || error), variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }

  async function copySecret() {
    if (!heartbeatSecret) return;
    try {
      await navigator.clipboard.writeText(heartbeatSecret);
      toast({ title: "Heartbeat secret copied" });
    } catch (error: any) {
      toast({ title: "Copy failed", description: String(error?.message || error), variant: "destructive" });
    }
  }

  function closeAndReset(nextOpen: boolean) {
    setOpen(nextOpen);
    if (!nextOpen) {
      setForm(initialForm);
      setHeartbeatSecret(null);
      setLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={closeAndReset}>
      <DialogTrigger asChild>
        <Button>Add VPS Agent</Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Register VPS Agent</DialogTitle>
        </DialogHeader>

        {heartbeatSecret ? (
          <div className="space-y-4">
            <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/10 p-4 text-sm">
              Save this heartbeat secret now. It will not be shown again.
            </div>
            <div className="rounded-lg border bg-muted/40 p-4 font-mono text-sm break-all">{heartbeatSecret}</div>
            <DialogFooter>
              <Button variant="outline" onClick={copySecret}>Copy Secret</Button>
              <Button onClick={() => closeAndReset(false)}>Done</Button>
            </DialogFooter>
          </div>
        ) : (
          <form className="space-y-4" onSubmit={handleSubmit}>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="ops-team">Team</Label>
                <select
                  id="ops-team"
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  value={form.teamId}
                  onChange={(e) => setForm((current) => ({ ...current, teamId: e.target.value }))}
                  required
                >
                  <option value="">Select team</option>
                  {teamOptions.map((team) => (
                    <option key={team.id} value={team.id}>
                      {team.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="ops-slug">Slug</Label>
                <Input
                  id="ops-slug"
                  value={form.slug}
                  onChange={(e) => setForm((current) => ({ ...current, slug: e.target.value.toLowerCase().replace(/\s+/g, "-") }))}
                  placeholder="hermes-orlando-01"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="ops-name">Display Name</Label>
                <Input
                  id="ops-name"
                  value={form.displayName}
                  onChange={(e) => setForm((current) => ({ ...current, displayName: e.target.value }))}
                  placeholder="Hermes Orlando"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="ops-hostname">Hostname</Label>
                <Input
                  id="ops-hostname"
                  value={form.hostname}
                  onChange={(e) => setForm((current) => ({ ...current, hostname: e.target.value }))}
                  placeholder="vps-01"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="ops-provider">Provider</Label>
                <Input
                  id="ops-provider"
                  value={form.provider}
                  onChange={(e) => setForm((current) => ({ ...current, provider: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="ops-region">Region</Label>
                <Input
                  id="ops-region"
                  value={form.region}
                  onChange={(e) => setForm((current) => ({ ...current, region: e.target.value }))}
                  placeholder="Orlando"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="ops-model">Model</Label>
                <Input
                  id="ops-model"
                  value={form.model}
                  onChange={(e) => setForm((current) => ({ ...current, model: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="ops-interval">Heartbeat Seconds</Label>
                <Input
                  id="ops-interval"
                  type="number"
                  min={30}
                  max={600}
                  value={form.expectedHeartbeatIntervalSeconds}
                  onChange={(e) => setForm((current) => ({ ...current, expectedHeartbeatIntervalSeconds: e.target.value }))}
                />
              </div>
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => closeAndReset(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={loading}>
                {loading ? "Registering..." : "Register Agent"}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
