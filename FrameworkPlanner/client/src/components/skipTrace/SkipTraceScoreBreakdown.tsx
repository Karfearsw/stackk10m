import { useMemo } from "react";
import { Badge } from "@/components/ui/badge";
import {
  buildScoreBreakdown,
  classifyProviderResult,
  summarizeScoreRows,
  type ProviderResultInfo,
  type ScoreBreakdownRow,
} from "@/lib/lead-score";

function stateTone(row: ScoreBreakdownRow): string {
  if (row.state === "scored") return "border-emerald-500/20 bg-emerald-500/5";
  if (row.state === "no_signal") return "border-muted";
  return "border-dashed border-muted";
}

function pointsTone(row: ScoreBreakdownRow): string {
  if (row.state === "scored" && row.points > 0) return "bg-emerald-500/10 text-emerald-700 border-emerald-500/20";
  return "bg-muted text-muted-foreground border-muted";
}

function providerStateTone(state: ProviderResultInfo["state"]): string {
  switch (state) {
    case "hit":
      return "bg-emerald-500/10 text-emerald-700 border-emerald-500/20";
    case "partial":
      return "bg-amber-500/10 text-amber-800 border-amber-500/20";
    case "no_hit":
      return "bg-slate-500/10 text-slate-700 border-slate-500/20";
    case "rate_limited":
      return "bg-orange-500/10 text-orange-700 border-orange-500/20";
    case "failed":
      return "bg-red-500/10 text-red-700 border-red-500/20";
    case "pending":
      return "bg-blue-500/10 text-blue-700 border-blue-500/20";
    default:
      return "bg-muted text-muted-foreground border-muted";
  }
}

export function SkipTraceProviderState({ result, className }: { result: any | null; className?: string }) {
  const info = useMemo(() => classifyProviderResult(result), [result]);
  return (
    <div className={`rounded-md border p-3 ${className || ""}`}>
      <div className="flex items-center justify-between gap-2">
        <div className="text-xs text-muted-foreground">Provider result</div>
        <Badge variant="outline" className={providerStateTone(info.state)} data-testid="skip-trace-provider-state">
          {info.label}
        </Badge>
      </div>
      <p className="mt-1 text-sm" data-testid="skip-trace-provider-detail">
        {info.detail}
      </p>
      <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
        {info.providerName ? <span>Provider: {info.providerName}</span> : null}
        {info.completedAt ? <span>Completed: {new Date(info.completedAt).toLocaleString()}</span> : null}
        {info.costCents !== null ? <span>Cost: ${(info.costCents / 100).toFixed(2)}</span> : null}
        {info.state === "none" ? <span>No lookup has run yet for this record.</span> : null}
      </div>
    </div>
  );
}

export function SkipTraceScoreBreakdown({
  scoreTotal,
  confidence,
  urgencyTier,
  factorsJson,
  evidence,
  className,
}: {
  scoreTotal: number | null;
  confidence: string | null;
  urgencyTier: string | null;
  factorsJson?: unknown;
  evidence?: unknown[];
  className?: string;
}) {
  const rows = useMemo(() => buildScoreBreakdown({ factorsJson, evidence }), [factorsJson, evidence]);
  const scored = rows.filter((r) => r.state === "scored" && r.points > 0);
  const unavailable = rows.filter((r) => r.state === "unavailable");
  const summary = useMemo(() => summarizeScoreRows(rows), [rows]);

  const confidenceTone = (c: string) => {
    const v = c.toLowerCase();
    if (v === "high") return "bg-emerald-500/10 text-emerald-700 border-emerald-500/20";
    if (v === "medium") return "bg-amber-500/10 text-amber-800 border-amber-500/20";
    if (v === "low") return "bg-red-500/10 text-red-700 border-red-500/20";
    return "bg-muted";
  };

  return (
    <div className={className}>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="rounded-md bg-muted/20 p-3">
          <div className="text-xs text-muted-foreground">Total</div>
          <div className="mt-1 text-2xl font-semibold" data-testid="score-total">
            {scoreTotal === null ? "---" : scoreTotal}
          </div>
          <div className="text-xs text-muted-foreground">0-100</div>
        </div>
        <div className="rounded-md bg-muted/20 p-3">
          <div className="text-xs text-muted-foreground">Urgency</div>
          <div className="mt-1 text-lg font-semibold capitalize" data-testid="score-urgency">
            {urgencyTier || "---"}
          </div>
        </div>
        <div className="rounded-md bg-muted/20 p-3">
          <div className="text-xs text-muted-foreground">Confidence</div>
          <div className="mt-1">
            {confidence ? (
              <Badge variant="outline" className={confidenceTone(confidence)}>
                {confidence}
              </Badge>
            ) : (
              <span className="text-lg font-semibold">---</span>
            )}
          </div>
        </div>
      </div>

      {summary ? (
        <p className="mt-3 text-sm text-muted-foreground" data-testid="score-summary">
          {summary}
        </p>
      ) : null}

      <div className="mt-3 space-y-1.5">
        <div className="flex items-center justify-between">
          <div className="text-xs text-muted-foreground">Score breakdown</div>
          <div className="text-[11px] text-muted-foreground">
            {scored.length} factor{scored.length === 1 ? "" : "s"} counted · {unavailable.length} unavailable
          </div>
        </div>
        {rows.map((row) => (
          <div key={row.key} className={`rounded-md border p-2.5 ${stateTone(row)}`} data-testid={`factor-${row.key}`}>
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium">{row.label}</span>
                  <Badge variant="outline" className="text-[10px] px-1.5 py-0 capitalize">
                    {row.categoryLabel}
                  </Badge>
                  {row.state === "scored" && row.points > 0 ? (
                    <Badge variant="outline" className={pointsTone(row)}>
                      +{row.points}
                    </Badge>
                  ) : null}
                </div>
                <div className="mt-0.5 text-xs text-muted-foreground">{row.why}</div>
              </div>
              <div className="shrink-0 text-right">
                <div className="text-sm" data-testid={`factor-value-${row.key}`}>
                  {row.valueText}
                </div>
                {row.state === "unavailable" ? (
                  <div className="text-[11px] text-muted-foreground">unavailable · not scored</div>
                ) : row.state === "no_signal" ? (
                  <div className="text-[11px] text-muted-foreground">on file · no positive signal</div>
                ) : null}
              </div>
            </div>
            <div className="mt-1.5 text-xs">
              {row.evidence.length ? (
                <div className="space-y-1" data-testid={`factor-evidence-${row.key}`}>
                  {row.evidence.map((ev, i) => (
                    <div key={i} className="flex items-center gap-2 text-muted-foreground">
                      <span className="font-medium capitalize">{ev.sourceType}</span>
                      {ev.notes ? <span className="truncate">{ev.notes}</span> : null}
                      {ev.sourceUrl ? (
                        <a className="underline underline-offset-2 shrink-0" href={ev.sourceUrl} target="_blank" rel="noreferrer">
                          source
                        </a>
                      ) : null}
                    </div>
                  ))}
                </div>
              ) : row.state === "scored" ? (
                <span className="text-muted-foreground">Reason derived from record/tag data on file.</span>
              ) : (
                <span className="text-muted-foreground">No evidence on file - not counted toward the score.</span>
              )}
            </div>
          </div>
        ))}
      </div>

      <p className="mt-3 text-[11px] text-muted-foreground">
        Scoring rule: points are only awarded when data is on file. Missing or absent data is never counted as positive
        evidence. This score is an internal prioritization aid, not a legal or credit determination.
      </p>
    </div>
  );
}
