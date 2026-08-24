// Vercel Serverless Function Entry Point (ESM)
// load-env.ts is now Vercel-safe (skips import.meta on Vercel runtime)
// Vercel injects env vars directly; load-env handles local .env files.

import "../server/load-env.js";
import { app } from "../server/app.js";
import { registerRoutes } from "../server/routes.js";
import { installErrorHandling } from "../server/app.js";

let ready = false;

export default async function handler(req: any, res: any) {
  if (!ready) {
    try {
      await registerRoutes(app, { mode: "serverless" });
      installErrorHandling(app);
      ready = true;
    } catch (err: any) {
      console.error("[api/index] Init failed:", err?.message || err);
      if (!res.headersSent) {
        res.status(500).json({ message: "Server init failed", detail: String(err?.message || err) });
      }
      return;
    }
  }
  app(req, res);
}
