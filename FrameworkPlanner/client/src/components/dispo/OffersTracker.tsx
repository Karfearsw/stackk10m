import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import {
  OFFER_STATUSES,
  OFFER_STATUS_LABELS,
  canTransitionOfferStatus,
  type OfferStatus,
} from "@shared/dispo-stages";
import { Plus } from "lucide-react";

interface Offer {
  id: number;
  buyerName: string;
  offerAmount: string | number | null;
  earnestMoney: string | number | null;
  contingencies: string[] | null;
  status: string | null;
  closingDate: string | null;
  specialTerms: string | null;
  createdAt: string | null;
}

function money(v: string | number | null): string {
  if (v === null || v === undefined || v === "") return "—";
  const n = Number(v);
  if (!Number.isFinite(n)) return "—";
  return "$" + Math.round(n).toLocaleString("en-US");
}

const STATUS_VARIANT: Record<string, "default" | "secondary" | "outline" | "destructive"> = {
  verbal: "outline",
  loi_sent: "secondary",
  accepted: "default",
  dead: "destructive",
};

export function OffersTracker({ dealId }: { dealId: number }) {
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [buyerName, setBuyerName] = useState("");
  const [amount, setAmount] = useState("");
  const [earnest, setEarnest] = useState("");
  const [contingencies, setContingencies] = useState("");
  const [formError, setFormError] = useState<string | null>(null);

  const { data, isLoading, isError } = useQuery<{ offers: Offer[] }>({
    queryKey: ["disposition-offers", dealId],
    queryFn: async () => {
      const res = await fetch(`/api/disposition/deals/${dealId}/offers`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error(`offers failed: ${res.status}`);
      return res.json();
    },
  });

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: ["disposition-offers", dealId] });

  const createOffer = useMutation({
    mutationFn: () =>
      apiRequest("POST", `/api/disposition/deals/${dealId}/offers`, {
        buyerName: buyerName.trim(),
        amount: Number(amount),
        earnestMoney: earnest ? Number(earnest) : null,
        contingencies: contingencies
          .split(",")
          .map((c) => c.trim())
          .filter(Boolean),
        status: "verbal",
      }),
    onSuccess: async () => {
      await invalidate();
      setShowForm(false);
      setBuyerName("");
      setAmount("");
      setEarnest("");
      setContingencies("");
      setFormError(null);
    },
    onError: (e: any) => setFormError(e?.message ?? "Could not create offer."),
  });

  const setStatus = useMutation({
    mutationFn: ({ offerId, status }: { offerId: number; status: OfferStatus }) =>
      apiRequest("PATCH", `/api/disposition/offers/${offerId}`, { status }),
    onSuccess: invalidate,
  });

  const offers = data?.offers ?? [];

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="text-sm font-medium">
          Offers <span className="text-muted-foreground">({offers.length})</span>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            setShowForm((s) => !s);
            setFormError(null);
          }}
        >
          <Plus className="mr-2 h-3.5 w-3.5" /> Log offer
        </Button>
      </div>

      {showForm && (
        <div className="space-y-3 rounded-lg border border-border/60 p-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <Label htmlFor="offer-buyer">Buyer name</Label>
              <Input
                id="offer-buyer"
                value={buyerName}
                onChange={(e) => setBuyerName(e.target.value)}
                placeholder="e.g. Acme Investments LLC"
              />
            </div>
            <div>
              <Label htmlFor="offer-amount">Offer amount ($)</Label>
              <Input
                id="offer-amount"
                type="number"
                min="1"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="185000"
              />
            </div>
            <div>
              <Label htmlFor="offer-earnest">Earnest money ($)</Label>
              <Input
                id="offer-earnest"
                type="number"
                min="0"
                value={earnest}
                onChange={(e) => setEarnest(e.target.value)}
                placeholder="5000"
              />
            </div>
            <div className="col-span-2">
              <Label htmlFor="offer-cont">Contingencies (comma-separated)</Label>
              <Textarea
                id="offer-cont"
                value={contingencies}
                onChange={(e) => setContingencies(e.target.value)}
                placeholder="inspection, clear title"
                rows={2}
              />
            </div>
          </div>
          {formError && (
            <div className="text-xs text-destructive">{formError}</div>
          )}
          <Button
            size="sm"
            disabled={createOffer.isPending || !buyerName.trim() || !amount}
            onClick={() => createOffer.mutate()}
          >
            {createOffer.isPending ? "Saving…" : "Save offer"}
          </Button>
        </div>
      )}

      {isLoading && (
        <div className="space-y-2">
          {[0, 1].map((i) => (
            <Skeleton key={i} className="h-20 w-full" />
          ))}
        </div>
      )}
      {isError && (
        <div className="text-sm text-muted-foreground">
          Could not load offers.
        </div>
      )}
      {!isLoading && offers.length === 0 && (
        <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
          No offers logged yet.
        </div>
      )}
      {offers.map((o) => {
        const current = (o.status ?? "verbal") as OfferStatus;
        const nextOptions = OFFER_STATUSES.filter(
          (s) => s !== current && canTransitionOfferStatus(current, s),
        );
        return (
          <div
            key={o.id}
            className="rounded-lg border border-border/60 p-3"
          >
            <div className="flex items-start justify-between gap-2">
              <div>
                <div className="font-medium">{o.buyerName}</div>
                <div className="text-sm text-muted-foreground">
                  {money(o.offerAmount)}
                  {o.earnestMoney ? ` · EMD ${money(o.earnestMoney)}` : ""}
                </div>
              </div>
              <Badge variant={STATUS_VARIANT[current] ?? "outline"}>
                {OFFER_STATUS_LABELS[current] ?? current}
              </Badge>
            </div>
            {o.contingencies && o.contingencies.length > 0 && (
              <div className="mt-1 text-xs text-muted-foreground">
                Contingencies: {o.contingencies.join(", ")}
              </div>
            )}
            {nextOptions.length > 0 && (
              <div className="mt-2 flex items-center gap-2">
                <Label className="text-xs text-muted-foreground">
                  Move to:
                </Label>
                <Select
                  onValueChange={(v) =>
                    setStatus.mutate({
                      offerId: o.id,
                      status: v as OfferStatus,
                    })
                  }
                  disabled={setStatus.isPending}
                >
                  <SelectTrigger className="h-8 w-40">
                    <SelectValue placeholder="Select status" />
                  </SelectTrigger>
                  <SelectContent>
                    {nextOptions.map((s) => (
                      <SelectItem key={s} value={s}>
                        {OFFER_STATUS_LABELS[s]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
