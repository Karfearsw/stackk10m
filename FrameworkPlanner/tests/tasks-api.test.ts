import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import request from "supertest";
import express from "express";
import session from "express-session";
import { registerRoutes } from "../server/routes";
import { storage } from "../server/storage";

describe("Tasks API", () => {
  let app: express.Express;

  beforeAll(async () => {
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
});
