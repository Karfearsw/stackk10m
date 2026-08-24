import fs from "node:fs";
import path from "node:path";
import dotenv from "dotenv";

// On Vercel, env vars are injected by the platform — skip .env loading.
// Locally, use process.cwd() to find .env files (avoids import.meta).
const isVercel = Boolean(process.env.VERCEL || process.env.VERCEL_ENV);
if (!isVercel) {
  // When running from FrameworkPlanner/, cwd already is the project root.
  // When running from the repo root, need to append FrameworkPlanner/.
  const cwd = process.cwd();
  const rootHasDotEnv = fs.existsSync(path.join(cwd, ".env"));
  const frameworkRoot = rootHasDotEnv ? cwd : path.resolve(cwd, "FrameworkPlanner");
  const baseFile = path.join(frameworkRoot, ".env");
  if (fs.existsSync(baseFile)) {
    dotenv.config({ path: baseFile, override: true });
  }
  const localFile = path.join(frameworkRoot, ".env.local");
  if (fs.existsSync(localFile)) {
    dotenv.config({ path: localFile, override: true });
  }
}
