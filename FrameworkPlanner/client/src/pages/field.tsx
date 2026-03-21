import { Layout } from "@/components/layout/Layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { enqueueAction, listActions, removeActions } from "@/lib/offlineQueue";
import { apiRequest } from "@/lib/queryClient";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";

function randomKey() {
  return `${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

async function fileToBase64(file: File) {
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onerror = () => reject(new Error("Failed to read file"));
    r.onload = () => resolve(String(r.result || ""));
    r.readAsDataURL(file);
  });
  return dataUrl.includes(",") ? dataUrl.split(",")[1] : dataUrl;
}

export default function FieldModePage() {
  const { toast } = useToast();
  const [queueCount, setQueueCount] = useState(0);
  const syncingRef = useRef(false);

  const { data: leadSourceOptions = [] } = useQuery<any[]>({
    queryKey: ["/api/lead-source-options"],
    queryFn: async () => {
      try {
        const res = await apiRequest("GET", "/api/lead-source-options");
        return res.json();
      } catch (e: any) {
        const msg = String(e?.message || "");
        toast({ title: msg.includes("404:") ? "Field Mode is not enabled" : (msg || "Failed to load lead sources"), variant: "destructive" });
        return [];
      }
    },
  });

  const defaultSource = useMemo(() => String(leadSourceOptions?.[0]?.value || ""), [leadSourceOptions]);

  const [leadDraft, setLeadDraft] = useState<any>({
    address: "",
    city: "",
    state: "FL",
    zipCode: "",
    ownerName: "",
    ownerPhone: "",
    ownerEmail: "",
    source: "",
  });

  useEffect(() => {
    if (!leadDraft.source && defaultSource) setLeadDraft((p: any) => ({ ...p, source: defaultSource }));
  }, [defaultSource, leadDraft.source]);

  const refreshQueueCount = async () => {
    const items = await listActions().catch(() => []);
    setQueueCount(items.length);
  };

  useEffect(() => {
    refreshQueueCount().catch(() => {});
    const onOnline = () => {
      syncQueue().catch(() => {});
    };
    window.addEventListener("online", onOnline);
    return () => window.removeEventListener("online", onOnline);
  }, []);

  const syncQueue = async () => {
    if (syncingRef.current) return;
    syncingRef.current = true;
    try {
      const items = await listActions();
      if (!items.length) {
        setQueueCount(0);
        return;
      }
      const res = await apiRequest("POST", "/api/sync", {
        actions: items.map((a) => ({ idempotencyKey: a.id, type: a.type, payload: a.payload })),
      });
      const json = await res.json().catch(() => ({}));
      const results = Array.isArray((json as any).results) ? (json as any).results : [];
      const okIds = results.filter((r: any) => r && r.ok).map((r: any) => String(r.idempotencyKey));
      if (okIds.length) await removeActions(okIds);
      await refreshQueueCount();
      toast({ title: "Synced", description: `${okIds.length} action(s) synced` });
    } catch (e: any) {
      toast({ title: e?.message || "Sync failed", variant: "destructive" });
    } finally {
      syncingRef.current = false;
    }
  };

  const enqueueLead = async () => {
    if (!leadDraft.address || !leadDraft.city || !leadDraft.zipCode || !leadDraft.ownerName || !leadDraft.source) {
      toast({ title: "Missing required lead fields", variant: "destructive" });
      return;
    }
    await enqueueAction({ id: randomKey(), type: "create_lead", payload: { ...leadDraft, status: "new" } });
    setLeadDraft({ address: "", city: "", state: "FL", zipCode: "", ownerName: "", ownerPhone: "", ownerEmail: "", source: defaultSource || "" });
    await refreshQueueCount();
    toast({ title: "Queued lead" });
    if (navigator.onLine) syncQueue().catch(() => {});
  };

  const [noteLeadId, setNoteLeadId] = useState("");
  const [noteText, setNoteText] = useState("");
  const enqueueNote = async () => {
    const leadId = parseInt(noteLeadId, 10);
    if (!Number.isFinite(leadId) || leadId <= 0) {
      toast({ title: "Enter a valid Lead ID", variant: "destructive" });
      return;
    }
    if (!noteText.trim()) {
      toast({ title: "Note is required", variant: "destructive" });
      return;
    }
    await enqueueAction({ id: randomKey(), type: "add_note", payload: { leadId, note: noteText } });
    setNoteText("");
    await refreshQueueCount();
    toast({ title: "Queued note" });
    if (navigator.onLine) syncQueue().catch(() => {});
  };

  const [campaignId, setCampaignId] = useState("");
  const [actionLeadId, setActionLeadId] = useState("");
  const enqueueSkipTraceAndEnroll = async () => {
    const leadId = parseInt(actionLeadId, 10);
    const cid = parseInt(campaignId, 10);
    if (!Number.isFinite(leadId) || leadId <= 0) {
      toast({ title: "Enter a valid Lead ID", variant: "destructive" });
      return;
    }
    if (!Number.isFinite(cid) || cid <= 0) {
      toast({ title: "Enter a valid Campaign ID", variant: "destructive" });
      return;
    }
    await enqueueAction({ id: randomKey(), type: "skip_trace_lead", payload: { leadId } });
    await enqueueAction({ id: randomKey(), type: "enroll_campaign", payload: { campaignId: cid, leadId } });
    await refreshQueueCount();
    toast({ title: "Queued skip trace + enrollment" });
    if (navigator.onLine) syncQueue().catch(() => {});
  };

  const enqueuePhoto = async (file: File) => {
    const base64 = await fileToBase64(file);
    await enqueueAction({
      id: randomKey(),
      type: "upload_media",
      payload: { kind: "photo", mimeType: file.type || "image/jpeg", contentBase64: base64 },
    });
    await refreshQueueCount();
    toast({ title: "Queued photo" });
    if (navigator.onLine) syncQueue().catch(() => {});
  };

  const [recording, setRecording] = useState(false);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mr = new MediaRecorder(stream);
      chunksRef.current = [];
      mr.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) chunksRef.current.push(e.data);
      };
      mr.onstop = async () => {
        const blob = new Blob(chunksRef.current, { type: mr.mimeType || "audio/webm" });
        const file = new File([blob], `voice-note-${Date.now()}.webm`, { type: blob.type });
        const base64 = await fileToBase64(file);
        await enqueueAction({ id: randomKey(), type: "upload_media", payload: { kind: "voice", mimeType: file.type, contentBase64: base64 } });
        await refreshQueueCount();
        toast({ title: "Queued voice note" });
        if (navigator.onLine) syncQueue().catch(() => {});
        stream.getTracks().forEach((t) => t.stop());
      };
      mr.start();
      recorderRef.current = mr;
      setRecording(true);
    } catch (e: any) {
      toast({ title: e?.message || "Mic permission required", variant: "destructive" });
    }
  };

  const stopRecording = () => {
    const r = recorderRef.current;
    if (!r) return;
    r.stop();
    recorderRef.current = null;
    setRecording(false);
  };

  return (
    <Layout>
      <div className="p-4 md:p-8 space-y-6">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Field Mode</h1>
            <p className="text-muted-foreground">Fast capture + offline queue (syncs when online).</p>
          </div>
          <div className="flex items-center gap-2">
            <div className="text-sm text-muted-foreground">Queued: <span className="text-foreground font-medium">{queueCount}</span></div>
            <Button variant="secondary" onClick={() => syncQueue()} disabled={!navigator.onLine}>
              Sync now
            </Button>
          </div>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Add Lead</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid gap-2">
              <Label>Address</Label>
              <Input value={leadDraft.address} onChange={(e) => setLeadDraft((p: any) => ({ ...p, address: e.target.value }))} placeholder="123 Main St" />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="grid gap-2">
                <Label>City</Label>
                <Input value={leadDraft.city} onChange={(e) => setLeadDraft((p: any) => ({ ...p, city: e.target.value }))} placeholder="Tampa" />
              </div>
              <div className="grid gap-2">
                <Label>State</Label>
                <Input value={leadDraft.state} onChange={(e) => setLeadDraft((p: any) => ({ ...p, state: e.target.value }))} placeholder="FL" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="grid gap-2">
                <Label>Zip</Label>
                <Input value={leadDraft.zipCode} onChange={(e) => setLeadDraft((p: any) => ({ ...p, zipCode: e.target.value }))} placeholder="33602" />
              </div>
              <div className="grid gap-2">
                <Label>Owner name</Label>
                <Input value={leadDraft.ownerName} onChange={(e) => setLeadDraft((p: any) => ({ ...p, ownerName: e.target.value }))} placeholder="Owner name" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="grid gap-2">
                <Label>Owner phone</Label>
                <Input value={leadDraft.ownerPhone} onChange={(e) => setLeadDraft((p: any) => ({ ...p, ownerPhone: e.target.value }))} placeholder="(555) 555-5555" />
              </div>
              <div className="grid gap-2">
                <Label>Owner email</Label>
                <Input value={leadDraft.ownerEmail} onChange={(e) => setLeadDraft((p: any) => ({ ...p, ownerEmail: e.target.value }))} placeholder="owner@email.com" />
              </div>
            </div>
            <div className="grid gap-2">
              <Label>Lead source</Label>
              <Select value={leadDraft.source} onValueChange={(v) => setLeadDraft((p: any) => ({ ...p, source: v }))}>
                <SelectTrigger>
                  <SelectValue placeholder="Select source" />
                </SelectTrigger>
                <SelectContent>
                  {leadSourceOptions.map((o: any) => (
                    <SelectItem key={String(o.value)} value={String(o.value)}>
                      {String(o.label || o.value)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button onClick={enqueueLead}>Queue Lead</Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Capture Media</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid gap-2">
              <Label>Photo</Label>
              <Input
                type="file"
                accept="image/*"
                capture="environment"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) enqueuePhoto(f).catch(() => {});
                }}
              />
            </div>
            <div className="flex gap-2">
              <Button variant="secondary" onClick={startRecording} disabled={recording}>
                Start voice note
              </Button>
              <Button variant="destructive" onClick={stopRecording} disabled={!recording}>
                Stop
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Quick Actions</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-2 gap-2">
              <div className="grid gap-2">
                <Label>Lead ID</Label>
                <Input value={actionLeadId} onChange={(e) => setActionLeadId(e.target.value)} placeholder="123" />
              </div>
              <div className="grid gap-2">
                <Label>Campaign ID</Label>
                <Input value={campaignId} onChange={(e) => setCampaignId(e.target.value)} placeholder="1" />
              </div>
            </div>
            <Button variant="secondary" onClick={enqueueSkipTraceAndEnroll}>
              Skip Trace + Add to Campaign
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Notes</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid gap-2">
              <Label>Lead ID</Label>
              <Input value={noteLeadId} onChange={(e) => setNoteLeadId(e.target.value)} placeholder="123" />
            </div>
            <div className="grid gap-2">
              <Label>Note</Label>
              <Textarea value={noteText} onChange={(e) => setNoteText(e.target.value)} placeholder="Voice-to-text notes, appointment details, etc." />
            </div>
            <Button variant="secondary" onClick={enqueueNote}>
              Queue Note
            </Button>
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
}
