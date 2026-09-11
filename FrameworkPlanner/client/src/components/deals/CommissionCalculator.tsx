import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Calculator, Users } from "lucide-react";

/**
 * Agent commission math. Given the deal economics (sale price / assignment fee),
 * commission rates, and the agent's payout structure (split, annual cap,
 * transaction fees), computes gross commission income, company dollar, and the
 * agent's net take-home — including the cap rollover where commission above the
 * annual cap is kept 100% by the agent.
 */
export function computeCommissionMath(input: {
  dealType: "standard_sale" | "wholesale_assignment";
  salePrice: number;
  assignmentFee: number;
  listingCommissionPct: number;
  buyerAgentPct: number;
  side: "listing" | "buyer";
  referralOutPct: number;
  agentSplitPct: number;
  annualCap: number;
  companyDollarYtd: number;
  transactionFeeFlat: number;
  taxReservePct: number;
}) {
  const sidePct = input.side === "listing" ? input.listingCommissionPct : input.buyerAgentPct;
  const commissionBase = input.dealType === "wholesale_assignment" ? input.assignmentFee : input.salePrice;
  const grossCommission = commissionBase * (sidePct / 100);
  const referralFee = grossCommission * (input.referralOutPct / 100);
  const afterReferral = grossCommission - referralFee;
  const companyDollarBeforeCap = afterReferral * (1 - input.agentSplitPct / 100);
  const agentGross = afterReferral - companyDollarBeforeCap;

  // Cap rollover: once company dollar paid YTD reaches the cap, the agent keeps 100%.
  let cappedCompanyDollar = companyDollarBeforeCap;
  let capPortionToAgent = 0;
  if (input.annualCap > 0) {
    const capRemaining = Math.max(0, input.annualCap - input.companyDollarYtd);
    cappedCompanyDollar = Math.min(companyDollarBeforeCap, capRemaining);
    capPortionToAgent = companyDollarBeforeCap - cappedCompanyDollar;
  }
  const agentNetBeforeFee = agentGross + capPortionToAgent;
  const agentNet = agentNetBeforeFee - input.transactionFeeFlat;
  const afterTax = agentNet * (1 - input.taxReservePct / 100);
  const effectiveSplitPct = commissionBase > 0 ? (agentNet / commissionBase) * 100 : 0;

  return {
    grossCommission,
    referralFee,
    afterReferral,
    companyDollar: cappedCompanyDollar,
    capPortionToAgent,
    agentNet,
    agentNetBeforeFee,
    afterTax,
    effectiveSplitPct,
    capReached: input.annualCap > 0 && input.companyDollarYtd >= input.annualCap,
    capHitThisDeal: input.annualCap > 0 && capPortionToAgent > 0,
  };
}

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

export function CommissionCalculator({ presetSalePrice }: { presetSalePrice?: number | null }) {
  const [f, setF] = useState<Record<string, string>>(() => ({
    ...DEFAULTS,
    salePrice: presetSalePrice ? String(Math.round(presetSalePrice)) : "",
  }));

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
          <CardContent className="space-y-4">
            <div>
              <div className="text-xs text-muted-foreground">Net commission (before tax)</div>
              <div className="text-3xl font-bold">${money(math.agentNet)}</div>
            </div>
            {num(f.taxReservePct) > 0 && (
              <div>
                <div className="text-xs text-muted-foreground">After {money(num(f.taxReservePct))}% tax reserve</div>
                <div className="text-xl font-semibold">${money(math.afterTax)}</div>
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
              <span className="text-muted-foreground">Your side commission ({f.side === "listing" ? money(num(f.listingCommissionPct), 1) : money(num(f.buyerAgentPct), 1)}%)</span>
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
      </div>
    </div>
  );
}
