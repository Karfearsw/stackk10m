import { Layout } from "@/components/layout/Layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";

type AudioAsset = { id: number; name: string; mimeType: string; createdAt: string };

export default function RvmPage() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data: audioAssets = [] } = useQuery<AudioAsset[]>({
    queryKey: ["/api/rvm/audio-assets"],
    queryFn: async () => {
      try {
        const res = await apiRequest("GET", "/api/rvm/audio-assets");
        return res.json();
      } catch {
        return [];
      }
    },
  });

  const { data: campaigns = [] } = useQuery<any[]>({
    queryKey: ["/api/rvm/campaigns"],
    queryFn: async () => {
      try {
        const res = await apiRequest("GET", "/api/rvm/campaigns");
        return res.json();
      } catch {
        return [];
      }
    },
  });

  const [newCampaignName, setNewCampaignName] = useState("");
  const [sendWindowStart, setSendWindowStart] = useState("09:00");
  const [sendWindowEnd, setSendWindowEnd] = useState("19:00");
  const [dailyCap, setDailyCap] = useState("500");
  const [activeCampaignId, setActiveCampaignId] = useState<number | null>(null);
  const [selectedAudioId, setSelectedAudioId] = useState<string>("");

  const activeCampaign = useMemo(() => campaigns.find((c: any) => c.id === activeCampaignId) || null, [campaigns, activeCampaignId]);

  useEffect(() => {
    if (!activeCampaignId) return;
    if (!campaigns.length) return;
    if (!activeCampaign) setActiveCampaignId(null);
  }, [activeCampaignId, activeCampaign, campaigns.length]);

  const { data: drops = [] } = useQuery<any[]>({
    queryKey: ["/api/rvm/campaigns", activeCampaignId, "drops"],
    enabled: !!activeCampaignId,
    queryFn: async () => {
      try {
        const res = await apiRequest("GET", `/api/rvm/campaigns/${activeCampaignId}/drops`);
        return res.json();
      } catch {
        return [];
      }
    },
  });

  const createCampaignMutation = useMutation({
    mutationFn: async () => {
      const cap = parseInt(dailyCap, 10);
      const res = await apiRequest("POST", "/api/rvm/campaigns", {
        name: newCampaignName,
        sendWindowStart,
        sendWindowEnd,
        dailyCap: Number.isFinite(cap) ? cap : 500,
        audioAssetId: selectedAudioId ? parseInt(selectedAudioId, 10) : null,
      });
      return res.json();
    },
    onSuccess: async (data: any) => {
      setNewCampaignName("");
      await queryClient.invalidateQueries({ queryKey: ["/api/rvm/campaigns"] });
      setActiveCampaignId(data?.id ?? null);
      toast({ title: "RVM campaign created" });
    },
    onError: (e: any) => toast({ title: e?.message || "Failed to create campaign", variant: "destructive" }),
  });

  const [leadIdsCsv, setLeadIdsCsv] = useState("");
  const launchMutation = useMutation({
    mutationFn: async () => {
      if (!activeCampaignId) throw new Error("Select a campaign");
      const ids = leadIdsCsv
        .split(/[,\s]+/g)
        .map((x) => parseInt(x, 10))
        .filter((n) => Number.isFinite(n) && n > 0);
      if (!ids.length) throw new Error("Enter at least one Lead ID");
      const res = await apiRequest("POST", `/api/rvm/campaigns/${activeCampaignId}/launch`, {
        leadIds: ids,
        audioAssetId: selectedAudioId ? parseInt(selectedAudioId, 10) : null,
      });
      return res.json();
    },
    onSuccess: async (data: any) => {
      await queryClient.invalidateQueries({ queryKey: ["/api/rvm/campaigns", activeCampaignId, "drops"] });
      toast({ title: "RVM launched", description: `Launched ${data.launched || 0}, failed ${data.failed || 0}` });
    },
    onError: async (e: any) => {
      const msg = String(e?.message || "");
      if (msg.includes("Campaign not found")) {
        setActiveCampaignId(null);
        await queryClient.invalidateQueries({ queryKey: ["/api/rvm/campaigns"] });
      }
      toast({ title: msg || "Launch failed", variant: "destructive" });
    },
  });

  const uploadAudioMutation = useMutation({
    mutationFn: async (file: File) => {
      const contentBase64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onerror = () => reject(new Error("Failed to read file"));
        reader.onload = () => {
          const result = String(reader.result || "");
          const base64 = result.includes(",") ? result.split(",")[1] : result;
          resolve(base64);
        };
        reader.readAsDataURL(file);
      });

      const res = await apiRequest("POST", "/api/rvm/audio-assets", {
        name: file.name,
        mimeType: file.type || "audio/mpeg",
        contentBase64,
      });
      return res.json();
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["/api/rvm/audio-assets"] });
      toast({ title: "Audio uploaded" });
    },
    onError: (e: any) => toast({ title: e?.message || "Upload failed", variant: "destructive" }),
  });

  return (
    <Layout>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">RVM</h1>
          <p className="text-muted-foreground">Ringless voicemail blasting with guardrails.</p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Audio Library</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid gap-2">
              <Label>Upload voicemail audio</Label>
              <Input
                type="file"
                accept="audio/*"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) uploadAudioMutation.mutate(f);
                }}
              />
            </div>
            <div className="grid gap-2">
              <Label>Select audio</Label>
              <Select value={selectedAudioId} onValueChange={setSelectedAudioId}>
                <SelectTrigger>
                  <SelectValue placeholder="Choose an audio asset" />
                </SelectTrigger>
                <SelectContent>
                  {audioAssets.map((a) => (
                    <SelectItem key={String(a.id)} value={String(a.id)}>
                      {a.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Create Campaign</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid gap-2">
              <Label>Name</Label>
              <Input value={newCampaignName} onChange={(e) => setNewCampaignName(e.target.value)} placeholder="RVM Campaign name" />
            </div>
            <div className="grid grid-cols-3 gap-2">
              <div className="grid gap-2">
                <Label>Start</Label>
                <Input value={sendWindowStart} onChange={(e) => setSendWindowStart(e.target.value)} placeholder="09:00" />
              </div>
              <div className="grid gap-2">
                <Label>End</Label>
                <Input value={sendWindowEnd} onChange={(e) => setSendWindowEnd(e.target.value)} placeholder="19:00" />
              </div>
              <div className="grid gap-2">
                <Label>Daily cap</Label>
                <Input value={dailyCap} onChange={(e) => setDailyCap(e.target.value)} placeholder="500" />
              </div>
            </div>
            <Button
              onClick={() => createCampaignMutation.mutate()}
              disabled={!newCampaignName.trim() || createCampaignMutation.isPending}
            >
              Create Campaign
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Launch</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
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
              <div className="text-sm text-muted-foreground">
                Status: <span className="text-foreground">{String(activeCampaign.status || "—")}</span>
              </div>
            )}

            <div className="grid gap-2">
              <Label>Lead IDs (comma or space separated)</Label>
              <Input value={leadIdsCsv} onChange={(e) => setLeadIdsCsv(e.target.value)} placeholder="123, 124, 125" />
            </div>
            <Button variant="secondary" onClick={() => launchMutation.mutate()} disabled={launchMutation.isPending}>
              Launch RVM
            </Button>

            {!!drops.length && (
              <div className="border rounded-md p-3 text-sm space-y-2">
                <div className="font-medium">Recent Drops</div>
                <div className="grid grid-cols-4 gap-2 text-xs text-muted-foreground">
                  <div>Lead</div>
                  <div>To</div>
                  <div>Status</div>
                  <div>When</div>
                </div>
                {drops.slice(0, 50).map((d: any) => (
                  <div key={String(d.id)} className="grid grid-cols-4 gap-2">
                    <div>{String(d.leadId ?? d.lead_id ?? "")}</div>
                    <div className="truncate">{String(d.toNumber ?? d.to_number ?? "") || "—"}</div>
                    <div>{String(d.status || "—")}</div>
                    <div className="text-xs text-muted-foreground">
                      {d.requestedAt || d.requested_at ? new Date(d.requestedAt || d.requested_at).toLocaleString() : "—"}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
}
