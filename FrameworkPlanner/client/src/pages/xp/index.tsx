import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { XpExperienceCard, type XpExperienceCardModel } from "@/components/xp/XpExperienceCard";
import { XpPublicShell } from "@/components/xp/XpPublicShell";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";

export default function XpLandingPage() {
  const [q, setQ] = useState("");
  const [mode, setMode] = useState<string>("all");

  const { data, isLoading, error } = useQuery<{ items: XpExperienceCardModel[] }>({
    queryKey: ["/api/xp/experiences"],
    queryFn: async () => {
      const res = await fetch("/api/xp/experiences");
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error((json as any).message || "Failed to load experiences");
      return json;
    },
  });

  const items = Array.isArray(data?.items) ? data?.items : [];

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return items.filter((x) => {
      if (mode !== "all") {
        const m = String(x.mode || "").trim();
        if (m !== mode) return false;
      }
      if (!needle) return true;
      const hay = `${x.title || ""} ${x.description || ""} ${x.location || ""}`.toLowerCase();
      return hay.includes(needle);
    });
  }, [items, mode, q]);

  return (
    <XpPublicShell>
      <div className="space-y-10">
        <div className="grid grid-cols-1 gap-8 lg:grid-cols-12 lg:items-end">
          <div className="space-y-3 lg:col-span-7">
            <div className="inline-flex items-center gap-2 rounded-full border border-border/60 bg-background/60 px-3 py-1 text-xs text-muted-foreground backdrop-blur">
              Experiences
              <span className="h-1 w-1 rounded-full bg-muted-foreground/60" />
              Book in minutes
            </div>
            <h1 className="text-4xl font-semibold tracking-tight md:text-5xl">
              Experiences
            </h1>
            <p className="max-w-prose text-sm leading-relaxed text-muted-foreground md:text-base">
              Book an Ocean Luxe experience in minutes. Choose a curated time slot or reserve a custom date range—then confirm with a deposit or full payment.
            </p>
          </div>

          <div className="space-y-3 lg:col-span-5">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-2">
                <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Search</div>
                <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Try: yacht, dinner, Nassau…" />
              </div>
              <div className="space-y-2">
                <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Mode</div>
                <Select value={mode} onValueChange={setMode}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All</SelectItem>
                    <SelectItem value="time_slot">Time slot</SelectItem>
                    <SelectItem value="date_range">Date range</SelectItem>
                    <SelectItem value="both">Both</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="text-xs text-muted-foreground">
              Showing {filtered.length} of {items.length}
            </div>
          </div>
        </div>

        {isLoading ? (
          <div className="grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="h-[360px] rounded-xl border border-border/60 bg-muted/20" />
            ))}
          </div>
        ) : error ? (
          <div className="rounded-xl border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">
            {String((error as any)?.message || error)}
          </div>
        ) : filtered.length === 0 ? (
          <div className="rounded-xl border border-border/60 bg-background/60 p-8 text-center">
            <div className="text-base font-semibold">No experiences found</div>
            <div className="mt-2 text-sm text-muted-foreground">Try a different search or clear filters.</div>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-3">
            {filtered.map((x) => (
              <XpExperienceCard key={x.id} experience={x} />
            ))}
          </div>
        )}
      </div>
    </XpPublicShell>
  );
}
