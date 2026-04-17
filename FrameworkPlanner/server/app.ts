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
  contentSecurityPolicy: false, // Disabled for simplicity with Vite dev server scripts
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
    activeTeamId?: number;
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

if (process.env.NODE_ENV === 'production' && !process.env.EMPLOYEE_ACCESS_CODE) {
  console.error('EMPLOYEE_ACCESS_CODE environment variable is required in production');
}

// Use PostgreSQL-backed session store for production-ready persistence
const PgSession = connectPgSimple(session);

export function installErrorHandling(target: Express) {
  if (process.env.SENTRY_DSN) {
    Sentry.setupExpressErrorHandler(target);
  }
  target.use((err: any, req: Request, res: Response, _next: NextFunction) => {
    const rawMessage = String(err?.message || "Internal Server Error");
    const quotaExceeded = /exceeded the .*quota/i.test(rawMessage) || String(err?.code || "") === "XX000";
    const status = quotaExceeded ? 503 : err.status || err.statusCode || 500;
    const message = quotaExceeded ? "Database is over quota" : rawMessage;
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
      process.env.NODE_ENV === "production" && status >= 500 && !quotaExceeded
        ? "Internal Server Error"
        : message;
    const payload: any = { message: clientMessage, requestId };
    if (quotaExceeded) payload.code = "DB_QUOTA_EXCEEDED";
    res.status(status).json(payload);
  });
}

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
        createTableIfMissing: false,
        disableTouch: true,
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
        domain:
          process.env.NODE_ENV === "production"
            ? String(process.env.COOKIE_DOMAIN || ".oceanluxe.org").trim() || ".oceanluxe.org"
            : undefined,
        secure: process.env.NODE_ENV === "production",
        httpOnly: true,
        maxAge: 1000 * 60 * 60 * 24 * 7,
        sameSite: "lax",
      },
    }),
  );

  if (process.env.DEBUG_ENDPOINTS === "1") {
    app.get("/api/debug/session", (req: Request, res: Response) => {
      const cookieHeader = String(req.headers.cookie || "");
      res.json({
        host: req.hostname,
        path: req.path,
        cookieHeaderPresent: Boolean(cookieHeader),
        sessionID: (req as any).sessionID || null,
        hasSession: Boolean((req as any).session),
        sessionKeys: (req as any).session ? Object.keys((req as any).session) : [],
      });
    });
  }
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

  installErrorHandling(app);

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
