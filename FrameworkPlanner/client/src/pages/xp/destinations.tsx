import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { XpPublicShell } from "@/components/xp/XpPublicShell";
import { useQuery } from "@tanstack/react-query";
import { MapPin } from "lucide-react";

type XpDestination = {
  id: number;
  name: string;
  slug?: string | null;
  heroImage?: string | null;
  images?: string[] | null;
  city?: string | null;
  state?: string | null;
  description?: string | null;
  highlights?: string[] | null;
};

function firstImage(d: XpDestination): string | null {
  const hero = String(d.heroImage || "").trim();
  if (hero) return hero;
  const img = Array.isArray(d.images) ? d.images.find((x) => String(x || "").trim()) : null;
  return img ? String(img).trim() : null;
}

export default function XpDestinationsPage() {
  const { data, isLoading, error } = useQuery<{ items: XpDestination[] }>({
    queryKey: ["/api/xp/destinations"],
    queryFn: async () => {
      const res = await fetch("/api/xp/destinations");
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error((json as any).message || "Failed to load destinations");
      return json;
    },
  });

  const items = (Array.isArray(data?.items) ? data?.items : [])
    .map((d) => ({ ...d, slug: d.slug ? String(d.slug).trim() : null }))
    .filter((d) => !!d.slug);

  return (
    <XpPublicShell>
      <div className="space-y-10">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="space-y-2">
            <div className="text-xs uppercase tracking-wider text-muted-foreground">Destinations</div>
            <h1 className="text-4xl font-semibold tracking-tight md:text-5xl">Destinations</h1>
            <p className="max-w-2xl text-sm leading-relaxed text-muted-foreground md:text-base">
              Explore Ocean Luxe destinations—then choose an experience and book in minutes.
            </p>
          </div>
          <Link href="/xp">
            <Button variant="secondary">All experiences</Button>
          </Link>
        </div>

        {isLoading ? (
          <div className="grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="h-[320px] rounded-xl border border-border/60 bg-muted/20" />
            ))}
          </div>
        ) : error ? (
          <div className="rounded-xl border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">
            {String((error as any)?.message || error)}
          </div>
        ) : items.length === 0 ? (
          <div className="rounded-xl border border-border/60 bg-background/60 p-8 text-center">
            <div className="text-base font-semibold">No destinations available</div>
            <div className="mt-2 text-sm text-muted-foreground">Ask an admin to publish destinations.</div>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-3">
            {items.map((d) => {
              const img = firstImage(d);
              const loc = `${String(d.city || "").trim()}${d.city && d.state ? ", " : ""}${String(d.state || "").trim()}`.trim();
              return (
                <Link key={d.id} href={`/xp/destinations/${encodeURIComponent(String(d.slug))}`}>
                  <Card className="group cursor-pointer overflow-hidden border-border/60 bg-background/70 shadow-[0_1px_0_rgba(255,255,255,0.12)_inset] backdrop-blur">
                    <div className="aspect-[16/10] overflow-hidden bg-muted/30">
                      {img ? (
                        <img
                          src={img}
                          alt={d.name}
                          className="h-full w-full object-cover transition duration-500 group-hover:scale-[1.03]"
                          loading="lazy"
                        />
                      ) : (
                        <div className="h-full w-full" />
                      )}
                    </div>
                    <CardContent className="space-y-2 p-4">
                      <div className="text-base font-semibold tracking-tight">{d.name}</div>
                      {loc ? (
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                          <MapPin className="h-4 w-4" />
                          {loc}
                        </div>
                      ) : null}
                      {d.description ? <div className="line-clamp-2 text-sm text-muted-foreground">{d.description}</div> : null}
                    </CardContent>
                  </Card>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </XpPublicShell>
  );
}

