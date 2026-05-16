import { app } from "./app.js";
import { registerRoutes } from "./routes.js";
import { bootstrapAdmin } from "./bootstrap-admin.js";

// Run bootstrap on cold start (idempotent - skips if admin exists)
bootstrapAdmin().catch(console.error);

// Register API routes on the Express app
registerRoutes(app);

// Export the Express app as a Vercel Serverless Function
export default app;
