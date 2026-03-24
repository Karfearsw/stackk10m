import { describe, expect, it, vi } from "vitest";
import request from "supertest";

describe("schema gate auth bypass", () => {
  it("does not gate /api/auth/* even when schema readiness fails", async () => {
    const prevSession = process.env.SESSION_SECRET;
    process.env.SESSION_SECRET = "test";

    vi.resetModules();

    vi.doMock("../server/db.js", () => ({
      pool: { query: vi.fn() },
      databaseUrl: () => undefined,
    }));

    const getSchemaReadiness = vi.fn(async () => ({
      ok: false as const,
      checkedAt: new Date().toISOString(),
      kind: "schema_missing" as const,
      message: "Database schema is not ready",
      code: null,
      missing: ["table:dialer_scripts"],
    }));

    vi.doMock("../server/schema-readiness.js", () => ({
      getSchemaReadiness,
      schemaFixInstructions: () => ({ applyMigrations: "npm run migrate" }),
    }));

    const mod = await import("../server/app");
    const app = mod.app;

    app.post("/api/auth/login", (_req, res) => {
      res.status(200).json({ ok: true });
    });
    app.get("/api/needs-schema", (_req, res) => {
      res.status(200).json({ ok: true });
    });

    const authRes = await request(app).post("/api/auth/login").send({ email: "x", password: "y" });
    expect(authRes.status).toBe(200);

    const gatedRes = await request(app).get("/api/needs-schema");
    expect(gatedRes.status).toBe(503);

    expect(getSchemaReadiness).toHaveBeenCalledTimes(1);

    process.env.SESSION_SECRET = prevSession;
  }, 20000);
});
