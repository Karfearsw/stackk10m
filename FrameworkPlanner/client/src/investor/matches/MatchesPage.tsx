/**
 * Matches page: the investor's scored deal list.
 *
 * Honesty rule: when the profile is incomplete we show the "Improve your
 * matches" checklist instead of manufacturing match accuracy. Completed
 * items sharpen scores; incomplete items link straight to the field that
 * needs attention.
 */
import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { Loader2, ListChecks, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { investorApi, type DealCard, type InvestorProfile } from "../api";
import { RequireInvestor } from "../InvestorLayout";
import { LuxePageHeader, LuxeSection, LuxeStatusBadge, LuxePropertyCard, LuxeEmptyState } from "@/components/luxe";
import { profileChecklist } from "../onboarding/profile";

export function MatchesPage() {
  return (
    <RequireInvestor>
      <MatchesBody />
    </RequireInvestor>
  );
}

function MatchesBody() {
  const [, setLocation] = useLocation();
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<InvestorProfile | null>(null);
  const [cards, setCards] = useState<DealCard[]>([]);

  useEffect(() => {
    Promise.allSettled([investorApi.getProfile(), investorApi.feed("score")]).then(([p, f]) => {
      if (p.status === "fulfilled") setProfile(p.value.profile);
      if (f.status === "fulfilled") setCards(f.value.cards);
      setLoading(false);
    });
  }, []);

  if (loading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const checklist = profileChecklist(profile);
  const incomplete = checklist.filter((i) => !i.done);
  const complete = profile?.isComplete === true;

  return (
    <div>
      <LuxePageHeader
        eyebrow="Deal Matchroom"
        title="Matches"
        description="Deals scored against your profile and buy boxes. Finish your profile and the scores get honest."
        actions={
          profile ? (
            <LuxeStatusBadge tone={complete ? "verified" : "gold"} dot>
              {complete ? "Profile complete" : `${checklist.filter((i) => i.done).length}/${checklist.length} profile fields`}
            </LuxeStatusBadge>
          ) : undefined
        }
      />

      {/* The checklist: shown prominently while the profile is incomplete. */}
      {!complete && (
        <LuxeSection
          title="Improve your matches"
          description="Each item you finish sharpens every score below. We would rather show you this list than a made-up number."
          className="mt-6"
          actions={
            <Button size="sm" onClick={() => setLocation("/investor/onboarding")}>
              Open profile <ArrowRight className="ml-1 h-4 w-4" />
            </Button>
          }
        >
          <ul className="flex flex-col gap-2">
            {incomplete.map((item) => (
              <li key={item.id}>
                <button
                  type="button"
                  onClick={() => setLocation(`/investor/onboarding?step=${item.step}`)}
                  className="flex w-full items-center justify-between gap-3 rounded-lg border border-border px-4 py-3 text-left transition-colors hover:border-primary/50"
                >
                  <span className="flex items-start gap-3">
                    <ListChecks className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                    <span>
                      <span className="block text-sm font-medium">{item.label}</span>
                      <span className="block text-xs text-muted-foreground">{item.hint}</span>
                    </span>
                  </span>
                  <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                </button>
              </li>
            ))}
          </ul>
        </LuxeSection>
      )}

      <div className="mt-8">
        {cards.length === 0 ? (
          <LuxeEmptyState
            title={complete ? "No matches yet" : "Matches will appear here"}
            description={
              complete
                ? "Nothing in inventory clears your criteria right now. New matches land here automatically."
                : "Once inventory is scored against a finished profile, your matches land here."
            }
            actionLabel={complete ? undefined : "Finish profile"}
            onAction={complete ? undefined : () => setLocation("/investor/onboarding")}
          />
        ) : (
          <>
            {!complete && (
              <p className="mb-4 text-xs text-muted-foreground">
                These scores are rough until your profile is complete — treat them as a preview, not a verdict.
              </p>
            )}
            <div className={cn("grid gap-5", "sm:grid-cols-2 lg:grid-cols-3")}>
              {cards.slice(0, 24).map((card) => (
                <LuxePropertyCard
                  key={card.deal.id}
                  property={{
                    id: card.deal.id,
                    image: card.deal.image,
                    address: card.deal.address,
                    city: card.deal.city,
                    state: card.deal.state,
                    zipCode: card.deal.zipCode,
                    propertyType: card.deal.propertyType,
                    price: card.deal.price,
                    arv: card.deal.arv,
                    repairCost: card.deal.repairCost,
                    spread: card.spread,
                    beds: card.deal.beds,
                    baths: card.deal.baths,
                    sqft: card.deal.sqft,
                    matchScore: complete ? card.score : null,
                  }}
                  onOpen={() => setLocation("/investor/discover")}
                />
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
