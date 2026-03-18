import { storage } from "../../storage.js";

function parseRrule(rule: string | null | undefined): { freq: "DAILY" | "WEEKLY" | "MONTHLY"; interval: number } | null {
  const raw = String(rule || "").trim();
  if (!raw) return null;
  const parts = raw.split(";").map((p) => p.trim()).filter(Boolean);
  const kv = new Map<string, string>();
  for (const p of parts) {
    const idx = p.indexOf("=");
    if (idx <= 0) continue;
    kv.set(p.slice(0, idx).toUpperCase(), p.slice(idx + 1).toUpperCase());
  }
  const freq = kv.get("FREQ");
  if (freq !== "DAILY" && freq !== "WEEKLY" && freq !== "MONTHLY") return null;
  const intervalRaw = kv.get("INTERVAL");
  const interval = intervalRaw ? Math.max(1, parseInt(intervalRaw, 10) || 1) : 1;
  return { freq, interval };
}

function addMonths(date: Date, months: number): Date {
  const d = new Date(date);
  const day = d.getDate();
  d.setMonth(d.getMonth() + months);
  if (d.getDate() !== day) {
    d.setDate(0);
  }
  return d;
}

function nextDueAt(input: { dueAt: Date | null; rule: { freq: "DAILY" | "WEEKLY" | "MONTHLY"; interval: number } }): Date | null {
  if (!input.dueAt) return null;
  const d = new Date(input.dueAt);
  if (input.rule.freq === "DAILY") return new Date(d.getTime() + input.rule.interval * 24 * 60 * 60 * 1000);
  if (input.rule.freq === "WEEKLY") return new Date(d.getTime() + input.rule.interval * 7 * 24 * 60 * 60 * 1000);
  return addMonths(d, input.rule.interval);
}

export async function createTask(input: {
  title: string;
  description?: string | null;
  type?: string | null;
  relatedEntityType?: string | null;
  relatedEntityId?: number | null;
  dueAt?: Date | null;
  priority?: string | null;
  status?: string | null;
  assignedToUserId?: number | null;
  isRecurring?: boolean | null;
  recurrenceRule?: string | null;
  isPrivate?: boolean | null;
  createdBy: number;
}) {
  const now = new Date();
  const row = await storage.createTask({
    title: input.title,
    description: input.description ?? null,
    type: input.type ?? "general",
    relatedEntityType: input.relatedEntityType ?? null,
    relatedEntityId: input.relatedEntityId ?? null,
    dueAt: input.dueAt ?? null,
    completedAt: null,
    priority: input.priority ?? "medium",
    status: input.status ?? "open",
    assignedToUserId: input.assignedToUserId ?? null,
    isRecurring: !!input.isRecurring,
    recurrenceRule: input.recurrenceRule ?? null,
    createdBy: input.createdBy,
    isPrivate: !!input.isPrivate,
    reminderSentAt: null,
    overdueAlertSentAt: null,
    createdAt: now,
    updatedAt: now,
  } as any);
  return row;
}

export async function completeTaskWithRecurrence(input: { taskId: number; completedAt: Date }) {
  const task = await storage.getTaskById(input.taskId);
  if (!task) return null;

  const completed = await storage.completeTask(task.id, { completedAt: input.completedAt, status: "completed" });

  if (!completed.isRecurring) return { completed, next: null };
  const rule = parseRrule(completed.recurrenceRule);
  if (!rule) return { completed, next: null };

  const dueAt = nextDueAt({ dueAt: completed.dueAt ?? null, rule });
  if (!dueAt) return { completed, next: null };

  const next = await createTask({
    title: completed.title,
    description: completed.description ?? null,
    type: completed.type ?? "general",
    relatedEntityType: completed.relatedEntityType ?? null,
    relatedEntityId: completed.relatedEntityId ?? null,
    dueAt,
    priority: completed.priority ?? "medium",
    status: "open",
    assignedToUserId: completed.assignedToUserId ?? null,
    isRecurring: true,
    recurrenceRule: completed.recurrenceRule ?? null,
    isPrivate: completed.isPrivate ?? false,
    createdBy: completed.createdBy ?? 0,
  });

  return { completed, next };
}

export async function onLeadCreated(input: { leadId: number; leadAddress: string; assignedTo?: number | null; createdBy: number }) {
  const assignedToUserId = typeof input.assignedTo === "number" ? input.assignedTo : input.createdBy;
  await createTask({
    title: "Initial follow-up",
    description: `New lead: ${input.leadAddress}`,
    type: "follow_up",
    relatedEntityType: "lead",
    relatedEntityId: input.leadId,
    dueAt: new Date(Date.now() + 60 * 60 * 1000),
    priority: "high",
    status: "open",
    assignedToUserId,
    isRecurring: false,
    recurrenceRule: null,
    isPrivate: false,
    createdBy: input.createdBy,
  });
}

export async function onLeadStatusChanged(input: {
  leadId: number;
  leadAddress: string;
  beforeStatus?: string | null;
  afterStatus?: string | null;
  assignedTo?: number | null;
  actorUserId: number;
}) {
  const before = String(input.beforeStatus || "").trim().toLowerCase();
  const after = String(input.afterStatus || "").trim().toLowerCase();
  if (!after || after === before) return;

  const assignedToUserId = typeof input.assignedTo === "number" ? input.assignedTo : input.actorUserId;

  if (after === "qualified") {
    await createTask({
      title: "Call seller to confirm details",
      description: `Qualified lead: ${input.leadAddress}`,
      type: "call",
      relatedEntityType: "lead",
      relatedEntityId: input.leadId,
      dueAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      priority: "medium",
      status: "open",
      assignedToUserId,
      isRecurring: false,
      recurrenceRule: null,
      isPrivate: false,
      createdBy: input.actorUserId,
    });
  }

  if (after === "under_contract") {
    await createTask({
      title: "Convert to opportunity + start contract workflow",
      description: `Lead is under contract: ${input.leadAddress}`,
      type: "workflow",
      relatedEntityType: "lead",
      relatedEntityId: input.leadId,
      dueAt: new Date(Date.now() + 2 * 60 * 60 * 1000),
      priority: "high",
      status: "open",
      assignedToUserId,
      isRecurring: false,
      recurrenceRule: null,
      isPrivate: false,
      createdBy: input.actorUserId,
    });
  }
}

export async function onContractSigned(input: { documentId: number; title: string; propertyId?: number | null }) {
  let assignedToUserId: number | null = null;
  if (typeof input.propertyId === "number") {
    try {
      const property = await storage.getPropertyById(input.propertyId);
      assignedToUserId = (property as any)?.assignedTo ?? null;
    } catch {}
  }

  await createTask({
    title: "Review executed contract + update deal stage",
    description: `Contract signed: ${input.title}`,
    type: "contract",
    relatedEntityType: typeof input.propertyId === "number" ? "opportunity" : null,
    relatedEntityId: typeof input.propertyId === "number" ? input.propertyId : null,
    dueAt: new Date(Date.now() + 2 * 60 * 60 * 1000),
    priority: "high",
    status: "open",
    assignedToUserId,
    isRecurring: false,
    recurrenceRule: null,
    isPrivate: false,
    createdBy: 0,
  });
}

export async function onCampaignCompleted(input: { campaignId: number; leadId: number; leadAddress: string; assignedTo?: number | null; createdBy: number }) {
  const assignedToUserId = typeof input.assignedTo === "number" ? input.assignedTo : input.createdBy;
  await createTask({
    title: "Follow up after campaign completion",
    description: `Campaign completed for lead: ${input.leadAddress}`,
    type: "follow_up",
    relatedEntityType: "lead",
    relatedEntityId: input.leadId,
    dueAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
    priority: "medium",
    status: "open",
    assignedToUserId,
    isRecurring: false,
    recurrenceRule: null,
    isPrivate: false,
    createdBy: input.createdBy,
  });
}

