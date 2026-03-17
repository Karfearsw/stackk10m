import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Slider } from "@/components/ui/slider";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { computeArvFromComps, computeCompPricePerSqft, computeDealMath, computeRepairTotal, underwritingTemplateConfigSchema, type UnderwritingRepairCategory, type UnderwritingV1 } from "@shared/underwriting";
import { CheckCircle2, XCircle, Sparkles, Plus, Trash2 } from "lucide-react";

type SubjectSnapshot = {
  address: string;
  beds?: number | null;
  baths?: number | null;
  sqft?: number | null;
  yearBuilt?: number | null;
  propertyType?: string | null;
  occupancy?: string | null;
};

type TemplateDto = { id: number; name: string; config: any };

function money(n: number | null | undefined) {
  const v = typeof n === "number" && Number.isFinite(n) ? n : 0;
  return v.toLocaleString("en-US", { maximumFractionDigits: 0 });
}

function clampMoney(n: number) {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.round(n));
}

function ensureRepairCategories(existing: UnderwritingRepairCategory[]) {
  const base: UnderwritingRepairCategory[] = [
    { key: "roof", label: "Roof", level: "med", estimate: null },
    { key: "hvac", label: "HVAC", level: "med", estimate: null },
    { key: "kitchen", label: "Kitchen", level: "med", estimate: null },
    { key: "baths", label: "Baths", level: "med", estimate: null },
    { key: "flooring", label: "Flooring", level: "med", estimate: null },
    { key: "paint", label: "Paint", level: "med", estimate: null },
    { key: "exterior", label: "Exterior", level: "med", estimate: null },
    { key: "misc", label: "Misc", level: "med", estimate: null },
  ];
  const byKey = new Map(existing.map((c) => [c.key, c]));
  return base.map((b) => byKey.get(b.key) || b);
}

export function UnderwriteDealPanel(props: {
  subject: SubjectSnapshot | null;
  underwriting: UnderwritingV1;
  templates: TemplateDto[];
  selectedTemplate: TemplateDto | null;
  onUnderwritingChange: (next: UnderwritingV1 | ((prev: UnderwritingV1) => UnderwritingV1)) => void;
  onCreateTemplate: (name: string, config: any) => Promise<any>;
  onRunAi: (payload: any) => Promise<any>;
}) {
  const { toast } = useToast();
  const [createName, setCreateName] = useState("");
  const templateConfig = useMemo(() => {
    try {
      return underwritingTemplateConfigSchema.parse(props.selectedTemplate?.config || {});
    } catch {
      return underwritingTemplateConfigSchema.parse({});
    }
  }, [props.selectedTemplate]);

  const getTemplateConfigById = (id: string) => {
    const tid = parseInt(id, 10);
    const t = Number.isFinite(tid) ? props.templates.find((x) => x.id === tid) : null;
    try {
      return underwritingTemplateConfigSchema.parse(t?.config || {});
    } catch {
      return underwritingTemplateConfigSchema.parse({});
    }
  };

  const repairsTotal = useMemo(() => computeRepairTotal(props.underwriting.repairs), [props.underwriting.repairs]);
  const arvFromComps = useMemo(
    () =>
      computeArvFromComps({
        subjectSqft: props.subject?.sqft ?? null,
        comps: props.underwriting.comps,
      }),
    [props.underwriting.comps, props.subject?.sqft],
  );

  const effectiveArv = props.underwriting.arv.value ?? arvFromComps.value ?? null;
  const computedDealMath = useMemo(() => {
    const arv = effectiveArv;
    if (!arv || arv <= 0) return props.underwriting.dealMath;
    const discount = props.underwriting.assumptions.targetDiscountPctOverride ?? templateConfig.targetDiscountPct;
    return computeDealMath({
      arv,
      repairs: repairsTotal,
      assumptions: props.underwriting.assumptions,
      targetDiscountPct: discount,
    });
  }, [effectiveArv, props.underwriting.assumptions, props.underwriting.dealMath, repairsTotal, templateConfig.targetDiscountPct]);

  const setUw = props.onUnderwritingChange;

  const applyTemplate = (templateId: string) => {
    const tid = templateId ? `${templateId}` : null;
    const cfg = tid ? getTemplateConfigById(tid) : underwritingTemplateConfigSchema.parse({});
    setUw((u) => ({
      ...u,
      templateId: tid,
      assumptions: {
        ...u.assumptions,
        closingHoldingPct: cfg.closingHoldingPct,
        assignmentFeeMode: "flat",
        assignmentFeeValue: cfg.defaultAssignmentFee,
      },
      updatedAt: new Date().toISOString(),
    }));
  };

  const setLiteRepair = (amt: number) => {
    setUw((u) => ({
      ...u,
      repairs: { ...u.repairs, mode: "lite", liteEstimate: amt },
      updatedAt: new Date().toISOString(),
    }));
  };

  const ensureDetailed = () => {
    setUw((u) => ({
      ...u,
      repairs: { ...u.repairs, mode: "detailed", categories: ensureRepairCategories(u.repairs.categories || []) },
      updatedAt: new Date().toISOString(),
    }));
  };

  const setCategory = (key: string, patch: Partial<UnderwritingRepairCategory>) => {
    setUw((u) => {
      const categories = ensureRepairCategories(u.repairs.categories || []).map((c) => (c.key === key ? { ...c, ...patch } : c));
      return { ...u, repairs: { ...u.repairs, mode: "detailed", categories }, updatedAt: new Date().toISOString() };
    });
  };

  const removeComp = (id: string) => {
    setUw((u) => ({ ...u, comps: u.comps.filter((c) => c.id !== id), updatedAt: new Date().toISOString() }));
  };

  const aiSuggest = async () => {
    try {
      const payload = {
        subject: { sqft: props.subject?.sqft ?? null },
        underwriting: { ...props.underwriting, dealMath: computedDealMath, updatedAt: new Date().toISOString() },
        templateConfig,
      };
      const json = await props.onRunAi(payload);
      const suggested = json?.suggestedArvRange;
      if (suggested?.value) {
        setUw((u) => ({
          ...u,
          arv: {
            ...u.arv,
            method: "comps",
            rangeLow: suggested.low ?? u.arv.rangeLow ?? null,
            rangeHigh: suggested.high ?? u.arv.rangeHigh ?? null,
            value: suggested.value ?? u.arv.value ?? null,
          },
          dealMath: json?.dealMath || computedDealMath,
          updatedAt: new Date().toISOString(),
        }));
      } else {
        setUw((u) => ({ ...u, dealMath: json?.dealMath || computedDealMath, updatedAt: new Date().toISOString() }));
      }
      toast({ title: "AI suggestions applied" });
    } catch (e: any) {
      toast({ title: "AI failed", description: e?.message || "Unknown error", variant: "destructive" });
    }
  };

  const saveTemplate = async () => {
    const name = createName.trim();
    if (!name) return;
    const config = templateConfig;
    try {
      const created = await props.onCreateTemplate(name, config);
      setCreateName("");
      if (created?.id) {
        applyTemplate(String(created.id));
      }
      toast({ title: "Template created" });
    } catch (e: any) {
      toast({ title: "Template failed", description: e?.message || "Unknown error", variant: "destructive" });
    }
  };

  const dealOk = computedDealMath.meetsCriteria;

  return (
    <Card className="h-full">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-3">
          <CardTitle className="text-base">Underwrite Deal</CardTitle>
          <Badge variant={dealOk ? "default" : "secondary"} className={dealOk ? "bg-green-600 text-white" : ""}>
            {dealOk ? (
              <span className="inline-flex items-center gap-1">
                <CheckCircle2 className="h-3.5 w-3.5" />
                Meets criteria
              </span>
            ) : (
              <span className="inline-flex items-center gap-1">
                <XCircle className="h-3.5 w-3.5" />
                Needs work
              </span>
            )}
          </Badge>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Select
            value={props.underwriting.templateId ? String(props.underwriting.templateId) : ""}
            onValueChange={(v) => applyTemplate(v)}
          >
            <SelectTrigger className="w-[220px]">
              <SelectValue placeholder="Criteria template" />
            </SelectTrigger>
            <SelectContent>
              {props.templates.map((t) => (
                <SelectItem key={t.id} value={String(t.id)}>
                  {t.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Dialog>
            <DialogTrigger asChild>
              <Button variant="outline">
                <Plus className="h-4 w-4 mr-2" />
                New template
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Create template</DialogTitle>
              </DialogHeader>
              <div className="space-y-2">
                <Label>Name</Label>
                <Input value={createName} onChange={(e) => setCreateName(e.target.value)} placeholder="Phoenix flips" />
              </div>
              <DialogFooter>
                <Button onClick={saveTemplate} disabled={!createName.trim()}>
                  Save
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </CardHeader>

      <CardContent className="pt-0 h-[calc(100%-6.25rem)]">
        <ScrollArea className="h-full pr-3">
          <div className="flex flex-col gap-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Deal Snapshot</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="text-sm font-medium">{props.subject?.address || "—"}</div>
                <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground">
                  <div>Beds: {props.subject?.beds ?? "—"}</div>
                  <div>Baths: {props.subject?.baths ?? "—"}</div>
                  <div>Sqft: {props.subject?.sqft ?? "—"}</div>
                  <div>Year: {props.subject?.yearBuilt ?? "—"}</div>
                </div>

                <div className="space-y-1">
                  <div className="text-xs font-medium">Seller motivation</div>
                  <ToggleGroup
                    type="single"
                    value={props.underwriting.snapshot.sellerMotivation || ""}
                    onValueChange={(v) => setUw((u) => ({ ...u, snapshot: { ...u.snapshot, sellerMotivation: v ? (v as any) : null }, updatedAt: new Date().toISOString() }))}
                    className="justify-start flex-wrap"
                  >
                    <ToggleGroupItem value="high">High</ToggleGroupItem>
                    <ToggleGroupItem value="medium">Medium</ToggleGroupItem>
                    <ToggleGroupItem value="low">Low</ToggleGroupItem>
                  </ToggleGroup>
                </div>

                <div className="space-y-1">
                  <div className="text-xs font-medium">Condition</div>
                  <ToggleGroup
                    type="single"
                    value={props.underwriting.snapshot.condition || ""}
                    onValueChange={(v) => setUw((u) => ({ ...u, snapshot: { ...u.snapshot, condition: v ? (v as any) : null }, updatedAt: new Date().toISOString() }))}
                    className="justify-start flex-wrap"
                  >
                    <ToggleGroupItem value="turnkey">Turnkey</ToggleGroupItem>
                    <ToggleGroupItem value="light_cosmetic">Light</ToggleGroupItem>
                    <ToggleGroupItem value="medium_rehab">Medium</ToggleGroupItem>
                    <ToggleGroupItem value="heavy_rehab">Heavy</ToggleGroupItem>
                    <ToggleGroupItem value="teardown">Teardown</ToggleGroupItem>
                  </ToggleGroup>
                </div>

                <div className="space-y-1">
                  <div className="text-xs font-medium">Timeline</div>
                  <ToggleGroup
                    type="single"
                    value={props.underwriting.snapshot.timeline || ""}
                    onValueChange={(v) => setUw((u) => ({ ...u, snapshot: { ...u.snapshot, timeline: v ? (v as any) : null }, updatedAt: new Date().toISOString() }))}
                    className="justify-start flex-wrap"
                  >
                    <ToggleGroupItem value="0_7">0–7</ToggleGroupItem>
                    <ToggleGroupItem value="7_30">7–30</ToggleGroupItem>
                    <ToggleGroupItem value="30_60">30–60</ToggleGroupItem>
                    <ToggleGroupItem value="60_plus">60+</ToggleGroupItem>
                  </ToggleGroup>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between gap-2">
                  <CardTitle className="text-sm">ARV & Comps</CardTitle>
                  <Button size="sm" variant="outline" onClick={aiSuggest}>
                    <Sparkles className="h-4 w-4 mr-2" />
                    Get ARV with AI
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label>ARV</Label>
                    <Input
                      type="number"
                      value={props.underwriting.arv.value ?? ""}
                      onChange={(e) =>
                        setUw((u) => ({
                          ...u,
                          arv: { ...u.arv, method: "manual", value: e.target.value ? clampMoney(parseFloat(e.target.value)) : null },
                          updatedAt: new Date().toISOString(),
                        }))
                      }
                      placeholder={arvFromComps.value ? String(clampMoney(arvFromComps.value)) : "250000"}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label>ARV range</Label>
                    <div className="text-sm text-muted-foreground">
                      {arvFromComps.low ? `$${money(arvFromComps.low)}–$${money(arvFromComps.high)}` : "Add comps to see a range"}
                    </div>
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="text-xs text-muted-foreground">Pin 1–3 primary comps to drive ARV</div>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Comp</TableHead>
                        <TableHead className="text-right">Price</TableHead>
                        <TableHead className="text-right">$/sf</TableHead>
                        <TableHead className="text-right">Use</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {props.underwriting.comps.slice(0, 10).map((c) => {
                        const ppsf = computeCompPricePerSqft(c);
                        return (
                          <TableRow key={c.id}>
                            <TableCell className="min-w-0">
                              <div className="truncate font-medium">{c.address}</div>
                              <div className="text-xs text-muted-foreground truncate">{c.url || ""}</div>
                            </TableCell>
                            <TableCell className="text-right">${money(c.soldPrice ?? null)}</TableCell>
                            <TableCell className="text-right">{ppsf ? `$${money(ppsf)}` : "—"}</TableCell>
                            <TableCell className="text-right">
                              <div className="flex justify-end gap-1">
                                <Button
                                  size="sm"
                                  variant={c.primary ? "default" : "outline"}
                                  onClick={() =>
                                    setUw((u) => ({
                                      ...u,
                                      comps: u.comps.map((x) => (x.id === c.id ? { ...x, primary: !x.primary, included: true } : x)),
                                      updatedAt: new Date().toISOString(),
                                    }))
                                  }
                                >
                                  Primary
                                </Button>
                                <Button
                                  size="sm"
                                  variant={c.included ? "outline" : "secondary"}
                                  onClick={() =>
                                    setUw((u) => ({
                                      ...u,
                                      comps: u.comps.map((x) => (x.id === c.id ? { ...x, included: !x.included, primary: x.included ? false : x.primary } : x)),
                                      updatedAt: new Date().toISOString(),
                                    }))
                                  }
                                >
                                  {c.included ? "In" : "Out"}
                                </Button>
                                <Button size="icon" variant="ghost" onClick={() => removeComp(c.id)} aria-label="Remove comp">
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </div>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                      {!props.underwriting.comps.length ? (
                        <TableRow>
                          <TableCell colSpan={4} className="text-sm text-muted-foreground">
                            Use the Research scratchpad to save comps (hotkey: C)
                          </TableCell>
                        </TableRow>
                      ) : null}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Repairs</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="text-sm font-medium">Total: ${money(repairsTotal)}</div>
                  <ToggleGroup
                    type="single"
                    value={props.underwriting.repairs.mode}
                    onValueChange={(v) => {
                      if (!v) return;
                      if (v === "detailed") ensureDetailed();
                      else setUw((u) => ({ ...u, repairs: { ...u.repairs, mode: "lite" }, updatedAt: new Date().toISOString() }));
                    }}
                  >
                    <ToggleGroupItem value="lite">Lite</ToggleGroupItem>
                    <ToggleGroupItem value="detailed">Detailed</ToggleGroupItem>
                  </ToggleGroup>
                </div>

                {props.underwriting.repairs.mode === "lite" ? (
                  <div className="space-y-2">
                    <div className="grid grid-cols-2 gap-2">
                      <Button variant="outline" onClick={() => setLiteRepair(templateConfig.repairLitePresets.low)}>
                        ${money(templateConfig.repairLitePresets.low)}
                      </Button>
                      <Button variant="outline" onClick={() => setLiteRepair(templateConfig.repairLitePresets.med)}>
                        ${money(templateConfig.repairLitePresets.med)}
                      </Button>
                      <Button variant="outline" onClick={() => setLiteRepair(templateConfig.repairLitePresets.high)}>
                        ${money(templateConfig.repairLitePresets.high)}
                      </Button>
                      <Button variant="outline" onClick={() => setLiteRepair(templateConfig.repairLitePresets.heavy)}>
                        ${money(templateConfig.repairLitePresets.heavy)}
                      </Button>
                    </div>
                    <div className="space-y-1">
                      <Label>Custom</Label>
                      <Input
                        type="number"
                        value={props.underwriting.repairs.liteEstimate ?? ""}
                        onChange={(e) => setLiteRepair(e.target.value ? clampMoney(parseFloat(e.target.value)) : 0)}
                        placeholder="15000"
                      />
                    </div>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <div className="text-xs text-muted-foreground">Use presets to reduce typing</div>
                    <div className="space-y-2">
                      {ensureRepairCategories(props.underwriting.repairs.categories || []).map((c) => (
                        <div key={c.key} className="grid grid-cols-12 gap-2 items-center">
                          <div className="col-span-4 text-sm">{c.label}</div>
                          <div className="col-span-5">
                            <ToggleGroup
                              type="single"
                              value={c.level}
                              onValueChange={(v) => {
                                if (!v) return;
                                const nextLevel = v as any;
                                const base = props.subject?.sqft ? props.subject.sqft * 5 : 5000;
                                const estimate = nextLevel === "low" ? base * 0.6 : nextLevel === "high" ? base * 1.3 : base;
                                setCategory(c.key, { level: nextLevel, estimate: clampMoney(estimate) });
                              }}
                              className="justify-start flex-wrap"
                            >
                              <ToggleGroupItem value="low">Low</ToggleGroupItem>
                              <ToggleGroupItem value="med">Med</ToggleGroupItem>
                              <ToggleGroupItem value="high">High</ToggleGroupItem>
                            </ToggleGroup>
                          </div>
                          <div className="col-span-3">
                            <Input
                              type="number"
                              value={c.estimate ?? ""}
                              onChange={(e) => setCategory(c.key, { level: "custom", estimate: e.target.value ? clampMoney(parseFloat(e.target.value)) : null })}
                              placeholder="0"
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Deal Math</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label>Closing/Holding %</Label>
                    <ToggleGroup
                      type="single"
                      value={String(props.underwriting.assumptions.closingHoldingPct)}
                      onValueChange={(v) => {
                        const next = v ? parseFloat(v) : props.underwriting.assumptions.closingHoldingPct;
                        setUw((u) => ({ ...u, assumptions: { ...u.assumptions, closingHoldingPct: next }, updatedAt: new Date().toISOString() }));
                      }}
                      className="justify-start flex-wrap"
                    >
                      <ToggleGroupItem value="8">8%</ToggleGroupItem>
                      <ToggleGroupItem value="10">10%</ToggleGroupItem>
                      <ToggleGroupItem value="12">12%</ToggleGroupItem>
                    </ToggleGroup>
                  </div>
                  <div className="space-y-1">
                    <Label>Aggression</Label>
                    <Select
                      value={props.underwriting.assumptions.offerAggression}
                      onValueChange={(v) => setUw((u) => ({ ...u, assumptions: { ...u.assumptions, offerAggression: v as any }, updatedAt: new Date().toISOString() }))}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="conservative">Conservative</SelectItem>
                        <SelectItem value="balanced">Balanced</SelectItem>
                        <SelectItem value="aggressive">Aggressive</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="space-y-1">
                  <Label>
                    Target discount off ARV ({props.underwriting.assumptions.targetDiscountPctOverride ?? templateConfig.targetDiscountPct}%)
                  </Label>
                  <Slider
                    value={[props.underwriting.assumptions.targetDiscountPctOverride ?? templateConfig.targetDiscountPct]}
                    min={0}
                    max={60}
                    step={1}
                    onValueChange={(v) => {
                      const next = v?.[0] ?? (props.underwriting.assumptions.targetDiscountPctOverride ?? templateConfig.targetDiscountPct);
                      setUw((u) => ({ ...u, assumptions: { ...u.assumptions, targetDiscountPctOverride: next }, updatedAt: new Date().toISOString() }));
                    }}
                  />
                </div>

                <div className="rounded-md border p-3 bg-muted/30 space-y-2">
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <div>
                      <div className="text-xs text-muted-foreground">MAO</div>
                      <div className="font-bold">${money(computedDealMath.mao ?? null)}</div>
                    </div>
                    <div>
                      <div className="text-xs text-muted-foreground">Offer range</div>
                      <div className="font-medium">
                        ${money(computedDealMath.offerMin ?? null)}–${money(computedDealMath.offerMax ?? null)}
                      </div>
                    </div>
                    <div>
                      <div className="text-xs text-muted-foreground">Assignment fee</div>
                      <div className="font-medium">${money(computedDealMath.assignmentFee ?? null)}</div>
                    </div>
                    <div>
                      <div className="text-xs text-muted-foreground">Projected spread</div>
                      <div className="font-medium">${money(computedDealMath.projectedSpread ?? null)}</div>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Notes</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {(
                  [
                    { key: "sellerSaid", label: "Seller said", presets: ["needs fast close", "behind on taxes", "tenant issue", "vacant", "inherited"] },
                    { key: "buyerFeedback", label: "Buyer feedback", presets: ["needs photos", "wants lower price", "prefers other area", "rehab too heavy"] },
                    { key: "inspection", label: "Inspection notes", presets: ["roof aging", "HVAC old", "foundation concern", "plumbing leak"] },
                    { key: "risks", label: "Objections / Risks", presets: ["title issue", "liens", "access problems", "unknown occupancy"] },
                  ] as const
                ).map((row) => {
                  const items = (props.underwriting.notes as any)[row.key] as string[];
                  return (
                    <div key={row.key} className="space-y-2">
                      <div className="text-xs font-medium">{row.label}</div>
                      <div className="flex flex-wrap gap-1">
                        {items.map((t) => (
                          <Badge
                            key={t}
                            variant="secondary"
                            className="cursor-pointer"
                            onClick={() =>
                              setUw((u) => ({
                                ...u,
                                notes: { ...u.notes, [row.key]: (u.notes as any)[row.key].filter((x: string) => x !== t) },
                                updatedAt: new Date().toISOString(),
                              }))
                            }
                          >
                            {t}
                          </Badge>
                        ))}
                        {!items.length ? <div className="text-xs text-muted-foreground">Tap presets to add</div> : null}
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {row.presets.map((p) => (
                          <Button
                            key={p}
                            size="sm"
                            variant="outline"
                            onClick={() =>
                              setUw((u) => ({
                                ...u,
                                notes: { ...u.notes, [row.key]: Array.from(new Set([...(u.notes as any)[row.key], p])) },
                                updatedAt: new Date().toISOString(),
                              }))
                            }
                          >
                            {p}
                          </Button>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </CardContent>
            </Card>
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  );
}
