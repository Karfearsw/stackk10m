import { app } from "./app.js";
import { registerRoutes } from "./routes.js";

// Register API routes on the Express app
registerRoutes(app, { mode: "serverless" });

// Export the Express app as a Vercel Serverless Function
export default app;
