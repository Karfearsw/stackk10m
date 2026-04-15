import fs from "node:fs";
import { type Server } from "node:http";
import path from "node:path";
import "dotenv/config";

import type { Express } from "express";
import { nanoid } from "nanoid";
import { createServer as createViteServer, createLogger } from "vite";

import runApp from "./app.js";

import viteConfig from "../vite.config";

const viteLogger = createLogger();

export async function setupVite(app: Express, server: Server) {
  const port = parseInt(process.env.PORT || "3000", 10);
  const hmrClientPort = process.env.VITE_HMR_CLIENT_PORT
    ? parseInt(String(process.env.VITE_HMR_CLIENT_PORT), 10)
    : process.env.CI === "true"
      ? 443
      : undefined;
  const hmrProtocol =
    process.env.VITE_HMR_PROTOCOL ||
    (process.env.CI === "true" ? "wss" : undefined);
  const hmrHost = process.env.VITE_HMR_HOST || undefined;

  const serverOptions = {
    middlewareMode: true,
    port,
    host: "0.0.0.0",
    hmr: {
      server,
      ...(hmrHost ? { host: hmrHost } : {}),
      ...(hmrProtocol ? { protocol: hmrProtocol } : {}),
      ...(hmrClientPort ? { clientPort: hmrClientPort } : {}),
    },
    allowedHosts: true as const,
  };

  const vite = await createViteServer({
    ...viteConfig,
    configFile: false,
    customLogger: {
      ...viteLogger,
      error: (msg, options) => {
        viteLogger.error(msg, options);
        process.exit(1);
      },
    },
    server: serverOptions,
    appType: "custom",
  });

  app.use(vite.middlewares);
  app.use("*", async (req, res, next) => {
    const url = req.originalUrl;

    try {
      const clientTemplate = path.resolve(
        import.meta.dirname,
        "..",
        "client",
        "index.html",
      );

      // always reload the index.html file from disk incase it changes
      let template = await fs.promises.readFile(clientTemplate, "utf-8");
      template = template.replace(
        `src="/src/main.tsx"`,
        `src="/src/main.tsx?v=${nanoid()}"`,
      );
      const page = await vite.transformIndexHtml(url, template);
      res.status(200).set({ "Content-Type": "text/html" }).end(page);
    } catch (e) {
      vite.ssrFixStacktrace(e as Error);
      next(e);
    }
  });
}

(async () => {
  await runApp(setupVite);
})();
