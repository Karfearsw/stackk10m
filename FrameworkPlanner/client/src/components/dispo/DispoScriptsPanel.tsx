import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { FileText, ChevronDown, ChevronUp } from "lucide-react";

/**
 * DispoScriptsPanel — shows call scripts inside the disposition deal drawer
 * so agents don't have to navigate away to find their talking points.
 * Scripts are collapsible to prevent long content from pushing other sections around.
 */
export function DispoScriptsPanel() {
  const { data, isLoading } = useQuery<{ items: any[] }>({
    queryKey: ["dispo-scripts"],
    queryFn: async () => {
      const res = await fetch("/api/scripts", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load scripts");
      return res.json();
    },
  });

  const [expanded, setExpanded] = useState<Set<string | number>>(new Set());
  const toggle = (id: string | number) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const scripts = data?.items ?? [];
  // Prefer buyer/disposition-related scripts, fall back to all
  const relevant = scripts.filter((s: any) =>
    /buyer|dispo|investor|offer/i.test(s.name || s.title || "")
  );
  const display = relevant.length > 0 ? relevant : scripts.slice(0, 5);

  if (isLoading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-24 w-full" />
      </div>
    );
  }

  if (display.length === 0) {
    return (
      <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
        <FileText className="mx-auto mb-2 h-8 w-8 opacity-50" />
        No scripts found. Add them in Scripts.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {display.map((script: any) => {
        const isOpen = expanded.has(script.id);
        const content = script.content || script.body || "No content";
        return (
          <Card key={script.id} className="overflow-hidden">
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm">{script.name || script.title}</CardTitle>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 px-2"
                  onClick={() => toggle(script.id)}
                >
                  {isOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                  <span className="ml-1 text-xs">{isOpen ? "Hide" : "Show"}</span>
                </Button>
              </div>
            </CardHeader>
            {isOpen && (
              <CardContent className="max-h-64 overflow-y-auto">
                <p className="whitespace-pre-wrap text-sm text-muted-foreground">
                  {content}
                </p>
              </CardContent>
            )}
          </Card>
        );
      })}
    </div>
  );
}
