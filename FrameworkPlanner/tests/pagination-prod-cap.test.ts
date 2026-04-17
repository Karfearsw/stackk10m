import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from "vitest";
import request from "supertest";
import express from "express";
import session from "express-session";
import { registerRoutes } from "../server/routes";
import { storage } from "../server/storage";

describe("Pagination caps in production", () => {
  const originalNodeEnv = process.env.NODE_ENV;
  const originalDbUrl = process.env.DATABASE_URL;
  let app: express.Express;
  let originalListLeads: any;
  let originalGetPropertiesBySourceLeadIds: any;

  beforeAll(async () => {
    process.env.NODE_ENV = "production";
    process.env.DATABASE_URL = "postgresql://user:pass@db.invalid/db?sslmode=require";

    app = express();
    app.use(express.json());
    app.use(session({ secret: "test", resave: false, saveUninitialized: false }));
    await registerRoutes(app);
  });

  beforeEach(() => {
    originalListLeads = (storage as any).listLeads;
    originalGetPropertiesBySourceLeadIds = (storage as any).getPropertiesBySourceLeadIds;
  });

  afterEach(() => {
    (storage as any).listLeads = originalListLeads;
    (storage as any).getPropertiesBySourceLeadIds = originalGetPropertiesBySourceLeadIds;
  });

  afterAll(() => {
    process.env.NODE_ENV = originalNodeEnv;
    process.env.DATABASE_URL = originalDbUrl;
  });

  it("clamps limit to 100", async () => {
    let received: any = null;
    (storage as any).listLeads = async (input: any) => {
      received = { limit: input?.limit, offset: input?.offset };
      return { items: [], total: 0 };
    };
    (storage as any).getPropertiesBySourceLeadIds = async () => [];

    const res = await request(app).get("/api/leads?limit=999999&offset=0");
    expect(res.status).toBe(200);
    expect(received).toEqual({ limit: 100, offset: 0 });
  });
});

