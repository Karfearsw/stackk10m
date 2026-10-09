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

  // ── Speed-to-lead alert (0098): instant in-app + SMS to the assigned agent.
  try {
    const { fireSpeedToLeadAlert } = await import("../notifications/speedToLead.js");
    await fireSpeedToLeadAlert({
      leadId: input.leadId,
      leadAddress: input.leadAddress,
      assignedToUserId,
      createdByUserId: input.createdBy,
    });
  } catch (e) {
    console.error("[speed-to-lead] hook failed (non-blocking):", e);
  }

  // ── Skip-trace bottleneck fix (0098): auto-queue a free skip-trace job when
  // the lead has no phone. Uses public-research/free providers first — $0.
  try {
    const lead: any = await storage.getLeadById(input.leadId);
    const hasPhone = String(lead?.ownerPhone || "").replace(/\D/g, "").length >= 7;
    if (!hasPhone) {
      const { createSkipTraceJob, runSkipTraceJob } = await import("../skipTrace/orchestrator.js");
      const job = await createSkipTraceJob({
        entityType: "lead",
        entityId: input.leadId,
        mode: "public_research",
        requestedByUserId: input.createdBy,
      });
      // Run async — don't block lead creation
      runSkipTraceJob(job.id).catch((e: any) =>
        console.error("[auto-skip-trace] job failed (non-blocking):", e?.message || e),
      );
      console.log(`[auto-skip-trace] queued job ${job.id} for phoneless lead ${input.leadId}`);
    }
  } catch (e) {
    console.error("[auto-skip-trace] hook failed (non-blocking):", e);
  }
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

    // ── Auto buyer-matching (0097): the moment a lead qualifies, score every
    // buyer and surface the top matches to the assigned agent. Non-blocking.
    try {
      const { matchBuyersToLead } = await import("../buyerMatch/matchLead.js");
      const matches = await matchBuyersToLead(input.leadId, { minScore: 40, limit: 10 });
      if (matches.length > 0) {
        const top3 = matches.slice(0, 3)
          .map((m) => `${m.buyerName} (${m.score})`)
          .join(", ");
        await createTask({
          title: `Dispo: ${matches.length} buyer${matches.length === 1 ? "" : "s"} match ${input.leadAddress}`,
          description: `Top matches: ${top3}${matches.length > 3 ? ` +${matches.length - 3} more` : ""}. Review in lead → buyer matches.`,
          type: "disposition",
          relatedEntityType: "lead",
          relatedEntityId: input.leadId,
          dueAt: new Date(Date.now() + 48 * 60 * 60 * 1000),
          priority: matches[0].score >= 70 ? "high" : "medium",
          status: "open",
          assignedToUserId,
          isRecurring: false,
          recurrenceRule: null,
          isPrivate: false,
          createdBy: input.actorUserId,
        });
      }
    } catch (e) {
      console.error("[auto-buyer-match] failed (non-blocking):", e);
    }
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

