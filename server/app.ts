import { type Server } from "node:http";

import express, { type Express, type Request, Response, NextFunction } from "express";
import session from "express-session";
import connectPgSimple from "connect-pg-simple";
import helmet from "helmet";
import { db } from "./db.js";
import { registerRoutes } from "./routes.js";
import { initSentry, Sentry } from "./sentry";
import crypto from "node:crypto";
import { httpRequestsTotal, httpErrorsTotal, metricsText } from "./metrics";

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

initSentry();
// Sentry v8+ auto-instruments Express; request handler is no longer required

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
  }
}

// Require SESSION_SECRET in production
if (process.env.NODE_ENV === 'production' && !process.env.SESSION_SECRET) {
  console.error('SESSION_SECRET environment variable is required in production');
}

const sessionSecret = process.env.SESSION_SECRET || 
  (process.env.NODE_ENV === 'development' ? 'flipstackk-development-secret-DO-NOT-USE-IN-PRODUCTION' : '');

if (!sessionSecret) {
  console.error('SESSION_SECRET must be set');
}

if (process.env.NODE_ENV === 'production' && !process.env.EMPLOYEE_ACCESS_CODE) {
  console.error('EMPLOYEE_ACCESS_CODE environment variable is required in production');
}

// Use PostgreSQL-backed session store for production-ready persistence
const PgSession = connectPgSimple(session);

app.use(session({
  store: new PgSession({
    conObject: {
      connectionString: process.env.DATABASE_URL,
    },
    tableName: 'session',
    createTableIfMissing: true,
  }),
  secret: sessionSecret,
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: process.env.NODE_ENV === 'production',
    httpOnly: true,
    maxAge: 1000 * 60 * 60 * 24 * 7, // 7 days
    sameSite: 'lax',
  }
}));

app.use(express.json({
  verify: (req, _res, buf) => {
    req.rawBody = buf;
  }
}));
app.use(express.urlencoded({ extended: false }));

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  const requestId = (req.headers["x-request-id"] as string) || crypto.randomUUID();
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

export default async function runApp(
  setup: (app: Express, server: Server) => Promise<void>,
) {
  const server = await registerRoutes(app);

  app.get("/api/metrics", async (_req, res) => {
    const text = await metricsText();
    res.setHeader("Content-Type", "text/plain");
    res.send(text);
  });

  if (process.env.SENTRY_DSN) {
    Sentry.setupExpressErrorHandler(app);
  }
  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";

    // Log the error for debugging
    console.error(err);

    res.status(status).json({ message });
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
