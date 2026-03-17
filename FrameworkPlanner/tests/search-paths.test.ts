import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import request from "supertest";
import express from "express";
import session from "express-session";
import { registerRoutes } from "../server/routes";
import { db } from "../server/db";

describe("Search result paths", () => {
  let app: express.Express;
  let originalExecute: any;

  beforeAll(async () => {
    originalExecute = (db as any).execute;
    let call = 0;
    (db as any).execute = vi.fn(async () => {
      call += 1;
      if (call === 1) return { rows: [{ c: 1 }] };
      if (call === 2) return { rows: [{ c: 0 }] };
      if (call === 3) return { rows: [{ c: 0 }] };
      return {
        rows: [
          {
            type: "lead",
            id: 123,
            title: "123 Main St",
            subtitle: "Test City, TS",
            path: "/leads?leadId=123",
            rank: 1,
          },
        ],
      };
    });

    app = express();
    app.use(express.json());
    app.use(session({ secret: "test", resave: false, saveUninitialized: false }));
    app.use((req: any, _res, next) => {
      req.session.userId = 1;
      next();
    });
    await registerRoutes(app);
  });

  afterAll(() => {
    (db as any).execute = originalExecute;
  });

  it("includes leadId in lead result path", async () => {
    const res = await request(app).get("/api/search?q=ma&limit=10");
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.results)).toBe(true);
    const lead = res.body.results.find((r: any) => r.type === "lead");
    expect(lead?.path).toContain("leadId=123");
  });
});

