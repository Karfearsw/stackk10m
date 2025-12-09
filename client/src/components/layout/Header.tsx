import React from "react";
import { Bell, Search, Menu, PanelLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
import { useQuery } from "@tanstack/react-query";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useLocation } from "wouter";

export function Header() {
  const { state, setState, cycleState, isHidden } = useSidebar();
  const { user, logout } = useAuth();
  const [, setLocation] = useLocation();

  const { data: userData } = useQuery<any>({
    queryKey: [`/api/users/${user?.id}`],
    enabled: !!user?.id,
  });

  const getNextStateLabel = () => {
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

  return (
    <header className="sticky top-0 z-30 flex h-16 w-full items-center border-b bg-background px-4 md:px-6 shadow-sm gap-4">
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button 
              variant="ghost" 
              size="icon" 
              onClick={isHidden ? () => setState("expanded") : cycleState}
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

      <div className="flex flex-1 items-center gap-4">
        <div className="relative w-full max-w-md">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            type="search"
            placeholder="Search leads, properties, or contacts..."
            className="w-full bg-muted/50 pl-9 md:w-[300px] lg:w-[400px] border-none focus-visible:ring-1"
            value={query}
            onChange={(e) => {
              const v = e.target.value;
              setQuery(v);
              setOpen(v.trim().length >= 2);
            }}
            onFocus={() => setOpen(query.trim().length >= 2)}
            onBlur={() => setTimeout(() => setOpen(false), 150)}
          />
          {open && (
            <div className="absolute mt-2 w-full bg-background border rounded-md shadow-lg z-50 max-h-80 overflow-auto">
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
                    <div className="flex items-center justify-between">
                      <span className="font-medium">{item.title}</span>
                      <span className="text-xs text-muted-foreground">{item.type}</span>
                    </div>
                    {item.subtitle && (
                      <div className="text-xs text-muted-foreground">{item.subtitle}</div>
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
          )}
        </div>
      </div>
      
      <div className="flex items-center gap-4">
        <Button 
          variant="ghost" 
          size="icon" 
          className="relative text-muted-foreground hover:text-foreground"
          onClick={() => setLocation('/notifications')}
        >
          <Bell className="h-5 w-5" />
          <span className="absolute top-2 right-2 h-2 w-2 rounded-full bg-accent ring-2 ring-background" />
        </Button>
        
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
