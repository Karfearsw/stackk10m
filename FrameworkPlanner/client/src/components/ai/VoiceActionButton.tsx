import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Mic, MicOff } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

type ParseResp = { transcript: string; parsed: any };

export function VoiceActionButton({
  selectionScope,
  leadIds,
  query,
}: {
  selectionScope: "explicit" | "all_filtered";
  leadIds: number[];
  query: any;
}) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [listening, setListening] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [parsed, setParsed] = useState<any>(null);
  const [preview, setPreview] = useState<any>(null);
  const recognitionRef = useRef<any>(null);

  const canUseSpeech = useMemo(() => {
    return Boolean((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition);
  }, []);

  useEffect(() => {
    if (!open) {
      setListening(false);
      setParsed(null);
      setPreview(null);
    }
  }, [open]);

  const startListening = () => {
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) {
      toast({ title: "Not supported", description: "Speech recognition isn't available in this browser.", variant: "destructive" });
      return;
    }
    const rec = new SR();
    rec.continuous = true;
    rec.interimResults = true;
    rec.lang = "en-US";
    rec.onresult = (e: any) => {
      const parts: string[] = [];
      for (let i = e.resultIndex; i < e.results.length; i += 1) {
        parts.push(String(e.results[i][0]?.transcript || ""));
      }
      setTranscript((prev) => (prev ? `${prev} ${parts.join(" ")}`.trim() : parts.join(" ").trim()));
    };
    rec.onerror = () => {
      setListening(false);
    };
    rec.onend = () => {
      setListening(false);
    };
    recognitionRef.current = rec;
    setListening(true);
    rec.start();
  };

  const stopListening = () => {
    const rec = recognitionRef.current;
    if (rec) rec.stop();
    setListening(false);
  };

  const doParse = async () => {
    try {
      const res = await apiRequest("POST", "/api/ai/voice/parse", { transcript });
      const data = (await res.json()) as ParseResp;
      setParsed({ ...data.parsed, transcript: data.transcript });
      setPreview(null);
    } catch (e: any) {
      const msg = String(e?.message || e);
      toast({ title: "Voice not enabled", description: msg.includes("404") ? "Enable FEATURE_VOICE_PLAYGROUND to use voice." : msg, variant: "destructive" });
    }
  };

  const doPreview = async () => {
    try {
      const res = await apiRequest("POST", "/api/ai/voice/preview", { proposal: parsed, selectionScope, leadIds, query });
      setPreview(await res.json());
    } catch (e: any) {
      toast({ title: "Preview failed", description: String(e?.message || e), variant: "destructive" });
    }
  };

  const doApply = async () => {
    try {
      const res = await apiRequest("POST", "/api/ai/voice/apply", { proposal: parsed, selectionScope, leadIds, query, transcript });
      const out = await res.json();
      toast({ title: "Applied", description: `Succeeded: ${out.succeeded || 0}, Failed: ${out.failed || 0}` });
      setOpen(false);
    } catch (e: any) {
      toast({ title: "Apply failed", description: String(e?.message || e), variant: "destructive" });
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button type="button" variant="outline" size="sm">
          <Mic className="h-4 w-4 mr-2" />
          Voice
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[720px]">
        <DialogHeader>
          <DialogTitle>Voice playground</DialogTitle>
          <DialogDescription>Parse intent and review before writing anything.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <Button type="button" variant="secondary" onClick={listening ? stopListening : startListening} disabled={!canUseSpeech}>
              {listening ? <MicOff className="h-4 w-4 mr-2" /> : <Mic className="h-4 w-4 mr-2" />}
              {listening ? "Stop" : "Record"}
            </Button>
            <Button type="button" variant="outline" onClick={() => setTranscript("")}>
              Clear
            </Button>
          </div>
          <Textarea value={transcript} onChange={(e) => setTranscript(e.target.value)} placeholder="Say or type a command…" className="min-h-[120px]" />
          <div className="flex flex-wrap gap-2">
            <Button type="button" onClick={doParse} disabled={!transcript.trim()}>
              Parse
            </Button>
            <Button type="button" variant="secondary" onClick={doPreview} disabled={!parsed}>
              Preview
            </Button>
            <Button type="button" variant="default" onClick={doApply} disabled={!preview || (preview?.warnings || []).length > 0}>
              Apply
            </Button>
          </div>
          {parsed ? (
            <pre className="text-xs rounded-md border bg-muted p-3 overflow-auto max-h-[260px]">{JSON.stringify(parsed, null, 2)}</pre>
          ) : null}
          {preview ? (
            <pre className="text-xs rounded-md border bg-muted p-3 overflow-auto max-h-[220px]">{JSON.stringify(preview, null, 2)}</pre>
          ) : null}
        </div>
        <DialogFooter />
      </DialogContent>
    </Dialog>
  );
}

