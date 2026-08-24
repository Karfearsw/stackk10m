import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";

// On Vercel, env vars are injected by the platform — no .env files to load.
// Also handles the case where import.meta.dirname is unavailable (CJS bundling).
const isVercel = Boolean(process.env.VERCEL || process.env.VERCEL_ENV);
if (!isVercel) {
  try {
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = path.dirname(__filename);
    const frameworkRoot = path.resolve(__dirname, "..");

    // Load .env first (base defaults), then .env.local (local overrides).
    const baseFile = path.join(frameworkRoot, ".env");
    if (fs.existsSync(baseFile)) {
      dotenv.config({ path: baseFile, override: true });
    }
    const localFile = path.join(frameworkRoot, ".env.local");
    if (fs.existsSync(localFile)) {
      dotenv.config({ path: localFile, override: true });
    }
  } catch {
    // import.meta not available (CJS context) — skip .env loading
  }
}
