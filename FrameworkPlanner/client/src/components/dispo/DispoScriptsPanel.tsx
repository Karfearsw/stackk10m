import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { FileText } from "lucide-react";

/**
 * DispoScriptsPanel — shows call scripts inside the disposition deal drawer
 * so agents don't have to navigate away to find their talking points.
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
      {display.map((script: any) => (
        <Card key={script.id}>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">{script.name || script.title}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="whitespace-pre-wrap text-sm text-muted-foreground">
              {script.content || script.body || "No content"}
            </p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
