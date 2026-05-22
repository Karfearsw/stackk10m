import type { TeamSettingsModel } from "../settings/teamSettings.js";

function str(v: unknown) {
  return String(v ?? "").trim().toLowerCase();
}

export function computeLeadScore(input: { lead: any; settings: TeamSettingsModel }): number {
  const cfg: any = input.settings?.leadScoring || {};
  if (!cfg.enabled) return 0;
  const weights: any[] = Array.isArray(cfg.weights) ? cfg.weights : [];
  let score = 0;
  for (const w of weights) {
    const key = str(w?.key);
    const pts = Number(w?.points || 0);
    if (!Number.isFinite(pts) || !key) continue;
    const match = str(w?.match);

    if (key === "source") {
      if (!match || str(input.lead?.source) === match) score += pts;
      continue;
    }
    if (key === "motivation") {
      if (!match || str(input.lead?.motivation) === match) score += pts;
      continue;
    }
    if (key === "has_email") {
      if (!!str(input.lead?.ownerEmail)) score += pts;
      continue;
    }
    if (key === "has_phone") {
      if (!!str(input.lead?.ownerPhone)) score += pts;
      continue;
    }
    if (key === "zip") {
      if (match && str(input.lead?.zipCode) === match) score += pts;
      continue;
    }
    if (key.startsWith("tag:")) {
      const tag = key.slice("tag:".length).trim();
      const tags = Array.isArray(input.lead?.tags) ? input.lead.tags.map(str) : [];
      if (tag && tags.includes(tag)) score += pts;
      continue;
    }
  }
  if (!Number.isFinite(score)) score = 0;
  score = Math.max(0, Math.min(100, Math.round(score)));
  return score;
}

