import "../server/load-env.js";

// Vercel Serverless Function Entry Point
// load-env.js must run first to ensure DATABASE_URL and SESSION_SECRET
// are available before any module-level DB pool creation.

import { app, installErrorHandling } from "../server/app.js";
import { registerRoutes } from "../server/routes.js";

let ready = false;

export default async function handler(req: any, res: any) {
  if (!ready) {
    try {
      await registerRoutes(app, { mode: "serverless" });
      installErrorHandling(app);
      ready = true;
    } catch (err: any) {
      console.error("[api/index] Failed to initialize:", err?.message || err);
      if (!res.headersSent) {
        res.status(500).json({ message: "Server initialization failed", detail: String(err?.message || err) });
      }
      return;
    }
  }
  app(req, res);
}
