import request from "supertest";
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";

const ORIGINAL_ENV = { ...process.env };

function restoreEnv() {
  for (const k of Object.keys(process.env)) delete (process.env as any)[k];
  Object.assign(process.env, ORIGINAL_ENV);
}

beforeEach(() => {
  restoreEnv();
  vi.resetModules();
});

afterEach(() => {
  restoreEnv();
});

async function buildTestServer() {
  const { app } = await import("../app.js");
  const { registerRoutes } = await import("../routes.js");
  return await registerRoutes(app);
}

describe("DB unavailable handling", () => {
  it("returns 503 (not 500) when Postgres host cannot be resolved", async () => {
    process.env.VERCEL = "1";
    process.env.DB_STARTUP_TEST = "0";
    process.env.NODE_ENV = "production";
    process.env.SESSION_SECRET = "test-secret";
    process.env.EMPLOYEE_ACCESS_CODE = "1234";
    process.env.DATABASE_URL = "postgresql://user:pass@base:5432/db?sslmode=require";

    const server = await buildTestServer();
    const res = await request(server).get("/api/auth/me");
    if (server.listening) await new Promise<void>((resolve) => server.close(() => resolve()));

    expect(res.status).toBe(503);
    expect(res.body?.kind).toBe("db_unavailable");
  });

  it("returns 503 with missing env hints when DATABASE_URL is invalid", async () => {
    process.env.VERCEL = "1";
    process.env.DB_STARTUP_TEST = "0";
    process.env.NODE_ENV = "production";
    process.env.SESSION_SECRET = "test-secret";
    process.env.EMPLOYEE_ACCESS_CODE = "1234";
    process.env.DATABASE_URL = "base";

    const server = await buildTestServer();
    const res = await request(server).get("/api/auth/me");
    if (server.listening) await new Promise<void>((resolve) => server.close(() => resolve()));

    expect(res.status).toBe(503);
    expect(res.body?.kind).toBe("db_unavailable");
    expect(Array.isArray(res.body?.missing) ? res.body.missing : []).toContain("env:DATABASE_URL");
  });

  it("resolves DB URL from POSTGRES_URL_NON_POOLING when DATABASE_URL missing", async () => {
    process.env.VERCEL = "1";
    process.env.DB_STARTUP_TEST = "0";
    process.env.NODE_ENV = "production";
    delete process.env.DATABASE_URL;
    process.env.POSTGRES_URL_NON_POOLING = "postgresql://user:pass@localhost:5432/db?sslmode=require";

    const { databaseUrlResolution } = await import("../db.js");
    const resolved = databaseUrlResolution();
    expect(resolved.source).toBe("POSTGRES_URL_NON_POOLING");
    expect(typeof resolved.url).toBe("string");
  });
});

