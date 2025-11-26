import { Link, useLocation } from "wouter";
import { 
  LayoutDashboard, 
  Users, 
  Building2, 
  FileText, 
  Settings, 
  PieChart, 
  LogOut,
  Calculator,
  Clock
} from "lucide-react";
import { cn } from "@/lib/utils";

const navigation = [
  { name: "Dashboard", href: "/", icon: LayoutDashboard },
  { name: "Leads Pipeline", href: "/leads", icon: Users },
  { name: "Properties", href: "/properties", icon: Building2 },
  { name: "Contracts", href: "/contracts", icon: FileText },
  { name: "Analytics", href: "/analytics", icon: PieChart },
  { name: "Calculator", href: "/calculator", icon: Calculator },
  { name: "Timesheet", href: "/timesheet", icon: Clock },
  { name: "Settings", href: "/settings", icon: Settings },
];

export function Sidebar() {
  const [location] = useLocation();

  return (
    <div className="flex h-full w-64 flex-col bg-sidebar text-sidebar-foreground border-r border-sidebar-border shadow-xl z-10">
      <div className="flex h-16 items-center px-6 border-b border-sidebar-border bg-sidebar-accent/10">
        <div className="flex items-center gap-3 font-display font-bold text-2xl tracking-tight text-white">
          <div className="h-8 w-8 rounded bg-primary flex items-center justify-center text-primary-foreground shadow-lg shadow-primary/20">
            F
          </div>
          Flipstackk
        </div>
      </div>
      
      <div className="flex-1 overflow-y-auto py-6">
        <nav className="space-y-1.5 px-3">
          {navigation.map((item) => {
            const isActive = location === item.href || (item.href !== '/' && location.startsWith(item.href));
            
            return (
              <Link key={item.name} href={item.href}>
                <div
                  className={cn(
                    "group relative flex items-center rounded-md px-3 py-2.5 text-sm font-medium transition-all duration-200 ease-in-out cursor-pointer",
                    isActive
                      ? "bg-primary text-primary-foreground shadow-md shadow-primary/20"
                      : "text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-white"
                  )}
                >
                  <item.icon
                    className={cn(
                      "mr-3 h-5 w-5 flex-shrink-0 transition-colors",
                      isActive ? "text-primary-foreground" : "text-sidebar-foreground/50 group-hover:text-white"
                    )}
                  />
                  {item.name}
                  
                  {isActive && (
                    <div className="absolute right-2 h-1.5 w-1.5 rounded-full bg-white/30" />
                  )}
                </div>
              </Link>
            );
          })}
        </nav>
      </div>

      <div className="p-4 mt-auto border-t border-sidebar-border bg-sidebar-accent/5">
        <div className="bg-sidebar-accent/50 rounded-lg p-3 mb-4">
          <p className="text-xs font-medium text-sidebar-foreground/60 uppercase tracking-wider mb-1">Current Goal</p>
          <div className="flex justify-between items-end mb-1">
            <span className="text-sm font-bold text-white">8/12 Deals</span>
            <span className="text-xs text-accent">66%</span>
          </div>
          <div className="h-1.5 w-full bg-sidebar-border rounded-full overflow-hidden">
            <div className="h-full bg-accent w-2/3 rounded-full" />
          </div>
        </div>

        <button className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-sidebar-foreground/70 hover:bg-destructive/10 hover:text-destructive transition-colors">
          <LogOut className="h-5 w-5" />
          Sign Out
        </button>
      </div>
    </div>
  );
}
