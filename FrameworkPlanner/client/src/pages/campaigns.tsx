import { Layout } from "@/components/layout/Layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { EntityTasksWidget } from "@/components/tasks/EntityTasksWidget";
import { useToast } from "@/hooks/use-toast";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";

type StepDraft = {
  stepOrder: number;
  channel: "sms" | "email";
  offsetDays: number;
  sendWindowStart: string;
  sendWindowEnd: string;
  templateText: string;
};

export default function Campaigns() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data: campaigns = [] } = useQuery<any[]>({
    queryKey: ["/api/campaigns"],
    queryFn: async () => {
      const res = await fetch("/api/campaigns", { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
  });

  const [newName, setNewName] = useState("");
  const [activeCampaignId, setActiveCampaignId] = useState<number | null>(null);

  const activeCampaign = useMemo(() => campaigns.find((c: any) => c.id === activeCampaignId) || null, [campaigns, activeCampaignId]);

  useEffect(() => {
    if (activeCampaignId) return;
    try {
      const params = new URLSearchParams(window.location.search);
      const raw = params.get("campaignId") || params.get("highlight") || "";
      const id = parseInt(String(raw || ""), 10);
      if (Number.isFinite(id)) setActiveCampaignId(id);
    } catch {}
  }, [activeCampaignId]);

  const { data: steps = [] } = useQuery<any[]>({
    queryKey: ["/api/campaigns", activeCampaignId, "steps"],
    enabled: !!activeCampaignId,
    queryFn: async () => {
      const res = await fetch(`/api/campaigns/${activeCampaignId}/steps`, { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
  });

  const { data: stats } = useQuery<any>({
    queryKey: ["/api/campaigns", activeCampaignId, "stats"],
    enabled: !!activeCampaignId,
    queryFn: async () => {
      const res = await fetch(`/api/campaigns/${activeCampaignId}/stats`, { credentials: "include" });
      if (!res.ok) return null;
      return res.json();
    },
  });

  const [draftSteps, setDraftSteps] = useState<StepDraft[]>([]);

  useEffect(() => {
    if (!activeCampaignId) return;
    const normalized: StepDraft[] = (steps || []).map((s: any) => ({
      stepOrder: Number(s.stepOrder ?? s.step_order ?? 0),
      channel: (String(s.channel || "sms") === "email" ? "email" : "sms") as "sms" | "email",
      offsetDays: Number(s.offsetDays ?? s.offset_days ?? 0),
      sendWindowStart: String(s.sendWindowStart ?? s.send_window_start ?? ""),
      sendWindowEnd: String(s.sendWindowEnd ?? s.send_window_end ?? ""),
      templateText: String(s.templateText ?? s.template_text ?? ""),
    }));
    setDraftSteps(normalized);
  }, [activeCampaignId, steps]);

  const createCampaignMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/campaigns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ name: newName }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error((data as any).message || "Failed to create campaign");
      return data;
    },
    onSuccess: async (data: any) => {
      setNewName("");
      await queryClient.invalidateQueries({ queryKey: ["/api/campaigns"] });
      setActiveCampaignId(data?.id ?? null);
      toast({ title: "Campaign created" });
    },
    onError: (e: any) => toast({ title: e?.message || "Failed to create campaign", variant: "destructive" }),
  });

  const saveStepsMutation = useMutation({
    mutationFn: async () => {
      if (!activeCampaignId) return;
      const res = await fetch(`/api/campaigns/${activeCampaignId}/steps`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          steps: draftSteps.map((s) => ({
            stepOrder: s.stepOrder,
            channel: s.channel,
            offsetDays: s.offsetDays,
            sendWindowStart: s.sendWindowStart || null,
            sendWindowEnd: s.sendWindowEnd || null,
            templateText: s.templateText,
          })),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error((data as any).message || "Failed to save steps");
      return data;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["/api/campaigns", activeCampaignId, "steps"] });
      toast({ title: "Steps saved" });
    },
    onError: (e: any) => toast({ title: e?.message || "Failed to save steps", variant: "destructive" }),
  });

  const deleteCampaignMutation = useMutation({
    mutationFn: async () => {
      if (!activeCampaignId) return;
      const res = await fetch(`/api/campaigns/${activeCampaignId}`, { method: "DELETE", credentials: "include" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error((data as any).message || "Failed to delete campaign");
      return data;
    },
    onSuccess: async () => {
      setActiveCampaignId(null);
      setDraftSteps([]);
      await queryClient.invalidateQueries({ queryKey: ["/api/campaigns"] });
      toast({ title: "Campaign deleted" });
    },
    onError: (e: any) => toast({ title: e?.message || "Failed to delete campaign", variant: "destructive" }),
  });

  const [enrollLeadId, setEnrollLeadId] = useState("");
  const enrollMutation = useMutation({
    mutationFn: async () => {
      if (!activeCampaignId) return;
      const leadId = parseInt(enrollLeadId, 10);
      if (!Number.isFinite(leadId)) throw new Error("Enter a valid Lead ID");
      const res = await fetch(`/api/campaigns/${activeCampaignId}/enroll`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ leadIds: [leadId] }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error((data as any).message || "Enroll failed");
      return data;
    },
    onSuccess: () => {
      setEnrollLeadId("");
      toast({ title: "Lead enrolled" });
    },
    onError: (e: any) => toast({ title: e?.message || "Enroll failed", variant: "destructive" }),
  });

  const addStep = () => {
    const maxOrder = draftSteps.reduce((m, s) => Math.max(m, s.stepOrder), -1);
    setDraftSteps([
      ...draftSteps,
      { stepOrder: maxOrder + 1, channel: "sms", offsetDays: 0, sendWindowStart: "09:00", sendWindowEnd: "19:00", templateText: "" },
    ]);
  };

  return (
    <Layout>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Campaigns</h1>
          <p className="text-muted-foreground">Build drip sequences and enroll leads.</p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Create Campaign</CardTitle>
          </CardHeader>
          <CardContent className="flex gap-2">
            <Input placeholder="Campaign name" value={newName} onChange={(e) => setNewName(e.target.value)} />
            <Button onClick={() => createCampaignMutation.mutate()} disabled={!newName.trim() || createCampaignMutation.isPending}>
              Create
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Manage</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-2">
              <Label>Campaign</Label>
              <Select value={activeCampaignId ? String(activeCampaignId) : ""} onValueChange={(v) => setActiveCampaignId(parseInt(v, 10))}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a campaign" />
                </SelectTrigger>
                <SelectContent>
                  {campaigns.map((c: any) => (
                    <SelectItem key={String(c.id)} value={String(c.id)}>
                      {String(c.name || `Campaign ${c.id}`)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {activeCampaign && (
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div className="border rounded-md p-3">
                  <div className="text-xs text-muted-foreground">Sends</div>
                  <div className="text-xl font-semibold">{Number(stats?.sends || 0)}</div>
                </div>
                <div className="border rounded-md p-3">
                  <div className="text-xs text-muted-foreground">Failed</div>
                  <div className="text-xl font-semibold">{Number(stats?.failed || 0)}</div>
                </div>
              </div>
            )}

            {activeCampaign && (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="font-medium">Steps</div>
                  <div className="flex gap-2">
                    <Button variant="secondary" onClick={addStep}>Add Step</Button>
                    <Button onClick={() => saveStepsMutation.mutate()} disabled={saveStepsMutation.isPending}>Save Steps</Button>
                  </div>
                </div>
                <div className="space-y-3">
                  {draftSteps.map((s, idx) => (
                    <div key={`${s.stepOrder}-${idx}`} className="border rounded-md p-3 space-y-2">
                      <div className="grid grid-cols-5 gap-2">
                        <div>
                          <Label>Order</Label>
                          <Input
                            value={String(s.stepOrder)}
                            onChange={(e) => {
                              const v = parseInt(e.target.value, 10);
                              setDraftSteps((prev) => prev.map((p, i) => (i === idx ? { ...p, stepOrder: Number.isFinite(v) ? v : 0 } : p)));
                            }}
                          />
                        </div>
                        <div>
                          <Label>Channel</Label>
                          <Select
                            value={s.channel}
                            onValueChange={(v) => setDraftSteps((prev) => prev.map((p, i) => (i === idx ? { ...p, channel: v as any } : p)))}
                          >
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="sms">SMS</SelectItem>
                              <SelectItem value="email">Email</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <div>
                          <Label>Offset Days</Label>
                          <Input
                            value={String(s.offsetDays)}
                            onChange={(e) => {
                              const v = parseInt(e.target.value, 10);
                              setDraftSteps((prev) => prev.map((p, i) => (i === idx ? { ...p, offsetDays: Number.isFinite(v) ? v : 0 } : p)));
                            }}
                          />
                        </div>
                        <div>
                          <Label>Start</Label>
                          <Input value={s.sendWindowStart} onChange={(e) => setDraftSteps((prev) => prev.map((p, i) => (i === idx ? { ...p, sendWindowStart: e.target.value } : p)))} />
                        </div>
                        <div>
                          <Label>End</Label>
                          <Input value={s.sendWindowEnd} onChange={(e) => setDraftSteps((prev) => prev.map((p, i) => (i === idx ? { ...p, sendWindowEnd: e.target.value } : p)))} />
                        </div>
                      </div>
                      <div>
                        <Label>Message</Label>
                        <Textarea
                          value={s.templateText}
                          onChange={(e) => setDraftSteps((prev) => prev.map((p, i) => (i === idx ? { ...p, templateText: e.target.value } : p)))}
                          placeholder="Write your SMS/email copy here"
                        />
                      </div>
                    </div>
                  ))}
                </div>

                <div className="space-y-2">
                  <div className="font-medium">Enroll Lead</div>
                  <div className="flex gap-2">
                    <Input placeholder="Lead ID" value={enrollLeadId} onChange={(e) => setEnrollLeadId(e.target.value)} />
                    <Button variant="secondary" onClick={() => enrollMutation.mutate()} disabled={enrollMutation.isPending}>
                      Enroll
                    </Button>
                    <Button variant="destructive" onClick={() => deleteCampaignMutation.mutate()} disabled={deleteCampaignMutation.isPending}>
                      Delete Campaign
                    </Button>
                  </div>
                </div>
              </div>
            )}

            {activeCampaignId ? <EntityTasksWidget entityType="campaign" entityId={activeCampaignId} /> : null}
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
}
