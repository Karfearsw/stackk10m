import type { ReactNode } from "react";
import { LuxeEmptyState } from "./LuxeEmptyState";
import { cn } from "@/lib/utils";

export type LuxeColumn<T> = {
  key: string;
  header: string;
  render: (row: T) => ReactNode;
  className?: string;
  hideOnMobile?: boolean;
};

type LuxeDataTableProps<T> = {
  columns: LuxeColumn<T>[];
  rows: T[];
  keyOf: (row: T, i: number) => string | number;
  emptyTitle?: string;
  emptyDescription?: string;
  onRowClick?: (row: T) => void;
  className?: string;
};

/**
 * Editorial data table: thin borders, generous row padding,
 * columns can hide on mobile (pair with LuxeMobileCard).
 */
export function LuxeDataTable<T>({ columns, rows, keyOf, emptyTitle, emptyDescription, onRowClick, className }: LuxeDataTableProps<T>) {
  if (!rows.length) {
    return <LuxeEmptyState title={emptyTitle || "Nothing here yet"} description={emptyDescription} />;
  }
  return (
    <div className={cn("overflow-x-auto rounded-lg border border-border/60", className)}>
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border/60 bg-muted/30">
            {columns.map((c) => (
              <th
                key={c.key}
                className={cn(
                  "px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground",
                  c.hideOnMobile && "hidden md:table-cell",
                  c.className,
                )}
              >
                {c.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr
              key={keyOf(row, i)}
              onClick={onRowClick ? () => onRowClick(row) : undefined}
              className={cn(
                "border-b border-border/40 last:border-0 transition-colors",
                onRowClick && "cursor-pointer hover:bg-muted/40",
              )}
            >
              {columns.map((c) => (
                <td
                  key={c.key}
                  className={cn("px-4 py-3.5 align-top", c.hideOnMobile && "hidden md:table-cell", c.className)}
                >
                  {c.render(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
