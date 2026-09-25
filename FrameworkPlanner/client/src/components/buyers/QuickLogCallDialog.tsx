import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import {
  formatDisposition,
  formatBuyerStatus,
  buyerStatusColor,
  BUYER_DISPOSITIONS_REQUIRE_NEXT_ACTION,
} from "@/lib/dispositions";

// Buyer-specific dispositions offered first in the dropdown, then the shared
// call outcomes (one taxonomy server-side; grouped here for fast selection).
const BUYER_DISPOSITIONS = [
  "send_deal", "offer_expected", "offer_submitted", "criteria_mismatch",
  "qualified_buyer", "needs_info", "callback_requested",
];
const SHARED_DISPOSITIONS = [
  "connected", "voicemail", "no_answer", "busy", "wrong_number_confirmed",
  "not_interested", "do_not_call", "invalid_number",
];
const NOTE_TEMPLATE = `Summary:
Interest level:
Deal discussed:
Objection / requirement:
Next step:`;

export function QuickLogCallDialog({
  buyer,
  open,
  onOpenChange,
}: {
  buyer: any;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [direction, setDirection] = useState<"inbound" | "outbound">("outbound");
  const [provider, setProvider] = useState("google_voice");
  const [occurredAt, setOccurredAt] = useState(() => {
    const now = new Date();
    now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
    return now.toISOString().slice(0, 16);
  });
  const [durationMinutes, setDurationMinutes] = useState("");
  const [disposition, setDisposition] = useState("");
  const [interestLevel, setInterestLevel] = useState("");
  const [note, setNote] = useState("");
  const [nextAction, setNextAction] = useState("");
  const [nextActionAt, setNextActionAt] = useState("");

  const isDnc = Boolean(buyer?.doNotCall || buyer?.buyerStatus === "do_not_contact");
  const needsNextAction = BUYER_DISPOSITIONS_REQUIRE_NEXT_ACTION.has(disposition);
  const canSave = Boolean(disposition) && (!needsNextAction || Boolean(nextAction && nextActionAt));

  const reset = () => {
    setDirection("outbound");
    setProvider("google_voice");
    const now = new Date();
    now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
    setOccurredAt(now.toISOString().slice(0, 16));
    setDurationMinutes("");
    setDisposition("");
    setInterestLevel("");
    setNote("");
    setNextAction("");
    setNextActionAt("");
  };

  const logMutation = useMutation({
    mutationFn: async () => {
      return apiRequest("POST", `/api/buyers/${buyer.id}/call-logs`, {
        direction,
        sessionProvider: provider,
        occurredAt: occurredAt ? new Date(occurredAt).toISOString() : undefined,
        durationSeconds: durationMinutes ? Math.max(0, Math.round(parseFloat(durationMinutes) * 60)) : undefined,
        disposition,
        note: note || undefined,
        interestLevel: interestLevel || undefined,
        nextAction: nextAction || undefined,
        nextActionAt: nextActionAt ? new Date(nextActionAt).toISOString() : undefined,
      });
    },
    onSuccess: async (res: any) => {
      const data = await res.json().catch(() => null);
      if (res.status >= 400) {
        toast({ title: "Could not log call", description: data?.error || "Request failed", variant: "destructive" });
        return;
      }
      queryClient.invalidateQueries({ queryKey: ["/api/buyers"] });
      queryClient.invalidateQueries({ queryKey: [`/api/buyers/${buyer.id}/call-logs`] });
      queryClient.invalidateQueries({ queryKey: [`/api/buyers/${buyer.id}/tasks`] });
      queryClient.invalidateQueries({ queryKey: ["/api/activity"] });
      toast({ title: "Call logged", description: `Disposition: ${formatDisposition(disposition)}` });
      reset();
      onOpenChange(false);
    },
    onError: async (err: any) => {
      let message = err?.message || "Failed to log call";
      try {
        const body = typeof err?.response?.text === "string" ? JSON.parse(err.response.text) : null;
        if (body?.error || body?.message) message = body.error || body.message;
      } catch { /* keep default */ }
      toast({ title: "Could not log call", description: message, variant: "destructive" });
    },
  });

  if (!buyer) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto" data-testid="dialog-quick-log-call">
        <DialogHeader>
          <DialogTitle>Quick Log Call — {buyer.name}</DialogTitle>
          <DialogDescription>
            Log a call made outside the CRM (company Google Voice, office line, or mobile). Same disposition workflow as dialed calls.
          </DialogDescription>
        </DialogHeader>

        {isDnc ? (
          <div className="rounded-md border border-destructive/40 bg-destructive/10 p-2 text-xs text-destructive">
            This buyer is marked Do-Not-Contact. Logging is allowed for records only — do not contact them until an admin opts them back in.
          </div>
        ) : null}

        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>Direction</Label>
            <select
              className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
              value={direction}
              onChange={(e) => setDirection(e.target.value as "inbound" | "outbound")}
              data-testid="select-quick-log-direction"
            >
              <option value="outbound">Outbound</option>
              <option value="inbound">Inbound</option>
            </select>
          </div>
          <div>
            <Label>Call source</Label>
            <select
              className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
              value={provider}
              onChange={(e) => setProvider(e.target.value)}
              data-testid="select-quick-log-provider"
            >
              <option value="google_voice">Google Voice</option>
              <option value="office_line">Office line</option>
              <option value="mobile">Mobile</option>
              <option value="other">Other</option>
            </select>
          </div>
          <div>
            <Label>When</Label>
            <Input
              type="datetime-local"
              value={occurredAt}
              onChange={(e) => setOccurredAt(e.target.value)}
              data-testid="input-quick-log-when"
            />
          </div>
          <div>
            <Label>Duration (minutes, optional)</Label>
            <Input
              type="number"
              min="0"
              value={durationMinutes}
              onChange={(e) => setDurationMinutes(e.target.value)}
              placeholder="e.g. 7"
              data-testid="input-quick-log-duration"
            />
          </div>
        </div>

        <div>
          <Label>Disposition *</Label>
          <select
            className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
            value={disposition}
            onChange={(e) => setDisposition(e.target.value)}
            data-testid="select-quick-log-disposition"
          >
            <option value="">Select disposition</option>
            <optgroup label="Buyer outcomes">
              {BUYER_DISPOSITIONS.map((d) => (
                <option key={d} value={d}>{formatDisposition(d)}</option>
              ))}
            </optgroup>
            <optgroup label="Call outcomes">
              {SHARED_DISPOSITIONS.map((d) => (
                <option key={d} value={d}>{formatDisposition(d)}</option>
              ))}
            </optgroup>
          </select>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>Interest level</Label>
            <select
              className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
              value={interestLevel}
              onChange={(e) => setInterestLevel(e.target.value)}
              data-testid="select-quick-log-interest"
            >
              <option value="">Auto (from disposition)</option>
              <option value="hot">Hot</option>
              <option value="warm">Warm</option>
              <option value="cold">Cold</option>
              <option value="not_a_fit">Not a fit</option>
            </select>
          </div>
          <div className="flex items-end gap-2 pb-1">
            <Badge className={buyerStatusColor(buyer.buyerStatus)}>{formatBuyerStatus(buyer.buyerStatus)}</Badge>
            {buyer.interestLevel ? <Badge variant="secondary">{buyer.interestLevel}</Badge> : null}
          </div>
        </div>

        <div>
          <Label>Notes</Label>
          <Textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder={NOTE_TEMPLATE}
            rows={5}
            data-testid="textarea-quick-log-notes"
          />
        </div>

        {needsNextAction ? (
          <div className="grid gap-2 rounded-md border border-border p-3">
            <Label>Next action * (required for {formatDisposition(disposition)})</Label>
            <Input
              value={nextAction}
              onChange={(e) => setNextAction(e.target.value)}
              placeholder={disposition === "send_deal" ? "e.g. Email deal package + rent roll" : "What happens next?"}
              data-testid="input-quick-log-next-action"
            />
            <Label>Next-action date *</Label>
            <Input
              type="date"
              value={nextActionAt}
              onChange={(e) => setNextActionAt(e.target.value)}
              data-testid="input-quick-log-next-action-date"
            />
          </div>
        ) : null}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button
            onClick={() => logMutation.mutate()}
            disabled={!canSave || logMutation.isPending}
            data-testid="button-quick-log-save"
          >
            {logMutation.isPending ? "Saving…" : "Save Call Log"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
