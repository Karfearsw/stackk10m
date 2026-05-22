import { storage } from "../../storage.js";

export type NotificationSeverity = "info" | "warning" | "urgent";
export type NotificationChannel = "in_app" | "email" | "push";
export type NotificationPreferenceCategory =
  | "newLeads"
  | "dealUpdates"
  | "contractAlerts"
  | "weeklySummary"
  | "taskReminders"
  | "campaignUpdates"
  | "rvmUpdates"
  | "billingAlerts"
  | "securityAlerts"
  | "systemAlerts";

function parseTimeToMinutes(raw: unknown): number | null {
  const s = String(raw || "").trim();
  if (!s) return null;
  const m = /^(\d{1,2}):(\d{2})$/.exec(s);
  if (!m) return null;
  const hh = Number.parseInt(m[1], 10);
  const mm = Number.parseInt(m[2], 10);
  if (!Number.isFinite(hh) || !Number.isFinite(mm)) return null;
  if (hh < 0 || hh > 23) return null;
  if (mm < 0 || mm > 59) return null;
  return hh * 60 + mm;
}

function utcMinutesSinceMidnight(now: Date): number {
  return now.getUTCHours() * 60 + now.getUTCMinutes();
}

function isInDndWindow(prefs: any, now: Date): boolean {
  if (!prefs?.dndEnabled) return false;
  const start = parseTimeToMinutes(prefs?.dndStartTime);
  const end = parseTimeToMinutes(prefs?.dndEndTime);
  if (start === null || end === null) return false;
  const cur = utcMinutesSinceMidnight(now);
  if (start === end) return true;
  if (start < end) return cur >= start && cur < end;
  return cur >= start || cur < end;
}

function isCategoryEnabled(prefs: any, category: NotificationPreferenceCategory | null | undefined): boolean {
  if (!category) return true;
  const v = prefs?.[category];
  return v !== false;
}

export async function getNotificationDeliveryPlan(input: {
  userId: number;
  category?: NotificationPreferenceCategory | null;
  now?: Date;
}): Promise<{ prefs: any | null; inApp: boolean; email: boolean; push: boolean; inDnd: boolean }> {
  const now = input.now ?? new Date();
  let prefs: any | null = null;
  try {
    prefs = (await storage.getNotificationPreferencesByUserId(input.userId)) as any;
  } catch {
    prefs = null;
  }

  const inDnd = isInDndWindow(prefs, now);
  const categoryOk = isCategoryEnabled(prefs, input.category ?? null);
  const inApp = !inDnd && categoryOk && (prefs ? prefs.inAppEnabled !== false : true);
  const email = !inDnd && categoryOk && (prefs ? prefs.emailEnabled !== false : true);
  const push = !inDnd && categoryOk && (prefs ? prefs.pushEnabled !== false : true);
  return { prefs, inApp, email, push, inDnd };
}

export async function emitInAppNotification(input: {
  userId: number;
  type: string;
  severity: NotificationSeverity;
  title: string;
  description?: string | null;
  linkPath?: string | null;
  relatedType?: string | null;
  relatedId?: number | null;
  primaryAction?: any | null;
  category?: NotificationPreferenceCategory | null;
  now?: Date;
}): Promise<{ created: boolean; skippedReason?: "prefs" | "dnd" }> {
  const plan = await getNotificationDeliveryPlan({
    userId: input.userId,
    category: input.category ?? null,
    now: input.now,
  });

  if (!plan.inApp) return { created: false, skippedReason: plan.inDnd ? "dnd" : "prefs" };

  await storage.createUserNotification({
    userId: input.userId,
    type: input.type,
    severity: input.severity,
    title: input.title,
    description: typeof input.description === "string" ? input.description : input.description ?? null,
    read: false,
    relatedId: typeof input.relatedId === "number" ? input.relatedId : input.relatedId ?? null,
    relatedType: input.relatedType ?? null,
    linkPath: input.linkPath ?? null,
    primaryAction: typeof input.primaryAction === "undefined" ? null : input.primaryAction,
    createdAt: input.now ?? new Date(),
  } as any);

  return { created: true };
}

