import { type Server } from "node:http";

import express, { type Express, type Request, Response, NextFunction } from "express";
import session from "express-session";
import connectPgSimple from "connect-pg-simple";
import helmet from "helmet";
import { pool, databaseUrl } from "./db.js";
import { registerRoutes } from "./routes.js";
import { initSentry, Sentry } from "./sentry.js";
import crypto from "node:crypto";
import { httpRequestsTotal, httpErrorsTotal, metricsText } from "./metrics.js";
import { getSchemaReadiness, schemaFixInstructions } from "./schema-readiness.js";

export function log(message: string, source = "express") {
  const formattedTime = new Date().toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });

  console.log(`${formattedTime} [${source}] ${message}`);
}

export const app = express();

log(`[Startup] Server initializing... (Commit: 90e785a)`);

initSentry();
// Sentry v8+ auto-instruments Express; request handler is no longer required

app.disable("x-powered-by");

if (!(globalThis as any).__stackk_process_handlers_installed) {
  (globalThis as any).__stackk_process_handlers_installed = true;
  process.on("unhandledRejection", (reason: any) => {
    console.error(JSON.stringify({ ts: new Date().toISOString(), event: "process", kind: "unhandledRejection", message: String(reason?.message || reason) }));
  });
  process.on("uncaughtException", (err: any) => {
    console.error(JSON.stringify({ ts: new Date().toISOString(), event: "process", kind: "uncaughtException", message: String(err?.message || err), code: err?.code ? String(err.code) : null }));
  });
}

app.use(helmet({
  contentSecurityPolicy: process.env.NODE_ENV === "production" ? {
    directives: {
      defaultSrc: ["'self'"],
      baseUri: ["'self'"],
      objectSrc: ["'none'"],
      frameAncestors: ["'none'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", "data:", "https:"],
      fontSrc: ["'self'", "data:"],
      connectSrc: ["'self'", "https:"],
      mediaSrc: ["'self'", "https:", "data:", "blob:"],
    },
  } : false,
}));

declare module 'http' {
  interface IncomingMessage {
    rawBody: unknown
  }
}

declare module 'express-session' {
  interface SessionData {
    userId?: number;
    email?: string;
  }
}

// Require SESSION_SECRET in production
if (process.env.NODE_ENV === 'production' && !process.env.SESSION_SECRET) {
  console.error('SESSION_SECRET environment variable is required in production');
}

const sessionSecret = process.env.SESSION_SECRET || 
  (process.env.NODE_ENV === 'development' ? 'luxe-rm-development-secret-DO-NOT-USE-IN-PRODUCTION' : '');

if (!sessionSecret) {
  console.error('SESSION_SECRET must be set');
}

if (process.env.NODE_ENV === "production") {
  const legacyEmployeeCode = String(process.env.EMPLOYEE_ACCESS_CODE || "").trim();
  const adminCode = String(process.env.ADMIN_ROLE_CODE || "").trim();
  const teamLeaderCode = String(process.env.TEAM_LEADER_ROLE_CODE || "").trim();
  const agentCode = String(process.env.AGENT_ROLE_CODE || "").trim();
  const vaCode = String(process.env.VA_ROLE_CODE || "").trim();
  const hasRoleCodes = Boolean(adminCode && teamLeaderCode && agentCode && vaCode);
  if (!legacyEmployeeCode && !hasRoleCodes) {
    console.error("Signup codes are not configured. Set EMPLOYEE_ACCESS_CODE (legacy) or all *_ROLE_CODE env vars.");
  }
}

// Use PostgreSQL-backed session store for production-ready persistence
const PgSession = connectPgSimple(session);

app.set("trust proxy", 1);

const hasDatabaseUrl = Boolean(databaseUrl() && String(databaseUrl()).trim());

app.use(express.json({
  limit: "10mb",
  verify: (req, _res, buf) => {
    req.rawBody = buf;
  }
}));
app.use(express.urlencoded({ extended: false }));

if (!sessionSecret) {
  app.use("/api", (_req, res) => {
    res.status(503).json({ message: "Server authentication is not configured" });
  });
  app.use((_req, _res, next) => {
    next(new Error("SESSION_SECRET is required"));
  });
} else if (process.env.NODE_ENV === "production" && !hasDatabaseUrl) {
  app.use("/api", (_req, res) => {
    res.status(503).json({
      message: "Server database is not configured",
      kind: "db_unavailable",
      missing: ["env:DATABASE_URL", "env:POSTGRES_URL_NON_POOLING", "env:POSTGRES_PRISMA_URL", "env:POSTGRES_URL"],
      code: null,
      howToFix: schemaFixInstructions(),
    });
  });
  app.use((_req, _res, next) => {
    next(new Error("DATABASE_URL is required in production"));
  });
} else {
  app.use("/api", (req, res, next) => {
    if (req.path === "/auth" || req.path.startsWith("/auth/")) return next();
    getSchemaReadiness()
      .then((r) => {
        if (r.ok) return next();
        res.status(503).json({
          message: r.message,
          kind: r.kind,
          missing: r.missing,
          code: r.code,
          howToFix: schemaFixInstructions(),
        });
      })
      .catch(next);
  });

  const store = hasDatabaseUrl
    ? new PgSession({
        pool,
        tableName: "session",
        createTableIfMissing: true,
      })
    : undefined;

  app.use(
    "/api",
    session({
      store,
      secret: sessionSecret,
      resave: false,
      saveUninitialized: false,
      cookie: {
        secure: process.env.NODE_ENV === "production",
        httpOnly: true,
        maxAge: 1000 * 60 * 60 * 24 * 7,
        sameSite: "lax",
      },
    }),
  );

  app.use("/api", (req, res, next) => {
    const method = String(req.method || "").toUpperCase();
    if (method === "GET" || method === "HEAD" || method === "OPTIONS") return next();

    const path = String(req.path || "");
    if (path.startsWith("/telephony/") && (path.includes("/webhook") || path.startsWith("/telephony/voice/") || path.startsWith("/telephony/sms/"))) {
      return next();
    }

    const cookie = String(req.headers.cookie || "").trim();
    if (!cookie) return next();

    const allowedFromEnv = String(process.env.ALLOWED_ORIGINS || "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);

    const host = String(req.headers.host || "").trim();
    const allowed: string[] = [];
    if (host) {
      allowed.push(`https://${host}`);
      allowed.push(`http://${host}`);
    }
    if (process.env.NODE_ENV !== "production") {
      allowed.push("http://localhost:3000");
      allowed.push("http://127.0.0.1:3000");
    }
    for (const o of allowedFromEnv) allowed.push(o);

    const origin = String(req.headers.origin || "").trim();
    if (origin) {
      if (!allowed.includes(origin)) return res.status(403).json({ code: "csrf_origin_forbidden", message: "Forbidden" });
      return next();
    }

    const referer = String(req.headers.referer || "").trim();
    if (referer) {
      try {
        const u = new URL(referer);
        const refOrigin = `${u.protocol}//${u.host}`;
        if (!allowed.includes(refOrigin)) return res.status(403).json({ code: "csrf_origin_forbidden", message: "Forbidden" });
        return next();
      } catch {
        return res.status(403).json({ code: "csrf_origin_forbidden", message: "Forbidden" });
      }
    }

    const secFetchSite = String(req.headers["sec-fetch-site"] || "").trim().toLowerCase();
    if (secFetchSite === "same-origin" || secFetchSite === "same-site") return next();

    return res.status(403).json({ code: "csrf_origin_forbidden", message: "Forbidden" });
  });
}

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  const requestId = (req.headers["x-request-id"] as string) || crypto.randomUUID();
  (res.locals as any).requestId = requestId;
  res.setHeader("x-request-id", requestId);
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms id=${requestId}`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }

      if (logLine.length > 80) {
        logLine = logLine.slice(0, 79) + "…";
      }

      log(logLine);
      httpRequestsTotal.labels(req.method, path, String(res.statusCode)).inc();
      if (res.statusCode >= 500) {
        httpErrorsTotal.labels(path, String(res.statusCode)).inc();
      }
    }
  });

  next();
});

import { startAutomationWorker } from "./cron/lead-automation.js";
import { startCampaignScheduler } from "./cron/campaign-scheduler.js";
import { startRvmPoller } from "./cron/rvm-poller.js";
import { startTaskReminders } from "./cron/task-reminders.js";

export default async function runApp(
  setup: (app: Express, server: Server) => Promise<void>,
) {
  // Ensure required tables exist (call_logs)
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS call_logs (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL,
        direction VARCHAR(20) NOT NULL,
        number VARCHAR(20) NOT NULL,
        contact_id INTEGER,
        status VARCHAR(50) NOT NULL,
        started_at TIMESTAMP DEFAULT NOW(),
        ended_at TIMESTAMP,
        duration_ms INTEGER,
        error_code VARCHAR(50),
        error_message TEXT,
        metadata TEXT,
        created_at TIMESTAMP DEFAULT NOW()
      );
    `);
    log("[Startup] Verified call_logs table", "db");
  } catch (e) {
    console.error("Failed to ensure call_logs table:", e);
  }

  const server = await registerRoutes(app, { mode: "server" });
  if (!server) throw new Error("registerRoutes returned null in server mode");

  const isServerless = Boolean(process.env.VERCEL) || Boolean(process.env.VERCEL_ENV);

  // Start background automation worker
  const enableAutomationWorker =
    typeof process.env.ENABLE_AUTOMATION_WORKER === "string"
      ? process.env.ENABLE_AUTOMATION_WORKER.toLowerCase() === "true"
      : !isServerless && process.env.NODE_ENV !== "test" && hasDatabaseUrl;
  if (enableAutomationWorker) {
    startAutomationWorker(60000); // Run every minute
  }

  const enableCampaignScheduler = String(process.env.FEATURE_CAMPAIGNS || "").trim().toLowerCase() === "true";
  if (enableCampaignScheduler && hasDatabaseUrl) {
    startCampaignScheduler(60000);
  }

  const enableRvmWorker = String(process.env.FEATURE_RVM || "").trim().toLowerCase() === "true";
  if (enableRvmWorker && hasDatabaseUrl) {
    startRvmPoller(60000);
  }

  const taskRemindersEnv = String(process.env.TASK_REMINDERS_ENABLED || "").trim().toLowerCase();
  const enableTaskReminders =
    !isServerless &&
    process.env.NODE_ENV !== "test" &&
    taskRemindersEnv !== "0" &&
    taskRemindersEnv !== "false" &&
    taskRemindersEnv !== "no" &&
    taskRemindersEnv !== "off";
  if (enableTaskReminders && hasDatabaseUrl) {
    startTaskReminders(60000);
  }

  app.get("/api/metrics", async (_req, res) => {
    const text = await metricsText();
    res.setHeader("Content-Type", "text/plain");
    res.send(text);
  });

  if (process.env.SENTRY_DSN) {
    Sentry.setupExpressErrorHandler(app);
  }
  app.use((err: any, req: Request, res: Response, _next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";
    const requestId =
      (res.locals as any).requestId ||
      (req.headers["x-request-id"] as string) ||
      null;

    if (process.env.NODE_ENV === "production") {
      console.error(
        JSON.stringify({
          ts: new Date().toISOString(),
          event: "http_error",
          requestId,
          method: req.method,
          path: req.path,
          message: String(message),
          code: err?.code ? String(err.code) : null,
          status,
        }),
      );
    } else {
      console.error(err);
    }

    const clientMessage =
      process.env.NODE_ENV === "production" && status >= 500
        ? "Internal Server Error"
        : message;
    res.status(status).json({ message: clientMessage, requestId });
  });

  // importantly run the final setup after setting up all the other routes so
  // the catch-all route doesn't interfere with the other routes
  await setup(app, server);

  // ALWAYS serve the app on the port specified in the environment variable PORT
  // Other ports are firewalled. Default to 3000 if not specified.
  // this serves both the API and the client.
  // It is the only port that is not firewalled.
  const port = parseInt(process.env.PORT || '3000', 10);
  server.listen({
    port,
    host: "0.0.0.0",
  }, () => {
    log(`serving on port ${port}`);
  });
}
