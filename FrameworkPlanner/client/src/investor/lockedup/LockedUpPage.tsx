/**
 * Locked Up: the investor's offers and deals under agreement.
 * Every row here represents capital committed or close to it.
 */
import { useEffect, useState } from "react";
import { Loader2, Lock } from "lucide-react";
import { investorApi, money, type OfferRow } from "../api";
import { RequireInvestor } from "../InvestorLayout";
import {
  LuxePageHeader,
  LuxeStatusBadge,
  LuxeDataTable,
  LuxeMobileCard,
  LuxeMobileCardRow,
  LuxeEmptyState,
  type LuxeColumn,
  type LuxeStatusTone,
} from "@/components/luxe";
import { useIsMobile } from "@/hooks/use-mobile";

function offerTone(status: string): LuxeStatusTone {
  const s = status.toLowerCase();
  if (s === "accepted" || s === "executed" || s === "under_contract") return "verified";
  if (s === "pending" || s === "submitted" || s === "negotiating") return "gold";
  if (s === "rejected" || s === "expired" || s === "withdrawn") return "oxblood";
  return "neutral";
}

export function LockedUpPage() {
  return (
    <RequireInvestor>
      <LockedUpBody />
    </RequireInvestor>
  );
}

function LockedUpBody() {
  const isMobile = useIsMobile();
  const [loading, setLoading] = useState(true);
  const [offers, setOffers] = useState<OfferRow[]>([]);

  useEffect(() => {
    investorApi.offers().then((r) => setOffers(r.offers)).catch(() => null).finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const active = offers.filter((o) => !["rejected", "expired", "withdrawn"].includes(o.status.toLowerCase()));

  const columns: LuxeColumn<OfferRow>[] = [
    {
      key: "property",
      header: "Property",
      render: (o) => (
        <div>
          <p className="font-medium">{o.address ?? "—"}</p>
          {o.city && <p className="text-xs text-muted-foreground">{o.city}</p>}
        </div>
      ),
    },
    {
      key: "amount",
      header: "Offer",
      render: (o) => <span className="font-serif font-semibold text-primary">{money(o.offerAmount)}</span>,
    },
    {
      key: "timeline",
      header: "Close",
      hideOnMobile: true,
      render: (o) => (o.closingTimelineDays != null ? `${o.closingTimelineDays} days` : "—"),
    },
    {
      key: "status",
      header: "Status",
      render: (o) => <LuxeStatusBadge tone={offerTone(o.status)} dot>{o.status.replace(/_/g, " ")}</LuxeStatusBadge>,
    },
  ];

  return (
    <div>
      <LuxePageHeader
        eyebrow="Deal Matchroom"
        title="Locked Up"
        description="Your offers and the deals you have under agreement. Oxblood means it needs your attention."
        actions={
          <LuxeStatusBadge tone="neutral" dot={active.length > 0}>
            {active.length} active
          </LuxeStatusBadge>
        }
      />

      <div className="mt-6">
        {offers.length === 0 ? (
          <LuxeEmptyState
            icon={<Lock className="h-5 w-5" />}
            title="Nothing locked up yet"
            description="When you make an offer on a match, it lands here with its status and closing timeline."
          />
        ) : isMobile ? (
          <div className="flex flex-col gap-3">
            {offers.map((o) => (
              <LuxeMobileCard key={o.id}>
                <div className="flex items-start justify-between gap-3">
                  <p className="font-serif text-base font-medium">{o.address ?? "—"}</p>
                  <LuxeStatusBadge tone={offerTone(o.status)} dot>{o.status.replace(/_/g, " ")}</LuxeStatusBadge>
                </div>
                <div className="mt-2">
                  <LuxeMobileCardRow label="Offer" value={<span className="font-serif text-primary">{money(o.offerAmount)}</span>} />
                  <LuxeMobileCardRow label="Close" value={o.closingTimelineDays != null ? `${o.closingTimelineDays} days` : "—"} />
                  {o.loiStatus && <LuxeMobileCardRow label="LOI" value={o.loiStatus} />}
                </div>
              </LuxeMobileCard>
            ))}
          </div>
        ) : (
          <LuxeDataTable columns={columns} rows={offers} keyOf={(o) => o.id} />
        )}
      </div>
    </div>
  );
}
