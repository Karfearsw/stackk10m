import { LuxeStatusBadge, type LuxeStatusTone } from "./LuxeStatusBadge";
import { cn } from "@/lib/utils";
import { CheckCircle2, Clock, FileText, AlertTriangle } from "lucide-react";

export type LuxeDocState =
  | "draft" | "internal_review" | "attorney_review" | "ready" | "sent"
  | "opened" | "partially_signed" | "executed" | "declined" | "voided" | "expired";

const stateMeta: Record<LuxeDocState, { label: string; tone: LuxeStatusTone }> = {
  draft: { label: "Draft", tone: "neutral" },
  internal_review: { label: "Internal Review", tone: "info" },
  attorney_review: { label: "Attorney Review", tone: "oxblood" },
  ready: { label: "Ready to Send", tone: "gold" },
  sent: { label: "Sent", tone: "info" },
  opened: { label: "Opened", tone: "info" },
  partially_signed: { label: "Partially Signed", tone: "gold" },
  executed: { label: "Fully Executed", tone: "verified" },
  declined: { label: "Declined", tone: "oxblood" },
  voided: { label: "Voided", tone: "oxblood" },
  expired: { label: "Expired", tone: "oxblood" },
};

type LuxeDocumentStatusProps = {
  state: LuxeDocState;
  signersCompleted?: number;
  signersTotal?: number;
  className?: string;
};

/** Contract/document status: badge + signer progress. */
export function LuxeDocumentStatus({ state, signersCompleted, signersTotal, className }: LuxeDocumentStatusProps) {
  const meta = stateMeta[state] || stateMeta.draft;
  const Icon = state === "executed" ? CheckCircle2 : state === "declined" || state === "voided" || state === "expired" ? AlertTriangle : state === "draft" ? FileText : Clock;
  return (
    <div className={cn("flex items-center gap-2", className)}>
      <LuxeStatusBadge tone={meta.tone} dot>
        <Icon className="h-3 w-3" aria-hidden />
        {meta.label}
      </LuxeStatusBadge>
      {typeof signersCompleted === "number" && typeof signersTotal === "number" && (
        <span className="text-xs text-muted-foreground">
          {signersCompleted}/{signersTotal} signed
        </span>
      )}
    </div>
  );
}
