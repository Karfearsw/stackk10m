import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Columns3 } from "lucide-react";

export type LeadColumnId =
  | "address"
  | "owner"
  | "status"
  | "score"
  | "value"
  | "contact"
  | "notes"
  | "zip"
  | "state"
  | "city"
  | "leadType"
  | "assignedTo"
  | "lastTouch"
  | "nextFollowUp"
  | "tags";

export const leadColumnsCatalog: Array<{ id: LeadColumnId; label: string; defaultVisible: boolean }> = [
  { id: "address", label: "Address", defaultVisible: true },
  { id: "owner", label: "Owner", defaultVisible: true },
  { id: "status", label: "Status", defaultVisible: true },
  { id: "score", label: "Score", defaultVisible: true },
  { id: "value", label: "Value", defaultVisible: true },
  { id: "contact", label: "Contact", defaultVisible: true },
  { id: "notes", label: "Notes", defaultVisible: true },
  { id: "zip", label: "ZIP", defaultVisible: false },
  { id: "state", label: "State", defaultVisible: false },
  { id: "city", label: "City", defaultVisible: false },
  { id: "leadType", label: "Lead type", defaultVisible: false },
  { id: "assignedTo", label: "Assigned to", defaultVisible: false },
  { id: "lastTouch", label: "Last touch", defaultVisible: false },
  { id: "nextFollowUp", label: "Next follow-up", defaultVisible: false },
  { id: "tags", label: "Tags", defaultVisible: false },
];

export function ColumnChooser({
  visible,
  onToggle,
  onRestoreDefaults,
}: {
  visible: Set<LeadColumnId>;
  onToggle: (id: LeadColumnId) => void;
  onRestoreDefaults: () => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button type="button" variant="outline" size="sm">
          <Columns3 className="h-4 w-4 mr-2" />
          Columns
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        {leadColumnsCatalog.map((c) => (
          <DropdownMenuCheckboxItem key={c.id} checked={visible.has(c.id)} onCheckedChange={() => onToggle(c.id)}>
            {c.label}
          </DropdownMenuCheckboxItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuCheckboxItem checked={false} onCheckedChange={onRestoreDefaults}>
          Restore defaults
        </DropdownMenuCheckboxItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

