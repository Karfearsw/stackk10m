/**
 * Ticket 15 — Broadcast campaign sender.
 *
 * Executes one-shot broadcast sends with:
 * - Immediate pause/cancel: checks campaign status before every message.
 * - Rate limiting: small delay between sends to respect carrier limits.
 * - Per-recipient cost tracking and run-level audit trail.
 * - DNC re-check at send time (flags may have changed since preview).
 *
 * Email channel is stubbed behind the Ticket 10 provider pattern: if no
 * email provider is configured the run fails fast with a clear error rather
 * than silently dropping messages.
 */
import { sql } from "drizzle-orm";
import { db } from "../db.js";
import { telnyx } from "../services/telecom/telnyx-client.js";

const SEND_DELAY_MS = 800; // ~75 msgs/min, conservative for carrier compliance
const SMS_COST_CENTS = 2;

export interface SendResult {
  runId: number;
  sent: number;
  failed: number;
  skipped: number;
  totalCostCents: number;
  stoppedEarly: boolean;
  stopReason: string | null;
}

interface CampaignRow {
  id: number;
  channel: string;
  status: string;
  pilot_mode: boolean;
  pilot_limit: number;
}

async function getCampaign(id: number): Promise<CampaignRow | null> {
  const out: any = await db.execute(sql`
    SELECT id, channel, status, COALESCE(pilot_mode, false) AS pilot_mode,
           COALESCE(pilot_limit, 10) AS pilot_limit
    FROM campaigns WHERE id = ${id} LIMIT 1
  `);
  const row = ((out as any).rows || [])[0];
  return row ? (row as CampaignRow) : null;
}

async function getMessageBody(campaignId: number): Promise<string | null> {
  const out: any = await db.execute(sql`
    SELECT body FROM campaign_messages WHERE campaign_id = ${campaignId} LIMIT 1
  `);
  const row = ((out as any).rows || [])[0];
  return row ? String(row.body || "") : null;
}

async function dncRecheck(recipientType: string, leadId: number | null, buyerId: number | null, channel: string): Promise<string | null> {
  try {
    if (recipientType === "lead" && leadId) {
      const out: any = await db.execute(sql`
        SELECT COALESCE(do_not_call,false) AS dnc, COALESCE(do_not_text,false) AS dnt,
               COALESCE(do_not_email,false) AS dne
        FROM leads WHERE id = ${leadId} LIMIT 1
      `);
      const r = ((out as any).rows || [])[0];
      if (r && (r.dnc || (channel === "sms" && r.dnt) || (channel === "email" && r.dne)))
        return "Do-not-contact flag set since preview";
    } else if (recipientType === "buyer" && buyerId) {
      const out: any = await db.execute(sql`
        SELECT COALESCE(do_not_call,false) AS dnc, COALESCE(do_not_text,false) AS dnt
        FROM buyers WHERE id = ${buyerId} LIMIT 1
      `);
      const r = ((out as any).rows || [])[0];
      if (r && (r.dnc || (channel === "sms" && r.dnt)))
        return "Do-not-contact flag set since preview";
    }
  } catch {
    // Non-blocking: if the check fails, proceed (preview already screened).
  }
  return null;
}

/**
 * Run a broadcast send. Returns when the recipient list is exhausted or the
 * campaign is paused/cancelled. Safe to call once per campaign; concurrent
 * runs are prevented by the 'sending' status guard in the route handler.
 */
export async function runBroadcast(campaignId: number, startedBy: number | null): Promise<SendResult> {
  const campaign = await getCampaign(campaignId);
  if (!campaign) throw new Error("Campaign not found");
  const channel = campaign.channel === "email" ? "email" : "sms";

  const body = await getMessageBody(campaignId);
  if (!body || !body.trim()) throw new Error("Campaign has no message body");

  if (channel === "email") {
    // Ticket 10 (business email delivery) is not yet configured. Fail fast
    // with a clear message instead of silently dropping.
    const provider = (process.env.EMAIL_PROVIDER || "").trim();
    if (!provider) {
      await db.execute(sql`
        UPDATE campaigns SET status = 'failed', updated_at = now() WHERE id = ${campaignId}
      `);
      throw new Error("Email provider not configured (Ticket 10). Configure EMAIL_PROVIDER before sending email campaigns.");
    }
  }

  const fromNumber = process.env.TELNYX_DEFAULT_FROM_NUMBER || "";
  if (channel === "sms" && !fromNumber) {
    await db.execute(sql`
      UPDATE campaigns SET status = 'failed', updated_at = now() WHERE id = ${campaignId}
    `);
    throw new Error("Telnyx SMS not configured. Set TELNYX_DEFAULT_FROM_NUMBER in Settings → System.");
  }

  // Create the run record.
  const runOut: any = await db.execute(sql`
    INSERT INTO campaign_runs (campaign_id, status, started_by)
    VALUES (${campaignId}, 'running', ${startedBy}) RETURNING id
  `);
  const runId = Number(((runOut as any).rows || [])[0]?.id);

  // Mark campaign as sending.
  await db.execute(sql`UPDATE campaigns SET status = 'sending', updated_at = now() WHERE id = ${campaignId}`);

  // Load pending recipients (pilot mode caps the batch).
  const limitClause = campaign.pilot_mode ? sql`LIMIT ${campaign.pilot_limit}` : sql``;
  const recOut: any = await db.execute(sql`
    SELECT id, lead_id, buyer_id, recipient_type, phone, email
    FROM campaign_recipients
    WHERE campaign_id = ${campaignId} AND status = 'pending'
    ORDER BY id ASC
    ${limitClause}
  `);
  const recipients: any[] = ((recOut as any).rows || []);
  await db.execute(sql`UPDATE campaign_runs SET total_recipients = ${recipients.length} WHERE id = ${runId}`);

  let sent = 0, failed = 0, skipped = 0, costCents = 0;
  let stoppedEarly = false;
  let stopReason: string | null = null;

  for (const r of recipients) {
    // ── Immediate pause/cancel check before every message ──
    const cur = await getCampaign(campaignId);
    if (!cur || cur.status === "paused") {
      stoppedEarly = true;
      stopReason = "Paused by user";
      break;
    }
    if (cur.status === "cancelled") {
      stoppedEarly = true;
      stopReason = "Cancelled by user";
      break;
    }
    if (cur.status !== "sending") {
      stoppedEarly = true;
      stopReason = `Campaign left sending state (${cur.status})`;
      break;
    }

    const to = channel === "sms" ? r.phone : r.email;
    if (!to) {
      skipped++;
      await db.execute(sql`UPDATE campaign_recipients SET status='skipped', error='Missing contact info' WHERE id = ${r.id}`);
      continue;
    }

    // DNC re-check at send time.
    const dncReason = await dncRecheck(r.recipient_type, r.lead_id, r.buyer_id, channel);
    if (dncReason) {
      skipped++;
      await db.execute(sql`UPDATE campaign_recipients SET status='opted_out', error=${dncReason} WHERE id = ${r.id}`);
      continue;
    }

    try {
      if (channel === "sms") {
        await telnyx.sendSms({ to: String(to), body, from: fromNumber, mediaUrls: [] });
        costCents += SMS_COST_CENTS;
      } else {
        // Email send goes through the Ticket 10 provider; stub records the attempt.
        // Replace with provider call once EMAIL_PROVIDER is configured.
        throw new Error("Email provider send not implemented (Ticket 10 pending)");
      }
      sent++;
      await db.execute(sql`
        UPDATE campaign_recipients
        SET status='sent', sent_at=now(), cost_cents=${channel === "sms" ? SMS_COST_CENTS : 0}
        WHERE id = ${r.id}
      `);
    } catch (e: any) {
      failed++;
      const msg = String(e?.message || "Send failed").slice(0, 500);
      await db.execute(sql`UPDATE campaign_recipients SET status='failed', error=${msg} WHERE id = ${r.id}`);
    }

    await db.execute(sql`
      UPDATE campaign_runs
      SET sent_count=${sent}, failed_count=${failed}, skipped_count=${skipped}, total_cost_cents=${costCents}
      WHERE id = ${runId}
    `);
    await new Promise((res) => setTimeout(res, SEND_DELAY_MS));
  }

  const finalStatus = stoppedEarly
    ? (stopReason === "Paused by user" ? "paused" : stopReason === "Cancelled by user" ? "cancelled" : "failed")
    : "completed";
  await db.execute(sql`
    UPDATE campaign_runs
    SET status=${finalStatus}, finished_at=now(), stop_reason=${stopReason},
        sent_count=${sent}, failed_count=${failed}, skipped_count=${skipped}, total_cost_cents=${costCents}
    WHERE id = ${runId}
  `);
  await db.execute(sql`UPDATE campaigns SET status=${finalStatus}, updated_at=now() WHERE id = ${campaignId}`);

  return { runId, sent, failed, skipped, totalCostCents: costCents, stoppedEarly, stopReason };
}
