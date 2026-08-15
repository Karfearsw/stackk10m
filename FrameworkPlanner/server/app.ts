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
import { getDatabaseUrlMissing, getSessionSecretMissing } from "./auth/config.js";
import { getRequestIdFromRes, sendAuthError } from "./auth/errors.js";

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

app.use((req, res, next) => {
  const requestId = (req.headers["x-request-id"] as string) || crypto.randomUUID();
  (res.locals as any).requestId = requestId;
  res.setHeader("x-request-id", requestId);
  next();
});

if (!sessionSecret) {
  app.use("/api", (_req, res) => {
    const missing = getSessionSecretMissing();
    return sendAuthError(res, 503, { code: "session_secret_missing", message: "Server authentication is not configured", missing: missing.length ? missing : undefined });
  });
  app.use((_req, _res, next) => {
    next(new Error("SESSION_SECRET is required"));
  });
} else if (process.env.NODE_ENV === "production" && !hasDatabaseUrl) {
  app.use("/api", (_req, res) => {
    const missing = getDatabaseUrlMissing();
    res.status(503).json({
      message: "Server database is not configured",
      kind: "db_unavailable",
      missing,
      code: "db_not_configured",
      requestId: getRequestIdFromRes(res),
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
        const requestId = getRequestIdFromRes(res);
        const code = r.kind === "db_unavailable" ? "db_unavailable" : "schema_not_ready";
        res.status(503).json({
          message: r.message,
          kind: r.kind,
          missing: r.missing,
          code,
          requestId,
          howToFix: schemaFixInstructions(),
        });
      })
      .catch(next);
  });

  const store = hasDatabaseUrl
    ? new PgSession({
        pool: pool as any,
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
          process.env.NODE_ENV === "production" && String(process.env.COOKIE_DOMAIN || "").trim()
            ? String(process.env.COOKIE_DOMAIN).trim()
            : undefined,
        secure: process.env.NODE_ENV === "production",
        httpOnly: true,
        maxAge: 1000 * 60 * 60 * 24 * 7,
        sameSite: "lax",
      },
    }),
  );

  if (process.env.DEBUG_ENDPOINTS === "1") {
    app.get("/api/debug/config", (_req: Request, res: Response) => {
      const cookieDomain =
        process.env.NODE_ENV === "production" && String(process.env.COOKIE_DOMAIN || "").trim()
          ? String(process.env.COOKIE_DOMAIN).trim()
          : null;
      res.json({
        hasSessionSecret: Boolean(sessionSecret && String(sessionSecret).trim()),
        hasDatabaseUrl,
        hasEmployeeAccessCode: Boolean(
          process.env.EMPLOYEE_ACCESS_CODE && String(process.env.EMPLOYEE_ACCESS_CODE).trim(),
        ),
        cookieDomain,
        env: process.env.NODE_ENV || "development",
      });
    });
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
  const requestId =
    (res.locals as any).requestId ||
    (req.headers["x-request-id"] as string) ||
    crypto.randomUUID();
  (res.locals as any).requestId = requestId;
  if (!res.getHeader("x-request-id")) res.setHeader("x-request-id", requestId);
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
import { startSkipTraceWorker } from "./cron/skip-trace-worker.js";

export default async function runApp(
  setup: (app: Express, server: Server) => Promise<void>,
) {
  // Ensure required telephony and CRM columns exist in preview/prod even if a migration lags.
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
    await pool.query(`
      ALTER TABLE call_logs
        ADD COLUMN IF NOT EXISTS lead_id INTEGER,
        ADD COLUMN IF NOT EXISTS note TEXT,
        ADD COLUMN IF NOT EXISTS disposition VARCHAR(64),
        ADD COLUMN IF NOT EXISTS follow_up_at TIMESTAMP,
        ADD COLUMN IF NOT EXISTS provider VARCHAR(32),
        ADD COLUMN IF NOT EXISTS provider_call_id VARCHAR(128),
        ADD COLUMN IF NOT EXISTS provider_leg_id VARCHAR(128),
        ADD COLUMN IF NOT EXISTS provider_status VARCHAR(64);
    `);
    log("[Startup] Verified call_logs table", "db");
  } catch (e) {
    console.error("Failed to ensure call_logs table:", e);
  }

  try {
    await pool.query(`
      ALTER TABLE buyers
        ADD COLUMN IF NOT EXISTS zip_codes TEXT[],
        ADD COLUMN IF NOT EXISTS min_price NUMERIC,
        ADD COLUMN IF NOT EXISTS max_price NUMERIC,
        ADD COLUMN IF NOT EXISTS min_beds INTEGER,
        ADD COLUMN IF NOT EXISTS max_beds INTEGER,
        ADD COLUMN IF NOT EXISTS property_types TEXT[],
        ADD COLUMN IF NOT EXISTS dedupe_key VARCHAR(400);
    `);
    log("[Startup] Verified buyers columns", "db");
  } catch (e) {
    console.error("Failed to ensure buyers columns:", e);
  }

  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS contract_templates (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        description TEXT,
        category VARCHAR(100),
        content TEXT NOT NULL,
        merge_fields TEXT[],
        is_active BOOLEAN DEFAULT TRUE,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS contract_documents (
        id SERIAL PRIMARY KEY,
        template_id INTEGER,
        property_id INTEGER,
        title VARCHAR(255) NOT NULL,
        document_type VARCHAR(50) DEFAULT 'contract',
        status VARCHAR(50) DEFAULT 'draft',
        content TEXT NOT NULL,
        merge_data TEXT,
        pdf_url VARCHAR(500),
        version INTEGER DEFAULT 1,
        created_by VARCHAR(255),
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS document_versions (
        id SERIAL PRIMARY KEY,
        document_id INTEGER NOT NULL,
        version_number INTEGER NOT NULL,
        content TEXT NOT NULL,
        changes TEXT,
        created_by VARCHAR(255),
        created_at TIMESTAMP DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS contract_envelopes (
        id SERIAL PRIMARY KEY,
        document_id INTEGER NOT NULL,
        status VARCHAR(20) NOT NULL DEFAULT 'draft',
        signer_name VARCHAR(255),
        signer_email VARCHAR(255),
        token_hash VARCHAR(64) NOT NULL,
        expires_at TIMESTAMP,
        sent_at TIMESTAMP,
        viewed_at TIMESTAMP,
        signed_at TIMESTAMP,
        declined_at TIMESTAMP,
        signature_type VARCHAR(20),
        signature_text VARCHAR(255),
        signature_image_base64 TEXT,
        audit_json TEXT NOT NULL DEFAULT '[]',
        signed_pdf_base64 TEXT,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS lois (
        id SERIAL PRIMARY KEY,
        property_id INTEGER NOT NULL,
        buyer_name VARCHAR(255) NOT NULL,
        seller_name VARCHAR(255) NOT NULL,
        offer_amount NUMERIC(12, 2) NOT NULL,
        earnest_money NUMERIC(12, 2),
        closing_date TIMESTAMP,
        contingencies TEXT[],
        special_terms TEXT,
        status VARCHAR(50) DEFAULT 'draft',
        sent_date TIMESTAMP,
        response_date TIMESTAMP,
        content TEXT,
        pdf_url VARCHAR(500),
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      );
    `);
    log("[Startup] Verified contract and LOI tables", "db");
  } catch (e) {
    console.error("Failed to ensure contract/LOI tables:", e);
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
    startSkipTraceWorker(15000);
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
