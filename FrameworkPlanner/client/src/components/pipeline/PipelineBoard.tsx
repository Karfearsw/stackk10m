import { ReactNode, useMemo, useState } from "react";
import { PipelineColumn } from "./types";

type PipelineBoardProps<T> = {
  columns: PipelineColumn[];
  items: T[];
  getId: (item: T) => string | number;
  getStatus: (item: T) => string | null | undefined;
  renderItem: (item: T) => ReactNode;
  emptyText?: string;
  /** M37: when provided, cards can be dragged between stage columns. */
  onMoveItem?: (item: T, newStatus: string) => void;
};

export function PipelineBoard<T>({
  columns,
  items,
  getId,
  getStatus,
  renderItem,
  emptyText = "No items",
  onMoveItem,
}: PipelineBoardProps<T>) {
  const [dragOverColumn, setDragOverColumn] = useState<string | null>(null);

  const { normalizedColumns, grouped } = useMemo(() => {
    const base = (columns || []).filter((c) => c?.value && c?.label);
    const byValue = new Map<string, PipelineColumn>();
    for (const c of base) byValue.set(String(c.value), { value: String(c.value), label: String(c.label) });

    const initialGrouped = new Map<string, T[]>();
    for (const c of byValue.values()) initialGrouped.set(c.value, []);

    const other: T[] = [];
    for (const item of items || []) {
      const status = String(getStatus(item) || "").trim();
      if (!status || !byValue.has(status)) other.push(item);
      else initialGrouped.get(status)!.push(item);
    }

    const normalizedColumns = [...byValue.values()];
    if (other.length) normalizedColumns.push({ value: "__other__", label: "Other" });
    if (other.length) initialGrouped.set("__other__", other);

    return { normalizedColumns, grouped: initialGrouped };
  }, [columns, getStatus, items]);

  if (!normalizedColumns.length) {
    return <div className="text-sm text-muted-foreground">{emptyText}</div>;
  }

  const canDrag = typeof onMoveItem === "function";

  return (
    <div className="w-full overflow-x-auto">
      <div className="flex gap-4 min-w-max pb-2">
        {normalizedColumns.map((col) => {
          const colItems = grouped.get(col.value) || [];
          const isOther = col.value === "__other__";
          const droppable = canDrag && !isOther;
          return (
            <div
              key={col.value}
              className={`w-[320px] flex-shrink-0 rounded-md transition-colors ${
                droppable && dragOverColumn === col.value ? "bg-primary/5 outline outline-1 outline-dashed outline-primary/40" : ""
              }`}
              onDragOver={(e) => {
                if (!droppable) return;
                e.preventDefault();
                e.dataTransfer.dropEffect = "move";
                setDragOverColumn(col.value);
              }}
              onDragLeave={(e) => {
                if (!droppable) return;
                if (e.currentTarget.contains(e.relatedTarget as Node)) return;
                setDragOverColumn((c) => (c === col.value ? null : c));
              }}
              onDrop={(e) => {
                if (!droppable) return;
                e.preventDefault();
                setDragOverColumn(null);
                const rawId = e.dataTransfer.getData("text/plain");
                if (!rawId) return;
                const moved = (items || []).find((it) => String(getId(it)) === rawId);
                if (!moved) return;
                if (String(getStatus(moved) || "") === col.value) return;
                onMoveItem?.(moved, col.value);
              }}
            >
              <div className="flex items-center justify-between px-1">
                <div className="text-sm font-medium">{col.label}</div>
                <div className="text-xs text-muted-foreground">{colItems.length}</div>
              </div>
              <div className="mt-2 space-y-3">
                {colItems.length ? (
                  colItems.map((item) => (
                    <div
                      key={String(getId(item))}
                      draggable={canDrag}
                      onDragStart={(e) => {
                        if (!canDrag) return;
                        e.dataTransfer.setData("text/plain", String(getId(item)));
                        e.dataTransfer.effectAllowed = "move";
                      }}
                      className={canDrag ? "cursor-grab active:cursor-grabbing" : undefined}
                    >
                      {renderItem(item)}
                    </div>
                  ))
                ) : (
                  <div className="text-xs text-muted-foreground px-1 py-3">{emptyText}</div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
