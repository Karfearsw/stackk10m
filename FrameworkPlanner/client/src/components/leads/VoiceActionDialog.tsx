import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { useMemo } from "react";

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
  selectionMode: SelectionMode;
  selectedIds: number[];
  selectedLead: SelectedLeadLite | null;
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
  const action = String(props.voiceParsed?.action || "").trim();
  const params = (props.voiceParsed?.params || {}) as Record<string, any>;

  const isAllFiltered = props.selectionMode === "all_filtered";
  const selectedCount = props.selectedIds.length;
  const isOverLimit = selectedCount > 200;
  const isPlaygroundAction = action === "playground_append_note";
  const isPlaygroundSelectionInvalid = isPlaygroundAction && selectedCount !== 1;

  const canParse = props.voiceTranscript.trim().length > 0 && !props.mutations.parse.isPending;
  const canPreview =
    !!action &&
    !isAllFiltered &&
    !isOverLimit &&
    !isPlaygroundSelectionInvalid &&
    !props.mutations.preview.isPending &&
    !props.mutations.parse.isPending;
  const canApply =
    !!props.voicePreview &&
    !isAllFiltered &&
    !isOverLimit &&
    !isPlaygroundSelectionInvalid &&
    !props.mutations.apply.isPending;
  const canUndo = !!props.voiceActionLogId && !props.mutations.undo.isPending;

  const selectionWarning = useMemo(() => {
    if (isAllFiltered) return "Voice actions can’t run on “all filtered”. Select specific leads.";
    if (isOverLimit) return "Voice actions are limited to 200 selected leads.";
    if (isPlaygroundSelectionInvalid) return "Playground notes require exactly 1 selected lead.";
    return "";
  }, [isAllFiltered, isOverLimit, isPlaygroundSelectionInvalid]);

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
              Selected: <span className="font-medium text-foreground">{selectedCount}</span>
              {selectedCount === 1 && props.selectedLead?.address ? (
                <span className="ml-2">{String(props.selectedLead.address)}</span>
              ) : null}
            </div>
          )}

          <div className="space-y-2">
            <Textarea
              value={props.voiceTranscript}
              onChange={(e) => props.setVoiceTranscript(e.target.value)}
              placeholder='Try: "Add note: left voicemail" or "Playground note: offer range 320-340k"'
              className="min-h-[120px]"
            />
            <div className="flex items-center justify-end gap-2">
              <Button
                variant="secondary"
                onClick={() => {
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

