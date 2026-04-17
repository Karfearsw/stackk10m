import { describe, expect, it, vi } from "vitest";
import request from "supertest";
import express from "express";

describe("DB quota exceeded handling", () => {
  it("returns 503 with code=DB_QUOTA_EXCEEDED", async () => {
    const prevSession = process.env.SESSION_SECRET;
    const prevEnv = process.env.NODE_ENV;
    process.env.SESSION_SECRET = "test";
    process.env.NODE_ENV = "test";

    vi.resetModules();

    vi.doMock("../server/db.js", () => ({
      pool: { query: vi.fn(async () => ({})) },
      databaseUrl: () => "postgresql://user:pass@db.invalid/db?sslmode=require",
    }));

    vi.doMock("../server/schema-readiness.js", () => ({
      getSchemaReadiness: async () => ({ ok: true, checkedAt: new Date().toISOString() }),
      schemaFixInstructions: () => ({}),
    }));

    const { installErrorHandling } = await import("../server/app");
    const app = express();

    app.get("/api/_test/quota", () => {
      const err: any = new Error("Your project has exceeded the data transfer quota.");
      err.code = "XX000";
      throw err;
    });
    installErrorHandling(app);

    const res = await request(app).get("/api/_test/quota").set("x-request-id", "test-request-id");
    expect(res.status).toBe(503);
    expect(res.body?.code).toBe("DB_QUOTA_EXCEEDED");
    expect(res.body?.message).toBe("Database is over quota");
    expect(res.body?.requestId).toBe("test-request-id");

    process.env.SESSION_SECRET = prevSession;
    process.env.NODE_ENV = prevEnv;
  });
});
