import "./load-env.js";

import { app, installErrorHandling } from "./app.js";
import { registerRoutes } from "./routes.js";

// Register API routes on the Express app
registerRoutes(app, { mode: "serverless" });

// Investor portal (Phase 2) — same module as the server entrypoint; the
// routes are individually gated by INVESTOR_PORTAL_ENABLED (default off).
// Awaited before the error handler so portal errors are handled consistently.
import { registerInvestorRoutes } from "./investor/router.js";
await registerInvestorRoutes(app);

installErrorHandling(app);

// Export the Express app as a Vercel Serverless Function
export default app;