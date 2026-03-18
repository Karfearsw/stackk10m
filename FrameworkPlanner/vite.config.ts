import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";
import * as fs from "node:fs";
import runtimeErrorOverlay from "@replit/vite-plugin-runtime-error-modal";
import { metaImagesPlugin } from "./vite-plugin-meta-images";

function luxeLogoPlugin() {
  const logoFilePath = path.resolve(import.meta.dirname, "..", ".vercel", "luxe-logo.png");
  const routes = [
    "/luxe-logo.png",
    "/favicon.png",
    "/apple-touch-icon.png",
    "/icon-192.png",
    "/icon-512.png",
  ];
  return {
    name: "luxe-logo",
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const pathname = (req.url || "").split("?")[0];
        if (!routes.includes(pathname)) return next();
        if (!fs.existsSync(logoFilePath)) return next();
        res.setHeader("Content-Type", "image/png");
        fs.createReadStream(logoFilePath).pipe(res);
      });
    },
    generateBundle() {
      if (!fs.existsSync(logoFilePath)) return;
      const source = fs.readFileSync(logoFilePath);
      for (const route of routes) {
        this.emitFile({
          type: "asset",
          fileName: route.slice(1),
          source,
        });
      }
    },
  };
}

export default defineConfig({
  plugins: [
    react(),
    runtimeErrorOverlay(),
    tailwindcss(),
    metaImagesPlugin(),
    luxeLogoPlugin(),
    ...(process.env.NODE_ENV !== "production" &&
    process.env.REPL_ID !== undefined
      ? [
          await import("@replit/vite-plugin-cartographer").then((m) =>
            m.cartographer(),
          ),
          await import("@replit/vite-plugin-dev-banner").then((m) =>
            m.devBanner(),
          ),
        ]
      : []),
  ],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "client", "src"),
      "@shared": path.resolve(import.meta.dirname, "shared"),
      "@assets": path.resolve(import.meta.dirname, "attached_assets"),
    },
  },
  css: {
    postcss: {
      plugins: [],
    },
  },
  root: path.resolve(import.meta.dirname, "client"),
  build: {
    outDir: path.resolve(import.meta.dirname, "dist"),
    emptyOutDir: true,
  },
  server: {
    port: 3000,
    host: "0.0.0.0",
    allowedHosts: true,
    fs: {
      strict: true,
      deny: ["**/.*"],
    },
  },
});
