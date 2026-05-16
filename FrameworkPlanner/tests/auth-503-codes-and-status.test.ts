import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import request from "supertest";
import express from "express";
import session from "express-session";

const ORIGINAL_ENV = { ...process.env };

function restoreEnv() {
  for (const k of Object.keys(process.env)) delete (process.env as any)[k];
  Object.assign(process.env, ORIGINAL_ENV);
}

describe("Auth 503 stable codes", () => {
  beforeEach(() => {
    restoreEnv();
  });

  afterEach(() => {
    restoreEnv();
    vi.resetModules();
    vi.clearAllMocks();
  });

  it("returns code=signup_not_configured for POST /api/auth/signup 503", async () => {
    process.env.DB_STARTUP_TEST = "0";
    delete process.env.EMPLOYEE_ACCESS_CODE;
    delete process.env.ADMIN_ROLE_CODE;
    delete process.env.TEAM_LEADER_ROLE_CODE;
    delete process.env.AGENT_ROLE_CODE;
    delete process.env.VA_ROLE_CODE;

    vi.resetModules();
    const { registerRoutes } = await import("../server/routes");

    const app = express();
    app.use(express.json());
    app.use(session({ secret: "test", resave: false, saveUninitialized: false }));
    await registerRoutes(app);

    const res = await request(app).post("/api/auth/signup").send({
      firstName: "New",
      lastName: "User",
      email: "new@oceanluxe.org",
      password: "password123",
      roleCode: "agent-code",
      teamCode: "team-123",
    });

    expect(res.status).toBe(503);
    expect(res.body?.code).toBe("signup_not_configured");
  });

  it("returns code=db_unavailable for POST /api/auth/login 503", async () => {
    process.env.DB_STARTUP_TEST = "0";

    vi.resetModules();
    const { registerRoutes } = await import("../server/routes");
    const { storage } = await import("../server/storage");

    storage.getUserByEmail = async () => {
      const err: any = new AggregateError([], "connect ECONNREFUSED");
      err.code = "ECONNREFUSED";
      throw err;
    };

    const app = express();
    app.use(express.json());
    app.use(session({ secret: "test", resave: false, saveUninitialized: false }));
    await registerRoutes(app);

    const res = await request(app).post("/api/auth/login").send({
      email: "x@example.com",
      password: "password123",
    });

    expect(res.status).toBe(503);
    expect(res.body?.code).toBe("db_unavailable");
  });

  it("returns code=email_not_configured for POST /api/auth/password-reset/request 503", async () => {
    process.env.DB_STARTUP_TEST = "0";
    process.env.NODE_ENV = "production";
    delete process.env.RESEND_API_KEY;
    delete process.env.RESEND_FROM;

    vi.resetModules();
    const { registerRoutes } = await import("../server/routes");

    const app = express();
    app.use(express.json());
    app.use(session({ secret: "test", resave: false, saveUninitialized: false }));
    await registerRoutes(app);

    const res = await request(app).post("/api/auth/password-reset/request").send({
      email: "new@oceanluxe.org",
    });

    expect(res.status).toBe(503);
    expect(res.body?.code).toBe("email_not_configured");
  });

  it("returns code=email_not_configured for POST /api/auth/magic-link/request 503", async () => {
    process.env.DB_STARTUP_TEST = "0";
    process.env.NODE_ENV = "production";
    delete process.env.RESEND_API_KEY;
    delete process.env.RESEND_FROM;

    vi.resetModules();
    const { registerRoutes } = await import("../server/routes");

    const app = express();
    app.use(express.json());
    app.use(session({ secret: "test", resave: false, saveUninitialized: false }));
    await registerRoutes(app);

    const res = await request(app).post("/api/auth/magic-link/request").send({
      email: "new@oceanluxe.org",
    });

    expect(res.status).toBe(503);
    expect(res.body?.code).toBe("email_not_configured");
  });
});

describe("/api/auth/status production snapshot", () => {
  beforeEach(() => {
    restoreEnv();
  });

  afterEach(() => {
    restoreEnv();
    vi.resetModules();
    vi.clearAllMocks();
  });

  it("returns ok=false and missing[] when required env is not configured in production", async () => {
    process.env.NODE_ENV = "production";

    delete process.env.SESSION_SECRET;
    delete process.env.DATABASE_URL;
    delete process.env.POSTGRES_URL_NON_POOLING;
    delete process.env.POSTGRES_PRISMA_URL;
    delete process.env.POSTGRES_URL;
    delete process.env.EMPLOYEE_ACCESS_CODE;
    delete process.env.ADMIN_ROLE_CODE;
    delete process.env.TEAM_LEADER_ROLE_CODE;
    delete process.env.AGENT_ROLE_CODE;
    delete process.env.VA_ROLE_CODE;
    delete process.env.RESEND_API_KEY;
    delete process.env.RESEND_FROM;
    delete process.env.ORG_EMAIL_DOMAIN;

    vi.resetModules();
    vi.doMock("../server/db.js", () => ({
      databaseUrlResolution: () => ({ url: process.env.DATABASE_URL }),
    }));
    const { getAuthStatusSnapshot } = await import("../server/auth/config");

    const app = express();
    app.get("/api/auth/status", (_req, res) => {
      res.json(getAuthStatusSnapshot());
    });

    const res = await request(app).get("/api/auth/status");
    expect(res.status).toBe(200);
    expect(res.body?.ok).toBe(false);
    expect(res.body?.nodeEnv).toBe("production");
    expect(res.body?.missing).toEqual(expect.any(Array));
    expect(res.body?.missing).toEqual(
      expect.arrayContaining([
        "env:SESSION_SECRET",
        "env:DATABASE_URL",
        "env:POSTGRES_URL_NON_POOLING",
        "env:POSTGRES_PRISMA_URL",
        "env:POSTGRES_URL",
        "env:RESEND_API_KEY",
        "env:RESEND_FROM",
        "env:ORG_EMAIL_DOMAIN",
      ]),
    );
  });

  it("returns ok=true and missing=[] when required env is configured in production", async () => {
    process.env.NODE_ENV = "production";
    process.env.SESSION_SECRET = "test";
    process.env.DATABASE_URL = "postgres://example.local/test";
    process.env.EMPLOYEE_ACCESS_CODE = "employee";
    process.env.RESEND_API_KEY = "rk_test";
    process.env.RESEND_FROM = "Ocean Luxe <noreply@oceanluxe.org>";
    process.env.ORG_EMAIL_DOMAIN = "oceanluxe.org";

    vi.resetModules();
    vi.doMock("../server/db.js", () => ({
      databaseUrlResolution: () => ({ url: process.env.DATABASE_URL }),
    }));
    const { getAuthStatusSnapshot } = await import("../server/auth/config");

    const app = express();
    app.get("/api/auth/status", (_req, res) => {
      res.json(getAuthStatusSnapshot());
    });

    const res = await request(app).get("/api/auth/status");
    expect(res.status).toBe(200);
    expect(res.body?.ok).toBe(true);
    expect(res.body?.nodeEnv).toBe("production");
    expect(res.body?.missing).toEqual([]);
  });
});
