import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { formatDisposition } from "@/lib/dispositions";
import { useDialerWorkspace } from "./DialerWorkspaceContext";

/** Disposition — extracted verbatim from the old dialer-workspace page. */
export function DispositionWidget() {
  const { disposition, setDisposition, DISPOSITIONS, note, setNote, followUpAt, setFollowUpAt, nextAction, setNextAction, nextActionAt, setNextActionAt, needsNextAction, wrapUpValid, saveLogPending, callId, logSaved, activeItem, session, buyerMode, handleSaveLog } = useDialerWorkspace();
  return (
    <div className="h-full overflow-auto rounded-lg border border-border bg-card">
      <div className="dialer-widget-drag-handle flex cursor-move items-center justify-between border-b border-border px-3 py-2">
        <span className="text-sm font-semibold">Disposition</span>
      </div>
      <div className="space-y-3 p-3">
      <div className="grid gap-2">
      <Label>Call Log</Label>
      <select
        className="h-10 rounded-md border border-input bg-background px-3 text-sm"
        value={disposition}
        onChange={(e) => setDisposition(e.target.value)}
      >
        <option value="">Select disposition</option>
        {DISPOSITIONS.map((d) => (
          <option key={d} value={d}>
            {formatDisposition(d)}
          </option>
        ))}
      </select>
      <Textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="Notes (optional)" />
      {needsNextAction ? (
        <div className="grid gap-1 rounded-md border border-border p-2">
          <Label>Next action (required for this disposition)</Label>
          <Input
            value={nextAction}
            onChange={(e) => setNextAction(e.target.value)}
            placeholder={disposition === "send_deal" ? "e.g. Email deal package + rent roll" : "What happens next?"}
          />
          <Label>Next-action date</Label>
          <Input type="date" value={nextActionAt} onChange={(e) => setNextActionAt(e.target.value)} />
        </div>
      ) : null}
      <div className="grid gap-1">
        <Label>Follow-up date</Label>
        <Input type="date" value={followUpAt} onChange={(e) => setFollowUpAt(e.target.value)} />
      </div>
      <Button
        variant="secondary"
                          onClick={handleSaveLog}
        disabled={saveLogPending || !wrapUpValid || (!callId && !activeItem?.leadId && !(session && buyerMode))}
      >
        Save Log
      </Button>
      {!wrapUpValid ? (
        <div className="text-xs text-muted-foreground">
          {disposition
            ? needsNextAction && (!nextAction || !nextActionAt)
              ? "Next action + date required for this disposition."
              : "Follow-up date required for callback_requested."
            : "Select a disposition to save the log."}
        </div>
      ) : null}
      {callId && !logSaved ? (
        <div className="text-xs text-muted-foreground">Save the log before moving to the next lead.</div>
      ) : null}
    </div>
      </div>
    </div>
  );
}
