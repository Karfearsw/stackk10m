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
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import agentImage from "@assets/generated_images/professional_headshot_of_a_real_estate_agent.png";

export function Header() {
  const { state, setState, cycleState, isHidden } = useSidebar();

  const getNextStateLabel = () => {
    if (state === "expanded") return "Collapse to icons";
    if (state === "icon") return "Hide sidebar";
    return "Show sidebar";
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
          />
        </div>
      </div>
      
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" className="relative text-muted-foreground hover:text-foreground">
          <Bell className="h-5 w-5" />
          <span className="absolute top-2 right-2 h-2 w-2 rounded-full bg-accent ring-2 ring-background" />
        </Button>
        
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" className="relative h-9 w-9 rounded-full">
              <Avatar className="h-9 w-9 border border-border">
                <AvatarImage src={agentImage} alt="User" />
                <AvatarFallback>BK</AvatarFallback>
              </Avatar>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuLabel>My Account</DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem>Profile</DropdownMenuItem>
            <DropdownMenuItem>Settings</DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem className="text-destructive">Log out</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
