/**
 * PendingDocsBanner — shown on the agent dashboard when the logged-in user
 * has onboarding documents (Offer Letter, ICA, W-9) waiting for signature.
 */
import { useQuery } from "@tanstack/react-query";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { FileWarning } from "lucide-react";
import { useLocation } from "wouter";

const LABELS: Record<string, string> = {
  offer_letter: "Offer Letter",
  ica: "Independent Contractor Agreement",
  w9: "IRS Form W-9",
};

export function PendingDocsBanner() {
  const [, setLocation] = useLocation();
  const { data, isLoading } = useQuery({
    queryKey: ["onboarding-docs-pending-mine"],
    queryFn: async () => {
      const res = await fetch("/api/onboarding/docs/pending/mine", { credentials: "include" });
      if (!res.ok) return { pending: [] };
      return res.json();
    },
  });

  const pending: any[] = data?.pending ?? [];
  if (isLoading || pending.length === 0) return null;

  const names = pending.map((p) => LABELS[p.doc_type] ?? p.doc_type).join(", ");

  return (
    <Alert className="border-yellow-500 bg-yellow-500/10">
      <FileWarning className="h-4 w-4 text-yellow-600" />
      <AlertTitle>Onboarding documents need your signature</AlertTitle>
      <AlertDescription className="flex items-center justify-between gap-4">
        <span>{names} — complete these to unlock full onboarding.</span>
        <Button size="sm" onClick={() => setLocation("/settings/onboarding-docs")}>
          Review & Sign
        </Button>
      </AlertDescription>
    </Alert>
  );
}
