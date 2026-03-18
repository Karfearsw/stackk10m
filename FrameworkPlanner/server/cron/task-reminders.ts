import { db } from "../db.js";
import { sql } from "drizzle-orm";
import { storage } from "../storage.js";
import { sendResendEmail } from "../services/messaging/resend.js";

function parseEnvBool(v: unknown): boolean | null {
  if (v === undefined || v === null) return null;
  const s = String(v).trim().toLowerCase();
  if (!s) return null;
  if (s === "1" || s === "true" || s === "yes" || s === "on") return true;
  if (s === "0" || s === "false" || s === "no" || s === "off") return false;
  return null;
}

function envInt(name: string, fallback: number) {
  const raw = String(process.env[name] || "").trim();
  const n = raw ? parseInt(raw, 10) : NaN;
  return Number.isFinite(n) ? n : fallback;
}

export function startTaskReminders(intervalMs = 60_000) {
  let running = false;

  const tick = async () => {
    if (running) return;
    running = true;
    try {
      const enabled = parseEnvBool(process.env.TASK_REMINDERS_ENABLED);
      if (enabled === false) return;

      const reminderWindowMinutes = envInt("TASK_REMINDER_WINDOW_MINUTES", 60);
      const overdueAlertWindowMinutes = envInt("TASK_OVERDUE_ALERT_WINDOW_MINUTES", 60);

      const dueSoon: any = await db.execute(sql`
        SELECT id, title, description, due_at, assigned_to_user_id
        FROM tasks
        WHERE status = 'open'
          AND assigned_to_user_id IS NOT NULL
          AND due_at IS NOT NULL
          AND due_at > NOW()
          AND due_at <= NOW() + (${reminderWindowMinutes}::int * INTERVAL '1 minute')
          AND reminder_sent_at IS NULL
        ORDER BY due_at ASC
        LIMIT 200
      `);
      const dueSoonRows = (dueSoon as any).rows || [];

      for (const r of dueSoonRows) {
        const taskId = Number(r.id);
        const userId = Number(r.assigned_to_user_id);
        if (!Number.isFinite(taskId) || !Number.isFinite(userId)) continue;

        const title = String(r.title || "Task due soon");
        const dueAt = r.due_at ? new Date(r.due_at) : null;

        const prefs = (await storage.getNotificationPreferencesByUserId(userId).catch(() => null)) as any;
        const inAppEnabled = prefs ? prefs.inAppEnabled !== false : true;
        const emailEnabled = prefs ? prefs.emailEnabled !== false : true;

        if (inAppEnabled) {
          await storage.createUserNotification({
            userId,
            type: "task_reminder",
            title: "Task due soon",
            description: dueAt ? `${title} is due at ${dueAt.toISOString()}` : title,
            read: false,
            relatedId: taskId,
            relatedType: "task",
            createdAt: new Date(),
          } as any);
        }

        if (emailEnabled) {
          try {
            const user = await storage.getUserById(userId);
            const to = String((user as any)?.email || "").trim();
            if (to) {
              await sendResendEmail({
                to,
                subject: "Task due soon",
                text: dueAt ? `${title}\nDue: ${dueAt.toISOString()}` : title,
              });
            }
          } catch {}
        }

        await db.execute(sql`UPDATE tasks SET reminder_sent_at = NOW(), updated_at = NOW() WHERE id = ${taskId}`);
      }

      const overdue: any = await db.execute(sql`
        SELECT id, title, description, due_at, assigned_to_user_id
        FROM tasks
        WHERE status = 'open'
          AND assigned_to_user_id IS NOT NULL
          AND due_at IS NOT NULL
          AND due_at < NOW()
          AND due_at >= NOW() - (${overdueAlertWindowMinutes}::int * INTERVAL '1 minute')
          AND overdue_alert_sent_at IS NULL
        ORDER BY due_at DESC
        LIMIT 200
      `);
      const overdueRows = (overdue as any).rows || [];

      for (const r of overdueRows) {
        const taskId = Number(r.id);
        const userId = Number(r.assigned_to_user_id);
        if (!Number.isFinite(taskId) || !Number.isFinite(userId)) continue;

        const title = String(r.title || "Overdue task");
        const dueAt = r.due_at ? new Date(r.due_at) : null;

        const prefs = (await storage.getNotificationPreferencesByUserId(userId).catch(() => null)) as any;
        const inAppEnabled = prefs ? prefs.inAppEnabled !== false : true;
        const emailEnabled = prefs ? prefs.emailEnabled !== false : true;

        if (inAppEnabled) {
          await storage.createUserNotification({
            userId,
            type: "task_overdue",
            title: "Task overdue",
            description: dueAt ? `${title} was due at ${dueAt.toISOString()}` : title,
            read: false,
            relatedId: taskId,
            relatedType: "task",
            createdAt: new Date(),
          } as any);
        }

        if (emailEnabled) {
          try {
            const user = await storage.getUserById(userId);
            const to = String((user as any)?.email || "").trim();
            if (to) {
              await sendResendEmail({
                to,
                subject: "Task overdue",
                text: dueAt ? `${title}\nDue: ${dueAt.toISOString()}` : title,
              });
            }
          } catch {}
        }

        await db.execute(sql`UPDATE tasks SET overdue_alert_sent_at = NOW(), updated_at = NOW() WHERE id = ${taskId}`);
      }
    } finally {
      running = false;
    }
  };

  tick().catch(() => {});
  return setInterval(() => tick().catch(() => {}), intervalMs);
}

