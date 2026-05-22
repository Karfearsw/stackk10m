import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { StickyNote } from "lucide-react";

export function LeadNotePreview({
  count,
  preview,
}: {
  count: number;
  preview: string | null;
}) {
  if (!count) return <span className="text-muted-foreground">—</span>;
  const text = String(preview || "").trim();
  return (
    <TooltipProvider delayDuration={150}>
      <Tooltip>
        <TooltipTrigger asChild>
          <Badge variant="secondary" className="gap-1 cursor-default">
            <StickyNote className="h-3.5 w-3.5" />
            {count}
          </Badge>
        </TooltipTrigger>
        {text ? (
          <TooltipContent side="top" className="max-w-[360px]">
            <div className="text-xs whitespace-pre-wrap">{text}</div>
          </TooltipContent>
        ) : null}
      </Tooltip>
    </TooltipProvider>
  );
}

