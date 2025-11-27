import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Layout } from "@/components/layout/Layout";
import { ArrowUpRight, DollarSign, Users, Briefcase, Activity } from "lucide-react";
import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis, YAxis, CartesianGrid } from "recharts";
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { MotivationalBanner } from "@/components/dashboard/MotivationalBanner";

export default function Dashboard() {
  // Fetch real data from APIs
  const { data: leads = [], isLoading: leadsLoading } = useQuery<any[]>({
    queryKey: ['/api/leads'],
  });

  const { data: properties = [], isLoading: propertiesLoading } = useQuery<any[]>({
    queryKey: ['/api/properties'],
  });

  const { data: contracts = [], isLoading: contractsLoading } = useQuery<any[]>({
    queryKey: ['/api/contracts'],
  });

  const { data: contractDocs = [] } = useQuery<any[]>({
    queryKey: ['/api/contract-documents'],
  });

  const isLoading = leadsLoading || propertiesLoading || contractsLoading;

  // Calculate real KPIs from data
  const kpiData = useMemo(() => {
    const totalRevenue = contracts.reduce((sum, contract) => {
      return sum + (parseFloat(contract.amount) || 0);
    }, 0);

    const activeLeads = leads.filter(lead => 
      lead.status === 'new' || lead.status === 'contacted' || lead.status === 'qualified'
    ).length;

    const dealsInPipeline = contracts.filter(contract => 
      contract.status === 'pending' || contract.status === 'negotiating'
    ).length;

    const closedDeals = contracts.filter(contract => 
      contract.status === 'signed' || contract.status === 'closed'
    ).length;

    const conversionRate = leads.length > 0 
      ? ((closedDeals / leads.length) * 100).toFixed(1)
      : "0.0";

    return [
      {
        title: "Total Contract Value",
        value: totalRevenue > 0 ? `$${totalRevenue.toLocaleString()}` : "$0",
        change: contracts.length > 0 ? `${contracts.length} contracts` : "No contracts yet",
        trend: "neutral",
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
        change: `${contracts.length} total`,
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
  }, [leads, contracts]);

  // Generate chart data from contracts grouped by month
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
        const monthKey = `${date.getFullYear()}-${date.getMonth()}`;
        const monthName = monthNames[date.getMonth()];
        
        if (!contractsByMonth[monthName]) {
          contractsByMonth[monthName] = 0;
        }
        contractsByMonth[monthName] += parseFloat(contract.amount) || 0;
      }
    });

    // Get last 6 months
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

  // Generate recent activity from real data
  const recentActivity = useMemo(() => {
    const activities: any[] = [];

    // Add contract activities
    contractDocs.slice(0, 2).forEach(doc => {
      activities.push({
        user: doc.createdBy || "User",
        action: doc.status === 'draft' ? 'created draft contract' : 'finalized contract',
        target: doc.title,
        time: formatTimeAgo(doc.createdAt),
        initials: (doc.createdBy || "U").substring(0, 2).toUpperCase()
      });
    });

    // Add lead activities
    leads.slice(0, 2).forEach(lead => {
      activities.push({
        user: "System",
        action: `added ${lead.status} lead`,
        target: `${lead.address}, ${lead.city}`,
        time: formatTimeAgo(lead.createdAt),
        initials: "SYS"
      });
    });

    return activities.slice(0, 4);
  }, [leads, contractDocs]);

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
            <CardTitle>Recent Activity</CardTitle>
          </CardHeader>
          <CardContent>
            {recentActivity.length === 0 ? (
              <div className="h-[300px] flex items-center justify-center text-center">
                <div>
                  <Activity className="w-12 h-12 mx-auto text-muted-foreground/50 mb-3" />
                  <p className="text-muted-foreground">No activity yet</p>
                  <p className="text-xs text-muted-foreground mt-1">Activity will appear as you add leads and contracts</p>
                </div>
              </div>
            ) : (
              <div className="space-y-8">
                {recentActivity.map((item, i) => (
                  <div key={i} className="flex items-center" data-testid={`activity-${i}`}>
                    <div className="relative flex h-9 w-9 shrink-0 overflow-hidden rounded-full border border-border items-center justify-center bg-secondary text-xs font-medium text-secondary-foreground">
                      {item.initials}
                    </div>
                    <div className="ml-4 space-y-1">
                      <p className="text-sm font-medium leading-none">
                        {item.user} <span className="text-muted-foreground font-normal">{item.action}</span>
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {item.target}
                      </p>
                    </div>
                    <div className="ml-auto font-medium text-xs text-muted-foreground">
                      {item.time}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
}
