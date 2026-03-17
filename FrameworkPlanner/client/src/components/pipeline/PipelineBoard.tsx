import { ReactNode, useMemo } from "react";
import { PipelineColumn } from "./types";

type PipelineBoardProps<T> = {
  columns: PipelineColumn[];
  items: T[];
  getId: (item: T) => string | number;
  getStatus: (item: T) => string | null | undefined;
  renderItem: (item: T) => ReactNode;
  emptyText?: string;
};

export function PipelineBoard<T>({
  columns,
  items,
  getId,
  getStatus,
  renderItem,
  emptyText = "No items",
}: PipelineBoardProps<T>) {
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

  return (
    <div className="w-full overflow-x-auto">
      <div className="flex gap-4 min-w-max pb-2">
        {normalizedColumns.map((col) => {
          const colItems = grouped.get(col.value) || [];
          return (
            <div key={col.value} className="w-[320px] flex-shrink-0">
              <div className="flex items-center justify-between px-1">
                <div className="text-sm font-medium">{col.label}</div>
                <div className="text-xs text-muted-foreground">{colItems.length}</div>
              </div>
              <div className="mt-2 space-y-3">
                {colItems.length ? (
                  colItems.map((item) => (
                    <div key={String(getId(item))}>
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

