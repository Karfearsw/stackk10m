import { AlertTriangle, Loader2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Shared error state for query-driven pages.
 * Renders a friendly, safe message with an optional retry action
 * instead of silently showing an empty panel.
 */
export function QueryError({ message, onRetry }: { message?: string; onRetry?: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-10 text-center" role="alert" data-testid="query-error">
      <AlertTriangle className="h-8 w-8 text-destructive/70" />
      <div className="space-y-1">
        <p className="font-medium text-sm">Couldn't load this data</p>
        <p className="text-sm text-muted-foreground max-w-md">
          {message || "The server didn't respond as expected. Please try again."}
        </p>
      </div>
      {onRetry && (
        <Button variant="outline" size="sm" onClick={onRetry}>
          <RefreshCw className="h-4 w-4 mr-2" />
          Retry
        </Button>
      )}
    </div>
  );
}

export function QueryLoading({ label }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-2 py-10 text-muted-foreground" data-testid="query-loading">
      <Loader2 className="h-5 w-5 animate-spin" />
      <span className="text-sm">{label || "Loading…"}</span>
    </div>
  );
}
