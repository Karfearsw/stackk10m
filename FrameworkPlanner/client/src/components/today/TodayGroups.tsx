import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { addDays } from "date-fns";
import { useMemo, useState } from "react";
import type { TodayQueueGroup, TodayQueueItem } from "./types";
import { TodayTaskRow } from "./TodayTaskRow";

export function TodayGroups(props: {
  title: string;
  groups: TodayQueueGroup[];
  disabled?: boolean;
  isManager?: boolean;
  onOpen: (item: TodayQueueItem) => void;
  onComplete: (id: number) => void;
  onReschedule: (id: number, dueAt: Date, reason: string | null) => void;
  onBulkComplete: (ids: number[]) => void;
  onBulkReschedule: (ids: number[], dueAt: Date, reason: string | null) => void;
}) {
  const total = useMemo(() => props.groups.reduce((sum, g) => sum + (g.count || 0), 0), [props.groups]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <div>{props.title}</div>
          <Badge variant="secondary">{total}</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent>
        {props.groups.length ? (
          <Accordion type="multiple" className="space-y-2">
            {props.groups.map((g) => (
              <GroupItem
                key={g.key}
                group={g}
                disabled={props.disabled}
                isManager={props.isManager}
                onOpen={props.onOpen}
                onComplete={props.onComplete}
                onReschedule={props.onReschedule}
                onBulkComplete={props.onBulkComplete}
                onBulkReschedule={props.onBulkReschedule}
              />
            ))}
          </Accordion>
        ) : (
          <div className="text-sm text-muted-foreground">Nothing here</div>
        )}
      </CardContent>
    </Card>
  );
}

function GroupItem(props: {
  group: TodayQueueGroup;
  disabled?: boolean;
  isManager?: boolean;
  onOpen: (item: TodayQueueItem) => void;
  onComplete: (id: number) => void;
  onReschedule: (id: number, dueAt: Date, reason: string | null) => void;
  onBulkComplete: (ids: number[]) => void;
  onBulkReschedule: (ids: number[], dueAt: Date, reason: string | null) => void;
}) {
  const ids = useMemo(() => props.group.items.map((t) => t.id), [props.group.items]);
  const blocked = useMemo(
    () => !props.isManager && props.group.items.some((t) => t.snoozeCount >= 5),
    [props.group.items, props.isManager],
  );
  const requireReason = useMemo(
    () => !props.isManager && props.group.items.some((t) => t.snoozeCount === 4),
    [props.group.items, props.isManager],
  );

  const [rescheduleDate, setRescheduleDate] = useState("");
  const [reason, setReason] = useState("");

  return (
    <AccordionItem value={props.group.key} className="rounded-md border border-border px-3">
      <div className="flex items-center justify-between gap-2 py-2">
        <AccordionTrigger className="flex-1 py-1">
          <div className="flex items-center gap-2">
            <div className="font-medium">{props.group.label}</div>
            <Badge variant="secondary">{props.group.count}</Badge>
          </div>
        </AccordionTrigger>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" disabled={props.disabled} onClick={() => props.onBulkComplete(ids)}>
            Complete all
          </Button>
          <Button size="sm" variant="outline" disabled={props.disabled || blocked} onClick={() => props.onBulkReschedule(ids, addDays(new Date(), 1), null)}>
            Tomorrow
          </Button>
          <Button size="sm" variant="outline" disabled={props.disabled || blocked} onClick={() => props.onBulkReschedule(ids, addDays(new Date(), 7), null)}>
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
                <DialogTitle>Reschedule group</DialogTitle>
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
                    props.onBulkReschedule(ids, d, requireReason ? reason.trim() : reason.trim() || null);
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
      <AccordionContent className="pb-3">
        <div className="space-y-3">
          {props.group.items.map((t) => (
            <TodayTaskRow
              key={t.id}
              item={t}
              disabled={props.disabled}
              isManager={props.isManager}
              onComplete={() => props.onComplete(t.id)}
              onOpen={() => props.onOpen(t)}
              onReschedule={(dueAt, reason) => props.onReschedule(t.id, dueAt, reason)}
            />
          ))}
        </div>
      </AccordionContent>
    </AccordionItem>
  );
}

