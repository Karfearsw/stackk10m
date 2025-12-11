import fs from "node:fs";
import { type Server } from "node:http";
import path from "node:path";
import "dotenv/config";

import express, { type Express, type Request } from "express";

import runApp from "./app.js";

export async function serveStatic(app: Express, server: Server) {
  // When built, this file is in dist-server/index.js
  // The client build is in dist/ (relative to project root)
  // So we go up one level from dist-server to find dist
  const distPath = path.resolve(import.meta.dirname, "..", "dist");

  if (!fs.existsSync(distPath)) {
    throw new Error(
      `Could not find the build directory: ${distPath}, make sure to build the client first`,
    );
  }

  app.use(express.static(distPath));

  // fall through to index.html if the file doesn't exist
  app.use("*", (_req, res) => {
    res.sendFile(path.resolve(distPath, "index.html"));
  });
}

(async () => {
  await runApp(serveStatic);
})();
