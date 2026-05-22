import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Mic, MicOff } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

type SelectionMode = "explicit" | "all_filtered";

type SelectedLeadLite = {
  id: number;
  address?: string | null;
  city?: string | null;
  state?: string | null;
  zipCode?: string | null;
};

type VoiceParsed = {
  action: string | null;
  params?: Record<string, any>;
  transcript?: string;
};

type VoicePreview = {
  changes?: Array<{ before: any; next: any }>;
  notes?: { leadIdsCount: number; bodyPreview: string } | null;
  playground?: { sessionId: number | null; wouldCreateSession: boolean; notePreview: string; currentNotesCount: number } | null;
};

export function VoiceActionDialog(props: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode?: "leads" | "playground";
  selectionMode: SelectionMode;
  selectedIds: number[];
  selectedLead: SelectedLeadLite | null;
  playgroundContext?: { address?: string | null; sessionId?: number | null; leadId?: number | null; propertyId?: number | null } | null;
  voiceTranscript: string;
  setVoiceTranscript: (v: string) => void;
  voiceParsed: VoiceParsed | null;
  setVoiceParsed: (v: VoiceParsed | null) => void;
  voicePreview: VoicePreview | null;
  setVoicePreview: (v: VoicePreview | null) => void;
  voiceActionLogId: number | null;
  setVoiceActionLogId: (v: number | null) => void;
  mutations: {
    parse: { mutate: () => void; isPending: boolean };
    preview: { mutate: () => void; isPending: boolean };
    apply: { mutate: () => void; isPending: boolean };
    undo: { mutate: () => void; isPending: boolean };
  };
}) {
  const mode = props.mode === "playground" ? "playground" : "leads";
  const action = String(props.voiceParsed?.action || "").trim();
  const params = (props.voiceParsed?.params || {}) as Record<string, any>;

  const isAllFiltered = mode === "leads" && props.selectionMode === "all_filtered";
  const selectedCount = mode === "playground" ? 1 : props.selectedIds.length;
  const isOverLimit = mode === "leads" && props.selectedIds.length > 200;
  const isPlaygroundAction = action === "playground_append_note";
  const isPlaygroundSelectionInvalid = mode === "leads" && isPlaygroundAction && props.selectedIds.length !== 1;
  const isPlaygroundContextMissing =
    mode === "playground" && isPlaygroundAction && !Number(props.playgroundContext?.sessionId || 0) && !String(props.playgroundContext?.address || "").trim();
  const isUnsupportedInPlayground = mode === "playground" && !!action && action !== "playground_append_note";

  const canParse = props.voiceTranscript.trim().length > 0 && !props.mutations.parse.isPending;
  const canPreview =
    !!action &&
    !isAllFiltered &&
    !isOverLimit &&
    !isPlaygroundSelectionInvalid &&
    !isPlaygroundContextMissing &&
    !isUnsupportedInPlayground &&
    !props.mutations.preview.isPending &&
    !props.mutations.parse.isPending;
  const canApply =
    !!props.voicePreview &&
    !isAllFiltered &&
    !isOverLimit &&
    !isPlaygroundSelectionInvalid &&
    !isPlaygroundContextMissing &&
    !isUnsupportedInPlayground &&
    !props.mutations.apply.isPending;
  const canUndo = !!props.voiceActionLogId && !props.mutations.undo.isPending;

  const speech = useRef<any>(null);
  const transcriptRef = useRef(props.voiceTranscript);
  const [speechSupported, setSpeechSupported] = useState(false);
  const [speechListening, setSpeechListening] = useState(false);
  const [speechInterim, setSpeechInterim] = useState("");
  const [speechError, setSpeechError] = useState<string | null>(null);

  useEffect(() => {
    transcriptRef.current = props.voiceTranscript;
  }, [props.voiceTranscript]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    setSpeechSupported(!!SpeechRecognition);
  }, []);

  useEffect(() => {
    if (!props.open) {
      try {
        speech.current?.stop?.();
      } catch {}
      setSpeechListening(false);
      setSpeechInterim("");
      setSpeechError(null);
    }
  }, [props.open]);

  const toggleSpeech = () => {
    if (typeof window === "undefined") return;
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setSpeechSupported(false);
      setSpeechError("Speech recognition is not supported in this browser.");
      return;
    }

    if (speechListening) {
      try {
        speech.current?.stop?.();
      } catch {}
      setSpeechListening(false);
      setSpeechInterim("");
      return;
    }

    setSpeechError(null);
    setSpeechInterim("");
    const recognition = new SpeechRecognition();
    recognition.lang = "en-US";
    recognition.interimResults = true;
    recognition.continuous = true;
    recognition.maxAlternatives = 1;

    recognition.onresult = (event: any) => {
      let interim = "";
      let finalText = "";
      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        const r = event.results[i];
        const text = String(r?.[0]?.transcript || "").trim();
        if (!text) continue;
        if (r.isFinal) finalText += `${text} `;
        else interim += `${text} `;
      }
      setSpeechInterim(interim.trim());
      if (finalText.trim()) {
        const prev = String(transcriptRef.current || "").trim();
        props.setVoiceTranscript([prev, finalText.trim()].filter(Boolean).join("\n"));
        setSpeechInterim("");
      }
    };

    recognition.onerror = (e: any) => {
      const msg = String(e?.error || e?.message || "Speech recognition error");
      setSpeechError(msg);
      setSpeechListening(false);
      setSpeechInterim("");
    };

    recognition.onend = () => {
      setSpeechListening(false);
      setSpeechInterim("");
    };

    speech.current = recognition;
    try {
      recognition.start();
      setSpeechListening(true);
    } catch (e: any) {
      setSpeechError(String(e?.message || e || "Could not start speech recognition"));
      setSpeechListening(false);
      setSpeechInterim("");
    }
  };

  const selectionWarning = useMemo(() => {
    if (isAllFiltered) return "Voice actions can’t run on “all filtered”. Select specific leads.";
    if (isOverLimit) return "Voice actions are limited to 200 selected leads.";
    if (isPlaygroundSelectionInvalid) return "Playground notes require exactly 1 selected lead.";
    if (isPlaygroundContextMissing) return "Missing playground context (address or session).";
    if (isUnsupportedInPlayground) return "Only Playground notes are supported from the Playground page.";
    return "";
  }, [isAllFiltered, isOverLimit, isPlaygroundSelectionInvalid, isPlaygroundContextMissing, isUnsupportedInPlayground]);

  const parsedSummary = useMemo(() => {
    if (!action) return null;
    const entries = Object.entries(params || {}).filter(([, v]) => v !== undefined && v !== null && String(v).trim() !== "");
    return { action, entries };
  }, [action, params]);

  const previewSummary = useMemo(() => {
    if (!props.voicePreview) return null;
    const changes = Array.isArray(props.voicePreview.changes) ? props.voicePreview.changes : [];
    if (props.voicePreview.playground) {
      return {
        type: "playground" as const,
        notePreview: props.voicePreview.playground.notePreview,
        wouldCreateSession: props.voicePreview.playground.wouldCreateSession,
        currentNotesCount: props.voicePreview.playground.currentNotesCount,
      };
    }
    if (props.voicePreview.notes) {
      return {
        type: "notes" as const,
        leadIdsCount: props.voicePreview.notes.leadIdsCount,
        bodyPreview: props.voicePreview.notes.bodyPreview,
      };
    }
    return { type: "changes" as const, count: changes.length };
  }, [props.voicePreview]);

  return (
    <Dialog
      open={props.open}
      onOpenChange={(open) => {
        props.onOpenChange(open);
        if (!open) {
          props.setVoicePreview(null);
        }
      }}
    >
      <DialogContent className="sm:max-w-[720px]">
        <DialogHeader>
          <DialogTitle>Voice</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {!!selectionWarning ? (
            <div className="rounded-md border px-3 py-2 text-sm text-muted-foreground">{selectionWarning}</div>
          ) : (
            <div className="rounded-md border px-3 py-2 text-sm text-muted-foreground">
              {mode === "playground" ? (
                <>
                  Playground:{" "}
                  <span className="font-medium text-foreground">
                    {String(props.playgroundContext?.address || "").trim() || (props.playgroundContext?.sessionId ? `Session ${props.playgroundContext.sessionId}` : "—")}
                  </span>
                </>
              ) : (
                <>
                  Selected: <span className="font-medium text-foreground">{selectedCount}</span>
                  {selectedCount === 1 && props.selectedLead?.address ? (
                    <span className="ml-2">{String(props.selectedLead.address)}</span>
                  ) : null}
                </>
              )}
            </div>
          )}

          <div className="space-y-2">
            <Textarea
              value={props.voiceTranscript}
              onChange={(e) => props.setVoiceTranscript(e.target.value)}
              placeholder='Try: "Add note: left voicemail" or "Playground note: offer range 320-340k"'
              className="min-h-[120px]"
            />
            {speechSupported ? (
              <div className="flex items-center justify-between gap-2 rounded-md border px-3 py-2 text-xs text-muted-foreground">
                <div className="truncate">
                  {speechListening ? "Listening…" : "Tap Record to dictate. Review the transcript before parsing."}
                  {speechInterim ? <span className="ml-2 text-foreground">{speechInterim}</span> : null}
                </div>
                <Button variant="outline" size="sm" onClick={toggleSpeech} type="button">
                  {speechListening ? <MicOff className="mr-2 h-4 w-4" /> : <Mic className="mr-2 h-4 w-4" />}
                  {speechListening ? "Stop" : "Record"}
                </Button>
              </div>
            ) : (
              <div className="rounded-md border px-3 py-2 text-xs text-muted-foreground">Paste or type your transcript (voice capture isn’t available in this browser).</div>
            )}
            {speechError ? <div className="rounded-md border px-3 py-2 text-xs text-destructive">{speechError}</div> : null}
            <div className="flex items-center justify-end gap-2">
              <Button
                variant="secondary"
                onClick={() => {
                  if (speechListening) toggleSpeech();
                  props.setVoiceTranscript("");
                  props.setVoiceParsed(null);
                  props.setVoicePreview(null);
                  props.setVoiceActionLogId(null);
                }}
              >
                Reset
              </Button>
              <Button onClick={props.mutations.parse.mutate} disabled={!canParse}>
                Parse
              </Button>
            </div>
          </div>

          <Separator />

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <div className="text-sm font-medium">Parsed</div>
              {parsedSummary?.action ? <Badge variant="secondary">{parsedSummary.action}</Badge> : <Badge variant="outline">None</Badge>}
            </div>

            {parsedSummary?.entries?.length ? (
              <div className="rounded-md border px-3 py-2 text-sm">
                {parsedSummary.entries.map(([k, v]) => (
                  <div key={k} className="flex items-start justify-between gap-3">
                    <div className="text-muted-foreground">{k}</div>
                    <div className="text-right font-medium">{String(v)}</div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="rounded-md border px-3 py-2 text-sm text-muted-foreground">No parsed action yet.</div>
            )}

            <div className="flex items-center justify-end gap-2">
              <Button variant="secondary" onClick={props.mutations.preview.mutate} disabled={!canPreview}>
                Preview
              </Button>
              <Button onClick={props.mutations.apply.mutate} disabled={!canApply}>
                Confirm &amp; Apply
              </Button>
            </div>
          </div>

          <Separator />

          <div className="space-y-2">
            <div className="text-sm font-medium">Preview</div>
            {!previewSummary ? (
              <div className="rounded-md border px-3 py-2 text-sm text-muted-foreground">Run preview to see what will happen.</div>
            ) : previewSummary.type === "playground" ? (
              <div className="rounded-md border px-3 py-2 text-sm">
                <div className="flex items-center justify-between">
                  <div className="text-muted-foreground">Playground note</div>
                  {previewSummary.wouldCreateSession ? <Badge>New session</Badge> : <Badge variant="secondary">Existing</Badge>}
                </div>
                <div className="mt-2 text-foreground">{previewSummary.notePreview}</div>
                <div className="mt-2 text-muted-foreground">Current notes: {previewSummary.currentNotesCount}</div>
              </div>
            ) : previewSummary.type === "notes" ? (
              <div className="rounded-md border px-3 py-2 text-sm">
                <div className="text-muted-foreground">Leads: {previewSummary.leadIdsCount}</div>
                <div className="mt-2 text-foreground">{previewSummary.bodyPreview}</div>
              </div>
            ) : (
              <div className="rounded-md border px-3 py-2 text-sm">
                <div className="text-muted-foreground">Rows affected: {previewSummary.count}</div>
              </div>
            )}
          </div>
        </div>

        <DialogFooter className="flex items-center justify-between gap-2 sm:justify-between">
          <Button variant="outline" onClick={props.mutations.undo.mutate} disabled={!canUndo}>
            Undo
          </Button>
          <Button variant="secondary" onClick={() => props.onOpenChange(false)}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
