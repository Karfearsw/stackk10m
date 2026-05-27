import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ChevronDown } from "lucide-react";

export type LeadSavedView = {
  id: number;
  name: string;
  visibility: string;
  shareToken: string | null;
  configJson: any;
};

export function SavedViewsDropdown({
  label,
  views,
  onSelectSystem,
  onSelectView,
  onSaveCurrent,
}: {
  label: string;
  views: LeadSavedView[];
  onSelectSystem: (systemId: string) => void;
  onSelectView: (view: LeadSavedView) => void;
  onSaveCurrent: () => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button type="button" variant="outline" size="sm">
          {label}
          <ChevronDown className="h-4 w-4 ml-2" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-64">
        <DropdownMenuItem onClick={() => onSelectSystem("all")}>All leads</DropdownMenuItem>
        <DropdownMenuItem onClick={() => onSelectSystem("unassigned")}>Unassigned</DropdownMenuItem>
        <DropdownMenuItem onClick={() => onSelectSystem("no_contact")}>No contact info</DropdownMenuItem>
        <DropdownMenuItem onClick={() => onSelectSystem("new_today")}>New today</DropdownMenuItem>
        <DropdownMenuSeparator />
        {views.map((v) => (
          <DropdownMenuItem key={v.id} onClick={() => onSelectView(v)}>
            {v.name}
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={onSaveCurrent}>Save current as view…</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

