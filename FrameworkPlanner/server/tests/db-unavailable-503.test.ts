import request from "supertest";
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";

const ORIGINAL_ENV = { ...process.env };
for (const k of [
  "DATABASE_URL",
  "POSTGRES_URL_NON_POOLING",
  "POSTGRES_PRISMA_URL",
  "POSTGRES_URL",
  "VERCEL",
  "VERCEL_ENV",
  "DB_STARTUP_TEST",
  "DB_POOL_MAX",
  "DB_POOL_IDLE_TIMEOUT_MS",
  "DB_POOL_CONN_TIMEOUT_MS",
  "DB_CONNECTION_TIMEOUT_MS",
  "DB_STATEMENT_TIMEOUT_MS",
  "DB_IDLE_IN_TX_TIMEOUT_MS",
  "DB_SLOW_QUERY_MS",
  "DB_QUERY_TIMING",
  "DB_RETRY_SELECTS",
  "DB_SSL_REJECT_UNAUTHORIZED",
  "DB_APPLICATION_NAME",
]) {
  delete (ORIGINAL_ENV as any)[k];
}

function restoreEnv() {
  for (const k of Object.keys(process.env)) delete (process.env as any)[k];
  Object.assign(process.env, ORIGINAL_ENV);
}

beforeEach(() => {
  restoreEnv();
  vi.resetModules();
  vi.unmock("../db.js");
});

afterEach(() => {
  restoreEnv();
  vi.unmock("../db.js");
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
    process.env.DATABASE_URL = "postgresql://user:pass@example.invalid:5432/db?sslmode=require";

    const server = await buildTestServer();
    const res = await request(server).get("/api/auth/me");
    if (server.listening) await new Promise<void>((resolve) => server.close(() => resolve()));

    expect(res.status).toBe(503);
    expect(res.body?.kind).toBe("db_unavailable");
  }, 15000);

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
    process.env.DATABASE_URL = "";
    process.env.POSTGRES_PRISMA_URL = "";
    process.env.POSTGRES_URL = "";
    process.env.POSTGRES_URL_NON_POOLING = "postgresql://user:pass@localhost:5432/db?sslmode=require";

    const { databaseUrlResolution } = await import("../db.js");
    const resolved = databaseUrlResolution();
    expect(resolved.source).toBe("POSTGRES_URL_NON_POOLING");
    expect(typeof resolved.url).toBe("string");
  });
});
