/**
 * Speed-to-lead alert system (0098).
 *
 * When a new lead is created, the assigned agent gets an instant alert via:
 *  1. In-app notification (bell icon) — always
 *  2. SMS to the agent's phone — if they have a mobile on file and SMS alerts enabled
 *
 * Response time is tracked: leads.first_outreach_at is set on the first
 * logged call/SMS, and the dashboard can show avg response time per agent.
 */
import { db } from "../../db.js";
import { sql } from "drizzle-orm";

export type NotificationType = "new_lead" | "lead_qualified" | "buyer_match" | "info" | "warning";

export async function createNotification(input: {
  userId: number;
  type: NotificationType;
  title: string;
  body?: string | null;
  entityType?: string | null;
  entityId?: number | null;
}): Promise<void> {
  await db.execute(sql`
    INSERT INTO notifications (user_id, type, title, body, entity_type, entity_id)
    VALUES (${input.userId}, ${input.type}, ${input.title}, ${input.body ?? null}, ${input.entityType ?? null}, ${input.entityId ?? null})
  `);
}

export async function getUnreadNotifications(userId: number, limit = 20): Promise<any[]> {
  const out: any = await db.execute(sql`
    SELECT id, type, title, body, entity_type, entity_id, created_at
    FROM notifications
    WHERE user_id = ${userId} AND is_read = false
    ORDER BY created_at DESC
    LIMIT ${limit}
  `);
  return (out as any).rows || [];
}

export async function getUnreadCount(userId: number): Promise<number> {
  const out: any = await db.execute(sql`
    SELECT COUNT(*)::int AS c FROM notifications WHERE user_id = ${userId} AND is_read = false
  `);
  return Number(((out as any).rows || [])[0]?.c || 0);
}

export async function markNotificationRead(userId: number, notificationId: number): Promise<void> {
  await db.execute(sql`
    UPDATE notifications SET is_read = true, read_at = now()
    WHERE id = ${notificationId} AND user_id = ${userId}
  `);
}

export async function markAllNotificationsRead(userId: number): Promise<void> {
  await db.execute(sql`
    UPDATE notifications SET is_read = true, read_at = now()
    WHERE user_id = ${userId} AND is_read = false
  `);
}

/**
 * Fire a speed-to-lead alert for a new lead. Non-blocking — failures are logged.
 * Sends in-app notification always; SMS to the agent when they have a phone.
 */
export async function fireSpeedToLeadAlert(input: {
  leadId: number;
  leadAddress: string;
  assignedToUserId: number;
  createdByUserId: number;
}): Promise<void> {
  const { leadId, leadAddress, assignedToUserId } = input;
  try {
    // 1. In-app notification
    await createNotification({
      userId: assignedToUserId,
      type: "new_lead",
      title: "🔥 New lead assigned",
      body: `${leadAddress} — call within 5 minutes for 10x conversion.`,
      entityType: "lead",
      entityId: leadId,
    });

    // 2. SMS to the agent (via Telnyx), if they have a mobile number
    try {
      const userOut: any = await db.execute(sql`
        SELECT phone, sms_alerts_enabled FROM users WHERE id = ${assignedToUserId} LIMIT 1
      `);
      const agent = ((userOut as any).rows || [])[0];
      const agentPhone = String(agent?.phone || "").replace(/\D/g, "");
      const smsEnabled = agent?.sms_alerts_enabled !== false; // default on
      if (agentPhone && agentPhone.length >= 10 && smsEnabled) {
        const { telnyx } = await import("../telecom/telnyx-client.js");
        await telnyx.sendSms({
          to: agentPhone,
          body: `OceanLuxe: New lead — ${leadAddress}. Call within 5 min: speed-to-lead is 10x. Open the CRM to dial.`,
        });
      }
    } catch (e) {
      console.error("[speed-to-lead] agent SMS failed (non-blocking):", e);
    }
  } catch (e) {
    console.error("[speed-to-lead] alert failed (non-blocking):", e);
  }
}

/**
 * Record first outreach on a lead. Called when the first call or SMS is
 * logged against a lead. Idempotent — only the first one counts.
 */
export async function recordFirstOutreach(leadId: number, userId: number): Promise<void> {
  try {
    await db.execute(sql`
      UPDATE leads
      SET first_outreach_at = COALESCE(first_outreach_at, now()),
          first_outreach_by = COALESCE(first_outreach_by, ${userId})
      WHERE id = ${leadId} AND first_outreach_at IS NULL
    `);
  } catch (e) {
    console.error("[speed-to-lead] recordFirstOutreach failed (non-blocking):", e);
  }
}

/**
 * Speed-to-lead stats for the dashboard: avg response time per agent over
 * the last 30 days, plus count of leads never contacted.
 */
export async function getSpeedToLeadStats(teamUserIds: number[]): Promise<{
  avgResponseMinutes: number | null;
  contactedCount: number;
  uncontactedCount: number;
  byAgent: Array<{ userId: number; avgMinutes: number | null; contacted: number }>;
}> {
  try {
    const ids = teamUserIds.filter(Number.isFinite);
    if (!ids.length) return { avgResponseMinutes: null, contactedCount: 0, uncontactedCount: 0, byAgent: [] };
    const idsSql = sql.join(ids.map((id) => sql`${id}`), sql`, `);
    const out: any = await db.execute(sql`
      SELECT
        first_outreach_by AS user_id,
        AVG(EXTRACT(EPOCH FROM (first_outreach_at - created_at)) / 60)::float AS avg_minutes,
        COUNT(*)::int AS contacted
      FROM leads
      WHERE created_at > now() - interval '30 days'
        AND first_outreach_at IS NOT NULL
        AND (assigned_to IN (${idsSql}) OR first_outreach_by IN (${idsSql}))
      GROUP BY first_outreach_by
    `);
    const unOut: any = await db.execute(sql`
      SELECT COUNT(*)::int AS c FROM leads
      WHERE created_at > now() - interval '30 days'
        AND first_outreach_at IS NULL
        AND assigned_to IN (${idsSql})
    `);
    const rows = (out as any).rows || [];
    const totalContacted = rows.reduce((a: number, r: any) => a + Number(r.contacted || 0), 0);
    const weightedSum = rows.reduce((a: number, r: any) => a + Number(r.avg_minutes || 0) * Number(r.contacted || 0), 0);
    return {
      avgResponseMinutes: totalContacted ? Math.round(weightedSum / totalContacted) : null,
      contactedCount: totalContacted,
      uncontactedCount: Number(((unOut as any).rows || [])[0]?.c || 0),
      byAgent: rows.map((r: any) => ({
        userId: Number(r.user_id),
        avgMinutes: r.avg_minutes !== null ? Math.round(Number(r.avg_minutes)) : null,
        contacted: Number(r.contacted || 0),
      })),
    };
  } catch (e) {
    console.error("[speed-to-lead] stats failed:", e);
    return { avgResponseMinutes: null, contactedCount: 0, uncontactedCount: 0, byAgent: [] };
  }
}
