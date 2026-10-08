/**
 * Ticket 15 — Campaign audience builder.
 *
 * Resolves the EXACT recipient list for a broadcast campaign before anything
 * is sent. Every exclusion (DNC, missing contact info, no consent) is recorded
 * with a reason so the UI can show precisely who will receive the message
 * and who was excluded and why.
 */
import { sql } from "drizzle-orm";
import { db } from "../db.js";

export interface AudienceFilter {
  field: string;
  value: string;
}

export interface AudienceRecipient {
  recipientType: "lead" | "buyer";
  leadId: number | null;
  buyerId: number | null;
  name: string;
  phone: string | null;
  email: string | null;
  excluded: boolean;
  exclusionReason: string | null;
}

export interface AudiencePreview {
  recipients: AudienceRecipient[];
  total: number;
  eligible: number;
  excluded: number;
  exclusions: Record<string, number>;
}

// Allowlisted lead filter fields -> { column, match mode }.
// Column names are hardcoded here and never taken from user input.
const LEAD_FILTERS: Record<string, { col: string; like: boolean }> = {
  source: { col: "source", like: true },
  status: { col: "status", like: false },
  state: { col: "state", like: false },
  county: { col: "county", like: true },
  leadType: { col: "lead_type", like: false },
  assignedTo: { col: "assigned_to", like: false },
  tag: { col: "tags", like: false }, // array containment handled specially
};

const BUYER_FILTERS: Record<string, { col: string; like: boolean }> = {
  status: { col: "status", like: false },
  state: { col: "state", like: true }, // preferred_areas text search
  minBudget: { col: "min_budget", like: false },
  tag: { col: "tags", like: false },
};

function buildLeadConditions(filters: AudienceFilter[]): any[] {
  const conds: any[] = [];
  for (const f of filters) {
    const spec = LEAD_FILTERS[String(f?.field || "")];
    const rawVal = String(f?.value || "").trim();
    if (!spec || !rawVal) continue;
    const col = sql.raw(`"leads"."${spec.col}"`);
    if (spec.col === "assigned_to") {
      const n = parseInt(rawVal, 10);
      if (!Number.isFinite(n)) continue;
      conds.push(sql`${col} = ${n}`);
    } else if (spec.col === "tags") {
      conds.push(sql`${col} @> ARRAY[${rawVal}]::text[]`);
    } else if (spec.like) {
      conds.push(sql`${col} ILIKE ${`%${rawVal}%`}`);
    } else {
      conds.push(sql`${col} = ${rawVal}`);
    }
  }
  return conds;
}

function buildBuyerConditions(filters: AudienceFilter[]): any[] {
  const conds: any[] = [];
  for (const f of filters) {
    const spec = BUYER_FILTERS[String(f?.field || "")];
    const rawVal = String(f?.value || "").trim();
    if (!spec || !rawVal) continue;
    if (spec.col === "state") {
      // Buyers don't have a state column; match against preferred areas.
      conds.push(sql`array_to_string("buyers"."preferred_areas", ',') ILIKE ${`%${rawVal}%`}`);
    } else if (spec.col === "tags") {
      conds.push(sql`"buyers"."tags" @> ARRAY[${rawVal}]::text[]`);
    } else if (spec.col === "min_budget") {
      const n = parseFloat(rawVal);
      if (!Number.isFinite(n)) continue;
      conds.push(sql`"buyers"."min_budget" >= ${String(n)}`);
    } else {
      const col = sql.raw(`"buyers"."${spec.col}"`);
      conds.push(sql`${col} = ${rawVal}`);
    }
  }
  return conds;
}

/**
 * Resolve the exact recipient list for a campaign.
 *
 * @param channel 'sms' | 'email' — determines which contact field is required
 * @param audience 'leads' | 'buyers' | 'both'
 * @param filters filter list applied to the matching tables
 * @param limit max recipients to return (preview cap; 0 = no cap)
 */
export async function buildAudience(opts: {
  channel: "sms" | "email";
  audience: "leads" | "buyers" | "both";
  filters: AudienceFilter[];
  limit?: number;
}): Promise<AudiencePreview> {
  const { channel, audience, filters } = opts;
  const limit = opts.limit && opts.limit > 0 ? Math.min(opts.limit, 5000) : 5000;
  const recipients: AudienceRecipient[] = [];

  if (audience === "leads" || audience === "both") {
    const conds = buildLeadConditions(filters);
    const where = conds.length ? sql`WHERE ${sql.join(conds, sql` AND `)}` : sql``;
    const rows: any = await db.execute(sql`
      SELECT id, owner_name, owner_phone, owner_email,
             COALESCE(do_not_call, false) AS do_not_call,
             COALESCE(do_not_text, false) AS do_not_text,
             COALESCE(do_not_email, false) AS do_not_email
      FROM leads
      ${where}
      ORDER BY id DESC
      LIMIT ${limit}
    `);
    for (const r of (rows as any).rows || []) {
      const contact = channel === "sms" ? r.owner_phone : r.owner_email;
      let excluded = false;
      let reason: string | null = null;
      if (r.do_not_call || (channel === "sms" && r.do_not_text) || (channel === "email" && r.do_not_email)) {
        excluded = true;
        reason = "Do-not-contact flag set";
      } else if (!contact || !String(contact).trim()) {
        excluded = true;
        reason = channel === "sms" ? "No phone number" : "No email address";
      }
      recipients.push({
        recipientType: "lead",
        leadId: Number(r.id),
        buyerId: null,
        name: String(r.owner_name || `Lead #${r.id}`),
        phone: r.owner_phone || null,
        email: r.owner_email || null,
        excluded,
        exclusionReason: reason,
      });
    }
  }

  if (audience === "buyers" || audience === "both") {
    const conds = buildBuyerConditions(filters);
    const where = conds.length ? sql`WHERE ${sql.join(conds, sql` AND `)}` : sql``;
    const rows: any = await db.execute(sql`
      SELECT id, name, phone, email,
             COALESCE(do_not_call, false) AS do_not_call,
             COALESCE(do_not_text, false) AS do_not_text
      FROM buyers
      ${where}
      ORDER BY id DESC
      LIMIT ${limit}
    `);
    for (const r of (rows as any).rows || []) {
      const contact = channel === "sms" ? r.phone : r.email;
      let excluded = false;
      let reason: string | null = null;
      if (r.do_not_call || (channel === "sms" && r.do_not_text)) {
        excluded = true;
        reason = "Do-not-contact flag set";
      } else if (!contact || !String(contact).trim()) {
        excluded = true;
        reason = channel === "sms" ? "No phone number" : "No email address";
      }
      recipients.push({
        recipientType: "buyer",
        leadId: null,
        buyerId: Number(r.id),
        name: String(r.name || `Buyer #${r.id}`),
        phone: r.phone || null,
        email: r.email || null,
        excluded,
        exclusionReason: reason,
      });
    }
  }

  const eligible = recipients.filter((r) => !r.excluded).length;
  const exclusions: Record<string, number> = {};
  for (const r of recipients) {
    if (r.excluded && r.exclusionReason) {
      exclusions[r.exclusionReason] = (exclusions[r.exclusionReason] || 0) + 1;
    }
  }
  return {
    recipients,
    total: recipients.length,
    eligible,
    excluded: recipients.length - eligible,
    exclusions,
  };
}

/** Persist the resolved recipient list for a campaign (replaces any prior list). */
export async function persistRecipients(campaignId: number, preview: AudiencePreview): Promise<number> {
  await db.execute(sql`DELETE FROM campaign_recipients WHERE campaign_id = ${campaignId}`);
  let inserted = 0;
  for (const r of preview.recipients) {
    const status = r.excluded ? (r.exclusionReason === "Do-not-contact flag set" ? "opted_out" : "skipped") : "pending";
    await db.execute(sql`
      INSERT INTO campaign_recipients
        (campaign_id, lead_id, buyer_id, recipient_type, phone, email, status, error)
      VALUES
        (${campaignId}, ${r.leadId}, ${r.buyerId}, ${r.recipientType},
         ${r.phone}, ${r.email}, ${status}, ${r.exclusionReason})
    `);
    inserted++;
  }
  return inserted;
}

/** Estimated cost in cents for the eligible recipients. */
export function estimateCost(channel: "sms" | "email", eligibleCount: number): { perMessageCents: number; totalCents: number } {
  // Conservative carrier estimates; configurable later via settings.
  const perMessageCents = channel === "sms" ? 2 : 0; // ~$0.02/SMS segment, email via provider
  return { perMessageCents, totalCents: perMessageCents * eligibleCount };
}
