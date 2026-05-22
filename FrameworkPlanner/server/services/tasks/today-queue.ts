import { and, asc, desc, eq, inArray, isNotNull, lte, ne, or, sql } from "drizzle-orm";
import { db } from "../../db.js";
import { leads, properties, tasks, users } from "../../shared-schema.js";

type Auth = { userId: number; isManager: boolean };

type Assignee = { id: number; label: string };

type LeadLite = {
  id: number;
  address: string;
  zipCode: string;
  source: string | null;
  status: string | null;
  relasScore: number | null;
  estimatedValue: string | null;
  lastTouchAt: Date | null;
};

type OpportunityLite = {
  id: number;
  address: string;
  zipCode: string;
  status: string | null;
  price: string | null;
  arv: string | null;
  leadSource: string | null;
  leadSourceDetail: string | null;
};

export type TodayQueueItem = {
  id: number;
  title: string;
  description: string | null;
  type: string | null;
  dueAt: Date | null;
  priority: string | null;
  status: string | null;
  assignedToUserId: number | null;
  relatedEntityType: string | null;
  relatedEntityId: number | null;
  snoozeCount: number;
  lastSnoozedAt: Date | null;
  lastSnoozeReason: string | null;
  score: number;
  buckets: { overdue: boolean; dueToday: boolean };
  assignee: Assignee | null;
  lead: LeadLite | null;
  opportunity: OpportunityLite | null;
};

export type TodayQueueResponse = {
  start: string;
  end: string;
  counts: { overdue: number; dueToday: number; total: number; snoozeBlocked: number };
  top: TodayQueueItem[];
  groups: Array<{
    key: string;
    label: string;
    count: number;
    meta: { type: string | null; source: string | null; zipCode: string | null; assigneeLabel: string | null };
    items: TodayQueueItem[];
  }>;
};

function userLabel(u: { firstName?: string | null; lastName?: string | null; email?: string | null }) {
  const name = `${String(u.firstName || "").trim()} ${String(u.lastName || "").trim()}`.trim();
  return name ? name : String(u.email || "").trim();
}

function parseMoney(raw: unknown): number | null {
  if (raw === null || raw === undefined) return null;
  const n = Number(String(raw).replace(/[^0-9.]/g, ""));
  return Number.isFinite(n) ? n : null;
}

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function scoreTask(input: { t: any; start: Date; end: Date; now: Date; lead: LeadLite | null; opp: OpportunityLite | null }) {
  const dueAt = input.t?.dueAt ? new Date(input.t.dueAt as any) : null;
  const priority = String(input.t?.priority || "medium").toLowerCase();
  const snoozeCount = Number(input.t?.snoozeCount || 0);

  let score = 0;

  if (dueAt) {
    const overdueMs = input.start.getTime() - dueAt.getTime();
    if (overdueMs > 0) {
      const days = overdueMs / (24 * 60 * 60 * 1000);
      score += clamp(days * 12, 0, 90);
    } else {
      const untilMs = dueAt.getTime() - input.now.getTime();
      const hours = untilMs / (60 * 60 * 1000);
      if (hours <= 2) score += 25;
      else if (hours <= 6) score += 16;
      else if (hours <= 12) score += 10;
      else if (hours <= 24) score += 6;
      else score += 2;
    }
  }

  if (priority === "urgent") score += 35;
  else if (priority === "high") score += 20;
  else if (priority === "low") score -= 6;

  if (input.lead) {
    if (typeof input.lead.relasScore === "number") score += clamp(input.lead.relasScore * 0.4, 0, 40);
    const value = parseMoney(input.lead.estimatedValue);
    if (typeof value === "number") score += clamp(value / 20000, 0, 25);

    if (!input.lead.lastTouchAt) {
      score += 8;
    } else {
      const daysSinceTouch = (input.now.getTime() - new Date(input.lead.lastTouchAt as any).getTime()) / (24 * 60 * 60 * 1000);
      score += clamp(daysSinceTouch * 1.25, 0, 18);
    }
  }

  if (input.opp) {
    const stage = String(input.opp.status || "").toLowerCase();
    if (stage.includes("contract") || stage.includes("pending") || stage.includes("hot")) score += 16;
    if (stage.includes("lost") || stage.includes("dead") || stage.includes("closed")) score -= 12;

    const price = parseMoney(input.opp.price);
    const arv = parseMoney(input.opp.arv);
    const value = typeof arv === "number" ? arv : typeof price === "number" ? price : null;
    if (typeof value === "number") score += clamp(value / 30000, 0, 22);
  }

  score += clamp(snoozeCount * 6, 0, 40);

  return score;
}

function isOverdue(dueAt: Date | null, start: Date) {
  if (!dueAt) return false;
  return dueAt.getTime() < start.getTime();
}

function isDueToday(dueAt: Date | null, start: Date, end: Date) {
  if (!dueAt) return false;
  const ts = dueAt.getTime();
  return ts >= start.getTime() && ts <= end.getTime();
}

function normalizeSpaces(s: string) {
  return String(s || "").trim().replace(/\s+/g, " ");
}

function groupKeyForItem(item: TodayQueueItem) {
  const type = String(item.type || "general").trim().toLowerCase();
  const title = String(item.title || "").toLowerCase();
  const assigneeLabel = item.assignee?.label || null;
  const source =
    item.lead?.source ||
    item.opportunity?.leadSource ||
    item.opportunity?.leadSourceDetail ||
    null;
  const zipCode = item.lead?.zipCode || item.opportunity?.zipCode || null;

  if (type === "follow_up" || title.includes("initial follow-up")) {
    return {
      key: `initial_follow_up|${normalizeSpaces(source || "")}|${normalizeSpaces(zipCode || "")}|${normalizeSpaces(assigneeLabel || "")}`,
      label: `Initial follow-up${source ? ` — ${source}` : ""}${zipCode ? ` — ${zipCode}` : ""}`,
      meta: { type: "follow_up", source: source || null, zipCode: zipCode || null, assigneeLabel: assigneeLabel || null },
    };
  }

  if (item.relatedEntityType === "lead") {
    return {
      key: `lead|${normalizeSpaces(type)}|${normalizeSpaces(source || "")}|${normalizeSpaces(assigneeLabel || "")}`,
      label: `${normalizeSpaces(type || "Lead task")}${source ? ` — ${source}` : ""}`,
      meta: { type, source: source || null, zipCode: zipCode || null, assigneeLabel: assigneeLabel || null },
    };
  }

  if (item.relatedEntityType === "opportunity") {
    return {
      key: `opportunity|${normalizeSpaces(type)}|${normalizeSpaces(source || "")}|${normalizeSpaces(assigneeLabel || "")}`,
      label: `${normalizeSpaces(type || "Opportunity task")}${source ? ` — ${source}` : ""}`,
      meta: { type, source: source || null, zipCode: zipCode || null, assigneeLabel: assigneeLabel || null },
    };
  }

  return {
    key: `task|${normalizeSpaces(type)}|${normalizeSpaces(assigneeLabel || "")}`,
    label: `${normalizeSpaces(type || "Task")}${assigneeLabel ? ` — ${assigneeLabel}` : ""}`,
    meta: { type, source: null, zipCode: null, assigneeLabel: assigneeLabel || null },
  };
}

export async function buildTodayQueue(
  auth: Auth,
  input: { start: Date; end: Date; limit?: number; relatedEntityType?: string; relatedEntityId?: number },
): Promise<TodayQueueResponse> {
  const limit = clamp(typeof input.limit === "number" ? input.limit : 300, 1, 500);

  const whereParts: any[] = [];
  if (!auth.isManager) {
    whereParts.push(or(eq(tasks.isPrivate, false), eq(tasks.createdBy, auth.userId), eq(tasks.assignedToUserId, auth.userId)));
  }
  whereParts.push(ne(tasks.status, "completed"));
  whereParts.push(and(isNotNull(tasks.dueAt), lte(tasks.dueAt, input.end)));
  const relType = (input as any)?.relatedEntityType;
  const relId = (input as any)?.relatedEntityId;
  if (typeof relType === "string" && relType.trim() && typeof relId === "number" && Number.isFinite(relId)) {
    whereParts.push(eq(tasks.relatedEntityType, relType.trim()));
    whereParts.push(eq(tasks.relatedEntityId, relId));
  }

  const whereClause = whereParts.length ? and(...whereParts) : undefined;

  let q: any = db.select().from(tasks);
  if (whereClause) q = q.where(whereClause);
  q = q.orderBy(sql`due_at is null`, asc(tasks.dueAt), desc(tasks.createdAt)).limit(limit);

  const rows = (await q) as any[];

  const leadIds = Array.from(
    new Set(
      rows
        .filter((t) => t.relatedEntityType === "lead" && typeof t.relatedEntityId === "number")
        .map((t) => Number(t.relatedEntityId)),
    ),
  );
  const oppIds = Array.from(
    new Set(
      rows
        .filter((t) => t.relatedEntityType === "opportunity" && typeof t.relatedEntityId === "number")
        .map((t) => Number(t.relatedEntityId)),
    ),
  );
  const assigneeIds = Array.from(new Set(rows.map((t) => (typeof t.assignedToUserId === "number" ? Number(t.assignedToUserId) : null)).filter(Boolean)));

  const [leadRows, oppRows, userRows] = await Promise.all([
    leadIds.length
      ? db
          .select({
            id: leads.id,
            address: leads.address,
            zipCode: leads.zipCode,
            source: leads.source,
            status: leads.status,
            relasScore: leads.relasScore,
            estimatedValue: leads.estimatedValue,
            lastTouchAt: leads.lastTouchAt,
          })
          .from(leads)
          .where(inArray(leads.id, leadIds))
      : Promise.resolve([] as any[]),
    oppIds.length
      ? db
          .select({
            id: properties.id,
            address: properties.address,
            zipCode: properties.zipCode,
            status: properties.status,
            price: properties.price,
            arv: properties.arv,
            leadSource: properties.leadSource,
            leadSourceDetail: properties.leadSourceDetail,
          })
          .from(properties)
          .where(inArray(properties.id, oppIds))
      : Promise.resolve([] as any[]),
    assigneeIds.length
      ? db
          .select({
            id: users.id,
            email: users.email,
            firstName: users.firstName,
            lastName: users.lastName,
          })
          .from(users)
          .where(inArray(users.id, assigneeIds as any))
      : Promise.resolve([] as any[]),
  ]);

  const leadById = new Map<number, LeadLite>(leadRows.map((r: any) => [Number(r.id), r]));
  const oppById = new Map<number, OpportunityLite>(oppRows.map((r: any) => [Number(r.id), r]));
  const userById = new Map<number, Assignee>(
    userRows.map((u: any) => [
      Number(u.id),
      {
        id: Number(u.id),
        label: userLabel(u),
      },
    ]),
  );

  const now = new Date();

  const items: TodayQueueItem[] = rows.map((t) => {
    const lead = t.relatedEntityType === "lead" ? leadById.get(Number(t.relatedEntityId)) || null : null;
    const opportunity = t.relatedEntityType === "opportunity" ? oppById.get(Number(t.relatedEntityId)) || null : null;
    const dueAt = t.dueAt ? new Date(t.dueAt as any) : null;
    const assignee = typeof t.assignedToUserId === "number" ? userById.get(Number(t.assignedToUserId)) || null : null;

    const score = scoreTask({ t, start: input.start, end: input.end, now, lead, opp: opportunity });

    return {
      id: Number(t.id),
      title: String(t.title || ""),
      description: t.description ?? null,
      type: t.type ?? null,
      dueAt,
      priority: t.priority ?? null,
      status: t.status ?? null,
      assignedToUserId: typeof t.assignedToUserId === "number" ? Number(t.assignedToUserId) : null,
      relatedEntityType: t.relatedEntityType ?? null,
      relatedEntityId: typeof t.relatedEntityId === "number" ? Number(t.relatedEntityId) : null,
      snoozeCount: Number(t.snoozeCount || 0),
      lastSnoozedAt: t.lastSnoozedAt ? new Date(t.lastSnoozedAt as any) : null,
      lastSnoozeReason: t.lastSnoozeReason ?? null,
      score,
      buckets: {
        overdue: isOverdue(dueAt, input.start),
        dueToday: isDueToday(dueAt, input.start, input.end),
      },
      assignee,
      lead,
      opportunity,
    };
  });

  const sorted = [...items].sort((a, b) => b.score - a.score);
  const top = sorted.slice(0, 10);
  const topIds = new Set(top.map((t) => t.id));

  const groupsMap = new Map<string, { key: string; label: string; meta: any; items: TodayQueueItem[]; maxScore: number }>();
  for (const item of sorted) {
    if (topIds.has(item.id)) continue;
    const g = groupKeyForItem(item);
    const existing = groupsMap.get(g.key);
    if (!existing) {
      groupsMap.set(g.key, { key: g.key, label: g.label, meta: g.meta, items: [item], maxScore: item.score });
    } else {
      existing.items.push(item);
      existing.maxScore = Math.max(existing.maxScore, item.score);
    }
  }

  const groups = Array.from(groupsMap.values())
    .sort((a, b) => b.maxScore - a.maxScore || b.items.length - a.items.length)
    .map((g) => ({
      key: g.key,
      label: g.label,
      count: g.items.length,
      meta: {
        type: g.meta?.type ?? null,
        source: g.meta?.source ?? null,
        zipCode: g.meta?.zipCode ?? null,
        assigneeLabel: g.meta?.assigneeLabel ?? null,
      },
      items: g.items,
    }));

  const overdueCount = items.filter((i) => i.buckets.overdue).length;
  const dueTodayCount = items.filter((i) => i.buckets.dueToday).length;
  const snoozeBlocked = items.filter((i) => i.snoozeCount >= 5).length;

  return {
    start: input.start.toISOString(),
    end: input.end.toISOString(),
    counts: { overdue: overdueCount, dueToday: dueTodayCount, total: items.length, snoozeBlocked },
    top,
    groups,
  };
}
