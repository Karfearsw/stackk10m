/**
 * Phase 10 investor profile: shared types, option lists, completeness
 * computation, and the "Improve your matches" checklist.
 *
 * The checklist is the anti-gaming rule: when the profile is incomplete we
 * show what to fill in instead of manufacturing match accuracy.
 */
import type { InvestorProfile, ProfileCriteria } from "../api";

export const US_STATES = ["AL","AK","AZ","AR","CA","CO","CT","DE","FL","GA","HI","ID","IL","IN","IA","KS","KY","LA","ME","MD","MA","MI","MN","MS","MO","MT","NE","NV","NH","NJ","NM","NY","NC","ND","OH","OK","OR","PA","RI","SC","SD","TN","TX","UT","VT","VA","WA","WV","WI","WY","DC"];

export const PROPERTY_TYPES = [
  { id: "sfr", label: "Single family" },
  { id: "mfr-2-4", label: "2–4 units" },
  { id: "mfr-5-plus", label: "5+ units" },
  { id: "condo", label: "Condo" },
  { id: "townhome", label: "Townhome" },
  { id: "land", label: "Land" },
  { id: "commercial", label: "Commercial" },
  { id: "mobile", label: "Mobile home" },
  { id: "mixed-use", label: "Mixed use" },
];

export const STRATEGIES = [
  { id: "fix-and-flip", label: "Fix & flip" },
  { id: "buy-and-hold", label: "Buy & hold" },
  { id: "brrrr", label: "BRRRR" },
  { id: "wholesale", label: "Wholesale" },
  { id: "house-hack", label: "House hack" },
  { id: "short-term-rental", label: "Short-term rental" },
  { id: "land", label: "Land plays" },
  { id: "new-build", label: "New build" },
  { id: "note-investing", label: "Note investing" },
];

export const FINANCING_TYPES = [
  { id: "cash", label: "Cash" },
  { id: "hard-money", label: "Hard money" },
  { id: "private-money", label: "Private money" },
  { id: "dscr", label: "DSCR loan" },
  { id: "conventional", label: "Conventional" },
  { id: "seller-finance", label: "Seller finance" },
  { id: "subject-to", label: "Subject-to" },
  { id: "heloc", label: "HELOC" },
];

export const OCCUPANCY_OPTIONS = [
  { id: "vacant", label: "Vacant" },
  { id: "owner-occupied", label: "Owner occupied" },
  { id: "tenant-occupied", label: "Tenant occupied" },
  { id: "month-to-month", label: "Month-to-month tenants" },
];

export const CONDITION_OPTIONS = [
  { id: "turnkey", label: "Turnkey" },
  { id: "light-cosmetic", label: "Light cosmetic" },
  { id: "moderate-rehab", label: "Moderate rehab" },
  { id: "heavy-rehab", label: "Heavy rehab" },
  { id: "gut-rehab", label: "Gut rehab" },
  { id: "tear-down", label: "Tear-down / lot value" },
];

export const INVESTOR_ROLES = [
  { id: "individual", label: "Individual investor" },
  { id: "fund", label: "Fund" },
  { id: "syndicator", label: "Syndicator" },
  { id: "family-office", label: "Family office" },
  { id: "operator", label: "Operator" },
  { id: "agent", label: "Agent / broker" },
  { id: "wholesaler", label: "Wholesaler" },
];

export const NOTIFY_CHANNELS = [
  { id: "in_app", label: "In app" },
  { id: "email", label: "Email" },
  { id: "sms", label: "Text message" },
];

export const NOTIFY_FREQUENCIES = [
  { id: "instant", label: "Instant", hint: "The moment a strong match lands." },
  { id: "digest", label: "Daily digest", hint: "One summary each morning." },
  { id: "weekly", label: "Weekly roundup", hint: "A recap every Monday." },
  { id: "off", label: "Off", hint: "I will check matches myself." },
] as const;

export const EMPTY_CRITERIA: ProfileCriteria = {
  targetStates: [],
  targetZips: [],
  radiusMiles: null,
  preferredAreas: [],
  propertyTypes: [],
  occupancy: [],
  yearBuiltMin: null,
  yearBuiltMax: null,
  conditionTolerance: [],
  priceMin: null,
  priceMax: null,
  maxRepairBudget: null,
  minDesiredMargin: null,
  minRentalYield: null,
  minCashFlow: null,
  strategies: [],
  financingTypes: [],
  closingSpeedDays: null,
  dealBreakers: [],
  minBeds: null,
  maxBeds: null,
  minSpread: null,
};

export type ChecklistItem = {
  id: string;
  label: string;
  hint: string;
  /** Wizard step index the item links to (0-based). */
  step: number;
  done: boolean;
};

/**
 * Checklist items mirror the server-side completeness computation
 * (server/investor/buybox.ts): 8 items, 12.5 points each.
 */
export function profileChecklist(profile: InvestorProfile | null): ChecklistItem[] {
  const c: ProfileCriteria = profile?.criteria ?? { ...EMPTY_CRITERIA };
  const hasName = Boolean((profile?.displayName ?? "").trim());
  const hasMarket = c.targetStates.length > 0 || c.targetZips.length > 0 || c.preferredAreas.length > 0;
  const hasPrice = c.priceMin !== null || c.priceMax !== null;
  const hasReturns =
    c.minDesiredMargin !== null || c.minRentalYield !== null || c.minCashFlow !== null || c.minSpread !== null;
  const hasCapital = c.financingTypes.length > 0 || c.closingSpeedDays !== null;
  const notificationsSet = (profile?.notificationPrefs.frequency ?? "digest") !== "off" ||
    (profile?.notificationPrefs.channels.length ?? 0) > 0;

  return [
    {
      id: "identity",
      label: "Name your profile",
      hint: "How the Ocean Luxe team addresses you on matches and offers.",
      step: 0,
      done: hasName,
    },
    {
      id: "markets",
      label: "Pick your markets",
      hint: "States, zip codes, or areas — where should we look for you?",
      step: 1,
      done: hasMarket,
    },
    {
      id: "property",
      label: "Choose property types",
      hint: "Single family, multifamily, land — what do you actually buy?",
      step: 2,
      done: c.propertyTypes.length > 0,
    },
    {
      id: "price",
      label: "Set a price band",
      hint: "A min or max purchase price keeps junk deals out of your feed.",
      step: 3,
      done: hasPrice,
    },
    {
      id: "strategy",
      label: "Choose your strategies",
      hint: "Fix & flip, buy & hold, BRRRR — deals are scored against them.",
      step: 4,
      done: c.strategies.length > 0,
    },
    {
      id: "capital",
      label: "How you fund and close",
      hint: "Financing type and closing speed decide which deals we show first.",
      step: 4,
      done: hasCapital,
    },
    {
      id: "returns",
      label: "Define your return floor",
      hint: "Minimum margin, yield, or cash flow — your walk-away number.",
      step: 3,
      done: hasReturns,
    },
    {
      id: "notifications",
      label: "Choose match alerts",
      hint: "Instant, daily digest, weekly, or none at all.",
      step: 6,
      done: notificationsSet,
    },
  ];
}

export function profileScore(profile: InvestorProfile | null): number {
  const items = profileChecklist(profile);
  const done = items.filter((i) => i.done).length;
  return Math.round((done / items.length) * 100);
}
