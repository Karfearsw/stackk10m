import { storage } from "../storage.js";
import { runSkipTraceJob } from "../services/skipTrace/orchestrator.js";

function envInt(name: string, fallback: number) {
  const raw = String(process.env[name] || "").trim();
  const n = raw ? parseInt(raw, 10) : NaN;
  return Number.isFinite(n) ? n : fallback;
}

export async function runSkipTraceWorkerOnce() {
  const limit = envInt("SKIP_TRACE_WORKER_BATCH_SIZE", 10);
  const jobs = await storage.listQueuedSkipTraceJobs(limit);

  for (const job of jobs) {
    const id = Number((job as any).id);
    if (!Number.isFinite(id)) continue;
    try {
      await runSkipTraceJob(id);
    } catch (e: any) {
      console.error(JSON.stringify({ ts: new Date().toISOString(), event: "skip_trace_worker", kind: "job_run_failed", jobId: id, message: String(e?.message || e) }));
    }
  }
}

export function startSkipTraceWorker(intervalMs = 15_000) {
  let running = false;

  const tick = async () => {
    if (running) return;
    running = true;
    try {
      await runSkipTraceWorkerOnce();
    } finally {
      running = false;
    }
  };

  tick();
  setInterval(tick, intervalMs);
}

