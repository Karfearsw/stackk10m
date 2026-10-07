import "./load-env.js";

import { app, installErrorHandling } from "./app.js";
import { registerRoutes } from "./routes.js";

// Register API routes on the Express app
registerRoutes(app, { mode: "serverless" });
// DISPO-PHASE1 (feat/dispo-phase1): Disposition workspace routes. Mounted
// here (not inside registerRoutes in server/routes.ts) to avoid conflicts
// with the unmerged freebuff/batch0-p0 branch (PR #25); the JWT /api
// middleware registers synchronously inside registerRoutes, so it applies.
import { registerDispositionRoutes } from "./routes/dispo.js";
registerDispositionRoutes(app);
installErrorHandling(app);

// Export the Express app as a Vercel Serverless Function
export default app;