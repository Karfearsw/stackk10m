import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import request from "supertest";
import express from "express";
import session from "express-session";
import { registerRoutes } from "../server/routes";
import { storage } from "../server/storage";

describe("Users RBAC", () => {
  let app: express.Express;

  const usersById = new Map<number, any>();

  beforeAll(async () => {
    process.env.SESSION_SECRET = "test";

    app = express();
    app.use(express.json());
    app.use(session({ secret: "test", resave: false, saveUninitialized: false }));
    app.use((req, _res, next) => {
      const header = req.headers["x-test-user-id"];
      const raw = Array.isArray(header) ? header[0] : header;
      const id = raw ? parseInt(String(raw), 10) : NaN;
      if (Number.isFinite(id)) (req.session as any).userId = id;
      next();
    });

    storage.getUsers = (async () => []) as any;
    storage.updateUser = (async (_id: number, patch: any) => ({ id: _id, ...patch })) as any;
    storage.getUserById = (async (id: number) => usersById.get(id)) as any;
    storage.getUserByEmail = (async (_email: string) => null) as any;

    await registerRoutes(app);
  });

  beforeEach(() => {
    usersById.clear();
  });

  it("GET /api/users requires auth", async () => {
    const res = await request(app).get("/api/users");
    expect(res.status).toBe(401);
  });

  it("GET /api/users forbidden for non-manager user", async () => {
    usersById.set(1, { id: 1, email: "u@example.com", role: "employee", isSuperAdmin: false, isActive: true });
    const res = await request(app).get("/api/users").set("x-test-user-id", "1");
    expect(res.status).toBe(403);
  });

  it("GET /api/users allowed for admin and strips passwordHash", async () => {
    usersById.set(10, { id: 10, email: "admin@example.com", role: "admin", isSuperAdmin: false, isActive: true });
    storage.getUsers = (async () => [{ id: 2, email: "x@example.com", passwordHash: "secret", role: "employee" }]) as any;
    const res = await request(app).get("/api/users").set("x-test-user-id", "10");
    expect(res.status).toBe(200);
    expect(res.body[0].passwordHash).toBe(undefined);
  });

  it("PATCH /api/users/:id as self cannot change role or isSuperAdmin", async () => {
    usersById.set(1, { id: 1, email: "u@example.com", role: "employee", isSuperAdmin: false, isActive: true });
    let updatedPatch: any = null;
    storage.updateUser = (async (_id: number, patch: any) => {
      updatedPatch = patch;
      return { id: _id, email: "u@example.com", role: "employee", isSuperAdmin: false, isActive: true, ...patch };
    }) as any;

    const res = await request(app)
      .patch("/api/users/1")
      .set("x-test-user-id", "1")
      .send({ firstName: "Test", role: "admin", isSuperAdmin: true, isActive: false });

    expect(res.status).toBe(200);
    expect(updatedPatch.firstName).toBe("Test");
    expect(updatedPatch.role).toBe(undefined);
    expect(updatedPatch.isSuperAdmin).toBe(undefined);
    expect(updatedPatch.isActive).toBe(undefined);
  });

  it("PATCH /api/users/:id as admin can set role but cannot grant super admin", async () => {
    usersById.set(10, { id: 10, email: "admin@example.com", role: "admin", isSuperAdmin: false, isActive: true });
    usersById.set(2, { id: 2, email: "u@example.com", role: "employee", isSuperAdmin: false, isActive: true });
    let updatedPatch: any = null;
    storage.updateUser = (async (_id: number, patch: any) => {
      updatedPatch = patch;
      return { id: _id, email: "u@example.com", role: "employee", isSuperAdmin: false, isActive: true, ...patch };
    }) as any;

    const res = await request(app)
      .patch("/api/users/2")
      .set("x-test-user-id", "10")
      .send({ role: "manager", isSuperAdmin: true, isActive: false });

    expect(res.status).toBe(200);
    expect(updatedPatch.role).toBe("manager");
    expect(updatedPatch.isActive).toBe(false);
    expect(updatedPatch.isSuperAdmin).toBe(undefined);
  });

  it("PATCH /api/users/:id blocks admin from editing super admin target", async () => {
    usersById.set(10, { id: 10, email: "admin@example.com", role: "admin", isSuperAdmin: false, isActive: true });
    usersById.set(99, { id: 99, email: "sa@example.com", role: "admin", isSuperAdmin: true, isActive: true });
    const res = await request(app)
      .patch("/api/users/99")
      .set("x-test-user-id", "10")
      .send({ role: "employee" });
    expect(res.status).toBe(403);
  });
});

