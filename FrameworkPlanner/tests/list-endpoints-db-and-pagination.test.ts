import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from "vitest";
import request from "supertest";
import express from "express";
import session from "express-session";
import { registerRoutes } from "../server/routes";
import { storage } from "../server/storage";

describe("List endpoints DB and pagination handling", () => {
  const originalDbUrl = process.env.DATABASE_URL;
  let app: express.Express;

  let originalListLeads: any;
  let originalGetProperties: any;

  beforeAll(async () => {
    process.env.DATABASE_URL = "postgresql://user:pass@db.invalid/db?sslmode=require";

    app = express();
    app.use(express.json());
    app.use(session({ secret: "test", resave: false, saveUninitialized: false }));
    app.use((req, _res, next) => {
      (req.session as any).userId = 1;
      next();
    });

    storage.getUserById = async (_id: number) => ({ id: 1, role: "admin", isSuperAdmin: true, isActive: true } as any);

    await registerRoutes(app);
  });

  beforeEach(() => {
    originalListLeads = (storage as any).listLeads;
    originalGetProperties = storage.getProperties;
  });

  afterEach(() => {
    (storage as any).listLeads = originalListLeads;
    storage.getProperties = originalGetProperties;
  });

  afterAll(() => {
    process.env.DATABASE_URL = originalDbUrl;
  });

  it("GET /api/leads returns 503 when DB is unavailable", async () => {
    (storage as any).listLeads = async () => {
      const err: any = new Error("connect ECONNREFUSED");
      err.code = "ECONNREFUSED";
      throw err;
    };

    const res = await request(app).get("/api/leads");
    expect(res.status).toBe(503);
    expect(res.body?.message).toBe("Database is unavailable");
  });

  it("GET /api/opportunities returns 503 when DB is unavailable", async () => {
    storage.getProperties = async () => {
      const err: any = new Error("connect ETIMEDOUT");
      err.code = "ETIMEDOUT";
      throw err;
    };

    const res = await request(app).get("/api/opportunities");
    expect(res.status).toBe(503);
    expect(res.body?.message).toBe("Database is unavailable");
  });

  it("GET /api/leads ignores invalid pagination params", async () => {
    let received: any = null;
    (storage as any).listLeads = async (input: any) => {
      received = { limit: input?.limit, offset: input?.offset };
      return { items: [], total: 0 };
    };

    const res = await request(app).get("/api/leads?limit=abc&offset=-10");
    expect(res.status).toBe(200);
    expect(received).toEqual({ limit: undefined, offset: 0 });
    expect(Array.isArray(res.body?.items)).toBe(true);
    expect(typeof res.body?.total).toBe("number");
  });

  it("GET /api/opportunities clamps extreme pagination params", async () => {
    let received: any = null;
    storage.getProperties = async (limit: any, offset: any) => {
      received = { limit, offset };
      return [];
    };

    const res = await request(app).get("/api/opportunities?limit=999999&offset=5");
    expect(res.status).toBe(200);
    expect(received).toEqual({ limit: 500, offset: 5 });
  });
});
