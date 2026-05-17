import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";
import request from "supertest";
import express from "express";
import session from "express-session";

beforeEach(() => {
  vi.clearAllMocks();
});

vi.mock("../server/services/skipTrace/orchestrator.js", () => {
  return {
    createSkipTraceJob: vi.fn(async (input: any) => ({
      id: 123,
      entityType: input.entityType,
      entityId: input.entityId,
      requestedByUserId: input.requestedByUserId,
      mode: input.mode,
      status: "queued",
      providerName: null,
      createdAt: new Date(),
      startedAt: null,
      completedAt: null,
      errorMessage: null,
      idempotencyKey: null,
    })),
    runSkipTraceJob: vi.fn(async (jobId: number) => ({
      job: { id: jobId, status: "completed" },
      scoreSnapshot: null,
    })),
    runProviderSkipTraceForEntity: vi.fn(),
    isHttpError: () => false,
  };
});

describe("Skip trace jobs API", () => {
  let app: express.Express;
  let agent: request.SuperAgentTest;
  let registerRoutes: (app: any, opts?: any) => Promise<any>;
  let storage: typeof import("../server/storage")["storage"];

  beforeAll(async () => {
    process.env.EMPLOYEE_ACCESS_CODE = "3911";
    process.env.SESSION_SECRET = "test";
    process.env.FEATURE_SKIP_TRACE = "true";

    vi.resetModules();
    ({ storage } = await import("../server/storage"));

    storage.getUserByEmail = async () => null as any;
    storage.createUser = async (data: any) => ({ id: 1, email: data.email, firstName: data.firstName, lastName: data.lastName, isActive: true, isSuperAdmin: false } as any);
    storage.getUserById = async () => ({ id: 1, email: "new@example.com", firstName: "New", lastName: "User", isActive: true, isSuperAdmin: false } as any);

    app = express();
    app.use(express.json());
    app.use(session({ secret: "test", resave: false, saveUninitialized: false }));

    ({ registerRoutes } = await import("../server/routes"));
    await registerRoutes(app, { mode: "serverless" });

    agent = request.agent(app);
    await agent.post("/api/auth/signup").send({ firstName: "New", lastName: "User", email: "new@example.com", password: "password123", employeeCode: "3911" });
  });

  it("POST /api/skip-trace/jobs runs provider jobs inline", async () => {
    const orchestrator = await import("../server/services/skipTrace/orchestrator.js");

    const res = await agent.post("/api/skip-trace/jobs").send({ entityType: "lead", entityId: 1, mode: "provider" });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("completed");
    expect((orchestrator as any).runSkipTraceJob).toHaveBeenCalledTimes(1);
  });

  it("POST /api/skip-trace/jobs enqueues public research jobs", async () => {
    const orchestrator = await import("../server/services/skipTrace/orchestrator.js");

    const res = await agent.post("/api/skip-trace/jobs").send({ entityType: "lead", entityId: 1, mode: "public_research" });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("queued");
    expect((orchestrator as any).runSkipTraceJob).toHaveBeenCalledTimes(0);
  });

  it("POST /api/skip-trace/jobs/:jobId/run triggers execution", async () => {
    const orchestrator = await import("../server/services/skipTrace/orchestrator.js");

    storage.getSkipTraceJobById = async (jobId: number) => ({ id: jobId, requestedByUserId: 1, status: "queued" } as any);

    const res = await agent.post("/api/skip-trace/jobs/999/run").send({});
    expect(res.status).toBe(200);
    expect(res.body.jobId).toBe(999);
    expect(res.body.status).toBe("completed");
    expect((orchestrator as any).runSkipTraceJob).toHaveBeenCalledWith(999);
  });
});
