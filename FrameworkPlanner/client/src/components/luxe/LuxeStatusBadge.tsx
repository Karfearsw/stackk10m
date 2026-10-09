import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";

export type LuxeStatusTone = "gold" | "neutral" | "verified" | "oxblood" | "info";

const toneClasses: Record<LuxeStatusTone, string> = {
  gold: "border-primary/30 bg-primary/10 text-primary",
  neutral: "border-border bg-muted text-muted-foreground",
  verified: "border-verified/30 bg-verified/10 text-verified",
  oxblood: "border-oxblood/30 bg-oxblood/10 text-oxblood",
  info: "border-blue-500/30 bg-blue-500/10 text-blue-600 dark:text-blue-400",
};

type LuxeStatusBadgeProps = {
  tone?: LuxeStatusTone;
  children: React.ReactNode;
  className?: string;
  dot?: boolean;
};

/**
 * Semantic status badge. Tones are restrained by design:
 * gold = emphasis, verified = success, oxblood = genuine risk only.
 */
export function LuxeStatusBadge({ tone = "neutral", children, className, dot }: LuxeStatusBadgeProps) {
  return (
    <Badge
      variant="outline"
      className={cn("gap-1.5 font-medium", toneClasses[tone], className)}
    >
      {dot && <span className="h-1.5 w-1.5 rounded-full bg-current" aria-hidden />}
      {children}
    </Badge>
  );
}
