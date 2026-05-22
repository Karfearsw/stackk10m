import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { addDays, format } from "date-fns";
import { useRef, useState } from "react";
import type { TodayQueueItem } from "./types";

function formatTime(dueAt: string | null) {
  if (!dueAt) return "";
  try {
    return format(new Date(dueAt), "p");
  } catch {
    return "";
  }
}

function daysAgo(iso: string | null) {
  if (!iso) return null;
  const ts = new Date(iso).getTime();
  if (!Number.isFinite(ts)) return null;
  const d = Math.floor((Date.now() - ts) / (24 * 60 * 60 * 1000));
  return d >= 0 ? d : null;
}

export function TodayTaskRow(props: {
  item: TodayQueueItem;
  disabled?: boolean;
  isManager?: boolean;
  onComplete: () => void;
  onOpen: () => void;
  onReschedule: (dueAt: Date, reason: string | null) => void;
}) {
  const blocked = !props.isManager && props.item.snoozeCount >= 5;
  const requireReason = !props.isManager && props.item.snoozeCount === 4;

  const startX = useRef<number | null>(null);
  const [dx, setDx] = useState(0);

  const onTouchStart = (e: React.TouchEvent) => {
    if (props.disabled) return;
    startX.current = e.touches[0]?.clientX ?? null;
    setDx(0);
  };
  const onTouchMove = (e: React.TouchEvent) => {
    if (props.disabled) return;
    if (startX.current === null) return;
    const x = e.touches[0]?.clientX ?? startX.current;
    const delta = x - startX.current;
    setDx(Math.max(0, Math.min(140, delta)));
  };
  const onTouchEnd = () => {
    if (props.disabled) return;
    if (dx > 90) props.onComplete();
    startX.current = null;
    setDx(0);
  };

  const [rescheduleDate, setRescheduleDate] = useState("");
  const [reason, setReason] = useState("");

  const source = props.item.lead?.source || props.item.opportunity?.leadSource || props.item.opportunity?.leadSourceDetail || null;
  const zip = props.item.lead?.zipCode || props.item.opportunity?.zipCode || null;
  const lastTouchDays = daysAgo(props.item.lead?.lastTouchAt || null);

  return (
    <div className="space-y-2">
      <div className="relative overflow-hidden rounded-md border border-border">
        <div className="absolute inset-0 flex items-center justify-end bg-primary/10 pr-4">
          <div className="text-sm font-semibold text-primary">Complete</div>
        </div>
        <button
          type="button"
          disabled={props.disabled}
          onClick={props.onOpen}
          onTouchStart={onTouchStart}
          onTouchMove={onTouchMove}
          onTouchEnd={onTouchEnd}
          className="relative w-full bg-background p-3 text-left transition-transform disabled:opacity-60 disabled:pointer-events-none"
          style={{ transform: `translateX(${dx}px)` }}
        >
          <div className="flex items-center justify-between gap-2">
            <div className="font-medium truncate">{props.item.title}</div>
            <div className="text-xs text-muted-foreground">{formatTime(props.item.dueAt)}</div>
          </div>
          {props.item.description ? <div className="text-xs text-muted-foreground mt-1 line-clamp-1">{props.item.description}</div> : null}
        </button>
      </div>

      <div className="flex flex-wrap gap-2">
        {props.item.buckets.overdue ? <Badge variant="destructive">Overdue</Badge> : null}
        {props.item.buckets.dueToday ? <Badge variant="secondary">Due today</Badge> : null}
        {props.item.assignee?.label ? <Badge variant="outline">{props.item.assignee.label}</Badge> : null}
        {typeof props.item.lead?.relasScore === "number" ? <Badge variant="outline">Score {props.item.lead.relasScore}</Badge> : null}
        {props.item.opportunity?.status ? <Badge variant="outline">{props.item.opportunity.status}</Badge> : null}
        {props.item.lead?.status ? <Badge variant="outline">{props.item.lead.status}</Badge> : null}
        {source ? <Badge variant="outline">{source}</Badge> : null}
        {zip ? <Badge variant="outline">{zip}</Badge> : null}
        {typeof lastTouchDays === "number" ? <Badge variant="outline">Last touch {lastTouchDays}d</Badge> : null}
        {props.item.snoozeCount > 0 ? <Badge variant={blocked ? "destructive" : "outline"}>{blocked ? "Locked" : `Snoozed ${props.item.snoozeCount}x`}</Badge> : null}
      </div>

      <div className="flex flex-wrap gap-2">
        <Button
          size="sm"
          variant="outline"
          disabled={props.disabled || blocked}
          onClick={() => props.onReschedule(addDays(new Date(), 1), null)}
        >
          Tomorrow
        </Button>
        <Button
          size="sm"
          variant="outline"
          disabled={props.disabled || blocked}
          onClick={() => props.onReschedule(addDays(new Date(), 7), null)}
        >
          Next week
        </Button>
        <Dialog>
          <DialogTrigger asChild>
            <Button size="sm" variant="outline" disabled={props.disabled || blocked}>
              Pick date
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Reschedule</DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              <Input type="date" value={rescheduleDate} onChange={(e) => setRescheduleDate(e.target.value)} />
              {requireReason ? <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason (required)" /> : null}
            </div>
            <DialogFooter>
              <Button
                disabled={!rescheduleDate || props.disabled || (requireReason && !reason.trim())}
                onClick={() => {
                  const d = rescheduleDate ? new Date(`${rescheduleDate}T09:00:00`) : null;
                  if (!d) return;
                  props.onReschedule(d, requireReason ? reason.trim() : reason.trim() || null);
                  setRescheduleDate("");
                  setReason("");
                }}
              >
                Save
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}

