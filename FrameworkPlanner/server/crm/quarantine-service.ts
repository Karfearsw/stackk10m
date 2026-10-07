import { and, desc, eq } from "drizzle-orm";
import { db } from "../db.js";
import { buyers, contacts, leads, properties, quarantinedRecords } from "../shared-schema.js";
import {
  type QuarantineEntityType,
  type QuarantineMatch,
  scanRecordForTestPatterns,
} from "./quarantine.js";

/** Active quarantine rows for an entity type, as a Set of ids for exclusion. */
export async function quarantinedIdsFor(entityType: QuarantineEntityType): Promise<Set<number>> {
  const rows = await db
    .select({ entityId: quarantinedRecords.entityId })
    .from(quarantinedRecords)
    .where(and(eq(quarantinedRecords.entityType, entityType), eq(quarantinedRecords.status, "quarantined")));
  return new Set(rows.map((r) => r.entityId));
}

export async function listQuarantinedRecords(filters: {
  entityType?: string;
  status?: string;
  limit?: number;
} = {}) {
  const conditions: any[] = [];
  if (filters.entityType) conditions.push(eq(quarantinedRecords.entityType, filters.entityType));
  if (filters.status) conditions.push(eq(quarantinedRecords.status, filters.status));
  return db
    .select()
    .from(quarantinedRecords)
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(desc(quarantinedRecords.flaggedAt))
    .limit(Math.min(Math.max(filters.limit ?? 200, 1), 1000));
}

export async function flagRecord(params: {
  entityType: QuarantineEntityType;
  entityId: number;
  matches: QuarantineMatch[];
  actorUserId?: number | null;
  notes?: string | null;
}) {
  if (!params.matches.length) return null;
  const primary = params.matches[0];
  const rows = await db
    .insert(quarantinedRecords)
    .values({
      entityType: params.entityType,
      entityId: params.entityId,
      matchReason: params.matches.map((m) => m.reason).join("; "),
      matchedPattern: primary.patternId,
      matchedField: String(primary.field),
      status: "quarantined",
      flaggedBy: typeof params.actorUserId === "number" ? params.actorUserId : null,
      notes: params.notes ?? null,
    } as any)
    .onConflictDoNothing()
    .returning();
  return rows[0] ?? null;
}

/** Owner-authorized restore of a false positive. Never deletes the row. */
export async function restoreQuarantinedRecord(id: number, actorUserId: number | null, notes?: string | null) {
  const rows = await db
    .update(quarantinedRecords)
    .set({
      status: "restored",
      restoredBy: typeof actorUserId === "number" ? actorUserId : null,
      restoredAt: new Date(),
      notes: notes ?? null,
      updatedAt: new Date(),
    } as any)
    .where(eq(quarantinedRecords.id, id))
    .returning();
  return rows[0] ?? null;
}

/**
 * Scan an entity type for reviewed test patterns and flag matches.
 * Read-only apart from creating quarantine rows; nothing is deleted.
 */
export async function scanAndFlagEntity(entityType: QuarantineEntityType, actorUserId: number | null) {
  if (entityType === "lead") {
    const rows = await db
      .select({ id: leads.id, address: leads.address, city: leads.city, ownerName: leads.ownerName, source: leads.source, notes: leads.notes })
      .from(leads);
    return flagMatches(entityType, rows, actorUserId);
  }
  if (entityType === "buyer") {
    const rows = await db
      .select({ id: buyers.id, name: buyers.name, company: buyers.company, email: buyers.email, phone: buyers.phone, notes: buyers.notes })
      .from(buyers);
    return flagMatches(entityType, rows, actorUserId);
  }
  if (entityType === "contact") {
    const rows = await db
      .select({ id: contacts.id, name: contacts.name, company: contacts.company, email: contacts.email, phone: contacts.phone, notes: contacts.notes })
      .from(contacts);
    return flagMatches(entityType, rows, actorUserId);
  }
  if (entityType === "opportunity") {
    const rows = await db
      .select({ id: properties.id, address: properties.address, city: properties.city, notes: properties.notes })
      .from(properties);
    return flagMatches(entityType, rows, actorUserId);
  }
  return { entityType, scanned: 0, flagged: 0, alreadyFlagged: 0 };
}

async function flagMatches(
  entityType: QuarantineEntityType,
  rows: Array<Record<string, unknown> & { id: number }>,
  actorUserId: number | null,
) {
  let flagged = 0;
  let alreadyFlagged = 0;
  for (const row of rows) {
    const matches = scanRecordForTestPatterns(row);
    if (!matches.length) continue;
    const created = await flagRecord({ entityType, entityId: row.id, matches, actorUserId });
    if (created) flagged += 1;
    else alreadyFlagged += 1;
  }
  return { entityType, scanned: rows.length, flagged, alreadyFlagged };
}

/** Convenience: filter a list of records by active quarantine entries. */
export async function excludeQuarantined<T extends { id: number }>(
  entityType: QuarantineEntityType,
  rows: T[],
): Promise<T[]> {
  if (!rows.length) return rows;
  const quarantined = await quarantinedIdsFor(entityType);
  if (!quarantined.size) return rows;
  return rows.filter((r) => !quarantined.has(r.id));
}

/** Convenience: the active quarantine ids for an entity type, as an array. */
export async function quarantinedIdList(entityType: QuarantineEntityType): Promise<number[]> {
  return Array.from(await quarantinedIdsFor(entityType));
}
