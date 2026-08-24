import "./load-env.js";

import { app, installErrorHandling } from "./app.js";
import { registerRoutes } from "./routes.js";

// Register API routes on the Express app
registerRoutes(app, { mode: "serverless" });
installErrorHandling(app);

// Run migrations once on cold start (safe for Vercel serverless).
// This replaces build-time migration which fails because Neon WebSocket
// is not available on Vercel build machines.
let migrationsAttempted = false;
async function runMigrationsOnce() {
  if (migrationsAttempted) return;
  migrationsAttempted = true;
  try {
    const { applyMigrations } = await import("./scripts/apply-migrations.js");
    await applyMigrations();
    console.log("[vercel] Migrations applied on cold start.");
  } catch (e: any) {
    console.warn("[vercel] Migration on cold start failed:", e?.message || e);
    console.warn("[vercel] The app will still work; run POST /api/admin/migrate to retry.");
  }
}

// Trigger migration on first request (non-blocking)
app.use((_req, _res, next) => {
  runMigrationsOnce().catch(() => {});
  next();
});

// Export the Express app as a Vercel Serverless Function
export default app;
