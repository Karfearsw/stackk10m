import React from "react";
import { Bell, Search, Menu, PanelLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useSidebar } from "@/contexts/SidebarContext";
import { useAuth } from "@/contexts/AuthContext";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useLocation } from "wouter";

interface NotificationItem {
  id: number;
  title: string;
  description: string | null;
  read: boolean;
  createdAt: string;
}

export function Header() {
  const { state, setState, cycleState, isHidden, toggleMobile } = useSidebar();
  const { user, logout } = useAuth();
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();

  const { data: userData } = useQuery<any>({
    queryKey: [`/api/users/${user?.id}`],
    enabled: !!user?.id,
  });

  const getNextStateLabel = () => {
    if (typeof window !== "undefined" && !window.matchMedia("(min-width: 768px)").matches) return "Open menu";
    if (state === "expanded") return "Collapse to icons";
    if (state === "icon") return "Hide sidebar";
    return "Show sidebar";
  };

  const getInitials = () => {
    if (userData?.firstName && userData?.lastName) {
      return `${userData.firstName[0]}${userData.lastName[0]}`.toUpperCase();
    }
    return user?.email?.[0]?.toUpperCase() || "U";
  };

  const profileImage = userData?.profilePicture || userData?.avatarUrl;

  const [query, setQuery] = React.useState("");
  const [debounced, setDebounced] = React.useState("");
  const [open, setOpen] = React.useState(false);
  React.useEffect(() => {
    const t = setTimeout(() => setDebounced(query.trim()), 250);
    return () => clearTimeout(t);
  }, [query]);
  const { data: searchData, isFetching: searching } = useQuery<any>({
    queryKey: ["/api/search", debounced],
    queryFn: async () => {
      const res = await fetch(`/api/search?q=${encodeURIComponent(debounced)}`);
      return res.json();
    },
    enabled: debounced.length >= 2,
  });

  const onSelect = (item: any) => {
    setOpen(false);
    setQuery("");
    if (item.path) setLocation(item.path);
  };

  const { data: notifications = [] } = useQuery<NotificationItem[]>({
    queryKey: [`/api/users/${user?.id}/notifications?limit=10`],
    enabled: !!user?.id,
  });

  const unreadCount = notifications.filter(n => !n.read).length;

  const markAllAsRead = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/users/${user?.id}/notifications/read-all`, {
        method: "PATCH",
        credentials: "include",
      });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/users/${user?.id}/notifications?limit=10`] });
      queryClient.invalidateQueries({ queryKey: [`/api/users/${user?.id}/notifications`] });
    },
  });

  const formatTime = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString();
  };

  return (
    <header className="sticky top-0 z-30 flex h-16 w-full min-w-0 items-center border-b bg-background px-4 md:px-6 shadow-sm gap-4">
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button 
              variant="ghost" 
              size="icon" 
              onClick={() => {
                const isDesktop = typeof window !== "undefined" && window.matchMedia("(min-width: 768px)").matches;
                if (!isDesktop) {
                  toggleMobile();
                  return;
                }
                if (isHidden) setState("expanded");
                else cycleState();
              }}
              className="text-muted-foreground hover:text-foreground shrink-0"
              data-testid="button-hamburger"
            >
              {isHidden ? (
                <PanelLeft className="h-5 w-5" />
              ) : (
                <Menu className="h-5 w-5" />
              )}
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom">
            {getNextStateLabel()}
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>

      <div className="flex min-w-0 flex-1 items-center gap-4">
        <div className="relative w-full max-w-md min-w-0">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
              <Input
                type="search"
                placeholder="Search leads, properties, or contacts..."
                className="w-full min-w-0 bg-muted/50 pl-9 border-none focus-visible:ring-1"
                value={query}
                onChange={(e) => {
                  const v = e.target.value;
                  setQuery(v);
                  setOpen(v.trim().length >= 2);
                }}
                onFocus={() => setOpen(query.trim().length >= 2)}
              />
            </PopoverTrigger>
            <PopoverContent align="start" className="w-[--radix-popover-trigger-width] p-0">
              <div className="bg-background border rounded-md shadow-lg max-h-80 overflow-auto">
                <div className="flex items-center justify-between px-3 py-2 text-xs text-muted-foreground">
                  <span>Results</span>
                  {searching && <span>Searching…</span>}
                </div>
                {(searchData?.results || []).length === 0 ? (
                  <div className="px-3 py-3 text-sm text-muted-foreground">No matches</div>
                ) : (
                  (searchData?.results || []).map((item: any) => (
                    <button
                      key={`${item.type}-${item.id}`}
                      className="w-full text-left px-3 py-2 hover:bg-muted/50 text-sm"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => onSelect(item)}
                    >
                      <div className="flex items-center justify-between gap-3">
                        <span className="font-medium truncate">{item.title}</span>
                        <span className="text-xs text-muted-foreground shrink-0">{item.type}</span>
                      </div>
                      {item.subtitle && (
                        <div className="text-xs text-muted-foreground truncate">{item.subtitle}</div>
                      )}
                    </button>
                  ))
                )}
                {searchData?.counts?.total > (searchData?.results?.length || 0) && (
                  <button
                    className="w-full text-left px-3 py-2 hover:bg-muted/50 text-sm border-t"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => {
                      setOpen(false);
                      setLocation(`/search?q=${encodeURIComponent(query.trim())}`);
                    }}
                  >
                    View all results ({searchData?.counts?.total})
                  </button>
                )}
              </div>
            </PopoverContent>
          </Popover>
        </div>
      </div>
      
      <div className="flex items-center gap-4">
        <Popover>
          <PopoverTrigger asChild>
            <Button 
              variant="ghost" 
              size="icon" 
              className="relative text-muted-foreground hover:text-foreground"
              aria-label="Notifications"
            >
              <Bell className="h-5 w-5" />
              {unreadCount > 0 && (
                <span className="absolute top-2 right-2 h-2 w-2 rounded-full bg-accent ring-2 ring-background" />
              )}
            </Button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-96 p-0">
            <div className="flex items-center justify-between px-4 py-3 border-b">
              <div className="font-semibold">Notifications</div>
              <div className="flex items-center gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={unreadCount === 0 || markAllAsRead.isPending}
                  onClick={() => markAllAsRead.mutate()}
                >
                  Mark all read
                </Button>
                <Button variant="ghost" size="sm" onClick={() => setLocation("/notifications")}>
                  View all
                </Button>
              </div>
            </div>
            <div className="max-h-96 overflow-auto">
              {notifications.length === 0 ? (
                <div className="px-4 py-8 text-sm text-muted-foreground">No notifications</div>
              ) : (
                notifications.slice(0, 10).map((n) => (
                  <button
                    key={n.id}
                    className={`w-full text-left px-4 py-3 border-b hover:bg-muted/40 ${n.read ? "" : "bg-primary/5"}`}
                    onClick={() => setLocation("/notifications")}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="text-sm font-medium truncate">{n.title}</div>
                        {n.description && <div className="text-xs text-muted-foreground truncate mt-0.5">{n.description}</div>}
                        <div className="text-xs text-muted-foreground mt-1">{formatTime(n.createdAt)}</div>
                      </div>
                      {!n.read && <div className="mt-1 h-2 w-2 rounded-full bg-primary" />}
                    </div>
                  </button>
                ))
              )}
            </div>
          </PopoverContent>
        </Popover>
        
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" className="relative h-9 w-9 rounded-full">
              <Avatar className="h-9 w-9 border border-border">
                {profileImage && <AvatarImage src={profileImage} alt="User" />}
                <AvatarFallback className="bg-primary/10 text-primary font-semibold">
                  {getInitials()}
                </AvatarFallback>
              </Avatar>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuLabel>
              {userData?.firstName && userData?.lastName 
                ? `${userData.firstName} ${userData.lastName}` 
                : user?.email}
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => setLocation('/settings')}>
              Profile
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setLocation('/settings')}>
              Settings
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem className="text-destructive" onClick={logout}>
              Log out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
