import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export type LuxeTimelineItem = {
  id: string | number;
  title: string;
  description?: string;
  time?: string;
  icon?: ReactNode;
  tone?: "default" | "gold" | "verified" | "oxblood";
};

const toneDot: Record<NonNullable<LuxeTimelineItem["tone"]>, string> = {
  default: "bg-muted-foreground/40",
  gold: "bg-primary",
  verified: "bg-verified",
  oxblood: "bg-oxblood",
};

/** Vertical activity timeline with restrained tone dots. */
export function LuxeTimeline({ items, className }: { items: LuxeTimelineItem[]; className?: string }) {
  return (
    <ol className={cn("relative space-y-5", className)}>
      {items.map((item, i) => (
        <li key={item.id} className="relative flex gap-3.5">
          {i < items.length - 1 && (
            <span className="absolute left-[7px] top-5 h-[calc(100%-8px)] w-px bg-border" aria-hidden />
          )}
          <span className={cn("mt-1 h-3.5 w-3.5 shrink-0 rounded-full ring-4 ring-background", toneDot[item.tone || "default"])} aria-hidden />
          <div className="min-w-0 flex-1">
            <div className="flex items-baseline justify-between gap-2">
              <p className="text-sm font-medium">{item.title}</p>
              {item.time && <span className="shrink-0 text-xs text-muted-foreground">{item.time}</span>}
            </div>
            {item.description && <p className="mt-0.5 text-sm text-muted-foreground">{item.description}</p>}
            {item.icon}
          </div>
        </li>
      ))}
    </ol>
  );
}
