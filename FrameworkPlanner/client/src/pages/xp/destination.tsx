import { Link, useRoute } from "wouter";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { XpExperienceCard, type XpExperienceCardModel } from "@/components/xp/XpExperienceCard";
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

function imageList(d: XpDestination | null | undefined): string[] {
  const hero = String(d?.heroImage || "").trim();
  const rest = (Array.isArray(d?.images) ? d?.images : []).map((x) => String(x || "").trim()).filter(Boolean);
  return Array.from(new Set([hero, ...rest].filter(Boolean)));
}

export default function XpDestinationPage() {
  const [, params] = useRoute("/xp/destinations/:slug");
  const slug = String(params?.slug || "").trim();

  const { data, isLoading, error } = useQuery<{ destination: XpDestination; experiences: XpExperienceCardModel[] }>({
    queryKey: ["/api/xp/destinations", slug],
    enabled: !!slug,
    queryFn: async () => {
      const res = await fetch(`/api/xp/destinations/${encodeURIComponent(slug)}`);
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error((json as any).message || "Not found");
      return json;
    },
  });

  const destination = data?.destination;
  const experiences = Array.isArray(data?.experiences) ? data?.experiences : [];
  const imgs = imageList(destination);
  const loc = `${String(destination?.city || "").trim()}${destination?.city && destination?.state ? ", " : ""}${String(destination?.state || "").trim()}`.trim();

  return (
    <XpPublicShell>
      <div className="space-y-10">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="secondary" className="bg-background/60 backdrop-blur">
                Destination
              </Badge>
              {loc ? (
                <Badge variant="outline" className="bg-background/40">
                  <MapPin className="mr-1 h-3.5 w-3.5" />
                  {loc}
                </Badge>
              ) : null}
            </div>
            <h1 className="text-3xl font-semibold tracking-tight md:text-4xl">{destination?.name || "Destination"}</h1>
            {destination?.description ? <p className="max-w-2xl text-sm leading-relaxed text-muted-foreground md:text-base">{destination.description}</p> : null}
          </div>

          <div className="flex gap-2">
            <Link href="/xp/destinations">
              <Button variant="secondary">All destinations</Button>
            </Link>
            <Link href="/xp">
              <Button>All experiences</Button>
            </Link>
          </div>
        </div>

        {isLoading ? (
          <div className="space-y-6">
            <div className="h-[280px] rounded-xl border border-border/60 bg-muted/20" />
            <div className="h-[360px] rounded-xl border border-border/60 bg-muted/20" />
          </div>
        ) : error ? (
          <div className="rounded-xl border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">
            {String((error as any)?.message || error)}
          </div>
        ) : !destination ? (
          <div className="rounded-xl border border-border/60 bg-background/60 p-8 text-center">
            <div className="text-base font-semibold">Destination not found</div>
          </div>
        ) : (
          <div className="space-y-10">
            {imgs.length ? (
              <Card className="overflow-hidden border-border/60 bg-background/70 shadow-[0_1px_0_rgba(255,255,255,0.12)_inset] backdrop-blur">
                <div className="grid grid-cols-1 gap-4 p-4 sm:grid-cols-2 lg:grid-cols-4">
                  {imgs.slice(0, 4).map((src) => (
                    <div key={src} className="aspect-[16/10] overflow-hidden rounded-xl border border-border/60 bg-muted/30">
                      <img src={src} alt={destination.name} className="h-full w-full object-cover" loading="lazy" />
                    </div>
                  ))}
                </div>
              </Card>
            ) : null}

            {Array.isArray(destination.highlights) && destination.highlights.length ? (
              <Card className="border-border/60 bg-background/60 backdrop-blur">
                <CardContent className="p-5">
                  <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Highlights</div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {destination.highlights.map((h) => (
                      <Badge key={h} variant="secondary" className="bg-muted/30">
                        {h}
                      </Badge>
                    ))}
                  </div>
                </CardContent>
              </Card>
            ) : null}

            <div className="space-y-4">
              <div className="flex items-end justify-between gap-4">
                <div>
                  <div className="text-sm font-semibold tracking-tight">Experiences at {destination.name}</div>
                  <div className="text-sm text-muted-foreground">Choose an experience and book with a secure deposit.</div>
                </div>
                <div className="text-xs text-muted-foreground">Showing {experiences.length}</div>
              </div>

              {experiences.length ? (
                <div className="grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-3">
                  {experiences.map((x) => (
                    <XpExperienceCard key={x.id} experience={x} />
                  ))}
                </div>
              ) : (
                <div className="rounded-xl border border-border/60 bg-background/60 p-8 text-center">
                  <div className="text-base font-semibold">No experiences yet</div>
                  <div className="mt-2 text-sm text-muted-foreground">Ask an admin to link experiences to this destination.</div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </XpPublicShell>
  );
}

