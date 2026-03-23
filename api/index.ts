import { app } from "../FrameworkPlanner/server/app.js";
import { registerRoutes } from "../FrameworkPlanner/server/routes.js";

// Vercel Serverless Function Entry Point
// This wrapper ensures routes are registered before handling requests

let routesRegistered = false;

export default async function handler(req: any, res: any) {
  if (!routesRegistered) {
    // Ensure routes are registered (await any async setup)
    await registerRoutes(app, { mode: "serverless" });
    routesRegistered = true;
  }
  
  // Delegate to Express app
  app(req, res);
}
