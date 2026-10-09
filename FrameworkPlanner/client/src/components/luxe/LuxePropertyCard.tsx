import { Card, CardContent } from "@/components/ui/card";
import { LuxeStatusBadge } from "./LuxeStatusBadge";
import { LuxeMatchScore } from "./LuxeMatchScore";
import { cn } from "@/lib/utils";
import { MapPin, BedDouble, Bath, Ruler } from "lucide-react";

export type LuxeProperty = {
  id: string | number;
  image?: string | null;
  address: string;
  city?: string | null;
  state?: string | null;
  zipCode?: string | null;
  propertyType?: string | null;
  price?: number | null;
  arv?: number | null;
  repairCost?: number | null;
  spread?: number | null;
  beds?: number | null;
  baths?: number | null;
  sqft?: number | null;
  matchScore?: number | null;
  statusLabel?: string | null;
  statusTone?: "gold" | "neutral" | "verified" | "oxblood" | "info";
  verificationLabel?: string | null;
};

function money(n: number | null | undefined): string {
  if (n === null || n === undefined) return "—";
  return "$" + Math.round(Number(n)).toLocaleString("en-US");
}

type LuxePropertyCardProps = {
  property: LuxeProperty;
  onOpen?: () => void;
  footer?: React.ReactNode;
  className?: string;
};

/**
 * Editorial property card: photography first, serif address,
 * restrained metrics, optional match score. No gradients, no neon.
 */
export function LuxePropertyCard({ property: p, onOpen, footer, className }: LuxePropertyCardProps) {
  return (
    <Card className={cn("overflow-hidden border-border/60", onOpen && "cursor-pointer hover:border-primary/40 transition-colors", className)} onClick={onOpen}>
      <div className="relative aspect-[4/3] bg-muted">
        {p.image ? (
          <img src={p.image} alt={p.address} className="h-full w-full object-cover" loading="lazy" />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-muted-foreground">
            <span className="font-serif text-lg">Ocean Luxe</span>
          </div>
        )}
        <div className="absolute left-3 top-3 flex gap-2">
          {p.statusLabel && <LuxeStatusBadge tone={p.statusTone || "neutral"}>{p.statusLabel}</LuxeStatusBadge>}
          {p.verificationLabel && <LuxeStatusBadge tone="verified">{p.verificationLabel}</LuxeStatusBadge>}
        </div>
        {typeof p.matchScore === "number" && (
          <div className="absolute right-3 top-3 rounded-full bg-background/90 p-1 backdrop-blur">
            <LuxeMatchScore score={p.matchScore} size="sm" />
          </div>
        )}
      </div>
      <CardContent className="p-4">
        <h3 className="font-serif text-lg font-medium leading-snug tracking-tight">{p.address}</h3>
        <p className="mt-0.5 flex items-center gap-1 text-sm text-muted-foreground">
          <MapPin className="h-3.5 w-3.5" aria-hidden />
          {[p.city, p.state, p.zipCode].filter(Boolean).join(", ")}
        </p>
        <div className="mt-3 flex items-baseline justify-between gap-2">
          <div>
            <p className="text-[11px] uppercase tracking-[0.12em] text-muted-foreground">Asking</p>
            <p className="font-serif text-xl font-semibold text-primary">{money(p.price)}</p>
          </div>
          {p.spread != null && (
            <div className="text-right">
              <p className="text-[11px] uppercase tracking-[0.12em] text-muted-foreground">Est. spread</p>
              <p className="font-serif text-xl font-semibold">{money(p.spread)}</p>
            </div>
          )}
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
          {p.beds != null && <span className="flex items-center gap-1"><BedDouble className="h-4 w-4" aria-hidden />{p.beds} bd</span>}
          {p.baths != null && <span className="flex items-center gap-1"><Bath className="h-4 w-4" aria-hidden />{p.baths} ba</span>}
          {p.sqft != null && <span className="flex items-center gap-1"><Ruler className="h-4 w-4" aria-hidden />{Number(p.sqft).toLocaleString()} sqft</span>}
          {p.propertyType && <LuxeStatusBadge tone="neutral">{p.propertyType}</LuxeStatusBadge>}
        </div>
        {(p.arv != null || p.repairCost != null) && (
          <div className="mt-3 grid grid-cols-2 gap-2 border-t border-border/60 pt-3 text-sm">
            <div><p className="text-[11px] text-muted-foreground">Est. ARV</p><p className="font-medium">{money(p.arv)}</p></div>
            <div><p className="text-[11px] text-muted-foreground">Est. repairs</p><p className="font-medium">{money(p.repairCost)}</p></div>
          </div>
        )}
        {footer && <div className="mt-4 border-t border-border/60 pt-3">{footer}</div>}
      </CardContent>
    </Card>
  );
}
