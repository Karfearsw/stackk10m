import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";
import request from "supertest";
import express from "express";
import session from "express-session";
import { storage } from "../server/storage";

vi.mock("../server/services/tasks/today-queue.js", () => ({
  buildTodayQueue: vi.fn(async () => ({
    start: "2026-05-22T00:00:00.000Z",
    end: "2026-05-22T23:59:59.999Z",
    counts: { overdue: 0, dueToday: 0, total: 0, snoozeBlocked: 0 },
    top: [],
    groups: [],
  })),
}));

describe("Tasks API", () => {
  let app: express.Express;

  beforeAll(async () => {
    const { registerRoutes } = await import("../server/routes");
    app = express();
    app.use(express.json());
    app.use(session({ secret: "test", resave: false, saveUninitialized: false }));
    app.use((req: any, _res, next) => {
      req.session.userId = 1;
      next();
    });
    await registerRoutes(app);
  });

  beforeEach(() => {
    storage.getUserById = (async (id: number) => ({
      id,
      email: "user@example.com",
      role: "user",
      isSuperAdmin: false,
    })) as any;
  });

  it("GET /api/tasks returns items + total", async () => {
    storage.listTasks = (async () => ({ items: [], total: 0 })) as any;
    const res = await request(app).get("/api/tasks");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ items: [], total: 0 });
  });

  it("POST /api/tasks sets createdBy and defaults assignee to self", async () => {
    storage.createTask = (async (input: any) => ({ id: 123, ...input })) as any;
    const res = await request(app).post("/api/tasks").send({ title: "Test task" });
    expect(res.status).toBe(201);
    expect(res.body.createdBy).toBe(1);
    expect(res.body.assignedToUserId).toBe(1);
    expect(res.body.title).toBe("Test task");
  });

  it("POST /api/tasks coerces dueAt string to Date", async () => {
    let captured: any | undefined;
    storage.createTask = (async (input: any) => {
      captured = input;
      return { id: 123, ...input };
    }) as any;

    const res = await request(app).post("/api/tasks").send({ title: "Test task", dueAt: "2026-03-20T10:00:00" });
    expect(res.status).toBe(201);
    expect(captured?.dueAt instanceof Date).toBe(true);
    expect(Number.isNaN(captured?.dueAt?.getTime?.())).toBe(false);
  });

  it("PATCH /api/tasks/:id returns 404 if private task is not visible", async () => {
    storage.getTaskById = (async () => ({ id: 10, isPrivate: true, createdBy: 2, assignedToUserId: 3 })) as any;
    const res = await request(app).patch("/api/tasks/10").send({ title: "Nope" });
    expect(res.status).toBe(404);
  });

  it("PATCH /api/tasks/:id returns 403 if shared task is visible but not mutable", async () => {
    storage.getTaskById = (async () => ({ id: 11, isPrivate: false, createdBy: 2, assignedToUserId: 3 })) as any;
    const res = await request(app).patch("/api/tasks/11").send({ title: "Nope" });
    expect(res.status).toBe(403);
  });

  it("POST /api/tasks/:id/complete returns completed and next=null when not recurring", async () => {
    storage.getTaskById = (async () => ({
      id: 12,
      title: "X",
      isPrivate: false,
      createdBy: 1,
      assignedToUserId: 1,
      isRecurring: false,
      recurrenceRule: null,
      dueAt: null,
    })) as any;
    storage.completeTask = (async (_id: number, input: any) => ({
      id: 12,
      title: "X",
      isPrivate: false,
      createdBy: 1,
      assignedToUserId: 1,
      isRecurring: false,
      recurrenceRule: null,
      dueAt: null,
      status: input.status,
      completedAt: input.completedAt,
    })) as any;
    const res = await request(app).post("/api/tasks/12/complete");
    expect(res.status).toBe(200);
    expect(res.body.completed?.id).toBe(12);
    expect(res.body.next).toBeNull();
  });

  it("GET /api/today-queue returns response", async () => {
    const res = await request(app).get("/api/today-queue?start=2026-05-22T00:00:00.000Z&end=2026-05-22T23:59:59.999Z");
    expect(res.status).toBe(200);
    expect(res.body?.counts?.total).toBe(0);
  });

  it("POST /api/tasks/:id/reschedule returns 409 when snooze limit reached", async () => {
    storage.getTaskById = (async () => ({ id: 30, isPrivate: false, createdBy: 1, assignedToUserId: 1, snoozeCount: 5 })) as any;
    storage.rescheduleTask = (async () => {
      const e: any = new Error("Snooze limit reached");
      e.code = "SNOOZE_LIMIT";
      throw e;
    }) as any;
    const res = await request(app).post("/api/tasks/30/reschedule").send({ dueAt: "2026-05-23T09:00:00.000Z" });
    expect(res.status).toBe(409);
  });

  it("POST /api/tasks/:id/reschedule coerces dueAt and forwards reason", async () => {
    storage.getTaskById = (async () => ({ id: 31, isPrivate: false, createdBy: 1, assignedToUserId: 1, snoozeCount: 0 })) as any;
    let captured: any;
    storage.rescheduleTask = (async (_auth: any, _id: number, input: any) => {
      captured = input;
      return { id: 31, dueAt: input.dueAt, snoozeCount: 1 };
    }) as any;
    const res = await request(app).post("/api/tasks/31/reschedule").send({ dueAt: "2026-05-23T09:00:00.000Z", reason: "Waiting on callback" });
    expect(res.status).toBe(200);
    expect(captured?.dueAt instanceof Date).toBe(true);
    expect(captured?.reason).toBe("Waiting on callback");
  });

  it("PATCH /api/tasks/:id uses rescheduleTask when dueAt is included", async () => {
    storage.getTaskById = (async () => ({ id: 32, isPrivate: false, createdBy: 1, assignedToUserId: 1, snoozeCount: 0 })) as any;
    let rescheduleInput: any;
    let updatePatch: any;
    storage.rescheduleTask = (async (_auth: any, _id: number, input: any) => {
      rescheduleInput = input;
      return { id: 32, dueAt: input.dueAt };
    }) as any;
    storage.updateTask = (async (_id: number, patch: any) => {
      updatePatch = patch;
      return { id: 32, ...patch };
    }) as any;
    const res = await request(app).patch("/api/tasks/32").send({ dueAt: "2026-05-23T09:00:00.000Z", status: "open", title: "New" });
    expect(res.status).toBe(200);
    expect(rescheduleInput?.dueAt instanceof Date).toBe(true);
    expect(updatePatch).toEqual({ title: "New" });
  });
});
