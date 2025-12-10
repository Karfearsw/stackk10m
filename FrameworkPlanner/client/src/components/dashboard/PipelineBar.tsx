import { Card, CardContent } from "@/components/ui/card";
import { useQuery } from "@tanstack/react-query";
import { Users, Handshake, FileText, CheckCircle2 } from "lucide-react";

export function PipelineBar() {
  const { data: leads = [] } = useQuery<any[]>({
    queryKey: ['/api/leads'],
  });

  const { data: opportunities = [] } = useQuery<any[]>({
    queryKey: ['/api/opportunities'], // We will implement this endpoint shortly
  });

  const { data: contracts = [] } = useQuery<any[]>({
    queryKey: ['/api/contracts'],
  });

  // Calculate counts for each stage
  const leadCount = leads.filter(l => l.status === 'new' || l.status === 'contacted').length;
  const negotiationCount = opportunities.filter(o => o.status === 'active' || o.status === 'negotiation').length;
  const contractCount = contracts.filter(c => c.status === 'pending').length;
  const closedCount = contracts.filter(c => c.status === 'closed').length;

  const stages = [
    {
      id: "lead",
      label: "Lead",
      count: leadCount,
      icon: Users,
      color: "bg-blue-500",
      textColor: "text-blue-600",
      bgColor: "bg-blue-50",
      borderColor: "border-blue-200"
    },
    {
      id: "negotiation",
      label: "Negotiation",
      count: negotiationCount,
      icon: Handshake,
      color: "bg-orange-500",
      textColor: "text-orange-600",
      bgColor: "bg-orange-50",
      borderColor: "border-orange-200"
    },
    {
      id: "contract",
      label: "Contract",
      count: contractCount,
      icon: FileText,
      color: "bg-purple-500",
      textColor: "text-purple-600",
      bgColor: "bg-purple-50",
      borderColor: "border-purple-200"
    },
    {
      id: "closed",
      label: "Closed",
      count: closedCount,
      icon: CheckCircle2,
      color: "bg-green-500",
      textColor: "text-green-600",
      bgColor: "bg-green-50",
      borderColor: "border-green-200"
    }
  ];

  return (
    <div className="w-full mb-6" data-testid="pipeline-bar">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {stages.map((stage, index) => (
          <Card key={stage.id} className={`border-l-4 ${stage.borderColor} shadow-sm hover:shadow-md transition-shadow`}>
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
        ))}
      </div>
    </div>
  );
}
