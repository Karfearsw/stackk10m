/**
 * Job worker — processes jobs from the queue (Ticket 09).
 *
 * Polls for claimable jobs, runs them through registered type handlers,
 * enforces per-job timeouts, and applies bounded retries with exponential
 * backoff (handled in queue.failJob). Timed-out or crashed jobs are
 * reclaimed via the lock timeout.
 */
import { claimNextJob, completeJob, failJob, startJobRun, timeoutJobRun, type Job } from "./queue.js";

export type JobHandler = (job: Job) => Promise<Record<string, unknown> | void>;

const handlers = new Map<string, JobHandler>();
const DEFAULT_JOB_TIMEOUT_MS = 5 * 60 * 1000;

function envInt(name: string, fallback: number): number {
  const raw = String(process.env[name] || "").trim();
  const n = raw ? parseInt(raw, 10) : NaN;
  return Number.isFinite(n) ? n : fallback;
}

/** Register a handler for a job type. Later tickets (follow-ups, sequences, imports) plug in here. */
export function registerJobHandler(type: string, handler: JobHandler): void {
  handlers.set(type, handler);
}

function log(event: string, fields: Record<string, unknown> = {}): void {
  console.log(JSON.stringify({ ts: new Date().toISOString(), event: "job_worker", event_detail: event, ...fields }));
}

/**
 * Run a handler with a timeout. Rejects with a timeout error if the
 * handler does not settle within timeoutMs.
 */
async function runWithTimeout(job: Job, handler: JobHandler, timeoutMs: number): Promise<Record<string, unknown> | void> {
  let timer: NodeJS.Timeout | null = null;
  try {
    return await Promise.race([
      handler(job),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error(`Job ${job.id} timed out after ${timeoutMs}ms`)), timeoutMs);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export async function processOneJob(workerId: string): Promise<boolean> {
  const job = await claimNextJob(workerId);
  if (!job) return false;

  const handler = handlers.get(job.type);
  if (!handler) {
    // No handler registered — fail fast so it surfaces in the dead-letter queue
    // rather than spinning forever.
    await failJob(job.id, `No handler registered for job type "${job.type}"`, 0);
    log("no_handler", { jobId: job.id, type: job.type });
    return true;
  }

  await startJobRun(job.id);
  const timeoutMs = envInt("JOB_TIMEOUT_MS", DEFAULT_JOB_TIMEOUT_MS);
  try {
    const output = (await runWithTimeout(job, handler, timeoutMs)) ?? undefined;
    await completeJob(job.id, (output as Record<string, unknown>) || undefined);
    log("job_succeeded", { jobId: job.id, type: job.type, attempts: job.attempts + 1 });
  } catch (err: any) {
    const message = String(err?.message || err);
    if (/timed out/.test(message)) {
      await timeoutJobRun(job.id).catch(() => {});
    }
    const updated = await failJob(job.id, message);
    log("job_failed", {
      jobId: job.id,
      type: job.type,
      attempts: updated.attempts,
      status: updated.status,
      message: message.slice(0, 500),
    });
  }
  return true;
}

/**
 * Start the polling worker. Follows the same pattern as the cron workers
 * in server/cron/*.ts (tick + setInterval, re-entrancy guard).
 */
export function startJobWorker(pollIntervalMs = 10_000): void {
  const workerId = `worker-${process.pid}-${Math.random().toString(36).slice(2, 8)}`;
  let running = false;
  let stopped = false;

  const tick = async () => {
    if (running || stopped) return;
    running = true;
    try {
      // Drain up to N jobs per tick so a burst doesn't starve the event loop.
      const maxPerTick = envInt("JOB_WORKER_MAX_PER_TICK", 5);
      for (let i = 0; i < maxPerTick; i++) {
        const didWork = await processOneJob(workerId).catch((e: any) => {
          log("tick_error", { message: String(e?.message || e).slice(0, 300) });
          return false;
        });
        if (!didWork) break;
      }
    } finally {
      running = false;
    }
  };

  log("worker_started", { workerId, pollIntervalMs });
  tick();
  const timer = setInterval(tick, pollIntervalMs);
  // Don't keep the process alive solely for the worker in tests.
  if (typeof (timer as any).unref === "function") (timer as any).unref();

  const shutdown = () => {
    stopped = true;
    clearInterval(timer);
    log("worker_stopped", { workerId });
  };
  process.once("SIGTERM", shutdown);
  process.once("SIGINT", shutdown);
}

/** For tests/health checks: is at least one handler registered? */
export function hasJobHandler(type: string): boolean {
  return handlers.has(type);
}

/** For tests: clear all registered handlers. */
export function clearJobHandlers(): void {
  handlers.clear();
}
