import { describe, it, expect, beforeAll, vi } from "vitest";

vi.mock("../server/services/skipTrace/orchestrator.js", () => {
  return {
    runSkipTraceJob: vi.fn(async () => ({ job: { id: 1, status: "completed" }, scoreSnapshot: null })),
  };
});

describe("Skip trace worker", () => {
  let runSkipTraceWorkerOnce: () => Promise<void>;
  let storage: typeof import("../server/storage")["storage"];

  beforeAll(async () => {
    vi.resetModules();
    ({ storage } = await import("../server/storage"));
    ({ runSkipTraceWorkerOnce } = await import("../server/cron/skip-trace-worker"));
  });

  it("runs queued jobs up to the batch limit", async () => {
    const orchestrator = await import("../server/services/skipTrace/orchestrator.js");

    storage.listQueuedSkipTraceJobs = async () => [{ id: 10 }, { id: 11 }] as any;
    await runSkipTraceWorkerOnce();

    expect((orchestrator as any).runSkipTraceJob).toHaveBeenCalledTimes(2);
    expect((orchestrator as any).runSkipTraceJob).toHaveBeenCalledWith(10);
    expect((orchestrator as any).runSkipTraceJob).toHaveBeenCalledWith(11);
  });
});
