import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Textarea } from "@/components/ui/textarea";
import { Bookmark } from "lucide-react";
import { useEffect, useMemo, useRef } from "react";
import type { UnderwritingSection } from "@/utils/playgroundPersistence";

export function UnderwritingPanel(props: {
  sections: UnderwritingSection[];
  values: Record<string, string>;
  activeSectionId: string;
  highlightSectionId: string;
  onActiveSectionChange: (sectionId: string) => void;
  onChangeValue: (sectionId: string, value: string) => void;
  onBookmarkSection: (sectionId: string) => void;
}) {
  const sectionRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const orderedSections = useMemo(() => props.sections, [props.sections]);

  useEffect(() => {
    if (!props.highlightSectionId) return;
    const el = sectionRefs.current[props.highlightSectionId];
    if (!el) return;
    el.scrollIntoView({ block: "start", behavior: "smooth" });
  }, [props.highlightSectionId]);

  return (
    <Card className="h-full">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-3">
          <CardTitle className="text-base min-w-0 truncate">Underwriting</CardTitle>
          <Button
            size="sm"
            variant="outline"
            onClick={() => props.onBookmarkSection(props.activeSectionId)}
            disabled={!props.activeSectionId}
            className="shrink-0"
          >
            <Bookmark className="h-4 w-4 mr-2" />
            Add bookmark
          </Button>
        </div>
      </CardHeader>

      <CardContent className="pt-0 h-[calc(100%-4.25rem)]">
        <ScrollArea className="h-full pr-3">
          <div className="flex flex-col gap-4">
            {orderedSections.map((s) => {
              const isActive = props.activeSectionId === s.id;
              const isHighlighted = props.highlightSectionId === s.id;
              return (
                <div
                  key={s.id}
                  ref={(node) => {
                    sectionRefs.current[s.id] = node;
                  }}
                  id={`uw-${s.id}`}
                  tabIndex={-1}
                  className={`rounded-lg border bg-background p-4 transition-colors ${
                    isHighlighted ? "ring-2 ring-primary" : isActive ? "ring-1 ring-primary/50" : ""
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="text-sm font-medium truncate" onClick={() => props.onActiveSectionChange(s.id)}>
                        {s.title}
                      </div>
                      <div className="text-xs text-muted-foreground">Click the bookmark icon to save a jump.</div>
                    </div>
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => props.onBookmarkSection(s.id)}
                      aria-label={`Bookmark ${s.title}`}
                      className="shrink-0"
                    >
                      <Bookmark className="h-4 w-4" />
                    </Button>
                  </div>

                  <div className="mt-3">
                    <Textarea
                      value={props.values[s.id] ?? ""}
                      onChange={(e) => props.onChangeValue(s.id, e.target.value)}
                      onFocus={() => props.onActiveSectionChange(s.id)}
                      rows={5}
                      placeholder="Type notes here…"
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  );
}
