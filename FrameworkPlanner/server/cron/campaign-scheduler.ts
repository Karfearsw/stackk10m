import { db } from "../db.js";
import { sql } from "drizzle-orm";
import { sendSignalWireSms } from "../services/messaging/signalwire.js";
import { sendResendEmail } from "../services/messaging/resend.js";
import { storage } from "../storage.js";
import { onCampaignCompleted } from "../services/tasks/task-service.js";

function parseHHMM(v: any): { h: number; m: number } | null {
  const s = String(v || "").trim();
  if (!/^\d{2}:\d{2}$/.test(s)) return null;
  const [hh, mm] = s.split(":").map((x) => parseInt(x, 10));
  if (!Number.isFinite(hh) || !Number.isFinite(mm)) return null;
  if (hh < 0 || hh > 23 || mm < 0 || mm > 59) return null;
  return { h: hh, m: mm };
}

function atLocalTime(base: Date, hhmm: { h: number; m: number }) {
  const d = new Date(base);
  d.setHours(hhmm.h, hhmm.m, 0, 0);
  return d;
}

function nextSendTime(now: Date, start?: string | null, end?: string | null): Date {
  const s = parseHHMM(start);
  const e = parseHHMM(end);
  if (!s || !e) return now;

  const startToday = atLocalTime(now, s);
  const endToday = atLocalTime(now, e);
  if (now < startToday) return startToday;
  if (now > endToday) {
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    return atLocalTime(tomorrow, s);
  }
  return now;
}

function addDays(d: Date, days: number) {
  const out = new Date(d);
  out.setDate(out.getDate() + days);
  return out;
}

export function startCampaignScheduler(intervalMs = 60_000) {
  let running = false;
  let lastErrorAt = 0;

  const tick = async () => {
    if (running) return;
    running = true;
    try {
      const due: any = await db.execute(sql`
        SELECT
          ce.id AS enrollment_id,
          ce.campaign_id,
          ce.lead_id,
          ce.status AS enrollment_status,
          ce.started_at,
          ce.next_step_order,
          ce.next_run_at,
          c.user_id AS campaign_user_id,
          c.name AS campaign_name,
          l.owner_phone,
          l.owner_email,
          l.assigned_to,
          l.do_not_text,
          l.do_not_email
        FROM campaign_enrollments ce
        JOIN campaigns c ON c.id = ce.campaign_id
        JOIN leads l ON l.id = ce.lead_id
        WHERE ce.status = 'active'
          AND ce.next_run_at IS NOT NULL
          AND ce.next_run_at <= NOW()
        ORDER BY ce.next_run_at ASC
        LIMIT 50
      `);

      const rows = (due as any).rows || [];
      const stepsByCampaign = new Map<number, any[]>();

      for (const r of rows) {
        const enrollmentId = Number(r.enrollment_id);
        const campaignId = Number(r.campaign_id);
        const leadId = Number(r.lead_id);
        const startedAt = new Date(r.started_at);
        const nextStepOrder = Number(r.next_step_order || 0);

        if (!stepsByCampaign.has(campaignId)) {
          const stepsRes: any = await db.execute(sql`
            SELECT id, step_order, channel, offset_days, send_window_start, send_window_end, template_text
            FROM campaign_steps
            WHERE campaign_id = ${campaignId}
            ORDER BY step_order ASC
          `);
          stepsByCampaign.set(campaignId, (stepsRes as any).rows || []);
        }

        const steps = stepsByCampaign.get(campaignId) || [];
        const step = steps.find((s) => Number(s.step_order) === nextStepOrder);
        if (!step) {
          await db.execute(sql`
            UPDATE campaign_enrollments
            SET status = 'completed', next_run_at = NULL, updated_at = NOW()
            WHERE id = ${enrollmentId}
          `);
          await db.execute(sql`
            UPDATE leads
            SET next_touch_at = NULL, updated_at = NOW()
            WHERE id = ${leadId}
          `);
          continue;
        }

        const dueAt = addDays(startedAt, Number(step.offset_days || 0));
        const now = new Date();
        if (now < dueAt) {
          await db.execute(sql`
            UPDATE campaign_enrollments
            SET next_run_at = ${dueAt}, updated_at = NOW()
            WHERE id = ${enrollmentId}
          `);
          await db.execute(sql`
            UPDATE leads
            SET next_touch_at = ${dueAt}, updated_at = NOW()
            WHERE id = ${leadId}
          `);
          continue;
        }

        const gatedNow = nextSendTime(now, step.send_window_start, step.send_window_end);
        if (gatedNow.getTime() > now.getTime()) {
          await db.execute(sql`
            UPDATE campaign_enrollments
            SET next_run_at = ${gatedNow}, updated_at = NOW()
            WHERE id = ${enrollmentId}
          `);
          await db.execute(sql`
            UPDATE leads
            SET next_touch_at = ${gatedNow}, updated_at = NOW()
            WHERE id = ${leadId}
          `);
          continue;
        }

        const channel = String(step.channel || "sms");
        const templateText = String(step.template_text || "");

        let deliveryStatus = "failed";
        let providerId: string | null = null;
        let error: string | null = null;

        if (channel === "sms") {
          const to = String(r.owner_phone || "").trim();
          if (r.do_not_text) {
            deliveryStatus = "failed";
            error = "DNC: do_not_text";
          } else if (!to) {
            deliveryStatus = "failed";
            error = "Missing lead phone";
          } else {
            try {
              const out = await sendSignalWireSms({ to, body: templateText });
              deliveryStatus = "sent";
              providerId = out.messageSid || null;
            } catch (e: any) {
              deliveryStatus = "failed";
              error = String(e?.message || e);
            }
          }
        } else if (channel === "email") {
          const to = String(r.owner_email || "").trim();
          if (r.do_not_email) {
            deliveryStatus = "failed";
            error = "DNC: do_not_email";
          } else if (!to) {
            deliveryStatus = "failed";
            error = "Missing lead email";
          } else {
            try {
              const campaignName = String(r.campaign_name || "").trim();
              const subject = campaignName ? `Campaign: ${campaignName}` : "Campaign email";
              const out = await sendResendEmail({ to, subject, text: templateText });
              deliveryStatus = "sent";
              providerId = out.id || null;
            } catch (e: any) {
              deliveryStatus = "failed";
              error = String(e?.message || e);
            }
          }
        } else {
          deliveryStatus = "failed";
          error = `Unknown channel: ${channel}`;
        }

        const sentAt = deliveryStatus === "sent" ? new Date() : null;
        await db.execute(sql`
          INSERT INTO campaign_deliveries (enrollment_id, campaign_id, lead_id, step_id, channel, status, provider_id, error, sent_at)
          VALUES (${enrollmentId}, ${campaignId}, ${leadId}, ${Number(step.id)}, ${channel}, ${deliveryStatus}, ${providerId}, ${error}, ${sentAt})
        `);

        const nextOrder = nextStepOrder + 1;
        const nextStep = steps.find((s) => Number(s.step_order) === nextOrder);
        const nextRun = nextStep ? nextSendTime(addDays(startedAt, Number(nextStep.offset_days || 0)), nextStep.send_window_start, nextStep.send_window_end) : null;

        await db.execute(sql`
          UPDATE campaign_enrollments
          SET next_step_order = ${nextOrder},
              next_run_at = ${nextRun},
              updated_at = NOW()
          WHERE id = ${enrollmentId}
        `);

        await db.execute(sql`
          UPDATE leads
          SET last_touch_at = NOW(),
              next_touch_at = ${nextRun},
              updated_at = NOW()
          WHERE id = ${leadId}
        `);

        if (deliveryStatus === "sent" && !nextStep) {
          try {
            const lead = await storage.getLeadById(leadId);
            const createdBy = Number.isFinite(Number(r.campaign_user_id))
              ? Number(r.campaign_user_id)
              : Number.isFinite(Number(r.assigned_to))
                ? Number(r.assigned_to)
                : 0;
            await onCampaignCompleted({
              campaignId,
              leadId,
              leadAddress: String((lead as any)?.address || "").trim(),
              assignedTo: (lead as any)?.assignedTo ?? null,
              createdBy,
            });
          } catch (e: any) {
            console.error(JSON.stringify({ ts: new Date().toISOString(), event: "campaign_scheduler", kind: "on_completed_failed", campaignId, leadId, message: String(e?.message || e), code: e?.code ? String(e.code) : null }));
          }
        }

        try {
          const activityUserId = Number.isFinite(Number(r.campaign_user_id)) ? Number(r.campaign_user_id) : Number.isFinite(Number(r.assigned_to)) ? Number(r.assigned_to) : 0;
          await storage.createGlobalActivity({
            userId: activityUserId,
            action: deliveryStatus === "sent" ? "campaign_step_sent" : "campaign_step_failed",
            description: deliveryStatus === "sent" ? `Campaign step sent (${channel})` : `Campaign step failed (${channel})`,
            metadata: JSON.stringify({ leadId, campaignId, enrollmentId, stepId: Number(step.id), channel, status: deliveryStatus, providerId, error }),
          } as any);
        } catch (e: any) {
          console.error(JSON.stringify({ ts: new Date().toISOString(), event: "campaign_scheduler", kind: "activity_log_failed", campaignId, leadId, message: String(e?.message || e), code: e?.code ? String(e.code) : null }));
        }
      }
    } finally {
      running = false;
    }
  };

  const runTick = async () => {
    try {
      await tick();
    } catch (e: any) {
      const now = Date.now();
      if (now - lastErrorAt >= 60_000) {
        lastErrorAt = now;
        console.error(JSON.stringify({ ts: new Date().toISOString(), event: "campaign_scheduler", kind: "tick_failed", message: String(e?.message || e), code: e?.code ? String(e.code) : null }));
      }
    }
  };

  void runTick();
  return setInterval(() => void runTick(), intervalMs);
}
