import { Card, CardContent } from "@/components/ui/card";
import { useQuery } from "@tanstack/react-query";
import { Users, Handshake, FileText, CheckCircle2 } from "lucide-react";
import { useLocation } from "wouter";

export function PipelineBar() {
  const [, setLocation] = useLocation();

  const { data: leadsResp } = useQuery<any>({
    queryKey: ['/api/leads?limit=1&statusIn=new,contacted'],
  });

  const { data: opportunities = [] } = useQuery<any[]>({
    queryKey: ['/api/opportunities'], // We will implement this endpoint shortly
  });

  const { data: contractDocuments = [] } = useQuery<any[]>({
    queryKey: ['/api/contract-documents'],
  });

  // Calculate counts for each stage
  const leadCount = Number(leadsResp?.total || 0);
  const negotiationCount = opportunities.filter((o: any) => o.status === 'active' || o.status === 'negotiation').length;
  const contractCount = contractDocuments.filter((c: any) => c.status === 'draft' || c.status === 'sent' || c.status === 'executed').length;
  const closedCount = contractDocuments.filter((c: any) => c.status === 'closed').length;

  const stages = [
    {
      id: "lead",
      label: "Lead",
      count: leadCount,
      icon: Users,
      color: "bg-blue-500",
      textColor: "text-blue-600",
      bgColor: "bg-blue-50",
      borderColor: "border-blue-200",
      href: "/leads?statusIn=new,contacted&sortKey=oldest_untouched&sortDir=asc",
    },
    {
      id: "negotiation",
      label: "Negotiation",
      count: negotiationCount,
      icon: Handshake,
      color: "bg-orange-500",
      textColor: "text-orange-600",
      bgColor: "bg-orange-50",
      borderColor: "border-orange-200",
      href: "/opportunities?statusIn=active,negotiation",
    },
    {
      id: "contract",
      label: "Contract",
      count: contractCount,
      icon: FileText,
      color: "bg-purple-500",
      textColor: "text-purple-600",
      bgColor: "bg-purple-50",
      borderColor: "border-purple-200",
      href: "/contracts?tab=list&statusIn=draft,sent,executed",
    },
    {
      id: "closed",
      label: "Closed",
      count: closedCount,
      icon: CheckCircle2,
      color: "bg-green-500",
      textColor: "text-green-600",
      bgColor: "bg-green-50",
      borderColor: "border-green-200",
      href: "/contracts?tab=list&status=closed",
    }
  ];

  return (
    <div className="w-full mb-6" data-testid="pipeline-bar">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {stages.map((stage) => (
          <button
            key={stage.id}
            type="button"
            className="text-left"
            onClick={() => setLocation(stage.href)}
          >
            <Card className={`border-l-4 ${stage.borderColor} shadow-sm hover:shadow-md transition-shadow`}>
              <CardContent className="p-4 flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-muted-foreground mb-1">{stage.label}</p>
                  <p className={`text-2xl font-bold ${stage.textColor}`}>{stage.count}</p>
                </div>
                <div className={`p-2 rounded-full ${stage.bgColor}`}>
                  <stage.icon className={`w-5 h-5 ${stage.textColor}`} />
                </div>
              </CardContent>
            </Card>
          </button>
        ))}
      </div>
    </div>
  );
}
