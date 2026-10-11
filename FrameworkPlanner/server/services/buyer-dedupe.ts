/**
 * Buyer dedupe + test-buyer detection.
 *
 * Centralizes the normalization and duplicate-detection rules for the buyers
 * table so every creation path (UI, inquiry conversion, CSV import) keys
 * records the same way:
 *
 *   dedupeKey = computeBuyerDedupeKey({ email, phone, name, company })
 *             = "norm(email)|norm(phone)|norm(name)|norm(company)"
 *
 * (reuses the import pipeline's key function in server/crm/import-export.ts
 * so imports and manual creates dedupe against each other).
 *
 * Enforcement: storage.createBuyer() stamps dedupeKey and uses
 * ON CONFLICT DO NOTHING on the partial unique index
 * uq_buyers_dedupe_key (migration 0109), returning the existing row instead
 * of inserting a duplicate.
 */
import { and, eq, isNotNull, ne, or, sql } from "drizzle-orm";
import { db } from "../db.js";
import { buyers, type Buyer } from "../shared-schema.js";
import { computeBuyerDedupeKey } from "../crm/import-export.js";
import { normalizePhone } from "../dialer/user-settings.js";

export function normalizeBuyerEmail(email: unknown): string | null {
  const e = String(email ?? "").trim().toLowerCase();
  if (!e || !e.includes("@")) return null;
  return e;
}

export function normalizeBuyerPhone(phone: unknown): string | null {
  // E.164 when resolvable, else digits-only — either way stable for compare.
  const e164 = normalizePhone(phone);
  if (e164) return e164;
  const digits = String(phone ?? "").replace(/\D/g, "");
  return digits.length >= 7 ? digits : null;
}

/** The canonical dedupe key for a buyer record (same as the import path). */
export function buyerDedupeKey(input: {
  name?: string | null;
  company?: string | null;
  email?: string | null;
  phone?: string | null;
}): string {
  const key = computeBuyerDedupeKey({
    name: String(input.name ?? ""),
    company: input.company ?? null,
    email: normalizeBuyerEmail(input.email) ?? "",
    phone: normalizeBuyerPhone(input.phone) ?? "",
  });
  // All parts empty (e.g. "|||") is not a usable key — callers store NULL.
  return key.replace(/\|/g, "") === "" ? "" : key;
}

/**
 * Find an existing buyer that duplicates the given contact info.
 * Checks the stamped dedupeKey first, then falls back to normalized
 * email/phone matching for legacy rows that predate key stamping.
 */
export async function findDuplicateBuyer(input: {
  email?: string | null;
  phone?: string | null;
  name?: string | null;
  company?: string | null;
  excludeId?: number;
}): Promise<Buyer | null> {
  const key = buyerDedupeKey(input);
  const email = normalizeBuyerEmail(input.email);
  const phone = normalizeBuyerPhone(input.phone);

  const clauses: any[] = [eq(buyers.dedupeKey, key)];
  if (email) clauses.push(sql`lower(trim(${buyers.email})) = ${email}`);
  if (phone) {
    // Compare digits-only so (401) 555-0100 matches 4015550100 / +14015550100.
    clauses.push(sql`regexp_replace(coalesce(${buyers.phone}, ''), '\\D', '', 'g') = ${phone.replace(/\D/g, "")}`);
  }
  const [row] = await db
    .select()
    .from(buyers)
    .where(
      and(
        or(...clauses),
        input.excludeId ? ne(buyers.id, input.excludeId) : undefined,
      ),
    )
    .limit(1);
  return (row as Buyer) ?? null;
}

// ── Test-buyer heuristics ────────────────────────────────────────────────
// Conservative patterns only: obvious placeholders, example domains, and the
// fictional 555-0100…555-0199 phone range. Real buyers are never flagged by
// name alone.

const TEST_NAME_RE = /\b(test\w*|dummy|fake|sample|example|asdf|qwerty|xxx+)\b/i;
const TEST_EMAIL_RE = /test|example\.com|example\.org|test\.com|fake|dummy|asdf/i;
const FICTIONAL_PHONE_RE = /555-?01\d\d\b/;

export interface TestBuyerFlag {
  id: number;
  name: string;
  email: string | null;
  phone: string | null;
  reasons: string[];
}

export function testBuyerReasons(b: {
  name?: string | null;
  email?: string | null;
  phone?: string | null;
}): string[] {
  const reasons: string[] = [];
  const name = String(b.name ?? "");
  const email = String(b.email ?? "");
  const phone = String(b.phone ?? "");
  if (TEST_NAME_RE.test(name)) reasons.push("test-like name");
  if (email && TEST_EMAIL_RE.test(email)) reasons.push("test-like email");
  if (phone && FICTIONAL_PHONE_RE.test(phone.replace(/\D/g, "").replace(/^1/, "")))
    reasons.push("fictional 555-01xx phone");
  if (/^test/i.test(email)) reasons.push("email starts with 'test'");
  return [...new Set(reasons)];
}

/** Scan the buyers table for obvious test records. Read-only. */
export async function findTestBuyers(limit = 200): Promise<TestBuyerFlag[]> {
  const rows = await db
    .select({ id: buyers.id, name: buyers.name, email: buyers.email, phone: buyers.phone })
    .from(buyers)
    .where(
      or(
        sql`${buyers.name} ~* 'test|dummy|fake|sample|asdf|qwerty'`,
        sql`${buyers.email} ~* 'test|example\\.com|example\\.org|fake|dummy'`,
      ),
    )
    .limit(limit);
  const out: TestBuyerFlag[] = [];
  for (const r of rows) {
    const reasons = testBuyerReasons(r);
    if (reasons.length) out.push({ id: r.id, name: r.name, email: r.email, phone: r.phone, reasons });
  }
  return out;
}

/** Duplicate clusters for the manager dedupe report. Read-only. */
export interface DuplicateCluster {
  key: string;
  matchOn: string;
  buyers: { id: number; name: string; email: string | null; phone: string | null; createdAt: unknown }[];
}

export async function findDuplicateClusters(limit = 100): Promise<DuplicateCluster[]> {
  // Cluster by stamped dedupeKey…
  const keyRows = (await db.execute(sql`
    SELECT dedupe_key AS key, COUNT(*)::int AS n
    FROM buyers
    WHERE dedupe_key IS NOT NULL AND dedupe_key <> '|||'
    GROUP BY dedupe_key
    HAVING COUNT(*) > 1
    ORDER BY 2 DESC
    LIMIT ${limit}
  `)) as any;
  const clusters: DuplicateCluster[] = [];
  for (const r of keyRows.rows ?? keyRows) {
    const members = await db
      .select({ id: buyers.id, name: buyers.name, email: buyers.email, phone: buyers.phone, createdAt: buyers.createdAt })
      .from(buyers)
      .where(and(eq(buyers.dedupeKey, r.key), isNotNull(buyers.dedupeKey)));
    clusters.push({
      key: String(r.key),
      matchOn: "dedupe_key",
      buyers: members.map((m) => ({ ...m, createdAt: m.createdAt })),
    });
  }
  // …plus legacy rows sharing a normalized email but no stamped key.
  const emailRows = (await db.execute(sql`
    SELECT lower(trim(email)) AS key, COUNT(*)::int AS n
    FROM buyers
    WHERE email IS NOT NULL AND trim(email) <> '' AND (dedupe_key IS NULL OR dedupe_key = '')
    GROUP BY lower(trim(email))
    HAVING COUNT(*) > 1
    ORDER BY 2 DESC
    LIMIT ${limit}
  `)) as any;
  for (const r of emailRows.rows ?? emailRows) {
    const members = await db
      .select({ id: buyers.id, name: buyers.name, email: buyers.email, phone: buyers.phone, createdAt: buyers.createdAt })
      .from(buyers)
      .where(sql`lower(trim(${buyers.email})) = ${String(r.key)}`);
    clusters.push({
      key: `email:${String(r.key)}`,
      matchOn: "email",
      buyers: members.map((m) => ({ ...m, createdAt: m.createdAt })),
    });
  }
  return clusters;
}
