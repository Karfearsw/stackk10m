import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function XpAdminHeader({
  title,
  subtitle,
  right,
  className,
}: {
  title: string;
  subtitle?: string;
  right?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-wrap items-start justify-between gap-4", className)}>
      <div className="space-y-1">
        <div className="text-2xl font-semibold tracking-tight">{title}</div>
        {subtitle ? <div className="text-sm text-muted-foreground">{subtitle}</div> : null}
      </div>
      <div className="flex items-center gap-2">
        {right}
        <Button variant="secondary" size="sm" className="hidden sm:inline-flex">
          Orlando concierge
        </Button>
      </div>
    </div>
  );
}
