import { EntityActivity } from "@/components/activity/EntityActivity";
import { useDialerWorkspace } from "./DialerWorkspaceContext";

/** Recent activity for the current lead. */
export function ActivityWidget() {
  const { activeItem, buyerMode } = useDialerWorkspace();
  return (
    <div className="h-full overflow-auto rounded-lg border border-border bg-card">
      <div className="dialer-widget-drag-handle flex cursor-move items-center justify-between border-b border-border px-3 py-2">
        <span className="text-sm font-semibold">Activity</span>
      </div>
      <div className="p-3">
        {activeItem?.leadId && !buyerMode ? (
          <EntityActivity leadId={activeItem.leadId} />
        ) : (
          <div className="text-sm text-muted-foreground">Select a lead to see recent activity.</div>
        )}
      </div>
    </div>
  );
}
