import { Link } from "wouter";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { Clock3, MapPin, Sparkles } from "lucide-react";

export type XpExperienceCardModel = {
  id: number;
  slug: string;
  title: string;
  description?: string | null;
  mode?: string | null;
  currency?: string | null;
  priceTotal?: string | number | null;
  depositAmount?: string | number | null;
  paymentMode?: string | null;
  images?: string[] | null;
  location?: string | null;
  durationMinutes?: number | null;
  destination?: {
    id: number;
    name: string;
    slug?: string | null;
    heroImage?: string | null;
    images?: string[] | null;
  } | null;
};

function moneyLabel(v: any) {
  if (v == null) return null;
  const s = String(v).trim();
  if (!s) return null;
  return s;
}

function durationLabel(minutes?: number | null) {
  if (!minutes || minutes <= 0) return null;
  if (minutes < 60) return `${minutes} min`;
  const h = Math.round((minutes / 60) * 10) / 10;
  return `${h} hr`;
}

export function XpExperienceCard({ experience }: { experience: XpExperienceCardModel }) {
  const image =
    (Array.isArray(experience.images) ? experience.images.find((x) => String(x || "").trim()) : null) ||
    (experience.destination?.heroImage ? String(experience.destination.heroImage || "").trim() : null) ||
    (Array.isArray(experience.destination?.images) ? experience.destination?.images?.find((x) => String(x || "").trim()) : null) ||
    null;
  const currency = String(experience.currency || "USD").toUpperCase();
  const paymentMode = String(experience.paymentMode || "deposit").toLowerCase();
  const dueNow = paymentMode === "full" ? moneyLabel(experience.priceTotal) : moneyLabel(experience.depositAmount);
  const total = moneyLabel(experience.priceTotal);

  return (
    <Card className="group overflow-hidden border-border/60 bg-background/70 shadow-[0_1px_0_rgba(255,255,255,0.12)_inset] backdrop-blur">
      <div className="relative">
        <div className="aspect-[16/10] w-full overflow-hidden bg-muted/30">
          {image ? (
            <img
              src={image}
              alt={experience.title}
              className="h-full w-full object-cover transition duration-500 group-hover:scale-[1.03]"
              loading="lazy"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center">
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Sparkles className="h-4 w-4" />
                Add images in XP Admin
              </div>
            </div>
          )}
        </div>

        <div className="absolute left-3 top-3 flex flex-wrap gap-2">
          {experience.location ? (
            <Badge variant="secondary" className="bg-background/75 backdrop-blur">
              <MapPin className="mr-1 h-3.5 w-3.5" />
              {experience.location}
            </Badge>
          ) : null}
          {durationLabel(experience.durationMinutes) ? (
            <Badge variant="secondary" className="bg-background/75 backdrop-blur">
              <Clock3 className="mr-1 h-3.5 w-3.5" />
              {durationLabel(experience.durationMinutes)}
            </Badge>
          ) : null}
          {experience.mode ? (
            <Badge variant="outline" className="border-background/40 bg-background/60 text-foreground/80 backdrop-blur">
              {String(experience.mode).replace(/_/g, " ")}
            </Badge>
          ) : null}
        </div>
      </div>

      <CardContent className="space-y-3 p-4">
        <div className="space-y-1">
          <div className="text-base font-semibold tracking-tight">{experience.title}</div>
          {experience.description ? (
            <div className="line-clamp-2 text-sm text-muted-foreground">{experience.description}</div>
          ) : null}
        </div>

        <div className="flex items-end justify-between gap-4">
          <div className="space-y-0.5">
            <div className="text-xs uppercase tracking-wider text-muted-foreground">
              {paymentMode === "full" ? "Due now" : "Deposit"}
            </div>
            <div className="text-sm font-semibold">
              {dueNow ? (
                <>
                  {dueNow} {currency}
                </>
              ) : (
                "—"
              )}
            </div>
            {paymentMode !== "full" && total ? (
              <div className="text-xs text-muted-foreground">
                Total {total} {currency}
              </div>
            ) : null}
          </div>

          <Link href={`/xp/${encodeURIComponent(experience.slug)}`}>
            <Button className={cn("shadow-sm")}>View details</Button>
          </Link>
        </div>
      </CardContent>
    </Card>
  );
}
