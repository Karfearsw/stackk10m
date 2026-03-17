import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PipelineColumn } from "./types";
import { Clock, StickyNote, Lightbulb } from "lucide-react";

type OpportunityLike = {
  id: number;
  address?: string | null;
  city?: string | null;
  state?: string | null;
  zipCode?: string | null;
  price?: string | number | null;
  status?: string | null;
  notes?: string | null;
};

export function OpportunityPipelineCard({
  opportunity,
  columns,
  onUpdateStatus,
  onAddNote,
  onOpenActivity,
}: {
  opportunity: OpportunityLike;
  columns: PipelineColumn[];
  onUpdateStatus: (id: number, status: string) => void;
  onAddNote: (opportunity: OpportunityLike) => void;
  onOpenActivity: (opportunity: OpportunityLike) => void;
}) {
  const status = String(opportunity.status || "").trim();
  const addressLine = [opportunity.address, opportunity.city, opportunity.state, opportunity.zipCode].filter(Boolean).join(", ");
  const notePreview = String(opportunity.notes || "").trim().split("\n").filter(Boolean).slice(-1)[0] || "";
  const playgroundAddress = addressLine || String(opportunity.address || "").trim();

  return (
    <Card>
      <CardContent className="p-3 space-y-2">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="text-sm font-medium truncate">{opportunity.address || "—"}</div>
            <div className="text-xs text-muted-foreground truncate">{addressLine || "—"}</div>
          </div>
          <div className="w-[150px]">
            <Select value={status || ""} onValueChange={(value) => onUpdateStatus(opportunity.id, value)}>
              <SelectTrigger className="h-8">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                {columns.map((c) => (
                  <SelectItem key={c.value} value={c.value}>
                    {c.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="flex items-center justify-between gap-2">
          <div className="text-xs text-muted-foreground">{notePreview}</div>
          <div className="text-xs text-muted-foreground whitespace-nowrap">
            {opportunity.price ? `$${opportunity.price}` : ""}
          </div>
        </div>

        <div className="flex flex-wrap gap-2 pt-1">
          <Button
            size="sm"
            variant="secondary"
            className="h-8 px-2"
            onClick={() => {
              if (!playgroundAddress) return;
              window.location.href = `/playground?address=${encodeURIComponent(playgroundAddress)}&propertyId=${opportunity.id}`;
            }}
            disabled={!playgroundAddress}
          >
            <Lightbulb className="w-4 h-4" />
          </Button>
          <Button size="sm" variant="secondary" className="h-8 px-2" onClick={() => onAddNote(opportunity)}>
            <StickyNote className="w-4 h-4" />
          </Button>
          <Button size="sm" variant="secondary" className="h-8 px-2" onClick={() => onOpenActivity(opportunity)}>
            <Clock className="w-4 h-4" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
