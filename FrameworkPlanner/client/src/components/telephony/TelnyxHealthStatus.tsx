import { Button } from "@/components/ui/button";
import { mapTelnyxHealth, type TelnyxHealthResult, type HealthTone } from "@/lib/telnyxHealth";

const toneClasses: Record<HealthTone, string> = {
  ok: "bg-green-500/10 text-green-600 border-green-500/30",
  warn: "bg-yellow-500/10 text-yellow-600 border-yellow-500/30",
  error: "bg-red-500/10 text-red-600 border-red-500/30",
  muted: "bg-muted text-muted-foreground border-border",
};

export function TelnyxHealthStatus({
  health,
  loading,
  onRetry,
  compact,
}: {
  health: TelnyxHealthResult | null | undefined;
  loading?: boolean;
  onRetry?: () => void;
  compact?: boolean;
}) {
  const mapped = mapTelnyxHealth(health);
  if (loading && !health) {
    return <span className="text-xs text-muted-foreground">Telnyx: checking…</span>;
  }
  return (
    <div className="flex items-center gap-2 text-xs">
      <span className={`inline-flex items-center rounded-full border px-2 py-0.5 font-medium ${toneClasses[mapped.tone]}`}>{mapped.label}</span>
      {!compact ? <span className="text-muted-foreground">{mapped.detail}</span> : null}
      {onRetry ? (
        <Button variant="ghost" size="sm" className="h-6 px-2 text-xs" onClick={onRetry} aria-label="Re-check Telnyx health">
          Re-check
        </Button>
      ) : null}
    </div>
  );
}
