import fs from "node:fs";
import path from "node:path";
import dotenv from "dotenv";

const frameworkRoot = path.resolve(import.meta.dirname, "..");

// Load .env first (base defaults), then .env.local (local overrides).
const baseFile = path.join(frameworkRoot, ".env");
if (fs.existsSync(baseFile)) {
  dotenv.config({ path: baseFile, override: true });
}
const localFile = path.join(frameworkRoot, ".env.local");
if (fs.existsSync(localFile)) {
  dotenv.config({ path: localFile, override: true });
}
