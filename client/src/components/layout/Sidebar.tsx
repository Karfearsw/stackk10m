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
  Clock,
  Bell,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  Lightbulb,
  UserCheck,
  Phone,
  Voicemail,
  History
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/contexts/AuthContext";
import { useSidebar } from "@/contexts/SidebarContext";
import { useQuery } from "@tanstack/react-query";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

const navigation = [
  { name: "Dashboard", href: "/", icon: LayoutDashboard },
  { name: "Leads Pipeline", href: "/leads", icon: Users },
  { name: "Opportunities", href: "/opportunities", icon: Building2 },
  { name: "Dialer", href: "/dialer", icon: Phone },
  { name: "Contacts", href: "/contacts", icon: Users },
  { name: "History", href: "/history", icon: History },
  { name: "Voicemail", href: "/voicemail", icon: Voicemail },
  { name: "Buyers", href: "/buyers", icon: UserCheck },
  { name: "Contracts", href: "/contracts", icon: FileText },
  { name: "Analytics", href: "/analytics", icon: PieChart },
  { name: "Playground", href: "/playground", icon: Lightbulb },
  { name: "Calculator", href: "/calculator", icon: Calculator },
  { name: "Timesheet", href: "/timesheet", icon: Clock },
  { name: "Notifications", href: "/notifications", icon: Bell },
  { name: "Settings", href: "/settings", icon: Settings },
];

export function Sidebar() {
  const [location, setLocation] = useLocation();
  const { user, logout } = useAuth();
  const { state, cycleState, isExpanded, isIconOnly, isHidden } = useSidebar();

  const { data: userData } = useQuery<any>({
    queryKey: [`/api/users/${user?.id}`],
    enabled: !!user?.id,
  });

  const { data: goals = [] } = useQuery<any[]>({
    queryKey: [`/api/users/${user?.id}/goals`],
    enabled: !!user?.id,
  });

  const activeGoal = goals.length > 0 ? goals[0] : null;
  const goalProgress = activeGoal && activeGoal.targetValue > 0
    ? Math.min(100, (activeGoal.currentValue / activeGoal.targetValue) * 100)
    : 0;

  const showIconsOnly = isIconOnly;
  const showLabels = isExpanded;
  
  const profileImage = userData?.profilePicture || userData?.avatarUrl;

  return (
    <TooltipProvider delayDuration={0}>
      <div 
        className={cn(
          "flex h-full flex-col bg-sidebar text-sidebar-foreground border-r border-sidebar-border shadow-xl z-40 transition-all duration-300 ease-in-out",
          isExpanded && "w-64",
          isIconOnly && "w-20",
          isHidden && "w-0 border-r-0 overflow-hidden"
        )}
        aria-hidden={isHidden}
      >
        <div className={cn(
          "flex h-16 items-center border-b border-sidebar-border bg-sidebar-accent/10 transition-all duration-300",
          isExpanded && "px-6",
          isIconOnly && "justify-center px-2",
          isHidden && "opacity-0"
        )}>
          <div className="flex items-center gap-3">
            <img 
              src="/flipstackk-logo.jpg" 
              alt="FlipStackk Logo" 
              className={cn(
                "object-contain transition-all duration-300",
                isIconOnly ? "h-10 w-10" : "h-12 w-auto"
              )}
            />
          </div>
        </div>

        {!isHidden && (
          <button
            onClick={cycleState}
            className="absolute -right-3 top-20 z-50 flex h-6 w-6 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-md hover:bg-primary/90 transition-colors"
            data-testid="button-toggle-sidebar"
          >
            {isExpanded && <ChevronLeft className="h-4 w-4" />}
            {isIconOnly && <ChevronsLeft className="h-4 w-4" />}
          </button>
        )}
        
        <div className={cn(
          "flex-1 scroll-y-container py-6 transition-all duration-300",
          isHidden && "opacity-0"
        )}>
          <nav className={cn("space-y-1.5", showIconsOnly ? "px-2" : "px-3")}>
            {navigation.map((item) => {
              const isActive = location === item.href || (item.href !== '/' && location.startsWith(item.href));
              
              const navItem = (
                <Link key={item.name} href={item.href}>
                  <div
                    className={cn(
                      "group relative flex items-center rounded-md text-sm font-medium transition-all duration-200 ease-in-out cursor-pointer",
                      showIconsOnly ? "justify-center px-2 py-2.5" : "px-3 py-2.5",
                      isActive
                        ? "bg-primary text-primary-foreground shadow-md shadow-primary/20"
                        : "text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-white"
                    )}
                  >
                    <item.icon
                      className={cn(
                        "h-5 w-5 flex-shrink-0 transition-colors",
                        showLabels && "mr-3",
                        isActive ? "text-primary-foreground" : "text-sidebar-foreground/50 group-hover:text-white"
                      )}
                    />
                    {showLabels && (
                      <span className="transition-opacity duration-200">{item.name}</span>
                    )}
                    
                    {isActive && showLabels && (
                      <div className="absolute right-2 h-1.5 w-1.5 rounded-full bg-white/30" />
                    )}
                  </div>
                </Link>
              );

              if (showIconsOnly) {
                return (
                  <Tooltip key={item.name}>
                    <TooltipTrigger asChild>
                      {navItem}
                    </TooltipTrigger>
                    <TooltipContent side="right" className="bg-sidebar text-white border-sidebar-border">
                      {item.name}
                    </TooltipContent>
                  </Tooltip>
                );
              }

              return navItem;
            })}
          </nav>
        </div>

        <div className={cn(
          "mt-auto border-t border-sidebar-border bg-sidebar-accent/5 transition-all duration-300",
          showIconsOnly ? "p-2" : "p-4",
          isHidden && "opacity-0"
        )}>
          {user && showLabels && (
            <div className="bg-sidebar-accent/50 rounded-lg p-3 mb-3">
              <p className="text-xs font-medium text-sidebar-foreground/60 uppercase tracking-wider mb-1">
                Logged in as
              </p>
              <p className="text-sm font-bold text-white truncate">
                {user.firstName && user.lastName ? `${user.firstName} ${user.lastName}` : user.email}
              </p>
              {user.isSuperAdmin && (
                <span className="inline-block mt-1 text-xs px-2 py-0.5 bg-primary/20 text-primary rounded">
                  Super Admin
                </span>
              )}
            </div>
          )}

          {user && showIconsOnly && (
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="flex justify-center mb-3">
                  <div className="h-10 w-10 rounded-full bg-primary/20 flex items-center justify-center overflow-hidden">
                    {profileImage ? (
                      <img src={profileImage} alt="Profile" className="w-full h-full object-cover" />
                    ) : (
                      <span className="text-sm font-bold text-primary">
                        {userData?.firstName?.[0] || user.email[0].toUpperCase()}
                      </span>
                    )}
                  </div>
                </div>
              </TooltipTrigger>
              <TooltipContent side="right" className="bg-sidebar text-white border-sidebar-border">
                {userData?.firstName && userData?.lastName ? `${userData.firstName} ${userData.lastName}` : user.email}
                {user.isSuperAdmin && " (Super Admin)"}
              </TooltipContent>
            </Tooltip>
          )}
          
          {showLabels && (
            <div 
              className="bg-sidebar-accent/50 rounded-lg p-3 mb-4 cursor-pointer hover:bg-sidebar-accent/70 transition-colors"
              onClick={() => setLocation('/settings')}
            >
              <p className="text-xs font-medium text-sidebar-foreground/60 uppercase tracking-wider mb-1">Current Goal</p>
              {activeGoal ? (
                <>
                  <div className="flex justify-between items-end mb-1">
                    <span className="text-sm font-bold text-white">
                      {activeGoal.currentValue}/{activeGoal.targetValue} {activeGoal.unit}
                    </span>
                    <span className="text-xs text-accent">{goalProgress.toFixed(0)}%</span>
                  </div>
                  <div className="h-1.5 w-full bg-sidebar-border rounded-full overflow-hidden">
                    <div 
                      className="h-full bg-accent rounded-full transition-all" 
                      style={{ width: `${Math.min(goalProgress, 100)}%` }}
                    />
                  </div>
                  <p className="text-xs text-sidebar-foreground/50 mt-1 truncate">{activeGoal.title}</p>
                </>
              ) : (
                <div className="text-xs text-sidebar-foreground/50">
                  No active goals. Click to create one!
                </div>
              )}
            </div>
          )}

          {showIconsOnly && activeGoal && (
            <Tooltip>
              <TooltipTrigger asChild>
                <div 
                  className="flex justify-center mb-3 cursor-pointer"
                  onClick={() => setLocation('/settings')}
                >
                  <div className="relative h-10 w-10">
                    <svg className="h-10 w-10 -rotate-90" viewBox="0 0 36 36">
                      <circle
                        cx="18"
                        cy="18"
                        r="15"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="3"
                        className="text-sidebar-border"
                      />
                      <circle
                        cx="18"
                        cy="18"
                        r="15"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="3"
                        strokeDasharray={`${goalProgress} 100`}
                        className="text-accent"
                      />
                    </svg>
                    <span className="absolute inset-0 flex items-center justify-center text-xs font-bold text-white">
                      {goalProgress.toFixed(0)}%
                    </span>
                  </div>
                </div>
              </TooltipTrigger>
              <TooltipContent side="right" className="bg-sidebar text-white border-sidebar-border">
                <p className="font-medium">{activeGoal.title}</p>
                <p className="text-xs text-sidebar-foreground/70">
                  {activeGoal.currentValue}/{activeGoal.targetValue} {activeGoal.unit}
                </p>
              </TooltipContent>
            </Tooltip>
          )}

          {showIconsOnly ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <button 
                  onClick={logout}
                  className="flex w-full items-center justify-center rounded-md p-2 text-sidebar-foreground/70 hover:bg-destructive/10 hover:text-destructive transition-colors"
                  data-testid="button-logout"
                >
                  <LogOut className="h-5 w-5" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="right" className="bg-sidebar text-white border-sidebar-border">
                Sign Out
              </TooltipContent>
            </Tooltip>
          ) : showLabels ? (
            <button 
              onClick={logout}
              className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-sidebar-foreground/70 hover:bg-destructive/10 hover:text-destructive transition-colors"
              data-testid="button-logout"
            >
              <LogOut className="h-5 w-5" />
              Sign Out
            </button>
          ) : null}
        </div>
      </div>
    </TooltipProvider>
  );
}
