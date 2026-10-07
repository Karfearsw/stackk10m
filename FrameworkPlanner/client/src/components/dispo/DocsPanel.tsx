import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { FileText, PenLine } from "lucide-react";

interface ContractTemplate {
  id: number;
  name: string;
  category: string | null;
  status: string | null;
  version: number | null;
}

interface EnvelopeInfo {
  dealId: number;
  envelope: null;
  envelopeStatus: string;
  message: string;
}

export function DocsPanel({ dealId }: { dealId: number }) {
  const { data: templatesData, isLoading: templatesLoading } = useQuery<{
    templates: ContractTemplate[];
  }>({
    queryKey: ["disposition-templates"],
    queryFn: async () => {
      const res = await fetch("/api/disposition/templates", {
        credentials: "include",
      });
      if (!res.ok) throw new Error(`templates failed: ${res.status}`);
      return res.json();
    },
  });

  const { data: envelopeData, isLoading: envelopeLoading } = useQuery<EnvelopeInfo>({
    queryKey: ["disposition-envelope", dealId],
    queryFn: async () => {
      const res = await fetch(`/api/disposition/deals/${dealId}/envelope`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error(`envelope failed: ${res.status}`);
      return res.json();
    },
  });

  const assignmentTemplates = (templatesData?.templates ?? []).filter(
    (t) => (t.category ?? "").toLowerCase().includes("assign"),
  );
  const otherTemplates = (templatesData?.templates ?? []).filter(
    (t) => !(t.category ?? "").toLowerCase().includes("assign"),
  );

  return (
    <div className="space-y-4">
      <div>
        <div className="mb-2 text-sm font-medium">E-sign envelope</div>
        {envelopeLoading ? (
          <Skeleton className="h-16 w-full" />
        ) : (
          <div className="flex items-start gap-3 rounded-lg border border-border/60 p-3">
            <PenLine className="mt-0.5 h-4 w-4 shrink-0 text-[#D4AF37]" />
            <div className="text-sm">
              <div className="flex items-center gap-2">
                <span className="font-medium">No envelope yet</span>
                <Badge variant="outline">
                  {envelopeData?.envelopeStatus ?? "not_started"}
                </Badge>
              </div>
              <div className="mt-1 text-xs text-muted-foreground">
                {envelopeData?.message ??
                  "E-sign is being built in parallel."}
              </div>
            </div>
          </div>
        )}
      </div>

      <div>
        <div className="mb-2 text-sm font-medium">
          Assignment agreement templates
        </div>
        {templatesLoading ? (
          <div className="space-y-2">
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
          </div>
        ) : assignmentTemplates.length === 0 ? (
          <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
            No assignment templates yet. Create one under Contracts →
            Templates with an “assignment” category.
          </div>
        ) : (
          <div className="space-y-2">
            {assignmentTemplates.map((t) => (
              <div
                key={t.id}
                className="flex items-center justify-between gap-2 rounded-lg border border-border/60 p-3"
              >
                <div className="flex items-center gap-2">
                  <FileText className="h-4 w-4 text-[#D4AF37]" />
                  <div>
                    <div className="text-sm font-medium">{t.name}</div>
                    <div className="text-[11px] text-muted-foreground">
                      {t.status ?? "draft"}
                      {t.version ? ` · v${t.version}` : ""}
                    </div>
                  </div>
                </div>
                <Button size="sm" variant="outline" disabled title="Wires to the e-sign module when it lands">
                  Generate
                </Button>
              </div>
            ))}
          </div>
        )}
      </div>

      {otherTemplates.length > 0 && (
        <div>
          <div className="mb-2 text-sm font-medium">Other templates</div>
          <div className="space-y-2">
            {otherTemplates.slice(0, 5).map((t) => (
              <div
                key={t.id}
                className="flex items-center gap-2 rounded-lg border border-border/60 p-3 text-sm"
              >
                <FileText className="h-4 w-4 text-muted-foreground" />
                <span className="font-medium">{t.name}</span>
                {t.category && (
                  <Badge variant="outline" className="text-[10px]">
                    {t.category}
                  </Badge>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
