import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";

type XpExperience = {
  id: number;
  slug: string;
  title: string;
  description?: string | null;
  mode?: string | null;
  currency?: string | null;
  priceTotal?: string | number | null;
  depositAmount?: string | number | null;
  images?: string[] | null;
};

export default function XpLandingPage() {
  const { data, isLoading, error } = useQuery<{ items: XpExperience[] }>({
    queryKey: ["/api/xp/experiences"],
    queryFn: async () => {
      const res = await fetch("/api/xp/experiences");
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error((json as any).message || "Failed to load experiences");
      return json;
    },
  });

  const items = Array.isArray(data?.items) ? data?.items : [];

  return (
    <div className="min-h-screen bg-muted/30 px-4 py-12">
      <div className="mx-auto w-full max-w-5xl space-y-8">
        <div className="space-y-2">
          <h1 className="text-3xl font-bold tracking-tight">Experiences</h1>
          <p className="text-muted-foreground">Book an experience in minutes.</p>
        </div>

        {isLoading && <div className="text-sm text-muted-foreground">Loading…</div>}
        {!isLoading && error && <div className="text-sm text-destructive">{String((error as any)?.message || error)}</div>}

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {items.map((x) => (
            <Card key={x.id}>
              <CardHeader>
                <CardTitle>{x.title}</CardTitle>
                {x.description ? <CardDescription>{x.description}</CardDescription> : null}
              </CardHeader>
              <CardContent className="flex items-center justify-between gap-3">
                <div className="text-sm text-muted-foreground">
                  Deposit: {x.depositAmount ?? "—"} {String(x.currency || "USD").toUpperCase()}
                </div>
                <Link href={`/xp/${encodeURIComponent(x.slug)}`}>
                  <Button>Book</Button>
                </Link>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}

