import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { TrendingUp } from "lucide-react";

export type DealCalculatorValues = {
  arv?: number | null;
  purchasePrice?: number | null;
  repairCosts?: number | null;
  closingCosts?: number | null;
  holdingCosts?: number | null;
  marketingCosts?: number | null;
  sellingCosts?: number | null;
};

function safeNumber(value: unknown): number {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  if (typeof value === "string") {
    const n = parseFloat(value);
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
}

export function DealCalculator({
  initialValues,
  showActions = true,
  onSave,
}: {
  initialValues?: DealCalculatorValues;
  showActions?: boolean;
  onSave?: (values: Required<DealCalculatorValues>) => void;
}) {
  const [arv, setArv] = useState(() => safeNumber(initialValues?.arv));
  const [purchasePrice, setPurchasePrice] = useState(() => safeNumber(initialValues?.purchasePrice));
  const [repairCosts, setRepairCosts] = useState(() => safeNumber(initialValues?.repairCosts));
  const [closingCosts, setClosingCosts] = useState(() => safeNumber(initialValues?.closingCosts));
  const [holdingCosts, setHoldingCosts] = useState(() => safeNumber(initialValues?.holdingCosts));
  const [marketingCosts, setMarketingCosts] = useState(() => safeNumber(initialValues?.marketingCosts));
  const [sellingCosts, setSellingCosts] = useState(() => safeNumber(initialValues?.sellingCosts));

  const metrics = useMemo(() => {
    const totalCosts = purchasePrice + repairCosts + closingCosts + holdingCosts + marketingCosts + sellingCosts;
    const profit = arv - totalCosts;
    const profitMargin = arv > 0 ? (profit / arv) * 100 : 0;
    const percentOfArv = arv > 0 ? (purchasePrice / arv) * 100 : 0;
    return { totalCosts, profit, profitMargin, percentOfArv };
  }, [arv, purchasePrice, repairCosts, closingCosts, holdingCosts, marketingCosts, sellingCosts]);

  const handleReset = () => {
    setArv(0);
    setPurchasePrice(0);
    setRepairCosts(0);
    setClosingCosts(0);
    setHoldingCosts(0);
    setMarketingCosts(0);
    setSellingCosts(0);
  };

  const handleSave = () => {
    onSave?.({
      arv,
      purchasePrice,
      repairCosts,
      closingCosts,
      holdingCosts,
      marketingCosts,
      sellingCosts,
    });
  };

  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <div className="lg:col-span-2 space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Property Information</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="dc-arv">After Repair Value (ARV)</Label>
                <div className="relative">
                  <span className="absolute left-3 top-2.5 text-muted-foreground">$</span>
                  <Input
                    id="dc-arv"
                    type="number"
                    placeholder="500000"
                    value={arv || ""}
                    onChange={(e) => setArv(safeNumber(e.target.value))}
                    className="pl-7"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="dc-purchasePrice">Purchase Price</Label>
                <div className="relative">
                  <span className="absolute left-3 top-2.5 text-muted-foreground">$</span>
                  <Input
                    id="dc-purchasePrice"
                    type="number"
                    placeholder="300000"
                    value={purchasePrice || ""}
                    onChange={(e) => setPurchasePrice(safeNumber(e.target.value))}
                    className="pl-7"
                  />
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Costs & Expenses</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="dc-repairs">Repair Costs</Label>
                <div className="relative">
                  <span className="absolute left-3 top-2.5 text-muted-foreground">$</span>
                  <Input
                    id="dc-repairs"
                    type="number"
                    placeholder="50000"
                    value={repairCosts || ""}
                    onChange={(e) => setRepairCosts(safeNumber(e.target.value))}
                    className="pl-7"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="dc-closing">Closing Costs</Label>
                <div className="relative">
                  <span className="absolute left-3 top-2.5 text-muted-foreground">$</span>
                  <Input
                    id="dc-closing"
                    type="number"
                    placeholder="9000"
                    value={closingCosts || ""}
                    onChange={(e) => setClosingCosts(safeNumber(e.target.value))}
                    className="pl-7"
                  />
                </div>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="dc-holding">Holding Costs</Label>
                <div className="relative">
                  <span className="absolute left-3 top-2.5 text-muted-foreground">$</span>
                  <Input
                    id="dc-holding"
                    type="number"
                    placeholder="3000"
                    value={holdingCosts || ""}
                    onChange={(e) => setHoldingCosts(safeNumber(e.target.value))}
                    className="pl-7"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="dc-marketing">Marketing Costs</Label>
                <div className="relative">
                  <span className="absolute left-3 top-2.5 text-muted-foreground">$</span>
                  <Input
                    id="dc-marketing"
                    type="number"
                    placeholder="2000"
                    value={marketingCosts || ""}
                    onChange={(e) => setMarketingCosts(safeNumber(e.target.value))}
                    className="pl-7"
                  />
                </div>
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="dc-selling">Selling Costs (Real Estate Commission, etc.)</Label>
              <div className="relative">
                <span className="absolute left-3 top-2.5 text-muted-foreground">$</span>
                <Input
                  id="dc-selling"
                  type="number"
                  placeholder="30000"
                  value={sellingCosts || ""}
                  onChange={(e) => setSellingCosts(safeNumber(e.target.value))}
                  className="pl-7"
                />
              </div>
            </div>
          </CardContent>
        </Card>

        {showActions && (
          <div className="flex gap-2">
            <Button onClick={handleReset} variant="outline" className={onSave ? "flex-1" : "w-full"}>
              Clear All
            </Button>
            {onSave && (
              <Button className="flex-1 bg-primary hover:bg-primary/90 text-white" onClick={handleSave}>
                Save Deal
              </Button>
            )}
          </div>
        )}
      </div>

      <div className="space-y-4">
        <Card className="border-primary/50 bg-primary/5">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-lg">
              <TrendingUp className="h-5 w-5 text-primary" />
              Profit Analysis
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <p className="text-xs text-muted-foreground mb-1">Total Profit</p>
              <p className={`text-3xl font-bold ${metrics.profit >= 0 ? "text-green-600" : "text-destructive"}`}>
                ${metrics.profit.toLocaleString("en-US", { maximumFractionDigits: 0 })}
              </p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground mb-1">Profit Margin</p>
              <p className={`text-2xl font-bold ${metrics.profit >= 0 ? "text-green-600" : "text-destructive"}`}>
                {metrics.profitMargin.toFixed(1)}%
              </p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Cost Breakdown</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="flex justify-between pb-2 border-b">
              <span className="text-muted-foreground">ARV:</span>
              <span className="font-medium">${arv.toLocaleString("en-US", { maximumFractionDigits: 0 })}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Purchase:</span>
              <span>
                ${purchasePrice.toLocaleString("en-US", { maximumFractionDigits: 0 })} ({metrics.percentOfArv.toFixed(1)}%)
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Repairs:</span>
              <span>${repairCosts.toLocaleString("en-US", { maximumFractionDigits: 0 })}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Closing:</span>
              <span>${closingCosts.toLocaleString("en-US", { maximumFractionDigits: 0 })}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Holding:</span>
              <span>${holdingCosts.toLocaleString("en-US", { maximumFractionDigits: 0 })}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Marketing:</span>
              <span>${marketingCosts.toLocaleString("en-US", { maximumFractionDigits: 0 })}</span>
            </div>
            <div className="flex justify-between pb-2 border-b">
              <span className="text-muted-foreground">Selling:</span>
              <span>${sellingCosts.toLocaleString("en-US", { maximumFractionDigits: 0 })}</span>
            </div>
            <div className="flex justify-between font-bold">
              <span>Total Costs:</span>
              <span>${metrics.totalCosts.toLocaleString("en-US", { maximumFractionDigits: 0 })}</span>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
