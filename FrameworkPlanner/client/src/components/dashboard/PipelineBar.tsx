import { Card, CardContent } from "@/components/ui/card";
import { useQuery } from "@tanstack/react-query";
import { Users, Handshake, FileText, CheckCircle2, Ban } from "lucide-react";
import { useLocation } from "wouter";
import { OPPORTUNITY_STAGE_GROUPS, normalizeStage } from "@shared/pipeline-stages";

/**
 * Ticket 7: the summary strip counts opportunities by their canonical pipeline
 * stage (`properties.stage`), grouped from shared/pipeline-stages.ts.
 *
 * It previously used an ad-hoc {lead, negotiation, contract, closed} vocabulary
 * and counted a mix of property status and contract documents, so stalled deals
 * were invisible and the counts disagreed with the deals board. Every canonical
 * stage now maps to exactly one bucket, and links use canonical stage ids.
 */

const GROUP_META: Record<
  string,
  { icon: typeof Users; textColor: string; bgColor: string; borderColor: string }
> = {
  lead: { icon: Users, textColor: "text-slate-600", bgColor: "bg-slate-50", borderColor: "border-slate-200" },
  negotiating: { icon: Handshake, textColor: "text-orange-600", bgColor: "bg-orange-50", borderColor: "border-orange-200" },
  under_contract: { icon: FileText, textColor: "text-amber-600", bgColor: "bg-amber-50", borderColor: "border-amber-200" },
  closed: { icon: CheckCircle2, textColor: "text-green-600", bgColor: "bg-green-50", borderColor: "border-green-200" },
  inactive: { icon: Ban, textColor: "text-zinc-600", bgColor: "bg-zinc-50", borderColor: "border-zinc-200" },
};

export function PipelineBar() {
  const [, setLocation] = useLocation();

  const { data: opportunities = [] } = useQuery<any[]>({
    queryKey: ["/api/opportunities"],
  });

  const countFor = (stages: readonly string[]) => {
    const set = new Set<string>(stages);
    return opportunities.filter((o: any) =>
      set.has(normalizeStage("opportunity", String(o?.stage ?? o?.status ?? ""))),
    ).length;
  };

  const groups = OPPORTUNITY_STAGE_GROUPS.map((g) => ({
    id: g.id,
    label: g.label,
    count: countFor(g.stages),
    meta: GROUP_META[g.id] ?? GROUP_META.lead,
    // The deals board reads `statusIn` and matches it against a canonical stage.
    href: `/opportunities?statusIn=${g.stages.join(",")}`,
  }));

  return (
    <div className="w-full mb-6" data-testid="pipeline-bar">
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        {groups.map((group) => (
          <button
            key={group.id}
            type="button"
            className="text-left"
            onClick={() => setLocation(group.href)}
          >
            <Card className={`border-l-4 ${group.meta.borderColor} shadow-sm hover:shadow-md transition-shadow`}>
              <CardContent className="p-4 flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-muted-foreground mb-1">{group.label}</p>
                  <p className={`text-2xl font-bold ${group.meta.textColor}`}>{group.count}</p>
                </div>
                <div className={`p-2 rounded-full ${group.meta.bgColor}`}>
                  <group.meta.icon className={`w-5 h-5 ${group.meta.textColor}`} />
                </div>
              </CardContent>
            </Card>
          </button>
        ))}
      </div>
    </div>
  );
}
