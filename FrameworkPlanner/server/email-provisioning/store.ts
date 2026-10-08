/**
 * Database access for email forward workflow + onboarding checklist.
 *
 * Uses the shared drizzle `db` handle with raw SQL — same pattern as
 * server/email/suppression.ts.
 *
 * Tables:
 *  - email_forwards (migration 0093): the forward-request workflow.
 *    IONOS has no email API, so forwards are created manually in the
 *    IONOS Control Panel and tracked here.
 *  - provisioned_emails (migrations 0091/0092): legacy mailbox-based
 *    records. Kept for dedup lookups — check-email consults both.
 *  - onboarding_checklist (migration 0091): gates live-lead access.
 */
import { db } from "../db.js";
import { sql } from "drizzle-orm";
import type { ForwardStatus, ForwardSource } from "./forwards.js";

export type EmailForwardRow = {
  id: number;
  user_id: number;
  forward_address: string;
  target_email: string;
  status: ForwardStatus;
  source: ForwardSource | null;
  requested_by: number | null;
  created_in_ionos_by: number | null;
  created_in_ionos_at: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

export type ProvisionedEmailRow = {
  id: number;
  user_id: number;
  email_address: string;
  ionos_mailbox_id: string | null;
  forwarding_to: string | null;
  status: "pending" | "active" | "failed";
  error: string | null;
  /** Where provisioning was initiated. Added in migration 0092; null on older rows. */
  source: "crm_signup" | "onboarding_site" | "manual" | null;
  created_at: string;
  provisioned_at: string | null;
};

export type ChecklistRow = {
  id: number;
  user_id: number;
  offer_letter_signed: boolean;
  ica_signed: boolean;
  w9_submitted: boolean;
  id_verified: boolean;
  payout_setup: boolean;
  training_completed: boolean;
  email_provisioned: boolean;
  live_lead_access_granted: boolean;
  live_lead_access_granted_at: string | null;
  live_lead_access_granted_by: number | null;
  updated_at: string;
};

function rowsOf(r: any): any[] {
  return (r as any)?.rows ?? (r as any) ?? [];
}

// ---------------------------------------------------------------------------
// Email forwards (migration 0093) — the manual forward workflow.
// ---------------------------------------------------------------------------

/** True if a forward address is already taken (forward table OR legacy provisioned table). */
export async function forwardAddressTaken(address: string): Promise<boolean> {
  const key = String(address || "").toLowerCase().trim();
  const r = await db.execute(sql`
    SELECT 1 FROM email_forwards WHERE lower(forward_address) = ${key} LIMIT 1
  `);
  if (rowsOf(r).length > 0) return true;
  const r2 = await db.execute(sql`
    SELECT 1 FROM provisioned_emails WHERE lower(email_address) = ${key} LIMIT 1
  `);
  return rowsOf(r2).length > 0;
}

export async function getForwardByUser(userId: number): Promise<EmailForwardRow | null> {
  const r = await db.execute(sql`SELECT * FROM email_forwards WHERE user_id = ${userId} LIMIT 1`);
  return rowsOf(r)[0] || null;
}

/** Find a forward by address (case-insensitive) — dedup. */
export async function getForwardByAddress(address: string): Promise<EmailForwardRow | null> {
  const r = await db.execute(sql`SELECT * FROM email_forwards WHERE lower(forward_address) = lower(${address}) LIMIT 1`);
  return rowsOf(r)[0] || null;
}

export async function createForwardRequest(row: {
  userId: number;
  address: string;
  targetEmail: string;
  source: ForwardSource;
  requestedBy?: number | null;
}): Promise<EmailForwardRow> {
  const r = await db.execute(sql`
    INSERT INTO email_forwards (user_id, forward_address, target_email, status, source, requested_by)
    VALUES (${row.userId}, ${row.address}, ${row.targetEmail}, 'requested', ${row.source}, ${row.requestedBy ?? null})
    RETURNING *
  `);
  return rowsOf(r)[0];
}

/** Move a forward to pending_creation (manager acknowledged the request). */
export async function markForwardPendingCreation(id: number): Promise<EmailForwardRow | null> {
  const r = await db.execute(sql`
    UPDATE email_forwards
    SET status = 'pending_creation', updated_at = now()
    WHERE id = ${id} AND status = 'requested'
    RETURNING *
  `);
  return rowsOf(r)[0] || null;
}

/**
 * Mark a forward active — the manager created it in the IONOS panel.
 * Flips the onboarding checklist's email_provisioned flag.
 */
export async function markForwardActive(id: number, createdBy: number, notes?: string | null): Promise<EmailForwardRow | null> {
  const r = await db.execute(sql`
    UPDATE email_forwards
    SET status = 'active',
        created_in_ionos_by = ${createdBy},
        created_in_ionos_at = now(),
        notes = COALESCE(${notes ?? null}, notes),
        updated_at = now()
    WHERE id = ${id} AND status IN ('requested', 'pending_creation')
    RETURNING *
  `);
  const row = rowsOf(r)[0] || null;
  if (row) {
    await markChecklistEmailProvisioned(row.user_id, true);
  }
  return row;
}

/** Mark a forward failed with a reason. */
export async function markForwardFailed(id: number, reason: string): Promise<EmailForwardRow | null> {
  const r = await db.execute(sql`
    UPDATE email_forwards
    SET status = 'failed', notes = ${reason}, updated_at = now()
    WHERE id = ${id}
    RETURNING *
  `);
  return rowsOf(r)[0] || null;
}

export async function listForwards(status?: string): Promise<EmailForwardRow[]> {
  const r = status
    ? await db.execute(sql`SELECT * FROM email_forwards WHERE status = ${status} ORDER BY created_at DESC`)
    : await db.execute(sql`SELECT * FROM email_forwards ORDER BY created_at DESC`);
  return rowsOf(r);
}

/** Queue of forwards needing manual IONOS creation (manager view). */
export async function forwardCreationQueue(): Promise<Array<EmailForwardRow & { first_name: string | null; last_name: string | null; signup_email: string }>> {
  const r = await db.execute(sql`
    SELECT ef.*, u.first_name, u.last_name, u.email AS signup_email
    FROM email_forwards ef
    JOIN users u ON u.id = ef.user_id
    WHERE ef.status IN ('requested', 'pending_creation')
    ORDER BY ef.created_at ASC
  `);
  return rowsOf(r);
}

/** Users who have no forward (and no legacy provisioned email) yet. */
export async function usersNeedingForward(): Promise<Array<{ id: number; first_name: string | null; last_name: string | null; email: string; role: string | null }>> {
  const r = await db.execute(sql`
    SELECT u.id, u.first_name, u.last_name, u.email, u.role
    FROM users u
    LEFT JOIN email_forwards ef ON ef.user_id = u.id
    LEFT JOIN provisioned_emails pe ON pe.user_id = u.id
    WHERE ef.id IS NULL AND pe.id IS NULL AND u.is_active = true
      AND u.email NOT LIKE '%@oceanluxe.org'
    ORDER BY u.created_at ASC
  `);
  return rowsOf(r);
}

// ---------------------------------------------------------------------------
// Legacy provisioned_emails (migrations 0091/0092) — kept for dedup lookups.
// ---------------------------------------------------------------------------

export async function emailTaken(email: string): Promise<boolean> {
  const r = await db.execute(sql`SELECT 1 FROM provisioned_emails WHERE email_address = ${email} LIMIT 1`);
  return rowsOf(r).length > 0;
}

export async function getProvisionByUser(userId: number): Promise<ProvisionedEmailRow | null> {
  const r = await db.execute(sql`SELECT * FROM provisioned_emails WHERE user_id = ${userId} LIMIT 1`);
  return rowsOf(r)[0] || null;
}

/** Find a provisioned email by address (case-insensitive) — cross-system dedup. */
export async function getProvisionByEmail(email: string): Promise<ProvisionedEmailRow | null> {
  const r = await db.execute(sql`SELECT * FROM provisioned_emails WHERE lower(email_address) = lower(${email}) LIMIT 1`);
  return rowsOf(r)[0] || null;
}

/**
 * Find a provisioned email for a person by name. Joins against users so
 * the onboarding site can ask "does Jane Doe already have an address?"
 * Returns the most recently provisioned match.
 */
export async function findProvisionByName(
  firstName: string,
  lastName: string
): Promise<(ProvisionedEmailRow & { matched_user_id: number }) | null> {
  const r = await db.execute(sql`
    SELECT pe.*, pe.user_id AS matched_user_id
    FROM provisioned_emails pe
    JOIN users u ON u.id = pe.user_id
    WHERE lower(trim(u.first_name)) = lower(trim(${firstName}))
      AND lower(trim(u.last_name)) = lower(trim(${lastName}))
    ORDER BY pe.provisioned_at DESC NULLS LAST, pe.created_at DESC
    LIMIT 1
  `);
  return rowsOf(r)[0] || null;
}

/**
 * Link a mailbox that already exists in IONOS (e.g. created via the
 * onboarding site) to a CRM user, instead of creating a duplicate.
 * Upserts on user_id; the source column is stamped best-effort so this
 * keeps working even if migration 0092 hasn't run yet.
 */
export async function linkExternalProvision(row: {
  userId: number;
  email: string;
  mailboxId: string | null;
  forwardingTo: string | null;
  source: "crm_signup" | "onboarding_site" | "manual";
}): Promise<ProvisionedEmailRow> {
  const saved = await saveProvision({
    userId: row.userId,
    email: row.email,
    mailboxId: row.mailboxId,
    forwardingTo: row.forwardingTo,
    status: "active",
    error: null,
  });
  try {
    await db.execute(sql`UPDATE provisioned_emails SET source = ${row.source} WHERE id = ${saved.id}`);
  } catch {
    // Column added in migration 0092 — ignore if it doesn't exist yet.
  }
  return { ...saved, source: row.source };
}

export async function saveProvision(row: {
  userId: number;
  email: string;
  mailboxId: string | null;
  forwardingTo: string | null;
  status: "pending" | "active" | "failed";
  error?: string | null;
}): Promise<ProvisionedEmailRow> {
  const r = await db.execute(sql`
    INSERT INTO provisioned_emails (user_id, email_address, ionos_mailbox_id, forwarding_to, status, error, provisioned_at)
    VALUES (${row.userId}, ${row.email}, ${row.mailboxId}, ${row.forwardingTo}, ${row.status}, ${row.error || null},
      ${row.status === "active" ? sql`now()` : null})
    ON CONFLICT (user_id) DO UPDATE SET
      email_address = EXCLUDED.email_address,
      ionos_mailbox_id = EXCLUDED.ionos_mailbox_id,
      forwarding_to = EXCLUDED.forwarding_to,
      status = EXCLUDED.status,
      error = EXCLUDED.error,
      provisioned_at = CASE WHEN EXCLUDED.status = 'active' THEN now() ELSE provisioned_emails.provisioned_at END
    RETURNING *
  `);
  return rowsOf(r)[0];
}

export async function listProvisions(status?: string): Promise<ProvisionedEmailRow[]> {
  const r = status
    ? await db.execute(sql`SELECT * FROM provisioned_emails WHERE status = ${status} ORDER BY created_at DESC`)
    : await db.execute(sql`SELECT * FROM provisioned_emails ORDER BY created_at DESC`);
  return rowsOf(r);
}

export async function pendingProvisionQueue(): Promise<Array<ProvisionedEmailRow & { first_name: string | null; last_name: string | null; signup_email: string }>> {
  const r = await db.execute(sql`
    SELECT pe.*, u.first_name, u.last_name, u.email AS signup_email
    FROM provisioned_emails pe
    JOIN users u ON u.id = pe.user_id
    WHERE pe.status IN ('pending', 'failed')
    ORDER BY pe.created_at ASC
  `);
  return rowsOf(r);
}

/** Users who have no provisioned_emails row yet (need provisioning). */
export async function usersNeedingEmail(): Promise<Array<{ id: number; first_name: string | null; last_name: string | null; email: string; role: string | null }>> {
  const r = await db.execute(sql`
    SELECT u.id, u.first_name, u.last_name, u.email, u.role
    FROM users u
    LEFT JOIN provisioned_emails pe ON pe.user_id = u.id
    WHERE pe.id IS NULL AND u.is_active = true
      AND u.email NOT LIKE '%@oceanluxe.org'
    ORDER BY u.created_at ASC
  `);
  return rowsOf(r);
}

export async function getChecklist(userId: number): Promise<ChecklistRow | null> {
  const r = await db.execute(sql`SELECT * FROM onboarding_checklist WHERE user_id = ${userId} LIMIT 1`);
  return rowsOf(r)[0] || null;
}

export async function ensureChecklist(userId: number): Promise<ChecklistRow> {
  const r = await db.execute(sql`
    INSERT INTO onboarding_checklist (user_id) VALUES (${userId})
    ON CONFLICT (user_id) DO NOTHING
    RETURNING *
  `);
  const created = rowsOf(r)[0];
  if (created) return created;
  return (await getChecklist(userId))!;
}

const CHECKLIST_COLS = [
  "offer_letter_signed",
  "ica_signed",
  "w9_submitted",
  "id_verified",
  "payout_setup",
  "training_completed",
  "email_provisioned",
] as const;

export async function updateChecklistItem(
  userId: number,
  item: string,
  value: boolean
): Promise<ChecklistRow | null> {
  if (!(CHECKLIST_COLS as readonly string[]).includes(item)) return null;
  // Column name is whitelisted above — safe to interpolate.
  const r = await db.execute(sql`
    INSERT INTO onboarding_checklist (user_id) VALUES (${userId})
    ON CONFLICT (user_id) DO UPDATE SET updated_at = now()
    RETURNING *
  `);
  void r;
  const r2 = await db.execute(sql`
    UPDATE onboarding_checklist
    SET ${sql.raw(`"${item}"`)} = ${value}, updated_at = now()
    WHERE user_id = ${userId}
    RETURNING *
  `);
  return rowsOf(r2)[0] || null;
}

export async function markChecklistEmailProvisioned(userId: number, provisioned: boolean): Promise<void> {
  await db.execute(sql`
    INSERT INTO onboarding_checklist (user_id, email_provisioned) VALUES (${userId}, ${provisioned})
    ON CONFLICT (user_id) DO UPDATE SET email_provisioned = ${provisioned}, updated_at = now()
  `);
}

export async function grantLiveLeadAccess(userId: number, grantedBy: number): Promise<{ ok: boolean; missing?: string[] }> {
  const checklist = await ensureChecklist(userId);
  const missing = (CHECKLIST_COLS as readonly string[]).filter((k) => !(checklist as any)[k]);
  if (missing.length > 0) {
    return { ok: false, missing: missing as string[] };
  }
  await db.execute(sql`
    UPDATE onboarding_checklist
    SET live_lead_access_granted = true,
        live_lead_access_granted_at = now(),
        live_lead_access_granted_by = ${grantedBy},
        updated_at = now()
    WHERE user_id = ${userId}
  `);
  return { ok: true };
}

export async function revokeLiveLeadAccess(userId: number): Promise<void> {
  await db.execute(sql`
    UPDATE onboarding_checklist
    SET live_lead_access_granted = false,
        live_lead_access_granted_at = null,
        live_lead_access_granted_by = null,
        updated_at = now()
    WHERE user_id = ${userId}
  `);
}
