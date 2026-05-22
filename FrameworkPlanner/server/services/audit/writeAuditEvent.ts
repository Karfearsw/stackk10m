import { db } from "../../db.js";
import { auditEvents } from "../../shared-schema.js";

function computeShallowDiff(before: any, after: any) {
  const b = before && typeof before === "object" ? before : {};
  const a = after && typeof after === "object" ? after : {};
  const keys = new Set<string>([...Object.keys(b), ...Object.keys(a)]);
  const changed: Array<{ key: string; before: unknown; after: unknown }> = [];
  for (const key of keys) {
    const bv = (b as any)[key];
    const av = (a as any)[key];
    if (JSON.stringify(bv) !== JSON.stringify(av)) {
      changed.push({ key, before: bv ?? null, after: av ?? null });
    }
  }
  return { changed };
}

export async function writeAuditEvent(input: {
  teamId: number;
  actorUserId?: number | null;
  entityType: string;
  entityId?: number | null;
  action: string;
  before?: unknown;
  after?: unknown;
  diff?: unknown;
  ip?: string | null;
  userAgent?: string | null;
  requestId?: string | null;
  kind?: "create" | "update" | "delete";
}) {
  const beforeJson = typeof input.before === "undefined" ? null : JSON.stringify(input.before);
  const afterJson = typeof input.after === "undefined" ? null : JSON.stringify(input.after);
  const diff =
    typeof input.diff !== "undefined"
      ? input.diff
      : typeof input.before !== "undefined" || typeof input.after !== "undefined"
        ? computeShallowDiff(input.before, input.after)
        : null;
  const diffJson =
    diff === null
      ? input.kind
        ? JSON.stringify({ kind: input.kind, changed: [] })
        : null
      : JSON.stringify({ kind: input.kind || "update", ...(diff as any) });

  const rows = await db
    .insert(auditEvents)
    .values({
      teamId: input.teamId,
      actorUserId: typeof input.actorUserId === "number" ? input.actorUserId : null,
      entityType: String(input.entityType || "").trim(),
      entityId: typeof input.entityId === "number" ? input.entityId : null,
      action: String(input.action || "").trim(),
      beforeJson,
      afterJson,
      diffJson,
      ip: input.ip ? String(input.ip).slice(0, 64) : null,
      userAgent: input.userAgent ? String(input.userAgent) : null,
      requestId: input.requestId ? String(input.requestId).slice(0, 64) : null,
    } as any)
    .returning();
  return rows[0] || null;
}

