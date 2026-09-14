import { db } from "../db.js";
import { sql } from "drizzle-orm";

/**
 * Contract expiry automation.
 *
 * Every sweep (default 10 min):
 *  1. Auto-flag: Store A contracts (signature store) whose expiresAt has lapsed
 *     and whose status is still pre-terminal (ready_to_send / sent / viewed /
 *     partially_signed) are moved to `expired`. A `system` contract event is
 *     logged and the linked opportunity gets a `contract_expired` activity entry.
 *  2. Warning sweep: contracts expiring within EXPIRY_WARN_DAYS (default 5) that
 *     are not yet terminal and have not already been warned get an
 *     `expiry_warning` contract event; the dashboard groups these as
 *     "expiring soon".
 */

const WARN_DAYS = Math.max(0, Number(process.env.EXPIRY_WARN_DAYS || "5"));
const SWEEP_LIMIT = 300;
const TERMINAL_STATUSES = ["executed", "voided", "declined", "expired"];

type SweepStats = { autoFlagged: number; warned: number; ranAt: string | null };

let lastResult: SweepStats = { autoFlagged: 0, warned: 0, ranAt: null };

export function getLastExpirySweep(): SweepStats {
  return lastResult;
}

export async function runContractExpirySweep(): Promise<SweepStats> {
  const stats: SweepStats = { autoFlagged: 0, warned: 0, ranAt: new Date().toISOString() };
  const now = new Date();
  const warnCutoff = new Date(now.getTime() + WARN_DAYS * 24 * 60 * 60 * 1000);

  try {
    // ---- 1. Auto-flag lapsed contracts (Store A signature store) ------------
    const lapsed = await db.execute(sql`
      SELECT id, opportunity_id, expires_at
      FROM contracts
      WHERE expires_at IS NOT NULL
        AND expires_at < ${now}
        AND status IN ('ready_to_send', 'sent', 'viewed', 'partially_signed')
      LIMIT ${SWEEP_LIMIT}
    `);

    for (const row of lapsed.rows as any[]) {
      const id = Number(row.id);
      try {
        // Skip if the contract has a signer that has already signed.
        const signerRes = await db.execute(sql`
          SELECT id FROM contract_signers
          WHERE contract_id = ${id} AND status = 'signed'
          LIMIT 1
        `);
        if (signerRes.rows.length > 0) continue;

        const upd = await db.execute(sql`
          UPDATE contracts
          SET status = 'expired', updated_at = ${now}
          WHERE id = ${id} AND status IN ('ready_to_send', 'sent', 'viewed', 'partially_signed')
          RETURNING id
        `);
        if (upd.rows.length === 0) continue; // raced or already swept

        await db.execute(sql`
          INSERT INTO contract_events (contract_id, actor_type, event_type, payload_json)
          VALUES (${id}, 'system', 'expired', ${JSON.stringify({
            expiresAt: row.expires_at,
            reason: "auto_flagged_by_expiry_sweeper",
          })})
        `);

        const oppId = row.opportunity_id ? Number(row.opportunity_id) : 0;
        if (oppId > 0) {
          await db.execute(sql`
            INSERT INTO opportunity_events (opportunity_id, event_type, actor_type, title, description, created_at)
            VALUES (${oppId}, 'contract_expired', 'system', 'Contract expired',
                    'The offer expired without being executed. Status auto-flagged.', ${now})
          `).catch(() => { /* schema drift tolerance */ });
        }
        stats.autoFlagged++;
      } catch (e) {
        console.error(`[ContractExpirySweeper] Failed to flag contract ${id}:`, e);
      }
    }

    // ---- 2. Warn on contracts expiring soon --------------------------------
    const soon = await db.execute(sql`
      SELECT c.id, c.opportunity_id, c.expires_at
      FROM contracts c
      WHERE c.expires_at IS NOT NULL
        AND c.expires_at >= ${now}
        AND c.expires_at <= ${warnCutoff}
        AND c.status IN ('ready_to_send', 'sent', 'viewed', 'partially_signed')
        AND NOT EXISTS (
          SELECT 1 FROM contract_events e
          WHERE e.contract_id = c.id AND e.event_type = 'expiry_warning'
        )
      LIMIT ${SWEEP_LIMIT}
    `);

    for (const row of soon.rows as any[]) {
      const id = Number(row.id);
      try {
        const daysLeft = Math.max(
          0,
          Math.ceil((new Date(row.expires_at).getTime() - now.getTime()) / (24 * 60 * 60 * 1000)),
        );
        await db.execute(sql`
          INSERT INTO contract_events (contract_id, actor_type, event_type, payload_json)
          VALUES (${id}, 'system', 'expiry_warning', ${JSON.stringify({
            expiresAt: row.expires_at,
            daysLeft,
            warnDays: WARN_DAYS,
          })})
        `);
        stats.warned++;
      } catch (e) {
        console.error(`[ContractExpirySweeper] Failed to warn on contract ${id}:`, e);
      }
    }
  } catch (e) {
    console.error("[ContractExpirySweeper] Sweep failed:", e);
  }

  lastResult = stats;
  if (stats.autoFlagged > 0 || stats.warned > 0) {
    console.log(
      `[ContractExpirySweeper] Sweep: ${stats.autoFlagged} auto-flagged, ${stats.warned} warned`,
    );
  }
  return stats;
}

export function startContractExpirySweeper(intervalMs = 600_000): NodeJS.Timeout {
  const timer = setInterval(() => {
    runContractExpirySweep().catch(() => {});
  }, intervalMs);
  // Keep the process alive only for this timer, but never block exit on a sweep.
  timer.unref?.();
  // Run once shortly after boot so lapsed offers are flagged without waiting a full interval.
  setTimeout(() => {
    runContractExpirySweep().catch(() => {});
  }, 15_000).unref?.();
  return timer;
}

export { SWEEP_LIMIT, TERMINAL_STATUSES };
