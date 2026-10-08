/**
 * Global email suppression list (Ticket 10).
 *
 * Hard bounces, spam complaints, and opt-outs are recorded here and every
 * send path checks this list first. Suppression is permanent until manually
 * removed — a bounced address never gets retried by automation.
 */
import { db } from "../db.js";
import { sql } from "drizzle-orm";

export type SuppressionReason = "bounce" | "complaint" | "optout";

export type SuppressionEntry = {
  id: number;
  email: string;
  reason: SuppressionReason;
  created_at: string;
};

/** Case-insensitive check: is this address suppressed? */
export async function isSuppressed(email: string): Promise<SuppressionEntry | null> {
  const addr = String(email || "").trim().toLowerCase();
  if (!addr) return null;
  const rows = await db.execute(sql`
    SELECT id, email, reason, created_at FROM email_suppressions
    WHERE lower(email) = ${addr} LIMIT 1
  `);
  const r: any = (rows as any)?.rows?.[0] ?? (rows as any)?.[0];
  return r ? { id: r.id, email: r.email, reason: r.reason, created_at: r.created_at } : null;
}

/** Add an address to the suppression list (idempotent). */
export async function addSuppression(email: string, reason: SuppressionReason): Promise<SuppressionEntry> {
  const addr = String(email || "").trim().toLowerCase();
  if (!addr) throw new Error("Email address is required");
  if (!["bounce", "complaint", "optout"].includes(reason)) throw new Error("Invalid suppression reason");
  const rows = await db.execute(sql`
    INSERT INTO email_suppressions (email, reason)
    VALUES (${addr}, ${reason})
    ON CONFLICT (email) DO UPDATE SET reason = EXCLUDED.reason
    RETURNING id, email, reason, created_at
  `);
  const r: any = (rows as any)?.rows?.[0] ?? (rows as any)?.[0];
  return { id: r.id, email: r.email, reason: r.reason, created_at: r.created_at };
}

/** Remove an address from the suppression list (manual admin action). */
export async function removeSuppression(email: string): Promise<boolean> {
  const addr = String(email || "").trim().toLowerCase();
  const rows = await db.execute(sql`
    DELETE FROM email_suppressions WHERE lower(email) = ${addr}
  `);
  const count = (rows as any)?.rowCount ?? (rows as any)?.rows?.length ?? 0;
  return count > 0;
}

/** Paged list for the Settings → Email suppression viewer. */
export async function listSuppressions(limit = 100, offset = 0): Promise<{ items: SuppressionEntry[]; total: number }> {
  const safeLimit = Math.min(Math.max(parseInt(String(limit), 10) || 100, 1), 500);
  const safeOffset = Math.max(parseInt(String(offset), 10) || 0, 0);
  const countRows = await db.execute(sql`SELECT COUNT(*)::int AS total FROM email_suppressions`);
  const total = Number((countRows as any)?.rows?.[0]?.total ?? (countRows as any)?.[0]?.total ?? 0);
  const rows = await db.execute(sql`
    SELECT id, email, reason, created_at FROM email_suppressions
    ORDER BY created_at DESC LIMIT ${safeLimit} OFFSET ${safeOffset}
  `);
  const list: any[] = (rows as any)?.rows ?? (rows as any) ?? [];
  return {
    total,
    items: list.map((r) => ({ id: r.id, email: r.email, reason: r.reason, created_at: r.created_at })),
  };
}
