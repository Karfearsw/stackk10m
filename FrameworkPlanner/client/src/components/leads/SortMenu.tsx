import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ArrowDownAZ, ArrowUpAZ } from "lucide-react";

export type LeadSortKey =
  | "newest_imported"
  | "oldest_imported"
  | "highest_score"
  | "lowest_score"
  | "highest_value"
  | "recently_updated"
  | "oldest_untouched"
  | "most_recent_contact"
  | "status_age"
  | "assigned_user";

const sortItems: Array<{ key: LeadSortKey; label: string }> = [
  { key: "newest_imported", label: "Newest imported" },
  { key: "oldest_imported", label: "Oldest imported" },
  { key: "highest_score", label: "Highest score" },
  { key: "lowest_score", label: "Lowest score" },
  { key: "highest_value", label: "Highest estimated value" },
  { key: "most_recent_contact", label: "Most recent contact" },
  { key: "oldest_untouched", label: "Oldest untouched" },
  { key: "recently_updated", label: "Recently updated" },
  { key: "assigned_user", label: "Assigned user" },
  { key: "status_age", label: "Status age" },
];

export function SortMenu({
  sortKey,
  sortDir,
  onChange,
}: {
  sortKey: LeadSortKey;
  sortDir: "asc" | "desc";
  onChange: (next: { sortKey: LeadSortKey; sortDir: "asc" | "desc" }) => void;
}) {
  const activeLabel = sortItems.find((i) => i.key === sortKey)?.label || "Sort";
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button type="button" variant="outline" size="sm">
          {sortDir === "asc" ? <ArrowUpAZ className="h-4 w-4 mr-2" /> : <ArrowDownAZ className="h-4 w-4 mr-2" />}
          {activeLabel}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuItem onClick={() => onChange({ sortKey, sortDir: sortDir === "asc" ? "desc" : "asc" })}>
          Toggle direction
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        {sortItems.map((i) => (
          <DropdownMenuItem key={i.key} onClick={() => onChange({ sortKey: i.key, sortDir })}>
            {i.label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

