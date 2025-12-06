import { app } from "./app";
import { registerRoutes } from "./routes";

// Register API routes on the Express app
registerRoutes(app);

// Export the Express app as a Vercel Serverless Function
export default app;
