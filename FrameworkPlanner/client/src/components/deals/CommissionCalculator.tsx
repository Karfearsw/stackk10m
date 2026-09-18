import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { computeCommissionMath } from "@shared/underwriting";
import { Calculator, Loader2, Save, Trash2, Users } from "lucide-react";

function money(n: number, digits = 0) {
  const v = typeof n === "number" && Number.isFinite(n) ? n : 0;
  return v.toLocaleString("en-US", { maximumFractionDigits: digits, minimumFractionDigits: digits });
}

const num = (s: string) => {
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : 0;
};

const DEFAULTS = {
  dealType: "standard_sale" as const,
  salePrice: "",
  assignmentFee: "",
  listingCommissionPct: "3",
  buyerAgentPct: "3",
  side: "listing" as const,
  referralOutPct: "0",
  agentSplitPct: "70",
  annualCap: "",
  companyDollarYtd: "",
  transactionFeeFlat: "",
  taxReservePct: "25",
};

/**
 * Agent commission math runs on the shared `computeCommissionMath` (see
 * @shared/underwriting) so the server recomputes the exact same numbers when a
 * snapshot is saved — the UI never stores its own arithmetic.
 */
export function CommissionCalculator({ opportunityId, presetSalePrice }: { opportunityId?: number | null; presetSalePrice?: number | null }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [f, setF] = useState<Record<string, string>>(() => ({
    ...DEFAULTS,
    salePrice: presetSalePrice ? String(Math.round(presetSalePrice)) : "",
  }));
  const [label, setLabel] = useState("");
  const [notes, setNotes] = useState("");

  const set = (k: string, v: string) => setF((p) => ({ ...p, [k]: v }));

  const math = useMemo(
    () =>
      computeCommissionMath({
        dealType: (f.dealType as any) || "standard_sale",
        salePrice: num(f.salePrice),
        assignmentFee: num(f.assignmentFee),
        listingCommissionPct: num(f.listingCommissionPct),
        buyerAgentPct: num(f.buyerAgentPct),
        side: (f.side as any) || "listing",
        referralOutPct: num(f.referralOutPct),
        agentSplitPct: num(f.agentSplitPct),
        annualCap: num(f.annualCap),
        companyDollarYtd: num(f.companyDollarYtd),
        transactionFeeFlat: num(f.transactionFeeFlat),
        taxReservePct: num(f.taxReservePct),
      }),
    [f],
  );

  const { data: snapshots = [] } = useQuery<any[]>({
    queryKey: ["/api/opportunities", opportunityId, "commission-snapshots"],
    enabled: !!opportunityId,
    queryFn: async () => {
      const res = await fetch(`/api/opportunities/${opportunityId}/commission-snapshots`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load commission snapshots");
      return res.json();
    },
  });

  const saveSnapshot = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/opportunities/${opportunityId}/commission-snapshots`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          label: label.trim() || null,
          notes: notes.trim() || null,
          inputs: {
            dealType: f.dealType,
            side: f.side,
            salePrice: num(f.salePrice),
            assignmentFee: num(f.assignmentFee),
            listingCommissionPct: num(f.listingCommissionPct),
            buyerAgentPct: num(f.buyerAgentPct),
            referralOutPct: num(f.referralOutPct),
            agentSplitPct: num(f.agentSplitPct),
            annualCap: num(f.annualCap),
            companyDollarYtd: num(f.companyDollarYtd),
            transactionFeeFlat: num(f.transactionFeeFlat),
            taxReservePct: num(f.taxReservePct),
          },
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.message || "Failed to save snapshot");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/opportunities", opportunityId, "commission-snapshots"] });
      setLabel("");
      setNotes("");
      toast({ title: "Commission snapshot saved", description: `Projected net ${money(math.agentNet)} on this deal.` });
    },
    onError: (e: any) => toast({ title: "Could not save snapshot", description: String(e?.message || e), variant: "destructive" }),
  });

  const deleteSnapshot = useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(`/api/opportunities/${opportunityId}/commission-snapshots/${id}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.message || "Failed to delete snapshot");
      }
      return res.json();
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/opportunities", opportunityId, "commission-snapshots"] }),
    onError: (e: any) => toast({ title: "Could not delete snapshot", description: String(e?.message || e), variant: "destructive" }),
  });

  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <div className="lg:col-span-2 space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Deal & Commission</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Deal type</Label>
                <Select value={f.dealType} onValueChange={(v) => set("dealType", v)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="standard_sale">Standard sale (listing/buyer side)</SelectItem>
                    <SelectItem value="wholesale_assignment">Wholesale / assignment fee</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Your side</Label>
                <Select value={f.side} onValueChange={(v) => set("side", v)} disabled={f.dealType === "wholesale_assignment"}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="listing">Listing side</SelectItem>
                    <SelectItem value="buyer">Buyer side</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {f.dealType === "standard_sale" ? (
              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="cc-price">Sale price</Label>
                  <div className="relative">
                    <span className="absolute left-3 top-2.5 text-muted-foreground">$</span>
                    <Input id="cc-price" type="number" placeholder="450000" value={f.salePrice} onChange={(e) => set("salePrice", e.target.value)} className="pl-7" />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="cc-list">Listing side %</Label>
                  <Input id="cc-list" type="number" step="0.1" value={f.listingCommissionPct} onChange={(e) => set("listingCommissionPct", e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="cc-buyer">Buyer agent %</Label>
                  <Input id="cc-buyer" type="number" step="0.1" value={f.buyerAgentPct} onChange={(e) => set("buyerAgentPct", e.target.value)} />
                </div>
              </div>
            ) : (
              <div className="space-y-2">
                <Label htmlFor="cc-fee">Assignment fee</Label>
                <div className="relative max-w-xs">
                  <span className="absolute left-3 top-2.5 text-muted-foreground">$</span>
                  <Input id="cc-fee" type="number" placeholder="15000" value={f.assignmentFee} onChange={(e) => set("assignmentFee", e.target.value)} className="pl-7" />
                </div>
              </div>
            )}

            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label htmlFor="cc-ref">Referral out %</Label>
                <Input id="cc-ref" type="number" step="0.1" value={f.referralOutPct} onChange={(e) => set("referralOutPct", e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="cc-tx">Transaction fee (flat)</Label>
                <div className="relative">
                  <span className="absolute left-3 top-2.5 text-muted-foreground">$</span>
                  <Input id="cc-tx" type="number" value={f.transactionFeeFlat} onChange={(e) => set("transactionFeeFlat", e.target.value)} className="pl-7" />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="cc-tax">Tax reserve %</Label>
                <Input id="cc-tax" type="number" step="1" value={f.taxReservePct} onChange={(e) => set("taxReservePct", e.target.value)} />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="h-4 w-4" />
              Your Payout Structure
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label htmlFor="cc-split">Agent split %</Label>
                <Input id="cc-split" type="number" value={f.agentSplitPct} onChange={(e) => set("agentSplitPct", e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="cc-cap">Annual cap (company $)</Label>
                <div className="relative">
                  <span className="absolute left-3 top-2.5 text-muted-foreground">$</span>
                  <Input id="cc-cap" type="number" placeholder="e.g. 23000" value={f.annualCap} onChange={(e) => set("annualCap", e.target.value)} className="pl-7" />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="cc-ytd">Company $ paid YTD</Label>
                <div className="relative">
                  <span className="absolute left-3 top-2.5 text-muted-foreground">$</span>
                  <Input id="cc-ytd" type="number" value={f.companyDollarYtd} onChange={(e) => set("companyDollarYtd", e.target.value)} className="pl-7" />
                </div>
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              Once company dollar paid year-to-date reaches your cap, the remainder of this deal's company dollar rolls to you at 100%.
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="space-y-4">
        <Card className="border-primary/50 bg-primary/5">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-lg">
              <Calculator className="h-5 w-5 text-primary" />
              Your Take-Home
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">              <div className="min-w-0">
                <div className="text-xs text-muted-foreground">Net commission (before tax)</div>
                <div className="text-3xl font-bold break-all">${money(math.agentNet)}</div>
              </div>
            {num(f.taxReservePct) > 0 && (
              <div className="min-w-0">
                <div className="text-xs text-muted-foreground">After {money(num(f.taxReservePct))}% tax reserve</div>
                <div className="text-xl font-semibold break-all">${money(math.afterTax)}</div>
              </div>
            )}
            <div className="flex flex-wrap gap-2">
              <Badge variant={math.effectiveSplitPct >= num(f.agentSplitPct) ? "default" : "secondary"} className={math.effectiveSplitPct >= num(f.agentSplitPct) ? "bg-green-600 text-white" : ""}>
                Net {money(math.effectiveSplitPct, 1)}% of {f.dealType === "wholesale_assignment" ? "fee" : "price"}
              </Badge>
              {math.capReached && <Badge variant="secondary">Cap reached — you keep 100%</Badge>}
              {!math.capReached && math.capHitThisDeal && <Badge className="bg-green-600 text-white">Cap hit on this deal</Badge>}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Commission Breakdown</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">{f.dealType === "wholesale_assignment" ? "Assignment fee" : "Sale price"}</span>
              <span>${money(f.dealType === "wholesale_assignment" ? num(f.assignmentFee) : num(f.salePrice))}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">{f.dealType === "wholesale_assignment" ? "Assignment fee (gross)" : `Your side commission (${f.side === "listing" ? money(num(f.listingCommissionPct), 1) : money(num(f.buyerAgentPct), 1)}%)`}</span>
              <span>${money(math.grossCommission)}</span>
            </div>
            {math.referralFee > 0 && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Referral out</span>
                <span className="text-destructive">−${money(math.referralFee)}</span>
              </div>
            )}
            <div className="flex justify-between">
              <span className="text-muted-foreground">Company dollar ({money(100 - num(f.agentSplitPct))}%)</span>
              <span>−${money(math.companyDollar)}</span>
            </div>
            {math.capPortionToAgent > 0 && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Cap rollover to you</span>
                <span className="text-green-600">+${money(math.capPortionToAgent)}</span>
              </div>
            )}
            {num(f.transactionFeeFlat) > 0 && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Transaction fee</span>
                <span className="text-destructive">−${money(num(f.transactionFeeFlat))}</span>
              </div>
            )}
            <div className="flex justify-between border-t pt-3 font-medium">
              <span>Agent net</span>
              <span>${money(math.agentNet)}</span>
            </div>
            {f.dealType === "standard_sale" && num(f.buyerAgentPct) > 0 && (
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>Co-op to buyer agent ({money(num(f.buyerAgentPct), 1)}%)</span>
                <span>${money(num(f.salePrice) * (num(f.buyerAgentPct) / 100))}</span>
              </div>
            )}
          </CardContent>
        </Card>

        {opportunityId ? (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <Save className="h-4 w-4" />
                Save This Projection
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="space-y-2">
                <Label htmlFor="cc-snap-label">Label (optional)</Label>
                <Input id="cc-snap-label" placeholder="e.g. 3% listing, 70/30" value={label} onChange={(e) => setLabel(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="cc-snap-notes">Notes (optional)</Label>
                <Textarea id="cc-snap-notes" rows={2} placeholder="Context for this projection…" value={notes} onChange={(e) => setNotes(e.target.value)} />
              </div>
              <Button className="w-full h-auto whitespace-normal py-2 min-w-0" disabled={saveSnapshot.isPending} onClick={() => saveSnapshot.mutate()} data-testid="button-save-commission-snapshot">
                {saveSnapshot.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin shrink-0" /> : <Save className="mr-2 h-4 w-4 shrink-0" />}
                <span className="break-words">Save snapshot (net ${money(math.agentNet)})</span>
              </Button>
            </CardContent>
          </Card>
        ) : null}
      </div>

      {opportunityId && snapshots.length > 0 ? (
        <Card className="lg:col-span-3">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Saved Commission Snapshots</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm" data-testid="commission-snapshots-table">
                <thead>
                  <tr className="border-b text-left text-xs text-muted-foreground">
                    <th className="py-2 pr-4 font-medium">Saved</th>
                    <th className="py-2 pr-4 font-medium">Scenario</th>
                    <th className="py-2 pr-4 font-medium">Gross</th>
                    <th className="py-2 pr-4 font-medium">Company $</th>
                    <th className="py-2 pr-4 font-medium">Agent net</th>
                    <th className="py-2 pr-4 font-medium">After tax</th>
                    <th className="py-2 pr-4 font-medium"></th>
                  </tr>
                </thead>
                <tbody>
                  {snapshots.map((s: any) => (
                    <tr key={s.id} className="border-b last:border-0">
                      <td className="py-2 pr-4 whitespace-nowrap">{s.createdAt ? new Date(s.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "—"}</td>
                      <td className="py-2 pr-4">
                        <div className="font-medium">{s.label || (s.dealType === "wholesale_assignment" ? "Wholesale fee" : `${s.side === "listing" ? "Listing" : "Buyer"} side`)}</div>
                        {s.notes ? <div className="text-xs text-muted-foreground max-w-xs truncate" title={s.notes}>{s.notes}</div> : null}
                      </td>
                      <td className="py-2 pr-4">${money(Number(s.grossCommission))}</td>
                      <td className="py-2 pr-4">
                        −${money(Number(s.companyDollar))}
                        {Number(s.capPortionToAgent) > 0 ? <span className="ml-1 text-xs text-green-600">+cap</span> : null}
                      </td>
                      <td className="py-2 pr-4 font-semibold">${money(Number(s.agentNet))}</td>
                      <td className="py-2 pr-4">${money(Number(s.afterTax))}</td>
                      <td className="py-2 pr-2 text-right">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-muted-foreground hover:text-destructive"
                          aria-label="Delete snapshot"
                          onClick={() => deleteSnapshot.mutate(s.id)}
                          disabled={deleteSnapshot.isPending}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="mt-3 text-xs text-muted-foreground">
              Snapshots are recomputed server-side when saved, so these projections are exact. Delete is limited to your own snapshots.
            </p>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
