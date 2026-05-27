import { Layout } from "@/components/layout/Layout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
<<<<<<< HEAD
import { UnderwriteDealWorkspace } from "@/components/underwriting/UnderwriteDealWorkspace";
import { useToast } from "@/hooks/use-toast";
import { Lightbulb, MapPin, RotateCcw } from "lucide-react";
import { useEffect, useState } from "react";
=======
import { VoiceActionDialog } from "@/components/leads/VoiceActionDialog";
import { UnderwriteDealWorkspace } from "@/components/underwriting/UnderwriteDealWorkspace";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Lightbulb, MapPin, Mic, RotateCcw } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
>>>>>>> origin/main

type PlaygroundContext = {
  address: string;
  leadId: number | null;
  propertyId: number | null;
  sessionId: number | null;
};

function parseContextFromLocation(): PlaygroundContext {
  const params = new URLSearchParams(window.location.search);
  const address = String(params.get("address") || "").trim();
  const leadIdRaw = params.get("leadId");
<<<<<<< HEAD
  const propertyIdRaw = params.get("propertyId");
  const sessionIdRaw = params.get("sessionId");
=======
  const propertyIdRaw = params.get("propertyId") || params.get("opportunityId");
  const sessionIdRaw = params.get("sessionId") || params.get("playgroundSessionId");
>>>>>>> origin/main
  const leadId = leadIdRaw ? parseInt(leadIdRaw, 10) : 0;
  const propertyId = propertyIdRaw ? parseInt(propertyIdRaw, 10) : 0;
  const sessionId = sessionIdRaw ? parseInt(sessionIdRaw, 10) : 0;
  return {
    address,
    leadId: leadId > 0 ? leadId : null,
    propertyId: propertyId > 0 ? propertyId : null,
    sessionId: sessionId > 0 ? sessionId : null,
  };
}

export default function Playground() {
  const { toast } = useToast();
<<<<<<< HEAD
  const [context, setContext] = useState<PlaygroundContext>(() => parseContextFromLocation());
  const [addressInput, setAddressInput] = useState(context.address);
  const [resolvedAddress, setResolvedAddress] = useState(context.address);
=======
  const queryClient = useQueryClient();
  const [context, setContext] = useState<PlaygroundContext>(() => parseContextFromLocation());
  const [addressInput, setAddressInput] = useState(context.address);
  const [resolvedAddress, setResolvedAddress] = useState(context.address);
  const [voiceOpen, setVoiceOpen] = useState(false);
  const [voiceTranscript, setVoiceTranscript] = useState("");
  const [voiceParsed, setVoiceParsed] = useState<any | null>(null);
  const [voicePreview, setVoicePreview] = useState<any | null>(null);
  const [voiceActionLogId, setVoiceActionLogId] = useState<number | null>(null);

  const sessionKey = useMemo(() => {
    if (context.sessionId) return `id:${context.sessionId}`;
    if (context.propertyId) return `property:${context.propertyId}`;
    if (context.leadId) return `lead:${context.leadId}`;
    return `addr:${resolvedAddress}`;
  }, [context.leadId, context.propertyId, context.sessionId, resolvedAddress]);

  const toastVoiceError = (error: any) => {
    const msg = String(error?.message || error || "");
    if (msg.startsWith("404:")) {
      toast({ title: "Voice", description: "Voice Playground is not enabled for your account." });
      return;
    }
    toast({ title: "Voice", description: msg || "Something went wrong." });
  };

  const playgroundVoiceContext = useMemo(
    () => ({
      address: resolvedAddress,
      sessionId: context.sessionId,
      leadId: context.leadId,
      propertyId: context.propertyId,
    }),
    [context.leadId, context.propertyId, context.sessionId, resolvedAddress],
  );
>>>>>>> origin/main

  useEffect(() => {
    const hydrate = async () => {
      if (context.address) {
        setResolvedAddress(context.address);
        return;
      }
      if (context.propertyId) {
        const res = await fetch(`/api/opportunities/${context.propertyId}`, { credentials: "include" });
        if (!res.ok) return;
        const json = await res.json();
        const addr = String(json?.property?.address || "").trim();
        if (addr) setResolvedAddress(addr);
        return;
      }
      if (context.leadId) {
        const res = await fetch(`/api/leads/${context.leadId}`, { credentials: "include" });
        if (!res.ok) return;
        const json = await res.json();
        const addr = String(json?.address || "").trim();
        if (addr) setResolvedAddress(addr);
      }
    };
    hydrate();
  }, [context.address, context.leadId, context.propertyId]);

<<<<<<< HEAD
=======
  const voiceParseMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/ai/voice/parse", { transcript: voiceTranscript });
      return await res.json();
    },
    onSuccess: (data) => {
      setVoiceParsed(data);
      setVoicePreview(null);
      setVoiceActionLogId(null);
    },
    onError: toastVoiceError,
  });

  const voicePreviewMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/ai/voice/preview", { parsed: voiceParsed, playground: playgroundVoiceContext });
      return await res.json();
    },
    onSuccess: (data) => setVoicePreview(data),
    onError: toastVoiceError,
  });

  const voiceApplyMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/ai/voice/apply", { parsed: voiceParsed, transcript: voiceTranscript, playground: playgroundVoiceContext });
      return await res.json();
    },
    onSuccess: async (data: any) => {
      const id = Number(data?.actionLogId || 0);
      if (id) setVoiceActionLogId(id);
      const nextSessionId = Number(data?.playgroundSessionId || 0);
      if (nextSessionId && !context.sessionId) setContext((c) => ({ ...c, sessionId: nextSessionId }));
      await queryClient.invalidateQueries({ queryKey: ["/api/playground/sessions/open", sessionKey] });
    },
    onError: toastVoiceError,
  });

  const voiceUndoMutation = useMutation({
    mutationFn: async () => {
      if (!voiceActionLogId) throw new Error("Missing action id");
      const res = await apiRequest("POST", "/api/ai/voice/undo", { aiActionLogId: voiceActionLogId });
      return await res.json();
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["/api/playground/sessions/open", sessionKey] });
    },
    onError: toastVoiceError,
  });

>>>>>>> origin/main
  return (
    <Layout>
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2" data-testid="page-title">
            <Lightbulb className="h-8 w-8 text-primary" />
            Property Playground
          </h1>
          <div className="text-sm text-muted-foreground">Research hub for zoning, suppliers, comps, and deal ideas.</div>
        </div>
        <Badge variant="secondary" className="h-6">
          {context.sessionId ? `Session ${context.sessionId}` : "Live"}
        </Badge>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <MapPin className="h-4 w-4 text-primary" />
            Context
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex-1 min-w-[240px]">
                <Input value={addressInput} onChange={(e) => setAddressInput(e.target.value)} placeholder="Address" />
              </div>
              <Button
                variant="outline"
                onClick={() => {
                  const nextAddr = addressInput.trim();
                  setContext((c) => ({ ...c, address: nextAddr, sessionId: null }));
                  setResolvedAddress(nextAddr);
                  toast({ title: "Context updated", description: nextAddr || "—" });
                }}
              >
                Apply
              </Button>
              <Button
                variant="outline"
                onClick={() => {
<<<<<<< HEAD
=======
                  setVoiceTranscript("");
                  setVoiceParsed(null);
                  setVoicePreview(null);
                  setVoiceActionLogId(null);
                  setVoiceOpen(true);
                }}
              >
                <Mic className="h-4 w-4 mr-2" />
                Voice
              </Button>
              <Button
                variant="outline"
                onClick={() => {
>>>>>>> origin/main
                  setContext((c) => ({ ...c, sessionId: null }));
                  toast({ title: "Session will reopen on next load" });
                }}
              >
                <RotateCcw className="h-4 w-4 mr-2" />
                Reopen session
              </Button>
            </div>
            <div className="text-xs text-muted-foreground">{resolvedAddress ? `Resolved: ${resolvedAddress}` : "Enter an address to start"}</div>
          </div>
        </CardContent>
      </Card>
<<<<<<< HEAD
=======
      <VoiceActionDialog
        open={voiceOpen}
        onOpenChange={setVoiceOpen}
        mode="playground"
        selectionMode="explicit"
        selectedIds={[]}
        selectedLead={null}
        playgroundContext={playgroundVoiceContext}
        voiceTranscript={voiceTranscript}
        setVoiceTranscript={setVoiceTranscript}
        voiceParsed={voiceParsed}
        setVoiceParsed={setVoiceParsed}
        voicePreview={voicePreview}
        setVoicePreview={setVoicePreview}
        voiceActionLogId={voiceActionLogId}
        setVoiceActionLogId={setVoiceActionLogId}
        mutations={{
          parse: { mutate: () => voiceParseMutation.mutate(), isPending: voiceParseMutation.isPending },
          preview: { mutate: () => voicePreviewMutation.mutate(), isPending: voicePreviewMutation.isPending },
          apply: { mutate: () => voiceApplyMutation.mutate(), isPending: voiceApplyMutation.isPending },
          undo: { mutate: () => voiceUndoMutation.mutate(), isPending: voiceUndoMutation.isPending },
        }}
      />

>>>>>>> origin/main

      {resolvedAddress ? (
        <UnderwriteDealWorkspace address={resolvedAddress} propertyId={context.propertyId} leadId={context.leadId} sessionId={context.sessionId} />
      ) : (
        <div className="text-sm text-muted-foreground py-10 text-center">Enter an address to start underwriting.</div>
      )}
    </Layout>
  );
}
