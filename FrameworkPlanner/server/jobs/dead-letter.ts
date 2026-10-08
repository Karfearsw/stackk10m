/**
 * Dead-letter queue helpers (Ticket 09).
 *
 * Jobs land here after exhausting max_attempts. Operators can inspect,
 * retry (requeues with attempts reset), or purge them.
 */
import { pool } from "../db.js";
import { retryJob } from "./queue.js";

export interface DeadLetterRecord {
  id: number;
  job_id: number | null;
  failed_at: string;
  error: string | null;
  payload: Record<string, unknown>;
  job_type: string | null;
  attempts: number;
}

function rowToRecord(row: any): DeadLetterRecord {
  return {
    id: Number(row.id),
    job_id: row.job_id != null ? Number(row.job_id) : null,
    failed_at: row.failed_at,
    error: row.error ?? null,
    payload: row.payload ?? {},
    job_type: row.job_type ?? null,
    attempts: Number(row.attempts),
  };
}

/** List dead-letter records, newest first. */
export async function listDeadLetters(limit = 50, offset = 0): Promise<{ records: DeadLetterRecord[]; total: number }> {
  const safeLimit = Math.min(Math.max(Number(limit) || 50, 1), 200);
  const safeOffset = Math.max(Number(offset) || 0, 0);
  const totalRes = await pool.query(`SELECT COUNT(*)::int AS c FROM dead_letter_queue`);
  const rowsRes = await pool.query(
    `SELECT * FROM dead_letter_queue ORDER BY failed_at DESC LIMIT $1 OFFSET $2`,
    [safeLimit, safeOffset],
  );
  return { records: rowsRes.rows.map(rowToRecord), total: totalRes.rows[0].c };
}

/**
 * Retry a dead-lettered job: requeues the original job with attempts reset.
 * Returns the requeued job, or throws if the original job row is gone.
 */
export async function retryDeadLetter(recordId: number) {
  const res = await pool.query(`SELECT job_id FROM dead_letter_queue WHERE id = $1`, [recordId]);
  if (res.rows.length === 0) throw new Error(`Dead-letter record ${recordId} not found`);
  const jobId = res.rows[0].job_id;
  if (jobId == null) throw new Error(`Dead-letter record ${recordId} has no linked job`);
  return retryJob(Number(jobId));
}

/** Purge a dead-letter record (the job row itself is left untouched). */
export async function purgeDeadLetter(recordId: number): Promise<void> {
  await pool.query(`DELETE FROM dead_letter_queue WHERE id = $1`, [recordId]);
}
