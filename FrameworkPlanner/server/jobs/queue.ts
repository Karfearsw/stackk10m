/**
 * Job queue — PostgreSQL-backed durable queue (Ticket 09).
 *
 * Supports job types, priorities, scheduled runs, and idempotency keys.
 * Workers claim jobs with an advisory-style lock (locked_by/locked_at) so
 * multiple processes never run the same job twice.
 */
import { pool } from "../db.js";

export type JobStatus = "queued" | "active" | "succeeded" | "failed" | "cancelled" | "dead_lettered";

export interface Job {
  id: number;
  type: string;
  payload: Record<string, unknown>;
  status: JobStatus;
  priority: number;
  scheduled_at: string;
  attempts: number;
  max_attempts: number;
  idempotency_key: string | null;
  locked_by: string | null;
  locked_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface EnqueueOptions {
  type: string;
  payload?: Record<string, unknown>;
  priority?: number;
  scheduledAt?: Date;
  maxAttempts?: number;
  idempotencyKey?: string;
}

function rowToJob(row: any): Job {
  return {
    id: Number(row.id),
    type: String(row.type),
    payload: row.payload ?? {},
    status: row.status,
    priority: Number(row.priority),
    scheduled_at: row.scheduled_at,
    attempts: Number(row.attempts),
    max_attempts: Number(row.max_attempts),
    idempotency_key: row.idempotency_key ?? null,
    locked_by: row.locked_by ?? null,
    locked_at: row.locked_at ?? null,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

/**
 * Enqueue a job. If an idempotency key is provided and a non-terminal job
 * already exists with that key, the existing job is returned (no duplicate).
 */
export async function enqueueJob(opts: EnqueueOptions): Promise<Job> {
  const { type, payload = {}, priority = 0, scheduledAt, maxAttempts = 5, idempotencyKey } = opts;
  if (!type || typeof type !== "string") throw new Error("Job type is required");

  if (idempotencyKey) {
    const existing = await pool.query(
      `SELECT * FROM job_queue
       WHERE idempotency_key = $1 AND status IN ('queued', 'active')
       LIMIT 1`,
      [idempotencyKey],
    );
    if (existing.rows.length > 0) return rowToJob(existing.rows[0]);
  }

  const result = await pool.query(
    `INSERT INTO job_queue (type, payload, priority, scheduled_at, max_attempts, idempotency_key)
     VALUES ($1, $2::jsonb, $3, $4, $5, $6)
     RETURNING *`,
    [
      type,
      JSON.stringify(payload),
      priority,
      scheduledAt ? scheduledAt.toISOString() : new Date().toISOString(),
      maxAttempts,
      idempotencyKey ?? null,
    ],
  );
  return rowToJob(result.rows[0]);
}

/**
 * Claim the next available job (highest priority, oldest scheduled first).
 * Uses an atomic UPDATE ... RETURNING so only one worker wins.
 */
export async function claimNextJob(workerId: string, lockTimeoutMs = 5 * 60 * 1000): Promise<Job | null> {
  const result = await pool.query(
    `UPDATE job_queue
     SET status = 'active', locked_by = $1, locked_at = now(), updated_at = now()
     WHERE id = (
       SELECT id FROM job_queue
       WHERE status = 'queued'
         AND scheduled_at <= now()
         AND (locked_by IS NULL OR locked_at < now() - make_interval(secs => $2 / 1000))
       ORDER BY priority DESC, scheduled_at ASC
       LIMIT 1
       FOR UPDATE SKIP LOCKED
     )
     RETURNING *`,
    [workerId, lockTimeoutMs],
  );
  if (result.rows.length === 0) return null;
  return rowToJob(result.rows[0]);
}

/** Mark a job as successfully completed. */
export async function completeJob(jobId: number, output?: Record<string, unknown>): Promise<void> {
  await pool.query(
    `UPDATE job_queue
     SET status = 'succeeded', locked_by = NULL, locked_at = NULL, updated_at = now()
     WHERE id = $1`,
    [jobId],
  );
  await pool.query(
    `UPDATE job_runs
     SET completed_at = now(), status = 'succeeded', output = $2::jsonb
     WHERE job_id = $1 AND status = 'running'`,
    [jobId, output ? JSON.stringify(output) : null],
  );
}

/**
 * Record a failed attempt. If attempts remain, the job goes back to queued
 * with an exponential-backoff delay; otherwise it moves to dead_lettered
 * and a dead-letter record is written.
 */
export async function failJob(jobId: number, error: string, baseBackoffMs = 30_000): Promise<Job> {
  const current = await pool.query(`SELECT * FROM job_queue WHERE id = $1`, [jobId]);
  if (current.rows.length === 0) throw new Error(`Job ${jobId} not found`);
  const job = rowToJob(current.rows[0]);
  const attempts = job.attempts + 1;

  await pool.query(
    `UPDATE job_runs
     SET completed_at = now(), status = 'failed', error = $2
     WHERE job_id = $1 AND status = 'running'`,
    [jobId, error],
  );

  if (attempts >= job.max_attempts) {
    await pool.query(
      `UPDATE job_queue
       SET status = 'dead_lettered', attempts = $2, locked_by = NULL, locked_at = NULL, updated_at = now()
       WHERE id = $1`,
      [jobId, attempts],
    );
    await pool.query(
      `INSERT INTO dead_letter_queue (job_id, error, payload, job_type, attempts)
       VALUES ($1, $2, $3::jsonb, $4, $5)`,
      [jobId, error, JSON.stringify(job.payload), job.type, attempts],
    );
    return { ...job, status: "dead_lettered", attempts };
  }

  // Exponential backoff: base * 2^(attempts-1), capped at 1 hour.
  const delayMs = Math.min(baseBackoffMs * 2 ** (attempts - 1), 3_600_000);
  const nextRun = new Date(Date.now() + delayMs);
  await pool.query(
    `UPDATE job_queue
     SET status = 'queued', attempts = $2, locked_by = NULL, locked_at = NULL,
         scheduled_at = $3, updated_at = now()
     WHERE id = $1`,
    [jobId, attempts, nextRun.toISOString()],
  );
  return { ...job, status: "queued", attempts };
}

/** Start a run record when a worker begins processing a job. */
export async function startJobRun(jobId: number): Promise<void> {
  await pool.query(`INSERT INTO job_runs (job_id, status) VALUES ($1, 'running')`, [jobId]);
}

/** Mark a run as timed out (worker exceeded its timeout). */
export async function timeoutJobRun(jobId: number): Promise<void> {
  await pool.query(
    `UPDATE job_runs SET completed_at = now(), status = 'timed_out'
     WHERE job_id = $1 AND status = 'running'`,
    [jobId],
  );
}

/** Retry a failed or dead-lettered job: reset attempts and requeue immediately. */
export async function retryJob(jobId: number): Promise<Job> {
  const result = await pool.query(
    `UPDATE job_queue
     SET status = 'queued', attempts = 0, locked_by = NULL, locked_at = NULL,
         scheduled_at = now(), updated_at = now()
     WHERE id = $1 AND status IN ('failed', 'dead_lettered', 'cancelled')
     RETURNING *`,
    [jobId],
  );
  if (result.rows.length === 0) throw new Error(`Job ${jobId} not found or not retryable`);
  return rowToJob(result.rows[0]);
}

/** Cancel a queued or active job. */
export async function cancelJob(jobId: number): Promise<Job> {
  const result = await pool.query(
    `UPDATE job_queue
     SET status = 'cancelled', locked_by = NULL, locked_at = NULL, updated_at = now()
     WHERE id = $1 AND status IN ('queued', 'active')
     RETURNING *`,
    [jobId],
  );
  if (result.rows.length === 0) throw new Error(`Job ${jobId} not found or not cancellable`);
  return rowToJob(result.rows[0]);
}

/** Fetch a single job by id. */
export async function getJob(jobId: number): Promise<Job | null> {
  const result = await pool.query(`SELECT * FROM job_queue WHERE id = $1`, [jobId]);
  if (result.rows.length === 0) return null;
  return rowToJob(result.rows[0]);
}

export interface JobFilters {
  status?: string;
  type?: string;
  limit?: number;
  offset?: number;
}

/** List jobs with optional filters, newest first. */
export async function listJobs(filters: JobFilters = {}): Promise<{ jobs: Job[]; total: number }> {
  const conditions: string[] = [];
  const params: any[] = [];
  let idx = 1;
  if (filters.status) {
    conditions.push(`status = $${idx++}`);
    params.push(filters.status);
  }
  if (filters.type) {
    conditions.push(`type = $${idx++}`);
    params.push(filters.type);
  }
  const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
  const limit = Math.min(Math.max(Number(filters.limit) || 50, 1), 200);
  const offset = Math.max(Number(filters.offset) || 0, 0);

  const totalRes = await pool.query(`SELECT COUNT(*)::int AS c FROM job_queue ${where}`, params);
  const rowsRes = await pool.query(
    `SELECT * FROM job_queue ${where} ORDER BY created_at DESC LIMIT $${idx++} OFFSET $${idx++}`,
    [...params, limit, offset],
  );
  return { jobs: rowsRes.rows.map(rowToJob), total: totalRes.rows[0].c };
}

/** Aggregate counts per status for the health dashboard. */
export async function getJobCounts(): Promise<Record<string, number>> {
  const result = await pool.query(
    `SELECT status, COUNT(*)::int AS c FROM job_queue GROUP BY status`,
  );
  const counts: Record<string, number> = {
    queued: 0,
    active: 0,
    succeeded: 0,
    failed: 0,
    cancelled: 0,
    dead_lettered: 0,
  };
  for (const row of result.rows) counts[row.status] = row.c;
  const dlq = await pool.query(`SELECT COUNT(*)::int AS c FROM dead_letter_queue`);
  counts.dead_letter_records = dlq.rows[0].c;
  return counts;
}

/** Oldest queued job age (ms) and last successful completion time. */
export async function getQueueVitals(): Promise<{ oldestQueuedAgeMs: number | null; lastSuccessAt: string | null }> {
  const oldest = await pool.query(
    `SELECT EXTRACT(EPOCH FROM (now() - MIN(scheduled_at))) * 1000 AS age_ms
     FROM job_queue WHERE status = 'queued'`,
  );
  const lastSuccess = await pool.query(
    `SELECT MAX(completed_at) AS at FROM job_runs WHERE status = 'succeeded'`,
  );
  return {
    oldestQueuedAgeMs: oldest.rows[0]?.age_ms != null ? Number(oldest.rows[0].age_ms) : null,
    lastSuccessAt: lastSuccess.rows[0]?.at ? new Date(lastSuccess.rows[0].at).toISOString() : null,
  };
}

/** Count of jobs that failed repeatedly (3+ attempts) in the last 24h — alert signal. */
export async function getRepeatedFailureCount(): Promise<number> {
  const result = await pool.query(
    `SELECT COUNT(*)::int AS c FROM job_queue
     WHERE attempts >= 3 AND updated_at > now() - interval '24 hours'`,
  );
  return result.rows[0].c;
}
