/**
 * Phase 10 investor profile onboarding — the full investor profile flow.
 *
 * 8 steps: identity, markets, property, deal math, strategy & capital,
 * deal-breakers, notifications, privacy, then a review screen. Nonessential
 * steps can be skipped and finished later from the Matches checklist
 * ("Improve your matches"). Persists to investor_profiles via
 * /api/investor/profile.
 *
 * Legacy note: this file previously held a 5-step buy-box wizard backed by
 * the single legacy buy box (/api/investor/buy-box). That endpoint is
 * untouched; this flow supersedes it for the Deal Matchroom.
 */
import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { useLocation } from "wouter";
import { Loader2, ArrowLeft, ArrowRight, Check, SkipForward } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { investorApi, InvestorApiError, type ProfileCriteria, type NotificationPrefs, type PrivacySettings } from "./api";
import { RequireInvestor } from "./InvestorLayout";
import { LuxePageHeader, LuxeSection, LuxeStatusBadge } from "@/components/luxe";
import {
  EMPTY_CRITERIA,
  US_STATES,
  PROPERTY_TYPES,
  STRATEGIES,
  FINANCING_TYPES,
  OCCUPANCY_OPTIONS,
  CONDITION_OPTIONS,
  INVESTOR_ROLES,
  NOTIFY_CHANNELS,
  NOTIFY_FREQUENCIES,
  profileChecklist,
  profileScore,
} from "./onboarding/profile";

const STEPS = [
  "Identity",
  "Markets",
  "Property",
  "Deal math",
  "Strategy & capital",
  "Deal-breakers",
  "Notifications",
  "Privacy",
];
// Steps 2-7 are nonessential and can be skipped; 0 and 1 are required.
const SKIPPABLE = new Set([2, 3, 4, 5, 6, 7]);
const REVIEW_STEP = STEPS.length;

function Chip({ selected, onClick, children }: { selected: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-full border px-3 py-1.5 text-sm transition-colors",
        selected
          ? "border-primary bg-primary/15 text-primary"
          : "border-border text-muted-foreground hover:border-foreground/40 hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}

function toggle(list: string[], v: string): string[] {
  return list.includes(v) ? list.filter((x) => x !== v) : [...list, v];
}

function NumInput({ label, value, onChange, placeholder, min = 0 }: {
  label: string;
  value: number | null;
  onChange: (v: number | null) => void;
  placeholder?: string;
  min?: number;
}) {
  return (
    <div>
      <Label className="text-muted-foreground">{label}</Label>
      <Input
        type="number"
        min={min}
        value={value ?? ""}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value === "" ? null : Number(e.target.value))}
        className="mt-1.5 border-border bg-background text-foreground"
      />
    </div>
  );
}

/** Comma-or-enter tag input for free-text lists (areas, deal-breakers). */
function TagInput({ value, onChange, placeholder }: { value: string[]; onChange: (v: string[]) => void; placeholder: string }) {
  const [draft, setDraft] = useState("");
  const add = () => {
    const v = draft.trim();
    if (v && !value.includes(v)) onChange([...value, v]);
    setDraft("");
  };
  return (
    <div>
      <div className="flex gap-2">
        <Input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); add(); } }}
          placeholder={placeholder}
          className="border-border bg-background text-foreground"
        />
        <Button type="button" variant="outline" onClick={add}>Add</Button>
      </div>
      {value.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {value.map((v) => (
            <Badge
              key={v}
              variant="outline"
              className="cursor-pointer border-primary/50 text-primary"
              onClick={() => onChange(value.filter((x) => x !== v))}
            >
              {v} ✕
            </Badge>
          ))}
        </div>
      )}
    </div>
  );
}

function stepFromQuery(): number {
  try {
    const n = parseInt(new URLSearchParams(window.location.search).get("step") || "", 10);
    return Number.isFinite(n) && n >= 0 && n <= REVIEW_STEP ? n : 0;
  } catch {
    return 0;
  }
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
  const [displayName, setDisplayName] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [role, setRole] = useState("");
  const [criteria, setCriteria] = useState<ProfileCriteria>({ ...EMPTY_CRITERIA });
  const [notify, setNotify] = useState<NotificationPrefs>({ frequency: "digest", channels: ["in_app"] });
  const [privacy, setPrivacy] = useState<PrivacySettings>({ profileVisibility: "private", shareWithSellers: false });

  useEffect(() => {
    // Deep link: /investor/onboarding?step=3 jumps straight to a field group.
    setStep(stepFromQuery());
    investorApi.getProfile()
      .then(({ profile }) => {
        if (!profile) return;
        setDisplayName(profile.displayName ?? "");
        setCompanyName(profile.companyName ?? "");
        setRole(profile.role ?? "");
        setCriteria({ ...EMPTY_CRITERIA, ...profile.criteria });
        setNotify(profile.notificationPrefs);
        setPrivacy(profile.privacy);
      })
      .catch(() => null)
      .finally(() => setLoading(false));
  }, []);

  const set = <K extends keyof ProfileCriteria>(key: K, v: ProfileCriteria[K]) =>
    setCriteria((c) => ({ ...c, [key]: v }));

  const score = profileScore({
    id: 0, displayName, companyName, role, criteria,
    notificationPrefs: notify, privacy,
    completenessScore: 0, isComplete: false, updatedAt: null,
  });
  const checklist = profileChecklist({
    id: 0, displayName, companyName, role, criteria,
    notificationPrefs: notify, privacy,
    completenessScore: 0, isComplete: false, updatedAt: null,
  });

  const canAdvance = (): boolean => {
    if (step === 0) return displayName.trim().length > 0;
    if (step === 1) {
      return criteria.targetStates.length > 0 || criteria.targetZips.length > 0 || criteria.preferredAreas.length > 0;
    }
    return true;
  };

  const save = async (done: boolean) => {
    setSaving(true);
    try {
      await investorApi.saveProfile({
        displayName: displayName.trim() || null,
        companyName: companyName.trim() || null,
        role: role || null,
        criteria,
        notificationPrefs: notify,
        privacy,
      });
      toast({ title: done ? "Profile complete" : "Progress saved" });
      if (done) setLocation("/investor/matches");
    } catch (e) {
      toast({
        title: "Save failed",
        description: e instanceof InvestorApiError ? e.message : "Try again.",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const isReview = step === REVIEW_STEP;

  return (
    <div>
      <LuxePageHeader
        eyebrow="Investor profile"
        title="Set up your matchroom profile"
        description="Date the deal. Match the buy box. Lock up the opportunity. The more of this you complete, the sharper your matches get."
        actions={
          <LuxeStatusBadge tone={score >= 100 ? "verified" : "gold"} dot>
            {score}% complete
          </LuxeStatusBadge>
        }
      />

      {/* Stepper */}
      <div className="mb-8 mt-6 flex flex-wrap gap-2">
        {STEPS.map((s, i) => (
          <button
            key={s}
            type="button"
            onClick={() => setStep(i)}
            className={cn(
              "flex items-center gap-2 rounded-full px-3 py-1.5 text-xs transition-colors",
              i === step
                ? "bg-primary font-semibold text-primary-foreground"
                : i < step
                  ? "bg-primary/20 text-primary"
                  : "bg-muted text-muted-foreground",
            )}
          >
            {i < step ? <Check className="h-3 w-3" /> : <span>{i + 1}</span>} {s}
          </button>
        ))}
      </div>

      <LuxeSection>
        {step === 0 && (
          <div className="flex max-w-md flex-col gap-5">
            <div>
              <Label className="text-muted-foreground">Your name or investor name *</Label>
              <Input
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="e.g. Alex Rivera"
                className="mt-1.5 border-border bg-background text-foreground"
              />
            </div>
            <div>
              <Label className="text-muted-foreground">Company (optional)</Label>
              <Input
                value={companyName}
                onChange={(e) => setCompanyName(e.target.value)}
                placeholder="e.g. Rivera Capital LLC"
                className="mt-1.5 border-border bg-background text-foreground"
              />
            </div>
            <div>
              <Label className="text-muted-foreground">Investor role (optional)</Label>
              <div className="mt-2 flex flex-wrap gap-2">
                {INVESTOR_ROLES.map((r) => (
                  <Chip key={r.id} selected={role === r.id} onClick={() => setRole(role === r.id ? "" : r.id)}>
                    {r.label}
                  </Chip>
                ))}
              </div>
            </div>
          </div>
        )}

        {step === 1 && (
          <div className="flex max-w-2xl flex-col gap-6">
            <div>
              <Label className="text-muted-foreground">States you invest in *</Label>
              <div className="mt-2 flex max-h-48 flex-wrap gap-1.5 overflow-y-auto">
                {US_STATES.map((st) => (
                  <Chip key={st} selected={criteria.targetStates.includes(st)} onClick={() => set("targetStates", toggle(criteria.targetStates, st))}>
                    {st}
                  </Chip>
                ))}
              </div>
            </div>
            <div className="grid gap-5 sm:grid-cols-2">
              <div>
                <Label className="text-muted-foreground">Search radius (miles)</Label>
                <Input
                  type="number"
                  min={0}
                  value={criteria.radiusMiles ?? ""}
                  placeholder="e.g. 30"
                  onChange={(e) => set("radiusMiles", e.target.value === "" ? null : Number(e.target.value))}
                  className="mt-1.5 max-w-xs border-border bg-background text-foreground"
                />
                <p className="mt-1 text-xs text-muted-foreground">Around your preferred areas.</p>
              </div>
            </div>
            <div>
              <Label className="text-muted-foreground">Preferred areas</Label>
              <p className="mb-2 mt-1 text-xs text-muted-foreground">Cities, counties, or neighborhoods — e.g. "Orlando, FL", "Wayne County".</p>
              <TagInput value={criteria.preferredAreas} onChange={(v) => set("preferredAreas", v)} placeholder="Add an area and press Enter" />
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="flex max-w-2xl flex-col gap-6">
            <div>
              <Label className="text-muted-foreground">Property types</Label>
              <div className="mt-2 flex flex-wrap gap-2">
                {PROPERTY_TYPES.map((t) => (
                  <Chip key={t.id} selected={criteria.propertyTypes.includes(t.id)} onClick={() => set("propertyTypes", toggle(criteria.propertyTypes, t.id))}>
                    {t.label}
                  </Chip>
                ))}
              </div>
            </div>
            <div>
              <Label className="text-muted-foreground">Occupancy preferences</Label>
              <div className="mt-2 flex flex-wrap gap-2">
                {OCCUPANCY_OPTIONS.map((o) => (
                  <Chip key={o.id} selected={criteria.occupancy.includes(o.id)} onClick={() => set("occupancy", toggle(criteria.occupancy, o.id))}>
                    {o.label}
                  </Chip>
                ))}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4 max-w-md">
              <NumInput label="Built after (year)" value={criteria.yearBuiltMin} onChange={(v) => set("yearBuiltMin", v)} placeholder="1970" min={1700} />
              <NumInput label="Built before (year)" value={criteria.yearBuiltMax} onChange={(v) => set("yearBuiltMax", v)} placeholder="2020" min={1700} />
            </div>
            <div>
              <Label className="text-muted-foreground">Condition tolerance</Label>
              <div className="mt-2 flex flex-wrap gap-2">
                {CONDITION_OPTIONS.map((c) => (
                  <Chip key={c.id} selected={criteria.conditionTolerance.includes(c.id)} onClick={() => set("conditionTolerance", toggle(criteria.conditionTolerance, c.id))}>
                    {c.label}
                  </Chip>
                ))}
              </div>
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="flex max-w-2xl flex-col gap-6">
            <div className="grid grid-cols-2 gap-4">
              <NumInput label="Min purchase price ($)" value={criteria.priceMin} onChange={(v) => set("priceMin", v)} placeholder="50000" />
              <NumInput label="Max purchase price ($)" value={criteria.priceMax} onChange={(v) => set("priceMax", v)} placeholder="500000" />
              <NumInput label="Max repair budget ($)" value={criteria.maxRepairBudget} onChange={(v) => set("maxRepairBudget", v)} placeholder="75000" />
              <NumInput label="Min desired margin ($)" value={criteria.minDesiredMargin} onChange={(v) => set("minDesiredMargin", v)} placeholder="30000" />
              <NumInput label="Min rental yield (%)" value={criteria.minRentalYield} onChange={(v) => set("minRentalYield", v)} placeholder="8" />
              <NumInput label="Min monthly cash flow ($)" value={criteria.minCashFlow} onChange={(v) => set("minCashFlow", v)} placeholder="300" />
            </div>
            <div className="grid grid-cols-3 gap-4 max-w-md">
              <NumInput label="Min beds" value={criteria.minBeds} onChange={(v) => set("minBeds", v)} />
              <NumInput label="Max beds" value={criteria.maxBeds} onChange={(v) => set("maxBeds", v)} />
              <NumInput label="Min spread ($)" value={criteria.minSpread} onChange={(v) => set("minSpread", v)} placeholder="25000" />
            </div>
            <p className="text-xs text-muted-foreground">Deals below your spread or margin floor are deprioritized, not hidden.</p>
          </div>
        )}

        {step === 4 && (
          <div className="flex max-w-2xl flex-col gap-6">
            <div>
              <Label className="text-muted-foreground">Preferred strategies</Label>
              <div className="mt-2 flex flex-wrap gap-2">
                {STRATEGIES.map((s) => (
                  <Chip key={s.id} selected={criteria.strategies.includes(s.id)} onClick={() => set("strategies", toggle(criteria.strategies, s.id))}>
                    {s.label}
                  </Chip>
                ))}
              </div>
            </div>
            <div>
              <Label className="text-muted-foreground">Financing types</Label>
              <div className="mt-2 flex flex-wrap gap-2">
                {FINANCING_TYPES.map((f) => (
                  <Chip key={f.id} selected={criteria.financingTypes.includes(f.id)} onClick={() => set("financingTypes", toggle(criteria.financingTypes, f.id))}>
                    {f.label}
                  </Chip>
                ))}
              </div>
            </div>
            <div className="max-w-xs">
              <NumInput label="Typical closing speed (days)" value={criteria.closingSpeedDays} onChange={(v) => set("closingSpeedDays", v)} placeholder="14" />
            </div>
          </div>
        )}

        {step === 5 && (
          <div className="max-w-xl">
            <Label className="text-muted-foreground">Deal-breakers</Label>
            <p className="mb-2 mt-1 text-xs text-muted-foreground">
              Anything that kills a deal for you — e.g. "HOAs over $300", "no flood zones", "no tenant-occupied".
            </p>
            <TagInput value={criteria.dealBreakers} onChange={(v) => set("dealBreakers", v)} placeholder="Add a deal-breaker and press Enter" />
          </div>
        )}

        {step === 6 && (
          <div className="flex max-w-xl flex-col gap-6">
            <div>
              <Label className="text-muted-foreground">Match alert frequency</Label>
              <div className="mt-2 flex flex-col gap-2">
                {NOTIFY_FREQUENCIES.map((f) => (
                  <button
                    key={f.id}
                    type="button"
                    onClick={() => setNotify({ ...notify, frequency: f.id })}
                    className={cn(
                      "rounded-lg border px-4 py-3 text-left text-sm transition-colors",
                      notify.frequency === f.id
                        ? "border-primary bg-primary/10 text-foreground"
                        : "border-border text-muted-foreground hover:border-foreground/30",
                    )}
                  >
                    <span className="font-medium">{f.label}</span>
                    <span className="mt-0.5 block text-xs opacity-80">{f.hint}</span>
                  </button>
                ))}
              </div>
            </div>
            <div>
              <Label className="text-muted-foreground">Channels</Label>
              <div className="mt-2 flex flex-wrap gap-2">
                {NOTIFY_CHANNELS.map((c) => (
                  <Chip
                    key={c.id}
                    selected={notify.channels.includes(c.id)}
                    onClick={() => setNotify({ ...notify, channels: toggle(notify.channels, c.id) })}
                  >
                    {c.label}
                  </Chip>
                ))}
              </div>
            </div>
          </div>
        )}

        {step === 7 && (
          <div className="flex max-w-xl flex-col gap-6">
            <div>
              <Label className="text-muted-foreground">Profile visibility</Label>
              <div className="mt-2 flex flex-col gap-2">
                {([
                  ["private", "Private", "Only you and the Ocean Luxe team see your profile."],
                  ["team", "Team", "Your assigned deal team can see it too."],
                  ["public", "Public", "Visible to sellers you engage with."],
                ] as const).map(([v, label, hint]) => (
                  <button
                    key={v}
                    type="button"
                    onClick={() => setPrivacy({ ...privacy, profileVisibility: v })}
                    className={cn(
                      "rounded-lg border px-4 py-3 text-left text-sm transition-colors",
                      privacy.profileVisibility === v
                        ? "border-primary bg-primary/10 text-foreground"
                        : "border-border text-muted-foreground hover:border-foreground/30",
                    )}
                  >
                    <span className="font-medium">{label}</span>
                    <span className="mt-0.5 block text-xs opacity-80">{hint}</span>
                  </button>
                ))}
              </div>
            </div>
            <button
              type="button"
              onClick={() => setPrivacy({ ...privacy, shareWithSellers: !privacy.shareWithSellers })}
              className="flex items-start gap-3 rounded-lg border border-border px-4 py-3 text-left text-sm"
            >
              <span
                className={cn(
                  "mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded border",
                  privacy.shareWithSellers ? "border-primary bg-primary text-primary-foreground" : "border-border",
                )}
              >
                {privacy.shareWithSellers && <Check className="h-3.5 w-3.5" />}
              </span>
              <span>
                <span className="font-medium text-foreground">Share criteria with sellers</span>
                <span className="mt-0.5 block text-xs text-muted-foreground">
                  Lets sellers you engage with see your buy criteria so they bring you fitting deals.
                </span>
              </span>
            </button>
          </div>
        )}

        {isReview && (
          <div className="max-w-xl">
            <h2 className="font-serif text-xl tracking-tight">Review your profile</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Anything unchecked stays open — you can finish it later from the Matches page.
            </p>
            <ul className="mt-5 flex flex-col gap-2">
              {checklist.map((item) => (
                <li
                  key={item.id}
                  className="flex items-start justify-between gap-3 rounded-lg border border-border px-4 py-3"
                >
                  <div className="flex items-start gap-3">
                    <span
                      className={cn(
                        "mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border",
                        item.done ? "border-verified bg-verified/15 text-verified" : "border-border text-muted-foreground",
                      )}
                    >
                      {item.done && <Check className="h-3 w-3" />}
                    </span>
                    <div>
                      <p className="text-sm font-medium">{item.label}</p>
                      <p className="text-xs text-muted-foreground">{item.hint}</p>
                    </div>
                  </div>
                  {!item.done && (
                    <Button type="button" variant="ghost" size="sm" onClick={() => setStep(item.step)}>
                      Fill in
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Footer actions */}
        <div className="mt-8 flex flex-wrap items-center justify-between gap-3 border-t border-border pt-6">
          <Button type="button" variant="ghost" disabled={step === 0 || saving} onClick={() => setStep(step - 1)} className="text-muted-foreground">
            <ArrowLeft className="mr-2 h-4 w-4" /> Back
          </Button>
          <div className="flex flex-wrap items-center gap-2">
            {SKIPPABLE.has(step) && !isReview && (
              <Button type="button" variant="ghost" onClick={() => setStep(step + 1)} className="text-muted-foreground">
                <SkipForward className="mr-2 h-4 w-4" /> Skip for now
              </Button>
            )}
            <Button type="button" variant="outline" disabled={saving} onClick={() => save(false)}>
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Save
            </Button>
            {!isReview ? (
              <Button type="button" disabled={!canAdvance() || saving} onClick={() => save(false).then(() => setStep(step + 1))}>
                Next <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            ) : (
              <Button type="button" disabled={saving || !canAdvance()} onClick={() => save(true)}>
                {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                <Check className="mr-2 h-4 w-4" /> Finish profile
              </Button>
            )}
          </div>
        </div>
      </LuxeSection>

      {!canAdvance() && !isReview && (
        <p className="mt-3 text-xs text-muted-foreground">
          {step === 0 ? "Add your name to continue." : "Pick at least one market to continue."}
        </p>
      )}
    </div>
  );
}
