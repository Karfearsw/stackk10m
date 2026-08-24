// Vercel Serverless Function Entry Point (ESM)
// Vercel injects env vars (DATABASE_URL, SESSION_SECRET, etc.) directly.
// Do NOT import load-env.js — it uses import.meta.dirname.

import { app } from "../server/app.js";
import { registerRoutes } from "../server/routes.js";
import { installErrorHandling } from "../server/app.js";

let ready = false;

export default async function handler(req, res) {
  if (!ready) {
    try {
      await registerRoutes(app, { mode: "serverless" });
      installErrorHandling(app);
      ready = true;
    } catch (err) {
      console.error("[api/index] Init failed:", err?.message || err);
      if (!res.headersSent) {
        res.status(500).json({ message: "Server init failed" });
      }
      return;
    }
  }
  app(req, res);
}
