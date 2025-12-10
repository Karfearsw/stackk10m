import { Layout } from "@/components/layout/Layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useState } from "react";
import { DollarSign, TrendingUp } from "lucide-react";

export default function Calculator() {
  const [arv, setArv] = useState(0);
  const [purchasePrice, setPurchasePrice] = useState(0);
  const [repairCosts, setRepairCosts] = useState(0);
  const [closingCosts, setClosingCosts] = useState(0);
  const [holdingCosts, setHoldingCosts] = useState(0);
  const [marketingCosts, setMarketingCosts] = useState(0);
  const [sellingCosts, setSellingCosts] = useState(0);

  const totalCosts = purchasePrice + repairCosts + closingCosts + holdingCosts + marketingCosts + sellingCosts;
  const profit = arv - totalCosts;
  const profitMargin = arv > 0 ? ((profit / arv) * 100).toFixed(1) : 0;
  const percentOfArv = arv > 0 ? ((purchasePrice / arv) * 100).toFixed(1) : 0;

  const handleReset = () => {
    setArv(0);
    setPurchasePrice(0);
    setRepairCosts(0);
    setClosingCosts(0);
    setHoldingCosts(0);
    setMarketingCosts(0);
    setSellingCosts(0);
  };

  return (
    <Layout>
      <div className="space-y-1 mb-6">
        <h1 className="text-3xl font-bold tracking-tight">Deal Calculator</h1>
        <p className="text-muted-foreground">Analyze deal profitability and ROI on potential properties.</p>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Input Section */}
        <div className="lg:col-span-2 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Property Information</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="arv">After Repair Value (ARV)</Label>
                  <div className="relative">
                    <span className="absolute left-3 top-2.5 text-muted-foreground">$</span>
                    <Input
                      id="arv"
                      type="number"
                      placeholder="500000"
                      value={arv || ""}
                      onChange={(e) => setArv(parseFloat(e.target.value) || 0)}
                      className="pl-7"
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="purchasePrice">Purchase Price</Label>
                  <div className="relative">
                    <span className="absolute left-3 top-2.5 text-muted-foreground">$</span>
                    <Input
                      id="purchasePrice"
                      type="number"
                      placeholder="300000"
                      value={purchasePrice || ""}
                      onChange={(e) => setPurchasePrice(parseFloat(e.target.value) || 0)}
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
                  <Label htmlFor="repairs">Repair Costs</Label>
                  <div className="relative">
                    <span className="absolute left-3 top-2.5 text-muted-foreground">$</span>
                    <Input
                      id="repairs"
                      type="number"
                      placeholder="50000"
                      value={repairCosts || ""}
                      onChange={(e) => setRepairCosts(parseFloat(e.target.value) || 0)}
                      className="pl-7"
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="closing">Closing Costs</Label>
                  <div className="relative">
                    <span className="absolute left-3 top-2.5 text-muted-foreground">$</span>
                    <Input
                      id="closing"
                      type="number"
                      placeholder="9000"
                      value={closingCosts || ""}
                      onChange={(e) => setClosingCosts(parseFloat(e.target.value) || 0)}
                      className="pl-7"
                    />
                  </div>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="holding">Holding Costs</Label>
                  <div className="relative">
                    <span className="absolute left-3 top-2.5 text-muted-foreground">$</span>
                    <Input
                      id="holding"
                      type="number"
                      placeholder="3000"
                      value={holdingCosts || ""}
                      onChange={(e) => setHoldingCosts(parseFloat(e.target.value) || 0)}
                      className="pl-7"
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="marketing">Marketing Costs</Label>
                  <div className="relative">
                    <span className="absolute left-3 top-2.5 text-muted-foreground">$</span>
                    <Input
                      id="marketing"
                      type="number"
                      placeholder="2000"
                      value={marketingCosts || ""}
                      onChange={(e) => setMarketingCosts(parseFloat(e.target.value) || 0)}
                      className="pl-7"
                    />
                  </div>
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="selling">Selling Costs (Real Estate Commission, etc.)</Label>
                <div className="relative">
                  <span className="absolute left-3 top-2.5 text-muted-foreground">$</span>
                  <Input
                    id="selling"
                    type="number"
                    placeholder="30000"
                    value={sellingCosts || ""}
                    onChange={(e) => setSellingCosts(parseFloat(e.target.value) || 0)}
                    className="pl-7"
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          <div className="flex gap-2">
            <Button onClick={handleReset} variant="outline" className="flex-1">
              Clear All
            </Button>
            <Button className="flex-1 bg-primary hover:bg-primary/90 text-white">
              Save Deal
            </Button>
          </div>
        </div>

        {/* Results Section */}
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
                <p className={`text-3xl font-bold ${profit >= 0 ? 'text-green-600' : 'text-destructive'}`}>
                  ${profit.toLocaleString('en-US', { maximumFractionDigits: 0 })}
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground mb-1">Profit Margin</p>
                <p className={`text-2xl font-bold ${profit >= 0 ? 'text-green-600' : 'text-destructive'}`}>
                  {profitMargin}%
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
                <span className="font-medium">${arv.toLocaleString('en-US', { maximumFractionDigits: 0 })}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Purchase:</span>
                <span>${purchasePrice.toLocaleString('en-US', { maximumFractionDigits: 0 })} ({percentOfArv}%)</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Repairs:</span>
                <span>${repairCosts.toLocaleString('en-US', { maximumFractionDigits: 0 })}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Closing:</span>
                <span>${closingCosts.toLocaleString('en-US', { maximumFractionDigits: 0 })}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Holding:</span>
                <span>${holdingCosts.toLocaleString('en-US', { maximumFractionDigits: 0 })}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Marketing:</span>
                <span>${marketingCosts.toLocaleString('en-US', { maximumFractionDigits: 0 })}</span>
              </div>
              <div className="flex justify-between pb-2 border-b">
                <span className="text-muted-foreground">Selling:</span>
                <span>${sellingCosts.toLocaleString('en-US', { maximumFractionDigits: 0 })}</span>
              </div>
              <div className="flex justify-between font-bold">
                <span>Total Costs:</span>
                <span>${totalCosts.toLocaleString('en-US', { maximumFractionDigits: 0 })}</span>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </Layout>
  );
}
