import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";

type LuxeSectionProps = {
  title?: string;
  description?: string;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  contentClassName?: string;
};

/** Consistent content section: thin architectural border, generous padding. */
export function LuxeSection({ title, description, actions, children, className, contentClassName }: LuxeSectionProps) {
  return (
    <Card className={cn("border-border/60", className)}>
      {(title || actions) && (
        <CardHeader className="flex flex-row items-start justify-between gap-4 pb-4">
          <div>
            {title && <CardTitle className="font-serif text-lg tracking-tight">{title}</CardTitle>}
            {description && <CardDescription className="mt-1">{description}</CardDescription>}
          </div>
          {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
        </CardHeader>
      )}
      <CardContent className={cn("pt-0", contentClassName)}>{children}</CardContent>
    </Card>
  );
}
