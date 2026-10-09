import { cn } from "@/lib/utils";

type LuxeMatchScoreProps = {
  score: number;
  size?: "sm" | "md" | "lg";
  showLabel?: boolean;
  className?: string;
};

function ringColor(score: number): string {
  if (score >= 70) return "text-primary";
  if (score >= 40) return "text-muted-foreground";
  return "text-muted-foreground/60";
}

/**
 * Match score ring — editorial, not gamified. No neon, no animation loops.
 * Detailed breakdowns live in the match explanation panel (Phase 12).
 */
export function LuxeMatchScore({ score, size = "md", showLabel, className }: LuxeMatchScoreProps) {
  const dims = { sm: "h-10 w-10", md: "h-14 w-14", lg: "h-20 w-20" }[size];
  const text = { sm: "text-xs", md: "text-sm", lg: "text-lg" }[size];
  const r = 26;
  const c = 2 * Math.PI * r;
  const clamped = Math.max(0, Math.min(100, Math.round(score)));
  return (
    <div className={cn("flex flex-col items-center gap-1", className)}>
      <div className={cn("relative", dims)} role="img" aria-label={`Match score ${clamped} out of 100`}>
        <svg viewBox="0 0 64 64" className="h-full w-full -rotate-90">
          <circle cx="32" cy="32" r={r} fill="none" stroke="currentColor" strokeOpacity="0.12" strokeWidth="6" className="text-foreground" />
          <circle
            cx="32" cy="32" r={r} fill="none" stroke="currentColor" strokeWidth="6"
            strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c - (c * clamped) / 100}
            className={ringColor(clamped)}
          />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <span className={cn("font-serif font-semibold", text)}>{clamped}</span>
        </div>
      </div>
      {showLabel && <span className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground">Match</span>}
    </div>
  );
}
