import { Layout } from "@/components/layout/Layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BarChart, Bar, LineChart, Line, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";

const COLORS = ["#0a0a0a", "#dc2626", "#7f1d1d", "#fca5a5", "#fee2e2"];

export default function Analytics() {
  // Fetch real data
  const { data: leads = [], isLoading: leadsLoading } = useQuery<any[]>({
    queryKey: ['/api/leads'],
  });

  const { data: contracts = [], isLoading: contractsLoading } = useQuery<any[]>({
    queryKey: ['/api/contracts'],
  });

  const isLoading = leadsLoading || contractsLoading;

  // Calculate YTD metrics
  const ytdMetrics = useMemo(() => {
    const closedContracts = contracts.filter(c => c.status === 'signed' || c.status === 'closed');
    const totalRevenue = closedContracts.reduce((sum, c) => sum + (parseFloat(c.amount) || 0), 0);
    const avgDealSize = closedContracts.length > 0 ? totalRevenue / closedContracts.length : 0;
    const conversionRate = leads.length > 0 ? (closedContracts.length / leads.length) * 100 : 0;

    return {
      revenue: totalRevenue,
      closedDeals: closedContracts.length,
      avgDealSize,
      conversionRate
    };
  }, [leads, contracts]);

  // Monthly performance data
  const monthlyData = useMemo(() => {
    if (contracts.length === 0) return [];

    const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    const dealsByMonth: { [key: string]: { deals: number, revenue: number } } = {};

    contracts.forEach(contract => {
      if (contract.createdAt) {
        const date = new Date(contract.createdAt);
        const monthName = monthNames[date.getMonth()];
        
        if (!dealsByMonth[monthName]) {
          dealsByMonth[monthName] = { deals: 0, revenue: 0 };
        }
        dealsByMonth[monthName].deals += 1;
        if (contract.status === 'signed' || contract.status === 'closed') {
          dealsByMonth[monthName].revenue += parseFloat(contract.amount) || 0;
        }
      }
    });

    // Get last 6 months
    const result = [];
    const now = new Date();
    for (let i = 5; i >= 0; i--) {
      const monthDate = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const monthName = monthNames[monthDate.getMonth()];
      result.push({
        month: monthName,
        deals: dealsByMonth[monthName]?.deals || 0,
        revenue: dealsByMonth[monthName]?.revenue || 0
      });
    }

    return result;
  }, [contracts]);

  // Lead source distribution
  const leadSourceData = useMemo(() => {
    if (leads.length === 0) return [];

    const sources: { [key: string]: number } = {};
    leads.forEach(lead => {
      const source = lead.source || "Unknown";
      sources[source] = (sources[source] || 0) + 1;
    });

    const total = leads.length;
    return Object.entries(sources).map(([name, count]) => ({
      name,
      value: parseFloat(((count / total) * 100).toFixed(1))
    }));
  }, [leads]);

  // Conversion funnel data
  const conversionFunnelData = useMemo(() => {
    const statusCounts = {
      "New Leads": leads.filter(l => l.status === 'new').length,
      "Contacted": leads.filter(l => l.status === 'contacted').length,
      "Qualified": leads.filter(l => l.status === 'qualified').length,
      "Negotiating": contracts.filter(c => c.status === 'negotiating' || c.status === 'pending').length,
      "Closed": contracts.filter(c => c.status === 'signed' || c.status === 'closed').length,
    };

    return Object.entries(statusCounts).map(([stage, count]) => ({
      stage,
      count
    }));
  }, [leads, contracts]);

  if (isLoading) {
    return (
      <Layout>
        <div className="space-y-1 mb-6">
          <h1 className="text-3xl font-bold tracking-tight" data-testid="page-title">Analytics</h1>
          <p className="text-muted-foreground">Key metrics and performance insights for your wholesaling business.</p>
        </div>
        <div className="grid gap-4 md:grid-cols-4 mb-6">
          {[1, 2, 3, 4].map(i => (
            <Card key={i} className="animate-pulse">
              <CardHeader className="pb-2">
                <div className="h-4 w-24 bg-muted rounded"></div>
              </CardHeader>
              <CardContent>
                <div className="h-8 w-32 bg-muted rounded"></div>
              </CardContent>
            </Card>
          ))}
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="space-y-1 mb-6">
        <h1 className="text-3xl font-bold tracking-tight" data-testid="page-title">Analytics</h1>
        <p className="text-muted-foreground">Key metrics and performance insights for your wholesaling business.</p>
      </div>

      <div className="grid gap-4 md:grid-cols-4 mb-6">
        <Card data-testid="metric-revenue">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">YTD Revenue</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-primary" data-testid="value-revenue">
              ${(ytdMetrics.revenue / 1000).toFixed(1)}K
            </div>
            <p className="text-xs text-muted-foreground mt-1">From closed deals</p>
          </CardContent>
        </Card>
        <Card data-testid="metric-deals">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">Deals Closed</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold" data-testid="value-deals">{ytdMetrics.closedDeals}</div>
            <p className="text-xs text-muted-foreground mt-1">This year</p>
          </CardContent>
        </Card>
        <Card data-testid="metric-avg-deal">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">Avg Deal Size</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold" data-testid="value-avg-deal">
              ${ytdMetrics.avgDealSize > 0 ? (ytdMetrics.avgDealSize / 1000).toFixed(0) + 'K' : '0'}
            </div>
            <p className="text-xs text-muted-foreground mt-1">Per transaction</p>
          </CardContent>
        </Card>
        <Card data-testid="metric-conversion">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">Conv. Rate</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold" data-testid="value-conversion">
              {ytdMetrics.conversionRate.toFixed(1)}%
            </div>
            <p className="text-xs text-muted-foreground mt-1">Lead to close</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Monthly Performance</CardTitle>
          </CardHeader>
          <CardContent className="pl-2">
            {monthlyData.length === 0 ? (
              <div className="h-[300px] flex items-center justify-center text-muted-foreground">
                <p>No contract data available</p>
              </div>
            ) : (
              <div className="h-[300px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={monthlyData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="month" stroke="hsl(var(--muted-foreground))" />
                    <YAxis stroke="hsl(var(--muted-foreground))" />
                    <Tooltip 
                      contentStyle={{ backgroundColor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))' }}
                      formatter={(value: any, name: string) => {
                        if (name === 'revenue') return [`$${value.toLocaleString()}`, 'Revenue'];
                        return [value, 'Deals'];
                      }}
                    />
                    <Legend />
                    <Bar dataKey="deals" fill="hsl(var(--primary))" name="Deals" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Lead Source Distribution</CardTitle>
          </CardHeader>
          <CardContent>
            {leadSourceData.length === 0 ? (
              <div className="h-[300px] flex items-center justify-center text-muted-foreground">
                <p>No lead source data available</p>
              </div>
            ) : (
              <div className="h-[300px]">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie 
                      data={leadSourceData} 
                      cx="50%" 
                      cy="50%" 
                      labelLine={false} 
                      label={({ name, value }) => `${name} ${value}%`} 
                      outerRadius={80} 
                      fill="#000" 
                      dataKey="value"
                    >
                      {leadSourceData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(value) => `${value}%`} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="md:col-span-2">
          <CardHeader>
            <CardTitle>Conversion Funnel</CardTitle>
          </CardHeader>
          <CardContent className="pl-2">
            {conversionFunnelData.every(d => d.count === 0) ? (
              <div className="h-[300px] flex items-center justify-center text-muted-foreground">
                <p>No pipeline data available</p>
              </div>
            ) : (
              <div className="h-[300px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={conversionFunnelData} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis type="number" stroke="hsl(var(--muted-foreground))" />
                    <YAxis dataKey="stage" type="category" stroke="hsl(var(--muted-foreground))" width={100} />
                    <Tooltip contentStyle={{ backgroundColor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))' }} />
                    <Bar dataKey="count" fill="hsl(var(--primary))" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
}
