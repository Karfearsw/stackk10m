import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Layout } from "@/components/layout/Layout";
import { ArrowUpRight, DollarSign, Users, Briefcase, Activity, User, Building2, FileText, Clock, Trash2 } from "lucide-react";
import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis, YAxis, CartesianGrid } from "recharts";
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { MotivationalBanner } from "@/components/dashboard/MotivationalBanner";
import { PipelineBar } from "@/components/dashboard/PipelineBar";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { ScrollArea } from "@/components/ui/scroll-area";

interface ActivityLog {
  id: number;
  userId: number;
  action: string;
  description: string;
  metadata: string;
  createdAt: string;
  user: {
    id: number;
    firstName: string;
    lastName: string;
    email: string;
    profilePicture?: string;
  } | null;
}

interface TeamMember {
  id: number;
  firstName: string;
  lastName: string;
  email: string;
  role: string;
  profilePicture?: string;
  isActive: boolean;
}

function getActionIcon(action: string) {
  if (action.includes('property')) return Building2;
  if (action.includes('lead')) return Users;
  if (action.includes('contract')) return FileText;
  if (action.includes('timesheet')) return Clock;
  if (action.includes('delete')) return Trash2;
  return Activity;
}

function getActionColor(action: string) {
  if (action.includes('created')) return 'text-green-600';
  if (action.includes('updated')) return 'text-blue-600';
  if (action.includes('deleted')) return 'text-red-600';
  return 'text-muted-foreground';
}

function formatTimeAgo(dateString: string | null): string {
  if (!dateString) return "Recently";
  
  const date = new Date(dateString);
  const now = new Date();
  const diffInSeconds = Math.floor((now.getTime() - date.getTime()) / 1000);
  
  if (diffInSeconds < 60) return "Just now";
  if (diffInSeconds < 3600) return `${Math.floor(diffInSeconds / 60)} min ago`;
  if (diffInSeconds < 86400) return `${Math.floor(diffInSeconds / 3600)} hours ago`;
  if (diffInSeconds < 604800) return `${Math.floor(diffInSeconds / 86400)} days ago`;
  return date.toLocaleDateString();
}

export default function Dashboard() {
  const { data: leads = [], isLoading: leadsLoading } = useQuery<any[]>({
    queryKey: ['/api/leads'],
  });

  const { data: properties = [], isLoading: propertiesLoading } = useQuery<any[]>({
    queryKey: ['/api/properties'],
  });

  const { data: contracts = [], isLoading: contractsLoading } = useQuery<any[]>({
    queryKey: ['/api/contracts'],
  });

  const { data: contractDocuments = [] } = useQuery<any[]>({
    queryKey: ['/api/contract-documents'],
  });

  const { data: activityLogs = [] } = useQuery<ActivityLog[]>({
    queryKey: ['/api/activity'],
    refetchInterval: 30000,
  });

  const { data: allUsers = [] } = useQuery<TeamMember[]>({
    queryKey: ['/api/users'],
  });

  const isLoading = leadsLoading || propertiesLoading || contractsLoading;

  const activeTeamMembers = allUsers.filter(user => user.isActive);

  const kpiData = useMemo(() => {
    const closedDocuments = contractDocuments.filter(doc => doc.status === 'closed');
    
    let totalAssignmentFees = 0;
    closedDocuments.forEach(doc => {
      try {
        if (doc.mergeData) {
          const data = typeof doc.mergeData === 'string' ? JSON.parse(doc.mergeData) : doc.mergeData;
          if (data.closingData?.assignmentFee) {
            totalAssignmentFees += parseFloat(data.closingData.assignmentFee) || 0;
          }
        }
      } catch (e) {}
    });

    const totalContractValue = contracts.reduce((sum, contract) => {
      return sum + (parseFloat(contract.amount) || 0);
    }, 0);

    const activeLeads = leads.filter(lead => 
      lead.status === 'new' || lead.status === 'contacted' || lead.status === 'qualified'
    ).length;

    const dealsInPipeline = contractDocuments.filter(doc => 
      doc.status === 'draft' || doc.status === 'sent' || doc.status === 'executed'
    ).length;

    const closedDeals = closedDocuments.length;

    const conversionRate = leads.length > 0 
      ? ((closedDeals / leads.length) * 100).toFixed(1)
      : "0.0";

    return [
      {
        title: "Revenue from Closed Deals",
        value: totalAssignmentFees > 0 ? `$${totalAssignmentFees.toLocaleString()}` : "$0",
        change: closedDeals > 0 ? `${closedDeals} closed deals` : "No closed deals yet",
        trend: "up",
        icon: DollarSign,
        description: ""
      },
      {
        title: "Active Leads",
        value: leads.length.toString(),
        change: activeLeads > 0 ? `${activeLeads} active` : "No active leads",
        trend: "neutral",
        icon: Users,
        description: ""
      },
      {
        title: "Deals in Pipeline",
        value: dealsInPipeline.toString(),
        change: `${contractDocuments.length} total contracts`,
        trend: "neutral",
        icon: Briefcase,
        description: ""
      },
      {
        title: "Conversion Rate",
        value: `${conversionRate}%`,
        change: closedDeals > 0 ? `${closedDeals} closed` : "No closed deals",
        trend: "neutral",
        icon: Activity,
        description: ""
      }
    ];
  }, [leads, contracts, contractDocuments]);

  const chartData = useMemo(() => {
    if (contracts.length === 0) {
      return [
        { name: "Jan", value: 0 },
        { name: "Feb", value: 0 },
        { name: "Mar", value: 0 },
        { name: "Apr", value: 0 },
        { name: "May", value: 0 },
        { name: "Jun", value: 0 },
      ];
    }

    const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    const contractsByMonth: { [key: string]: number } = {};

    contracts.forEach(contract => {
      if (contract.createdAt) {
        const date = new Date(contract.createdAt);
        const monthName = monthNames[date.getMonth()];
        
        if (!contractsByMonth[monthName]) {
          contractsByMonth[monthName] = 0;
        }
        contractsByMonth[monthName] += parseFloat(contract.amount) || 0;
      }
    });

    const result = [];
    const now = new Date();
    for (let i = 5; i >= 0; i--) {
      const monthDate = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const monthName = monthNames[monthDate.getMonth()];
      result.push({
        name: monthName,
        value: contractsByMonth[monthName] || 0
      });
    }

    return result;
  }, [contracts]);

  if (isLoading) {
    return (
      <Layout>
        <MotivationalBanner />
        <div className="flex flex-col gap-2">
          <h1 className="text-3xl font-bold tracking-tight text-foreground" data-testid="page-title">Dashboard</h1>
          <p className="text-muted-foreground">Overview of your wholesaling operations and performance metrics.</p>
        </div>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {[1, 2, 3, 4].map(i => (
            <Card key={i} className="animate-pulse">
              <CardHeader className="pb-2">
                <div className="h-4 w-24 bg-muted rounded"></div>
              </CardHeader>
              <CardContent>
                <div className="h-8 w-32 bg-muted rounded mb-2"></div>
                <div className="h-3 w-20 bg-muted rounded"></div>
              </CardContent>
            </Card>
          ))}
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <MotivationalBanner />
      <PipelineBar />
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-bold tracking-tight text-foreground" data-testid="page-title">Dashboard</h1>
        <p className="text-muted-foreground">Overview of your wholesaling operations and performance metrics.</p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {kpiData.map((kpi) => (
          <Card key={kpi.title} className="hover-elevate transition-all duration-200" data-testid={`kpi-${kpi.title.toLowerCase().replace(/\s+/g, '-')}`}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                {kpi.title}
              </CardTitle>
              <kpi.icon className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold" data-testid={`value-${kpi.title.toLowerCase().replace(/\s+/g, '-')}`}>
                {kpi.value}
              </div>
              <p className="text-xs text-muted-foreground flex items-center gap-1 mt-1">
                <span className="text-muted-foreground">
                  {kpi.change}
                </span>
                {kpi.description}
              </p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-7">
        <Card className="col-span-4 hover-elevate">
          <CardHeader>
            <CardTitle>Revenue Overview</CardTitle>
          </CardHeader>
          <CardContent className="pl-2">
            {chartData.every(d => d.value === 0) ? (
              <div className="h-[300px] flex items-center justify-center text-center">
                <div>
                  <DollarSign className="w-12 h-12 mx-auto text-muted-foreground/50 mb-3" />
                  <p className="text-muted-foreground">No contract data yet</p>
                  <p className="text-xs text-muted-foreground mt-1">Start adding contracts to see your revenue trends</p>
                </div>
              </div>
            ) : (
              <div className="h-[300px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={chartData}>
                    <defs>
                      <linearGradient id="colorValue" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3}/>
                        <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0}/>
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                    <XAxis 
                      dataKey="name" 
                      stroke="hsl(var(--muted-foreground))" 
                      fontSize={12} 
                      tickLine={false} 
                      axisLine={false} 
                    />
                    <YAxis 
                      stroke="hsl(var(--muted-foreground))" 
                      fontSize={12} 
                      tickLine={false} 
                      axisLine={false}
                      tickFormatter={(value) => `$${value.toLocaleString()}`} 
                    />
                    <Tooltip 
                      contentStyle={{ 
                        backgroundColor: 'hsl(var(--card))', 
                        borderColor: 'hsl(var(--border))',
                        borderRadius: 'var(--radius)',
                        color: 'hsl(var(--foreground))'
                      }}
                      itemStyle={{ color: 'hsl(var(--primary))' }}
                      formatter={(value: any) => [`$${value.toLocaleString()}`, 'Revenue']}
                    />
                    <Area 
                      type="monotone" 
                      dataKey="value" 
                      stroke="hsl(var(--primary))" 
                      strokeWidth={2}
                      fillOpacity={1} 
                      fill="url(#colorValue)" 
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="col-span-3 hover-elevate">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Activity className="h-5 w-5" />
              Team Activity Feed
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-[300px] pr-4">
              {activityLogs.length === 0 ? (
                <div className="h-full flex items-center justify-center text-center">
                  <div>
                    <Activity className="w-12 h-12 mx-auto text-muted-foreground/50 mb-3" />
                    <p className="text-muted-foreground">No activity yet</p>
                    <p className="text-xs text-muted-foreground mt-1">Activity will appear as team members work</p>
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  {activityLogs.map((log) => {
                    const ActionIcon = getActionIcon(log.action);
                    return (
                      <div key={log.id} className="flex items-start gap-3 p-2 rounded-lg hover:bg-muted/50 transition-colors" data-testid={`activity-${log.id}`}>
                        <Avatar className="h-8 w-8 border">
                          {log.user?.profilePicture && <AvatarImage src={log.user.profilePicture} />}
                          <AvatarFallback className="text-xs bg-primary/10 text-primary">
                            {log.user?.firstName?.[0] || log.user?.email?.[0]?.toUpperCase() || 'U'}
                          </AvatarFallback>
                        </Avatar>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-sm">
                              {log.user?.firstName && log.user?.lastName 
                                ? `${log.user.firstName} ${log.user.lastName}`
                                : log.user?.email || 'Unknown User'}
                            </span>
                            <ActionIcon className={`h-3.5 w-3.5 ${getActionColor(log.action)}`} />
                          </div>
                          <p className="text-sm text-muted-foreground line-clamp-1">
                            {log.description}
                          </p>
                          <p className="text-xs text-muted-foreground/70 mt-0.5">
                            {formatTimeAgo(log.createdAt)}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </ScrollArea>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card className="hover-elevate">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="h-5 w-5" />
              Team Members ({activeTeamMembers.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-[200px]">
              {activeTeamMembers.length === 0 ? (
                <div className="h-full flex items-center justify-center text-center">
                  <div>
                    <Users className="w-10 h-10 mx-auto text-muted-foreground/50 mb-2" />
                    <p className="text-sm text-muted-foreground">No team members yet</p>
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  {activeTeamMembers.map((member) => (
                    <div key={member.id} className="flex items-center gap-3 p-2 rounded-lg hover:bg-muted/50 transition-colors" data-testid={`member-${member.id}`}>
                      <Avatar className="h-10 w-10 border">
                        {member.profilePicture && <AvatarImage src={member.profilePicture} />}
                        <AvatarFallback className="bg-primary/10 text-primary font-medium">
                          {member.firstName?.[0] || member.email[0].toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-sm">
                          {member.firstName && member.lastName 
                            ? `${member.firstName} ${member.lastName}`
                            : member.email}
                        </p>
                        <p className="text-xs text-muted-foreground capitalize">
                          {member.role || 'Team Member'}
                        </p>
                      </div>
                      <div className="h-2 w-2 rounded-full bg-green-500" title="Online" />
                    </div>
                  ))}
                </div>
              )}
            </ScrollArea>
          </CardContent>
        </Card>

        <Card className="hover-elevate">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Building2 className="h-5 w-5" />
              Properties Overview
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-4">
              <div className="text-center p-4 bg-muted/30 rounded-lg">
                <p className="text-3xl font-bold">{properties.length}</p>
                <p className="text-sm text-muted-foreground">Total Properties</p>
              </div>
              <div className="text-center p-4 bg-green-500/10 rounded-lg">
                <p className="text-3xl font-bold text-green-600">
                  {properties.filter((p: any) => p.status === 'active').length}
                </p>
                <p className="text-sm text-muted-foreground">Active</p>
              </div>
              <div className="text-center p-4 bg-blue-500/10 rounded-lg">
                <p className="text-3xl font-bold text-blue-600">
                  {properties.filter((p: any) => p.status === 'under_contract').length}
                </p>
                <p className="text-sm text-muted-foreground">Under Contract</p>
              </div>
              <div className="text-center p-4 bg-purple-500/10 rounded-lg">
                <p className="text-3xl font-bold text-purple-600">
                  {properties.filter((p: any) => p.status === 'sold').length}
                </p>
                <p className="text-sm text-muted-foreground">Sold</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
}
