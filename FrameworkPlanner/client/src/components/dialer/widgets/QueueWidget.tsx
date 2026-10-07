import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useDialerWorkspace } from "./DialerWorkspaceContext";

/** Queue — extracted verbatim from the old dialer-workspace page. */
export function QueueWidget() {
  const { state, setListId, loadQueue, queueLoading, next, status, callId, logSaved, saveLogPending, setQueue, setActiveIndex } = useDialerWorkspace();
  return (
    <div className="h-full overflow-auto rounded-lg border border-border bg-card">
      <div className="dialer-widget-drag-handle flex cursor-move items-center justify-between border-b border-border px-3 py-2">
        <span className="text-sm font-semibold">Queue</span>
      </div>
      <div className="space-y-3 p-3">
        <div className="flex flex-wrap gap-2">
          <Button variant={state.listId === "new" ? "default" : "outline"} onClick={() => { setListId("new"); loadQueue("new"); }}>
            New
          </Button>
          <Button
            variant={state.listId === "followups_due" ? "default" : "outline"}
            onClick={() => { setListId("followups_due"); loadQueue("followups_due"); }}
          >
            Follow-ups
          </Button>
          <Button variant={state.listId === "all_callable" ? "default" : "outline"} onClick={() => { setListId("all_callable"); loadQueue("all_callable"); }}>
            All
          </Button>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button
            variant="secondary"
            onClick={() => loadQueue(state.listId)}
          >
            {queueLoading ? "Loading…" : "Start Session"}
          </Button>
          <Button
            variant="outline"
            onClick={next}
            disabled={
              !state.queue.length ||
              status === "dialing" ||
              status === "ringing" ||
              status === "connected" ||
              (callId && !logSaved) ||
              saveLogPending
            }
          >
            Next
          </Button>
        </div>

        <div className="text-xs text-muted-foreground" data-testid="queue-count">
          {state.queue.length ? `${state.queue.length} lead${state.queue.length === 1 ? "" : "s"} loaded · ${state.listId === "new" ? "New" : state.listId === "followups_due" ? "Follow-ups due" : "All callable"}` : "Pick New / Follow-ups / All to load a queue"}
        </div>
        <ScrollArea className="max-h-[40vh] sm:max-h-[50vh] lg:max-h-[60vh] min-h-[10rem] border rounded-md p-2">
          {!state.queue.length ? (
            <div className="text-sm text-muted-foreground">{queueLoading ? "Loading queue…" : "No leads in this queue — try another filter"}</div>
          ) : (
            <div className="space-y-2">
              {state.queue.map((item, idx) => {
                const isActive = idx === state.activeIndex;
                return (
                  <div key={item.leadId} className={`rounded-md border p-2 ${isActive ? "border-primary bg-primary/10" : "border-border hover:bg-muted/40"}`}>
                    <button
                      className="w-full text-left"
                      onClick={() => setActiveIndex(idx)}
                    >
                      <div className="text-sm font-medium truncate">{item.ownerName}</div>
                      <div className="text-xs text-muted-foreground truncate">{item.address}</div>
                      <div className="text-xs text-muted-foreground truncate">{item.ownerPhone}</div>
                    </button>
                    <button
                      className="mt-1 text-[11px] text-muted-foreground hover:text-destructive underline underline-offset-2"
                      title="Remove this lead from the session queue"
                      aria-label={`Remove ${item.ownerName || "lead"} from queue`}
                      data-testid={`queue-remove-${item.leadId}`}
                      onClick={() => {
                        // M41: minimal queue management — remove a lead from
                        // this session's queue without deleting the lead.
                        const nextQueue = state.queue.filter((_: any, i: number) => i !== idx);
                        setQueue(nextQueue);
                        if (state.activeIndex >= nextQueue.length) {
                          setActiveIndex(Math.max(0, nextQueue.length - 1));
                        }
                      }}
                    >
                      Remove from queue
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </ScrollArea>
      </div>
    </div>
  );
}
