import { app } from "../server/app.js";
import { registerRoutes } from "../server/routes.js";

// Vercel Serverless Function Entry Point
// This wrapper ensures routes are registered before handling requests

let routesRegistered = false;

export default async function handler(req: any, res: any) {
  if (!routesRegistered) {
    // Ensure routes are registered (await any async setup)
    await registerRoutes(app);
    routesRegistered = true;
  }
  
  // Delegate to Express app
  app(req, res);
}
