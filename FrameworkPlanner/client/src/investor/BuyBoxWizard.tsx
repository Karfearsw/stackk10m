/** 5-step buy-box onboarding wizard. Persists to buyer_profiles via /api/investor/buy-box. */
import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { Loader2, ArrowLeft, ArrowRight, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { investorApi, type BuyBox } from "./api";
import { InvestorPage, RequireInvestor } from "./InvestorLayout";

const STEPS = ["Markets", "Property types", "Deal size", "Strategy", "Notifications"];

const STRATEGIES = [
  { id: "fix-and-flip", label: "Fix & Flip" },
  { id: "buy-and-hold", label: "Buy & Hold" },
  { id: "brrrr", label: "BRRRR" },
  { id: "wholesale", label: "Wholesale" },
  { id: "land", label: "Land" },
  { id: "new-build", label: "New Build" },
];

const PROPERTY_TYPES = [
  { id: "sfr", label: "Single Family" },
  { id: "mfr-2-4", label: "2–4 Units" },
  { id: "mfr-5+", label: "5+ Units" },
  { id: "condo", label: "Condo" },
  { id: "land", label: "Land" },
  { id: "commercial", label: "Commercial" },
  { id: "mobile", label: "Mobile" },
];

const US_STATES = ["AL","AK","AZ","AR","CA","CO","CT","DE","FL","GA","HI","ID","IL","IN","IA","KS","KY","LA","ME","MD","MA","MI","MN","MS","MO","MT","NE","NV","NH","NJ","NM","NY","NC","ND","OH","OK","OR","PA","RI","SC","SD","TN","TX","UT","VT","VA","WA","WV","WI","WY","DC"];

function Chip({ selected, onClick, children }: { selected: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-full border px-3 py-1.5 text-sm transition-colors",
        selected ? "border-[#D4AF37] bg-[#D4AF37]/15 text-[#D4AF37]" : "border-white/15 text-neutral-400 hover:border-white/40 hover:text-white",
      )}
    >
      {children}
    </button>
  );
}

function toggle(list: string[], v: string) {
  return list.includes(v) ? list.filter((x) => x !== v) : [...list, v];
}

export function BuyBoxWizard() {
  return (
    <RequireInvestor>
      <WizardBody />
    </RequireInvestor>
  );
}

function WizardBody() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [step, setStep] = useState(0);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [box, setBox] = useState<BuyBox>({
    targetStates: [], targetZips: [], strategies: [], minSpread: null, minYield: null,
    propertyTypes: [], priceMin: null, priceMax: null, minBeds: null, maxBeds: null, notifyMode: "digest",
  });
  const [zipInput, setZipInput] = useState("");

  useEffect(() => {
    investorApi.getBuyBox().then(setBox).catch(() => null).finally(() => setLoading(false));
  }, []);

  const save = async (done: boolean) => {
    setSaving(true);
    try {
      await investorApi.saveBuyBox(box);
      toast({ title: "Buy box saved" });
      if (done) setLocation("/investor/discover");
    } catch (e: any) {
      toast({ title: "Save failed", description: e?.message || "Try again.", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="flex min-h-[40vh] items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-[#D4AF37]" /></div>;
  }

  const addZip = () => {
    const z = zipInput.replace(/\D/g, "").slice(0, 5);
    if (z.length === 5 && !box.targetZips.includes(z)) setBox({ ...box, targetZips: [...box.targetZips, z] });
    setZipInput("");
  };

  return (
    <InvestorPage title="Your buy box" subtitle="Tell us exactly what you buy — we'll match deals to it.">
      {/* stepper */}
      <div className="mb-8 flex flex-wrap gap-2">
        {STEPS.map((s, i) => (
          <button key={s} onClick={() => setStep(i)} className={cn("flex items-center gap-2 rounded-full px-3 py-1.5 text-xs",
            i === step ? "bg-[#D4AF37] text-black font-semibold" : i < step ? "bg-[#D4AF37]/20 text-[#D4AF37]" : "bg-white/5 text-neutral-500")}>
            {i < step ? <Check className="h-3 w-3" /> : <span>{i + 1}</span>} {s}
          </button>
        ))}
      </div>

      <Card className="border-white/10 bg-[#121212]">
        <CardContent className="py-6">
          {step === 0 && (
            <div className="flex flex-col gap-5">
              <div>
                <Label className="text-neutral-300">States you invest in</Label>
                <div className="mt-2 flex max-h-48 flex-wrap gap-1.5 overflow-y-auto">
                  {US_STATES.map((st) => (
                    <Chip key={st} selected={box.targetStates.includes(st)} onClick={() => setBox({ ...box, targetStates: toggle(box.targetStates, st) })}>{st}</Chip>
                  ))}
                </div>
              </div>
              <div>
                <Label className="text-neutral-300">Target zip codes</Label>
                <div className="mt-2 flex gap-2">
                  <Input value={zipInput} onChange={(e) => setZipInput(e.target.value)} onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addZip())} placeholder="32801" maxLength={5} className="w-32 border-white/10 bg-black text-white" />
                  <Button type="button" variant="outline" className="border-white/20 text-white" onClick={addZip}>Add</Button>
                </div>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {box.targetZips.map((z) => (
                    <Badge key={z} variant="outline" className="cursor-pointer border-[#D4AF37]/50 text-[#D4AF37]" onClick={() => setBox({ ...box, targetZips: box.targetZips.filter((x) => x !== z) })}>{z} ✕</Badge>
                  ))}
                </div>
              </div>
            </div>
          )}

          {step === 1 && (
            <div>
              <Label className="text-neutral-300">Property types</Label>
              <div className="mt-3 flex flex-wrap gap-2">
                {PROPERTY_TYPES.map((t) => (
                  <Chip key={t.id} selected={box.propertyTypes.includes(t.id)} onClick={() => setBox({ ...box, propertyTypes: toggle(box.propertyTypes, t.id) })}>{t.label}</Chip>
                ))}
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="grid grid-cols-2 gap-4">
              <div><Label className="text-neutral-300">Min price ($)</Label><Input type="number" min={0} value={box.priceMin ?? ""} onChange={(e) => setBox({ ...box, priceMin: e.target.value ? Number(e.target.value) : null })} className="border-white/10 bg-black text-white" /></div>
              <div><Label className="text-neutral-300">Max price ($)</Label><Input type="number" min={0} value={box.priceMax ?? ""} onChange={(e) => setBox({ ...box, priceMax: e.target.value ? Number(e.target.value) : null })} className="border-white/10 bg-black text-white" /></div>
              <div><Label className="text-neutral-300">Min beds</Label><Input type="number" min={0} value={box.minBeds ?? ""} onChange={(e) => setBox({ ...box, minBeds: e.target.value ? Number(e.target.value) : null })} className="border-white/10 bg-black text-white" /></div>
              <div><Label className="text-neutral-300">Max beds</Label><Input type="number" min={0} value={box.maxBeds ?? ""} onChange={(e) => setBox({ ...box, maxBeds: e.target.value ? Number(e.target.value) : null })} className="border-white/10 bg-black text-white" /></div>
            </div>
          )}

          {step === 3 && (
            <div className="flex flex-col gap-5">
              <div>
                <Label className="text-neutral-300">Investment strategies</Label>
                <div className="mt-3 flex flex-wrap gap-2">
                  {STRATEGIES.map((s) => (
                    <Chip key={s.id} selected={box.strategies.includes(s.id)} onClick={() => setBox({ ...box, strategies: toggle(box.strategies, s.id) })}>{s.label}</Chip>
                  ))}
                </div>
              </div>
              <div>
                <Label className="text-neutral-300">Minimum spread ($) — optional</Label>
                <Input type="number" min={0} value={box.minSpread ?? ""} onChange={(e) => setBox({ ...box, minSpread: e.target.value ? Number(e.target.value) : null })} placeholder="e.g. 30000" className="mt-2 max-w-xs border-white/10 bg-black text-white" />
                <p className="mt-1 text-xs text-neutral-500">Deals below this ARV-minus-costs spread are deprioritized.</p>
              </div>
            </div>
          )}

          {step === 4 && (
            <div>
              <Label className="text-neutral-300">New-match notifications</Label>
              <div className="mt-3 flex flex-col gap-2">
                {([["instant", "Instant — notify me the moment a match lands"], ["digest", "Daily digest — one summary per day"], ["off", "Off — I'll check the feed myself"]] as const).map(([v, label]) => (
                  <button key={v} type="button" onClick={() => setBox({ ...box, notifyMode: v })}
                    className={cn("rounded-lg border px-4 py-3 text-left text-sm", box.notifyMode === v ? "border-[#D4AF37] bg-[#D4AF37]/10 text-white" : "border-white/10 text-neutral-400 hover:border-white/30")}>
                    {label}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="mt-8 flex items-center justify-between">
            <Button type="button" variant="ghost" disabled={step === 0} onClick={() => setStep(step - 1)} className="text-neutral-400">
              <ArrowLeft className="mr-2 h-4 w-4" /> Back
            </Button>
            <div className="flex gap-2">
              <Button type="button" variant="outline" disabled={saving} onClick={() => save(false)} className="border-white/20 text-white">
                {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Save
              </Button>
              {step < STEPS.length - 1 ? (
                <Button type="button" onClick={() => setStep(step + 1)} className="bg-[#D4AF37] font-semibold text-black hover:bg-[#c19b2e]">
                  Next <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              ) : (
                <Button type="button" disabled={saving} onClick={() => save(true)} className="bg-[#D4AF37] font-semibold text-black hover:bg-[#c19b2e]">
                  {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} <Check className="mr-2 h-4 w-4" /> Finish
                </Button>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    </InvestorPage>
  );
}
