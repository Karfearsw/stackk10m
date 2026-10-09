import { cn } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";

type LuxeMetricProps = {
  label: string;
  value: string | number;
  sub?: string;
  tone?: "default" | "gold" | "verified" | "oxblood";
  className?: string;
};

const toneText: Record<NonNullable<LuxeMetricProps["tone"]>, string> = {
  default: "text-foreground",
  gold: "text-primary",
  verified: "text-verified",
  oxblood: "text-oxblood",
};

/** Editorial metric tile: label above, large serif value, muted subcaption. */
export function LuxeMetric({ label, value, sub, tone = "default", className }: LuxeMetricProps) {
  return (
    <Card className={cn("border-border/60", className)}>
      <CardContent className="p-4 md:p-5">
        <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground">{label}</p>
        <p className={cn("mt-1 font-serif text-2xl md:text-3xl font-semibold tracking-tight", toneText[tone])}>
          {value}
        </p>
        {sub && <p className="mt-1 text-xs text-muted-foreground">{sub}</p>}
      </CardContent>
    </Card>
  );
}
