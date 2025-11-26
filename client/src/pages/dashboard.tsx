import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Layout } from "@/components/layout/Layout";
import { ArrowUpRight, DollarSign, Users, Briefcase, Activity } from "lucide-react";
import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis, YAxis, CartesianGrid } from "recharts";

const kpiData = [
  {
    title: "Total Revenue",
    value: "$142,300",
    change: "+12.5%",
    trend: "up",
    icon: DollarSign,
    description: "vs last month"
  },
  {
    title: "Active Leads",
    value: "124",
    change: "+4",
    trend: "up",
    icon: Users,
    description: "new this week"
  },
  {
    title: "Deals in Pipeline",
    value: "18",
    change: "-2",
    trend: "down",
    icon: Briefcase,
    description: "active negotiations"
  },
  {
    title: "Conversion Rate",
    value: "3.2%",
    change: "+0.4%",
    trend: "up",
    icon: Activity,
    description: "lead to close"
  }
];

const chartData = [
  { name: "Jan", value: 4000 },
  { name: "Feb", value: 3000 },
  { name: "Mar", value: 2000 },
  { name: "Apr", value: 2780 },
  { name: "May", value: 1890 },
  { name: "Jun", value: 2390 },
  { name: "Jul", value: 3490 },
];

export default function Dashboard() {
  return (
    <Layout>
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-bold tracking-tight text-foreground">Dashboard</h1>
        <p className="text-muted-foreground">Overview of your wholesaling operations and performance metrics.</p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {kpiData.map((kpi) => (
          <Card key={kpi.title} className="hover-elevate transition-all duration-200">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                {kpi.title}
              </CardTitle>
              <kpi.icon className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{kpi.value}</div>
              <p className="text-xs text-muted-foreground flex items-center gap-1 mt-1">
                <span className={kpi.trend === 'up' ? 'text-accent' : 'text-destructive'}>
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
                    tickFormatter={(value) => `$${value}`} 
                  />
                  <Tooltip 
                    contentStyle={{ 
                      backgroundColor: 'hsl(var(--card))', 
                      borderColor: 'hsl(var(--border))',
                      borderRadius: 'var(--radius)',
                      color: 'hsl(var(--foreground))'
                    }}
                    itemStyle={{ color: 'hsl(var(--primary))' }}
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
          </CardContent>
        </Card>

        <Card className="col-span-3 hover-elevate">
          <CardHeader>
            <CardTitle>Recent Activity</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-8">
              {[
                {
                  user: "Kevin B.",
                  action: "moved lead to negotiation",
                  target: "123 Maple Street",
                  time: "2 hours ago",
                  initials: "KB"
                },
                {
                  user: "System",
                  action: "flagged high motivation score",
                  target: "456 Oak Avenue",
                  time: "4 hours ago",
                  initials: "SYS"
                },
                {
                  user: "Benji S.",
                  action: "sent contract to seller",
                  target: "789 Pine Lane",
                  time: "5 hours ago",
                  initials: "BS"
                },
                {
                  user: "Sarah M.",
                  action: "added new lead",
                  target: "321 Elm St",
                  time: "Yesterday",
                  initials: "SM"
                }
              ].map((item, i) => (
                <div key={i} className="flex items-center">
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
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
}
