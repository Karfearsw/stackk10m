/**
 * Onboarding document templates.
 *
 * Offer Letter + ICA bodies live as contract_templates rows (seeded by
 * migration 0092). This module resolves them by name and exposes their
 * merge-field contracts so the API can validate merge data.
 *
 * The W-9 is agent-filled structured data (not a merged template).
 */

import { db } from "../db.js";
import { sql } from "drizzle-orm";

export type OnboardingDocType = "offer_letter" | "ica" | "w9";

export const DOC_TYPES: OnboardingDocType[] = ["offer_letter", "ica", "w9"];

export const DOC_LABELS: Record<OnboardingDocType, string> = {
  offer_letter: "Offer Letter",
  ica: "Independent Contractor Agreement",
  w9: "IRS Form W-9",
};

export const TEMPLATE_NAMES: Record<"offer_letter" | "ica", string> = {
  offer_letter: "OceanLuxe Agent Offer Letter",
  ica: "OceanLuxe Independent Contractor Agreement (Agent)",
};

export type TemplateInfo = {
  id: number;
  name: string;
  description: string | null;
  version: number;
  status: string | null;
  mergeFields: string[];
  updatedAt: string | null;
};

function rowsOf(r: any): any[] {
  return (r as any)?.rows ?? (r as any) ?? [];
}

export async function getOnboardingTemplate(docType: "offer_letter" | "ica"): Promise<TemplateInfo | null> {
  const name = TEMPLATE_NAMES[docType];
  const r = await db.execute(sql`
    SELECT id, name, description, version, status, merge_fields, updated_at
    FROM contract_templates
    WHERE name = ${name} AND is_active = TRUE
    LIMIT 1
  `);
  const row = rowsOf(r)[0];
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    version: row.version ?? 1,
    status: row.status,
    mergeFields: Array.isArray(row.merge_fields) ? row.merge_fields : [],
    updatedAt: row.updated_at ? new Date(row.updated_at).toISOString() : null,
  };
}

export async function getTemplateBody(templateId: number): Promise<string | null> {
  const r = await db.execute(sql`SELECT content FROM contract_templates WHERE id = ${templateId} LIMIT 1`);
  const row = rowsOf(r)[0];
  return row ? String(row.content || "") : null;
}

/** W-9 field definitions for the agent-facing form. */
export const W9_FIELDS = [
  { key: "name", label: "Name (as shown on your income tax return)", required: true, type: "text" },
  { key: "business_name", label: "Business name / disregarded entity name (if different)", required: false, type: "text" },
  { key: "tax_classification", label: "Federal tax classification", required: true, type: "select",
    options: ["Individual/sole proprietor", "C Corporation", "S Corporation", "Partnership", "Trust/estate", "LLC — C Corp", "LLC — S Corp", "LLC — Partnership", "Other"] },
  { key: "other_classification", label: "If Other, specify", required: false, type: "text" },
  { key: "exempt_payee_code", label: "Exempt payee code (if any)", required: false, type: "text" },
  { key: "address", label: "Street address", required: true, type: "text" },
  { key: "city", label: "City", required: true, type: "text" },
  { key: "state", label: "State", required: true, type: "text" },
  { key: "zip", label: "ZIP code", required: true, type: "text" },
  { key: "tin_type", label: "TIN type", required: true, type: "select", options: ["SSN", "EIN"] },
  { key: "tin", label: "Taxpayer Identification Number", required: true, type: "text", sensitive: true },
  { key: "certification", label: "Under penalties of perjury, I certify that the information above is correct.", required: true, type: "checkbox" },
] as const;

export function validateW9FormData(formData: Record<string, any>): { ok: boolean; missing: string[] } {
  const missing: string[] = [];
  for (const f of W9_FIELDS) {
    if (!f.required) continue;
    const v = formData[f.key];
    if (f.type === "checkbox") {
      if (v !== true) missing.push(f.label);
    } else if (v === undefined || v === null || String(v).trim() === "") {
      missing.push(f.label);
    }
  }
  return { ok: missing.length === 0, missing };
}

/** Default merge data for offer letter / ICA, overridable per send. */
export function defaultMergeData(docType: "offer_letter" | "ica", agent: { firstName: string; lastName: string; email: string; phone?: string | null }, sender: { name: string; title: string }) {
  const today = new Date().toISOString().slice(0, 10);
  const fullName = `${agent.firstName} ${agent.lastName}`.trim();
  if (docType === "offer_letter") {
    return {
      offer_date: today,
      agent_full_name: fullName,
      agent_first_name: agent.firstName,
      agent_email: agent.email,
      agent_phone: agent.phone || "",
      start_date: today,
      commission_split_agent: "70",
      commission_split_company: "30",
      platform_fee: "$50/mo",
      sender_name: sender.name,
      sender_title: sender.title,
    };
  }
  return {
    effective_date: today,
    contractor_full_name: fullName,
    contractor_email: agent.email,
    contractor_phone: agent.phone || "",
    commission_split_agent: "70",
    commission_split_company: "30",
    platform_fee: "$50/mo",
    tail_days: "30",
    noncircumvent_months: "12",
    governing_law: "Florida",
    sender_name: sender.name,
    sender_title: sender.title,
  };
}
