import { describe, it, expect, beforeAll, beforeEach, afterEach } from "vitest";
import request from "supertest";
import express from "express";
import session from "express-session";
import { registerRoutes } from "../server/routes";
import { storage } from "../server/storage";

storage.getUserById = async () => ({ id: 1, email: "test@example.com", isSuperAdmin: true } as any);

// Audit C2 regression: buyer creation must never report success without a
// persisted record, and must fail loud (non-2xx + message) on any error.
describe("Buyer create honesty (audit C2)", () => {
  let app: express.Express;
  let originalCreateBuyer: any;
  let created: any[] = [];

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
    originalCreateBuyer = (storage as any).createBuyer;
    created = [];
  });

  afterEach(() => {
    (storage as any).createBuyer = originalCreateBuyer;
  });

  it("returns 201 and the persisted record on success", async () => {
    (storage as any).createBuyer = async (b: any) => {
      const row = { id: 101, name: b.name, createdAt: new Date() };
      created.push(row);
      return row;
    };

    const res = await request(app).post("/api/buyers").send({ name: "Test Buyer" });
    expect(res.status).toBe(201);
    expect(res.body.id).toBe(101);
    expect(created.length).toBe(1);
  });

  it("fails loud with a non-2xx status when createBuyer resolves without a persisted row (silent-loss guard)", async () => {
    (storage as any).createBuyer = async () => null as any;

    const res = await request(app).post("/api/buyers").send({ name: "Ghost Buyer" });
    expect(res.status).toBe(500);
    expect(String(res.body.message)).toMatch(/could not be created/i);
  });

  it("fails loud when createBuyer throws (e.g. DB constraint) instead of swallowing", async () => {
    (storage as any).createBuyer = async () => {
      const err: any = new Error("relation \"buyers\" does not exist");
      err.code = "42P01";
      throw err;
    };

    const res = await request(app).post("/api/buyers").send({ name: "Doomed Buyer" });
    expect(res.status).toBe(400);
    expect(String(res.body.message)).toMatch(/does not exist/i);
  });
});
