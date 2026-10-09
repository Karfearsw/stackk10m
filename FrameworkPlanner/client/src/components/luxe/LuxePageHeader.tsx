import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type LuxePageHeaderProps = {
  eyebrow?: string;
  title: string;
  description?: string;
  actions?: ReactNode;
  className?: string;
};

/**
 * Editorial page header: small gold eyebrow, serif title, muted description,
 * actions right-aligned. Used on every authenticated page.
 */
export function LuxePageHeader({ eyebrow, title, description, actions, className }: LuxePageHeaderProps) {
  return (
    <div className={cn("flex flex-wrap items-start justify-between gap-4", className)}>
      <div className="min-w-0">
        {eyebrow && (
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-primary">{eyebrow}</p>
        )}
        <h1 className="mt-1 font-serif text-2xl md:text-3xl font-semibold tracking-tight">{title}</h1>
        {description && (
          <p className="mt-1.5 max-w-2xl text-sm text-muted-foreground">{description}</p>
        )}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function LuxeHeaderAction(props: React.ComponentProps<typeof Button>) {
  return <Button {...props} className={cn("h-9", props.className)} />;
}
