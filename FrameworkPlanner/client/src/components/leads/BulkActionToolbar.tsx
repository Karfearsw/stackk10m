import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function BulkActionToolbar({
  selectedCount,
  onAssign,
  onAddTags,
  onRemoveTags,
  onSetStatus,
  onExport,
  onArchive,
  onClear,
  className,
}: {
  selectedCount: number;
  onAssign: () => void;
  onAddTags: () => void;
  onRemoveTags: () => void;
  onSetStatus: () => void;
  onExport: () => void;
  onArchive: () => void;
  onClear: () => void;
  className?: string;
}) {
  if (!selectedCount) return null;
  return (
    <div className={cn("flex flex-wrap items-center justify-between gap-2 rounded-md border bg-card p-2", className)}>
      <div className="text-sm">
        <span className="font-medium">{selectedCount}</span> selected
      </div>
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="secondary" onClick={onAssign}>
          Assign
        </Button>
        <Button size="sm" variant="secondary" onClick={onAddTags}>
          Add tags
        </Button>
        <Button size="sm" variant="secondary" onClick={onRemoveTags}>
          Remove tags
        </Button>
        <Button size="sm" variant="secondary" onClick={onSetStatus}>
          Status
        </Button>
        <Button size="sm" variant="secondary" onClick={onExport}>
          Export
        </Button>
        <Button size="sm" variant="destructive" onClick={onArchive}>
          Archive
        </Button>
        <Button size="sm" variant="outline" onClick={onClear}>
          Clear
        </Button>
      </div>
    </div>
  );
}

