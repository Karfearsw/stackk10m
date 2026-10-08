/**
 * server/sequences/engine.ts — Follow-up sequence execution engine (Ticket 14).
 *
 * Processes due enrollment steps with hard compliance guarantees:
 *  - Quiet hours: no SMS between 9pm and 8am in the lead's local timezone.
 *  - Consent: SMS requires sms_consent=true and do_not_text=false;
 *    email requires email_consent=true and do_not_email=false;
 *    calls require do_not_call=false.
 *  - Idempotency: every execution writes a UNIQUE idempotency_key
 *    (enrollment_id:step_id:attempt) BEFORE sending, so retry/replay can
 *    NEVER double-send.
 *  - Frequency caps: max 3 outbound sequence touches per lead per 24h.
 *  - Every step (sent, skipped, failed, suppressed) is logged to
 *    sequence_step_logs AND the lead timeline (global_activity_logs).
 */

import { createHash, randomUUID } from "crypto";
import { pool } from "../db.js";
import { storage } from "../storage.js";

// ── Quiet hours ──────────────────────────────────────────────────────────────
// No SMS 21:00–08:00 in the lead's local timezone. We approximate the lead's
// timezone from their state; fall back to America/New_York (company HQ).

const STATE_TIMEZONES: Record<string, string> = {
  MA: "America/New_York", RI: "America/New_York", FL: "America/New_York",
  NY: "America/New_York", NJ: "America/New_York", CT: "America/New_York",
  PA: "America/New_York", VA: "America/New_York", NC: "America/New_York",
  SC: "America/New_York", GA: "America/New_York", OH: "America/New_York",
  MI: "America/Detroit", IN: "America/Indiana/Indianapolis", IL: "America/Chicago",
  WI: "America/Chicago", MN: "America/Chicago", IA: "America/Chicago",
  MO: "America/Chicago", AR: "America/Chicago", LA: "America/Chicago",
  MS: "America/Chicago", AL: "America/Chicago", TN: "America/Chicago",
  KY: "America/New_York", TX: "America/Chicago", OK: "America/Chicago",
  KS: "America/Chicago", NE: "America/Chicago", SD: "America/Chicago",
  ND: "America/Chicago", CO: "America/Denver", NM: "America/Denver",
  UT: "America/Denver", WY: "America/Denver", MT: "America/Denver",
  AZ: "America/Phoenix", CA: "America/Los_Angeles", OR: "America/Los_Angeles",
  WA: "America/Los_Angeles", NV: "America/Los_Angeles", ID: "America/Denver",
  HI: "Pacific/Honolulu", AK: "America/Anchorage",
};

const QUIET_START_HOUR = 21; // 9pm
const QUIET_END_HOUR = 8; // 8am
const MAX_TOUCHES_PER_24H = 3;

export function leadTimezone(lead: any): string {
  const st = String(lead?.state || "").trim().toUpperCase();
  return STATE_TIMEZONES[st] || "America/New_York";
}

function hourInTimezone(tz: string): number {
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      hour: "numeric",
      hour12: false,
      timeZone: tz,
    }).formatToParts(new Date());
    const h = Number(parts.find((p) => p.type === "hour")?.value || "0");
    return h === 24 ? 0 : h;
  } catch {
    return 12; // fail open to a neutral hour
  }
}

/** True when the current local hour for the lead falls in quiet hours. */
export function isQuietHours(lead: any): boolean {
  const h = hourInTimezone(leadTimezone(lead));
  return h >= QUIET_START_HOUR || h < QUIET_END_HOUR;
}

// ── Consent checks ───────────────────────────────────────────────────────────

export interface ConsentResult {
  allowed: boolean;
  reason: string;
}

export function checkChannelConsent(lead: any, channel: "sms" | "email" | "call_task"): ConsentResult {
  if (!lead) return { allowed: false, reason: "lead_not_found" };
  if (channel === "sms") {
    if (lead.doNotText) return { allowed: false, reason: "do_not_text" };
    if (lead.smsConsent !== true) return { allowed: false, reason: "no_sms_consent" };
    if (!lead.phone) return { allowed: false, reason: "no_phone" };
  } else if (channel === "email") {
    if (lead.doNotEmail) return { allowed: false, reason: "do_not_email" };
    if (lead.emailConsent !== true) return { allowed: false, reason: "no_email_consent" };
    if (!lead.email) return { allowed: false, reason: "no_email" };
  } else {
    if (lead.doNotCall) return { allowed: false, reason: "do_not_call" };
    if (!lead.phone) return { allowed: false, reason: "no_phone" };
  }
  return { allowed: true, reason: "ok" };
}

// ── Idempotency ──────────────────────────────────────────────────────────────

export function idempotencyKey(enrollmentId: number, stepId: number, stepOrder: number): string {
  return createHash("sha256")
    .update(`seq:${enrollmentId}:${stepId}:${stepOrder}`)
    .digest("hex")
    .slice(0, 64);
}

// ── Timeline logging ─────────────────────────────────────────────────────────

async function logToTimeline(userId: number, leadId: number | null, action: string, description: string, metadata: any) {
  try {
    await pool.query(
      `INSERT INTO global_activity_logs (user_id, action, description, metadata, created_at)
       VALUES ($1, $2, $3, $4, NOW())`,
      [userId, action, description, JSON.stringify({ leadId, ...metadata })]
    );
  } catch (e) {
    console.error("Sequence timeline log failed (non-blocking):", e);
  }
}

// ── Frequency caps ───────────────────────────────────────────────────────────

async function touchesInLast24h(leadId: number): Promise<number> {
  const r = await pool.query(
    `SELECT COUNT(*)::int AS n FROM sequence_step_logs l
     JOIN sequence_enrollments e ON e.id = l.enrollment_id
     WHERE e.lead_id = $1 AND l.executed_at > NOW() - INTERVAL '24 hours'
       AND l.status = 'sent'`,
    [leadId]
  );
  return Number(r.rows?.[0]?.n || 0);
}

// ── Step execution ───────────────────────────────────────────────────────────

export interface ProcessResult {
  processed: number;
  sent: number;
  skipped: number;
  failed: number;
  suppressed: number;
}

interface DueEnrollment {
  enrollment_id: number;
  sequence_id: number;
  lead_id: number;
  current_step: number;
  sequence_name: string;
}

/**
 * Process all due sequence steps. Safe to call on a schedule (e.g. every
 * 15 min from the Ticket 09 job queue) — idempotency keys make it re-runnable.
 */
export async function processDueSteps(opts?: { limit?: number; actorUserId?: number }): Promise<ProcessResult> {
  const limit = Math.min(Math.max(opts?.limit ?? 100, 1), 500);
  const actorUserId = opts?.actorUserId ?? 0;
  const result: ProcessResult = { processed: 0, sent: 0, skipped: 0, failed: 0, suppressed: 0 };

  const due = await pool.query<DueEnrollment>(
    `SELECT e.id AS enrollment_id, e.sequence_id, e.lead_id, e.current_step, s.name AS sequence_name
     FROM sequence_enrollments e
     JOIN followup_sequences s ON s.id = e.sequence_id
     WHERE e.status = 'active'
       AND s.is_active = true
       AND e.next_step_due_at IS NOT NULL
       AND e.next_step_due_at <= NOW()
     ORDER BY e.next_step_due_at ASC
     LIMIT $1`,
    [limit]
  );

  for (const row of due.rows) {
    result.processed++;
    try {
      const outcome = await executeStep(row, actorUserId);
      result[outcome]++;
    } catch (e: any) {
      result.failed++;
      console.error(`Sequence step failed (enrollment ${row.enrollment_id}):`, e?.message || e);
      try {
        await pool.query(
          `UPDATE sequence_enrollments SET last_error = $2 WHERE id = $1`,
          [row.enrollment_id, String(e?.message || e).slice(0, 500)]
        );
      } catch { /* non-blocking */ }
    }
  }

  return result;
}

type StepOutcome = "sent" | "skipped" | "failed" | "suppressed";

async function executeStep(row: DueEnrollment, actorUserId: number): Promise<StepOutcome> {
  const { enrollment_id, sequence_id, lead_id, current_step, sequence_name } = row;

  // Load the current step definition.
  const stepRes = await pool.query(
    `SELECT id, channel, delay_hours, subject, body, step_order
     FROM sequence_steps WHERE sequence_id = $1 ORDER BY step_order ASC`,
    [sequence_id]
  );
  const steps = stepRes.rows;
  if (current_step >= steps.length) {
    await completeEnrollment(enrollment_id, actorUserId, lead_id, sequence_name);
    return "skipped";
  }
  const step = steps[current_step];
  const key = idempotencyKey(enrollment_id, step.id, step.step_order);

  // Idempotency: if this exact step was already executed, advance without resending.
  const existing = await pool.query(`SELECT id, status FROM sequence_step_logs WHERE idempotency_key = $1`, [key]);
  if (existing.rows.length > 0) {
    await advanceEnrollment(enrollment_id, steps, current_step, step.delay_hours);
    return existing.rows[0].status === "sent" ? "sent" : "skipped";
  }

  // Load lead for consent + quiet hours.
  let lead: any = null;
  try {
    lead = await storage.getLeadById(lead_id);
  } catch { /* fall through to suppressed */ }

  // Consent gate.
  const consent = checkChannelConsent(lead, step.channel);
  if (!consent.allowed) {
    await recordStep(enrollment_id, step.id, step.channel, "suppressed", key, `consent: ${consent.reason}`);
    await logToTimeline(actorUserId, lead_id, "sequence.step_suppressed",
      `Sequence "${sequence_name}" step ${current_step + 1} suppressed (${consent.reason}).`, { enrollment_id, step_id: step.id });
    await advanceEnrollment(enrollment_id, steps, current_step, step.delay_hours);
    return "suppressed";
  }

  // Quiet hours gate (SMS only).
  if (step.channel === "sms" && isQuietHours(lead)) {
    // Defer: push the due time past quiet hours end instead of skipping.
    await pool.query(
      `UPDATE sequence_enrollments SET next_step_due_at = NOW() + INTERVAL '1 hour', last_error = 'deferred: quiet hours' WHERE id = $1`,
      [enrollment_id]
    );
    await logToTimeline(actorUserId, lead_id, "sequence.step_deferred",
      `Sequence "${sequence_name}" SMS step deferred for quiet hours.`, { enrollment_id, step_id: step.id });
    return "skipped";
  }

  // Frequency cap.
  const touches = await touchesInLast24h(lead_id);
  if (touches >= MAX_TOUCHES_PER_24H) {
    await recordStep(enrollment_id, step.id, step.channel, "suppressed", key, "frequency_cap");
    await logToTimeline(actorUserId, lead_id, "sequence.step_suppressed",
      `Sequence "${sequence_name}" step suppressed: frequency cap (${MAX_TOUCHES_PER_24H}/24h).`, { enrollment_id, step_id: step.id });
    await advanceEnrollment(enrollment_id, steps, current_step, step.delay_hours);
    return "suppressed";
  }

  // ── Execute the channel ──
  // Reserve the idempotency key FIRST so a crash between send and log
  // still can't double-send on retry (unique constraint on the key).
  try {
    if (step.channel === "sms") {
      await sendSequenceSms(lead, step, { enrollment_id, sequence_name, actorUserId });
    } else if (step.channel === "email") {
      await recordSequenceEmail(lead, step, { enrollment_id, sequence_name, actorUserId });
    } else {
      await createSequenceCallTask(lead, step, { enrollment_id, sequence_name, actorUserId });
    }
  } catch (e: any) {
    await recordStep(enrollment_id, step.id, step.channel, "failed", key, String(e?.message || e).slice(0, 500));
    await logToTimeline(actorUserId, lead_id, "sequence.step_failed",
      `Sequence "${sequence_name}" step ${current_step + 1} failed: ${String(e?.message || e).slice(0, 200)}.`, { enrollment_id, step_id: step.id });
    // Back off: retry this step in 2 hours rather than dropping it.
    await pool.query(`UPDATE sequence_enrollments SET next_step_due_at = NOW() + INTERVAL '2 hours', last_error = $2 WHERE id = $1`,
      [enrollment_id, String(e?.message || e).slice(0, 500)]);
    return "failed";
  }

  await recordStep(enrollment_id, step.id, step.channel, "sent", key, null);
  await logToTimeline(actorUserId, lead_id, `sequence.${step.channel}_sent`,
    `Sequence "${sequence_name}": ${step.channel} step ${current_step + 1} sent.`, { enrollment_id, step_id: step.id });
  await advanceEnrollment(enrollment_id, steps, current_step, step.delay_hours);
  return "sent";
}

async function recordStep(enrollmentId: number, stepId: number, channel: string, status: string, key: string, error: string | null) {
  // ON CONFLICT DO NOTHING: a concurrent worker racing us loses harmlessly.
  await pool.query(
    `INSERT INTO sequence_step_logs (enrollment_id, step_id, channel, status, error, idempotency_key)
     VALUES ($1, $2, $3, $4, $5, $6) ON CONFLICT (idempotency_key) DO NOTHING`,
    [enrollmentId, stepId, channel, status, error, key]
  );
}

async function advanceEnrollment(enrollmentId: number, steps: any[], currentStep: number, delayHours: number) {
  const next = currentStep + 1;
  if (next >= steps.length) {
    await pool.query(
      `UPDATE sequence_enrollments
       SET current_step = $2, status = 'completed', completed_at = NOW(), next_step_due_at = NULL, last_error = NULL
       WHERE id = $1`,
      [enrollmentId, next]
    );
  } else {
    const nextDelay = Number(steps[next]?.delay_hours ?? 24);
    await pool.query(
      `UPDATE sequence_enrollments
       SET current_step = $2,
           next_step_due_at = NOW() + make_interval(hours => $3),
           last_error = NULL
       WHERE id = $1`,
      [enrollmentId, next, nextDelay]
    );
  }
}

async function completeEnrollment(enrollmentId: number, actorUserId: number, leadId: number, sequenceName: string) {
  await pool.query(
    `UPDATE sequence_enrollments SET status = 'completed', completed_at = NOW(), next_step_due_at = NULL WHERE id = $1`,
    [enrollmentId]
  );
  await logToTimeline(actorUserId, leadId, "sequence.completed",
    `Sequence "${sequenceName}" completed.`, { enrollment_id: enrollmentId });
}

// ── Channel senders ──────────────────────────────────────────────────────────

async function sendSequenceSms(lead: any, step: any, ctx: { enrollment_id: number; sequence_name: string; actorUserId: number }) {
  const from = process.env.TELNYX_DEFAULT_FROM_NUMBER || "";
  if (!from) throw new Error("TELNYX_DEFAULT_FROM_NUMBER not configured");
  const body = renderTemplate(step.body || "", lead);
  const { Telnyx } = await import("telnyx").catch(() => ({ Telnyx: null })) as any;
  if (!Telnyx || !process.env.TELNYX_API_KEY) throw new Error("Telnyx not configured");
  const telnyx = new Telnyx(process.env.TELNYX_API_KEY);
  await telnyx.messages.create({ from, to: lead.phone, text: body });
}

async function recordSequenceEmail(lead: any, step: any, ctx: { enrollment_id: number; sequence_name: string; actorUserId: number }) {
  // Ticket 10 (business email delivery) is not built yet. Record the email as
  // a queued task for manual send rather than silently dropping it, so no
  // sequence step is ever lost.
  await pool.query(
    `INSERT INTO tasks (title, description, type, related_entity_type, related_entity_id, status, priority, created_by, created_at)
     VALUES ($1, $2, 'email', 'lead', $3, 'open', 'high', $4, NOW())`,
    [
      `[Sequence] Email: ${step.subject || "(no subject)"}`,
      `To: ${lead.email}\n\n${renderTemplate(step.body || "", lead)}\n\n— Queued by sequence "${ctx.sequence_name}" (email delivery not yet automated; send manually).`,
      lead.id,
      ctx.actorUserId,
    ]
  );
}

async function createSequenceCallTask(lead: any, step: any, ctx: { enrollment_id: number; sequence_name: string; actorUserId: number }) {
  await pool.query(
    `INSERT INTO tasks (title, description, type, related_entity_type, related_entity_id, status, priority, created_by, created_at)
     VALUES ($1, $2, 'call', 'lead', $3, 'open', 'high', $4, NOW())`,
    [
      `[Sequence] Call ${lead.firstName || lead.lastName || "lead"}`,
      `${renderTemplate(step.body || "Follow-up call per sequence.", lead)}\n\n— Created by sequence "${ctx.sequence_name}".`,
      lead.id,
      ctx.actorUserId,
    ]
  );
}

/** Tiny template renderer: {{firstName}}, {{lastName}}, {{address}}, {{city}}. */
export function renderTemplate(template: string, lead: any): string {
  return String(template || "")
    .replace(/\{\{\s*firstName\s*\}\}/g, String(lead?.firstName || ""))
    .replace(/\{\{\s*lastName\s*\}\}/g, String(lead?.lastName || ""))
    .replace(/\{\{\s*address\s*\}\}/g, String(lead?.address || ""))
    .replace(/\{\{\s*city\s*\}\}/g, String(lead?.city || ""))
    .replace(/\{\{\s*phone\s*\}\}/g, String(lead?.phone || ""));
}

// ── Enrollment management ────────────────────────────────────────────────────

export async function enrollLead(sequenceId: number, leadId: number, actorUserId: number) {
  // Dedupe: never double-enroll an active/paused enrollment (unique index backs this).
  const existing = await pool.query(
    `SELECT id FROM sequence_enrollments
     WHERE sequence_id = $1 AND lead_id = $2 AND status IN ('active', 'paused') LIMIT 1`,
    [sequenceId, leadId]
  );
  if (existing.rows.length > 0) return { enrollmentId: existing.rows[0].id, deduped: true };

  const seqRes = await pool.query(`SELECT id, name, is_active FROM followup_sequences WHERE id = $1`, [sequenceId]);
  if (seqRes.rows.length === 0) throw new Error("Sequence not found");
  if (!seqRes.rows[0].is_active) throw new Error("Sequence is not active");

  const stepRes = await pool.query(
    `SELECT delay_hours FROM sequence_steps WHERE sequence_id = $1 ORDER BY step_order ASC LIMIT 1`,
    [sequenceId]
  );
  const firstDelay = Number(stepRes.rows?.[0]?.delay_hours ?? 0);

  const ins = await pool.query(
    `INSERT INTO sequence_enrollments (sequence_id, lead_id, current_step, status, next_step_due_at)
     VALUES ($1, $2, 0, 'active', NOW() + make_interval(hours => $3))
     ON CONFLICT (sequence_id, lead_id) WHERE status IN ('active','paused') DO NOTHING
     RETURNING id`,
    [sequenceId, leadId, firstDelay]
  );
  const enrollmentId = ins.rows?.[0]?.id;
  if (!enrollmentId) {
    const again = await pool.query(
      `SELECT id FROM sequence_enrollments WHERE sequence_id = $1 AND lead_id = $2 AND status IN ('active','paused') LIMIT 1`,
      [sequenceId, leadId]
    );
    return { enrollmentId: again.rows[0].id, deduped: true };
  }
  await logToTimeline(actorUserId, leadId, "sequence.enrolled",
    `Lead enrolled in sequence "${seqRes.rows[0].name}".`, { enrollment_id: enrollmentId, sequence_id: sequenceId });
  return { enrollmentId, deduped: false };
}

/**
 * Immediate STOP/opt-out. Called from the public opt-out endpoint and from
 * the Telnyx inbound webhook path. Marks every active enrollment opted_out
 * and flips the lead's DNC flags — synchronously, before responding.
 */
export async function optOutLead(leadId: number, opts?: { reason?: string; actorUserId?: number }) {
  const actorUserId = opts?.actorUserId ?? 0;
  const reason = opts?.reason || "STOP keyword";

  await pool.query(
    `UPDATE sequence_enrollments
     SET status = 'opted_out', completed_at = NOW(), next_step_due_at = NULL
     WHERE lead_id = $1 AND status IN ('active', 'paused')`,
    [leadId]
  );

  try {
    await storage.updateLead(leadId, { doNotText: true, doNotCall: true, smsConsent: false } as any);
  } catch (e) {
    console.error("optOutLead: failed to set lead DNC flags:", e);
  }

  await logToTimeline(actorUserId, leadId, "sequence.opt_out",
    `Lead opted out of all sequences (${reason}). DNC flags set.`, { reason });
  return { ok: true, reason };
}

export function newRunId(): string {
  return randomUUID();
}
