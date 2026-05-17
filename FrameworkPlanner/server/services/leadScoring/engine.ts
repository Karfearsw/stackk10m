export type LeadScoringWeights = {
  motivationScale: number;
  absentee: number;
  yearsOwned10Plus: number;
  yearsOwned5Plus: number;
  yearsOwned2Plus: number;
  probate: number;
  preForeclosure: number;
  taxDelinquent: number;
  vacancy: number;
  hasPhone: number;
  hasEmail: number;
};

export type LeadScoringConfidenceWeights = {
  motivationScore: number;
  absentee: number;
  yearsOwned: number;
  distress: number;
  contact: number;
};

export const LEAD_SCORING_WEIGHTS: LeadScoringWeights = {
  motivationScale: 0.45,
  absentee: 30,
  yearsOwned10Plus: 25,
  yearsOwned5Plus: 15,
  yearsOwned2Plus: 5,
  probate: 15,
  preForeclosure: 20,
  taxDelinquent: 15,
  vacancy: 10,
  hasPhone: 5,
  hasEmail: 5,
};

export const LEAD_SCORING_CONFIDENCE_WEIGHTS: LeadScoringConfidenceWeights = {
  motivationScore: 0.35,
  absentee: 0.2,
  yearsOwned: 0.2,
  distress: 0.15,
  contact: 0.1,
};

export type LeadScoringDistressSignals = {
  probate?: boolean | null;
  preForeclosure?: boolean | null;
  taxDelinquent?: boolean | null;
  vacancy?: boolean | null;
};

export type LeadScoringInput = {
  motivationScore?: number | null;
  isAbsentee?: boolean | null;
  yearsOwned?: number | null;
  distress?: LeadScoringDistressSignals | null;
  tags?: string[] | null;
  hasPhone?: boolean | null;
  hasEmail?: boolean | null;
  nextTouchAt?: Date | string | null;
};

export type LeadScoringReason = {
  key: string;
  label: string;
  points: number;
};

export type LeadScoringFactor = {
  key: string;
  label: string;
  weight: number;
  value: unknown;
  points: number;
  confidenceWeight: number;
  urgencyPoints: number;
};

export type LeadScoringResult = {
  score: number;
  confidence: number;
  urgency: number;
  reasons: LeadScoringReason[];
  factorsJson: LeadScoringFactor[];
};

export type ComputeLeadScoreOptions = {
  now?: Date;
  weights?: Partial<LeadScoringWeights>;
  confidenceWeights?: Partial<LeadScoringConfidenceWeights>;
};

function clamp(n: number, min: number, max: number) {
  if (n < min) return min;
  if (n > max) return max;
  return n;
}

function toFiniteNumber(v: unknown): number | null {
  if (typeof v !== "number") return null;
  if (!Number.isFinite(v)) return null;
  return v;
}

function parseDate(v: unknown): Date | null {
  if (!v) return null;
  if (v instanceof Date) return Number.isFinite(v.getTime()) ? v : null;
  if (typeof v === "string") {
    const d = new Date(v);
    return Number.isFinite(d.getTime()) ? d : null;
  }
  return null;
}

function normalizeTags(tags: unknown): string[] {
  if (!Array.isArray(tags)) return [];
  return tags.map((t) => String(t || "").trim().toLowerCase()).filter(Boolean);
}

function detectDistressFromTags(tags: string[]) {
  const set = new Set(tags);
  const has = (k: string) => set.has(k) || tags.some((t) => t.includes(k));
  return {
    probate: has("probate"),
    preForeclosure: has("pre-foreclosure") || has("preforeclosure") || has("foreclosure"),
    taxDelinquent: has("tax delinquent") || has("tax-delinquent") || has("tax"),
    vacancy: has("vacant") || has("vacancy"),
  };
}

export function computeLeadScore(input: LeadScoringInput, options: ComputeLeadScoreOptions = {}): LeadScoringResult {
  const now = options.now ?? new Date();
  const weights: LeadScoringWeights = { ...LEAD_SCORING_WEIGHTS, ...(options.weights || {}) };
  const confW: LeadScoringConfidenceWeights = { ...LEAD_SCORING_CONFIDENCE_WEIGHTS, ...(options.confidenceWeights || {}) };

  const tags = normalizeTags(input.tags);
  const distressFromTags = detectDistressFromTags(tags);
  const distress: Required<LeadScoringDistressSignals> = {
    probate: input.distress?.probate ?? distressFromTags.probate,
    preForeclosure: input.distress?.preForeclosure ?? distressFromTags.preForeclosure,
    taxDelinquent: input.distress?.taxDelinquent ?? distressFromTags.taxDelinquent,
    vacancy: input.distress?.vacancy ?? distressFromTags.vacancy,
  };

  const motivationScoreRaw = toFiniteNumber(input.motivationScore);
  const motivationScore = motivationScoreRaw === null ? null : clamp(motivationScoreRaw, 0, 100);
  const isAbsentee = input.isAbsentee === null || input.isAbsentee === undefined ? null : !!input.isAbsentee;
  const yearsOwnedRaw = toFiniteNumber(input.yearsOwned);
  const yearsOwned = yearsOwnedRaw === null ? null : clamp(yearsOwnedRaw, 0, 1000);
  const hasPhone = input.hasPhone === null || input.hasPhone === undefined ? null : !!input.hasPhone;
  const hasEmail = input.hasEmail === null || input.hasEmail === undefined ? null : !!input.hasEmail;
  const nextTouchAt = parseDate(input.nextTouchAt);

  const factors: LeadScoringFactor[] = [];

  let score = 0;
  let urgency = 0;
  let confidenceEvidence = 0;
  const confidenceTotal = confW.motivationScore + confW.absentee + confW.yearsOwned + confW.distress + confW.contact;

  if (motivationScore !== null) {
    const points = clamp(Math.round(motivationScore * weights.motivationScale), 0, 100);
    score += points;
    if (motivationScore >= 80) urgency += 40;
    else if (motivationScore >= 60) urgency += 25;
    else if (motivationScore >= 40) urgency += 10;
    confidenceEvidence += confW.motivationScore;
    factors.push({
      key: "motivation_score",
      label: "Motivation score",
      weight: weights.motivationScale,
      value: motivationScore,
      points,
      confidenceWeight: confW.motivationScore,
      urgencyPoints: motivationScore >= 80 ? 40 : motivationScore >= 60 ? 25 : motivationScore >= 40 ? 10 : 0,
    });
  }

  if (isAbsentee !== null) {
    const points = isAbsentee ? weights.absentee : 0;
    score += points;
    if (isAbsentee) urgency += 10;
    confidenceEvidence += confW.absentee;
    factors.push({
      key: "absentee_owner",
      label: "Absentee owner",
      weight: weights.absentee,
      value: isAbsentee,
      points,
      confidenceWeight: confW.absentee,
      urgencyPoints: isAbsentee ? 10 : 0,
    });
  }

  if (yearsOwned !== null) {
    let points = 0;
    if (yearsOwned >= 10) points = weights.yearsOwned10Plus;
    else if (yearsOwned >= 5) points = weights.yearsOwned5Plus;
    else if (yearsOwned >= 2) points = weights.yearsOwned2Plus;
    score += points;
    if (yearsOwned >= 10) urgency += 10;
    confidenceEvidence += confW.yearsOwned;
    factors.push({
      key: "years_owned",
      label: "Years owned",
      weight: yearsOwned,
      value: yearsOwned,
      points,
      confidenceWeight: confW.yearsOwned,
      urgencyPoints: yearsOwned >= 10 ? 10 : 0,
    });
  }

  const distressSignals = [
    { key: "probate", label: "Probate", enabled: !!distress.probate, points: weights.probate, urgency: 20 },
    { key: "pre_foreclosure", label: "Pre-foreclosure", enabled: !!distress.preForeclosure, points: weights.preForeclosure, urgency: 30 },
    { key: "tax_delinquent", label: "Tax delinquent", enabled: !!distress.taxDelinquent, points: weights.taxDelinquent, urgency: 15 },
    { key: "vacancy", label: "Vacancy", enabled: !!distress.vacancy, points: weights.vacancy, urgency: 15 },
  ];

  const distressKnown =
    input.distress?.probate !== undefined ||
    input.distress?.preForeclosure !== undefined ||
    input.distress?.taxDelinquent !== undefined ||
    input.distress?.vacancy !== undefined ||
    tags.length > 0;

  if (distressKnown) confidenceEvidence += confW.distress;

  for (const s of distressSignals) {
    if (!s.enabled) continue;
    score += s.points;
    urgency += s.urgency;
    factors.push({
      key: s.key,
      label: s.label,
      weight: s.points,
      value: true,
      points: s.points,
      confidenceWeight: 0,
      urgencyPoints: s.urgency,
    });
  }

  const contactKnown = hasPhone !== null || hasEmail !== null;
  if (contactKnown) confidenceEvidence += confW.contact;

  if (hasPhone !== null) {
    const points = hasPhone ? weights.hasPhone : 0;
    score += points;
    factors.push({
      key: "has_phone",
      label: "Has phone",
      weight: weights.hasPhone,
      value: hasPhone,
      points,
      confidenceWeight: 0,
      urgencyPoints: 0,
    });
  }

  if (hasEmail !== null) {
    const points = hasEmail ? weights.hasEmail : 0;
    score += points;
    factors.push({
      key: "has_email",
      label: "Has email",
      weight: weights.hasEmail,
      value: hasEmail,
      points,
      confidenceWeight: 0,
      urgencyPoints: 0,
    });
  }

  if (nextTouchAt) {
    const deltaMs = nextTouchAt.getTime() - now.getTime();
    const deltaHours = deltaMs / 36e5;
    let urgencyPoints = 0;
    if (deltaHours <= 0) urgencyPoints = 40;
    else if (deltaHours <= 24) urgencyPoints = 25;
    else if (deltaHours <= 72) urgencyPoints = 15;
    urgency += urgencyPoints;
    factors.push({
      key: "next_touch_at",
      label: "Next touch time",
      weight: 0,
      value: nextTouchAt.toISOString(),
      points: 0,
      confidenceWeight: 0,
      urgencyPoints,
    });
  }

  score = clamp(score, 0, 100);
  urgency = clamp(urgency, 0, 100);
  const confidence = confidenceTotal <= 0 ? 0 : clamp(0.2 + 0.8 * (confidenceEvidence / confidenceTotal), 0, 1);

  const reasons: LeadScoringReason[] = factors
    .filter((f) => f.points > 0)
    .map((f) => ({ key: f.key, label: f.label, points: f.points }))
    .sort((a, b) => (b.points - a.points) || a.key.localeCompare(b.key));

  return {
    score: Math.round(score),
    confidence: Math.round(confidence * 100) / 100,
    urgency: Math.round(urgency),
    reasons,
    factorsJson: factors,
  };
}

