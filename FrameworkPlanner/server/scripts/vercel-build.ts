import fs from "node:fs";
import { spawnSync } from "node:child_process";
import { applyMigrations } from "./apply-migrations.js";

function parseBoolEnv(name: string): boolean | null {
  const raw = String(process.env[name] ?? "").trim().toLowerCase();
  if (raw === "true" || raw === "1" || raw === "yes" || raw === "on") return true;
  if (raw === "false" || raw === "0" || raw === "no" || raw === "off") return false;
  return null;
}

function isQuotaExceededError(e: any): boolean {
  const code = String(e?.code || "");
  const msg = String(e?.message || e || "");
  return code === "XX000" || /exceeded the .*quota/i.test(msg);
}

async function run() {
  const skip = parseBoolEnv("SKIP_DB_MIGRATIONS");
  const explicit = parseBoolEnv("AUTO_APPLY_MIGRATIONS");

  // Migrations are skipped during build by default.
  // After deploy, run: POST /api/admin/migrate (admin auth required)
  // Or use a dedicated post-deploy hook.
  const shouldApply = skip === true ? false : explicit === true ? true : false;

  if (shouldApply) {
    console.log("Applying database migrations (explicitly enabled via AUTO_APPLY_MIGRATIONS=true)...");
    try {
      await applyMigrations();
    } catch (e: any) {
      if (isQuotaExceededError(e)) {
        console.error(
          "Database quota exceeded. Migrations skipped.",
          "Fix: reduce usage / wait for quota reset / upgrade Neon plan.",
        );
        process.exitCode = 1;
        return;
      }
      throw e;
    }
  } else {
    console.log(
      "Skipping DB migrations during build.",
      "After deploy, run migrations via: POST /api/admin/migrate",
      "(requires admin auth + advisory lock).",
    );
  }

  const npmCli = process.env.npm_execpath;
  if (!npmCli) {
    throw new Error("npm_execpath is not set; cannot run nested npm build");
  }


  // Bundle api/index.ts -> api/index.mjs (ESM format for Vercel serverless)
  console.log("Bundling api/index.mjs (ESM serverless entry)...");
  const apiSrc = "api/index.ts.bak";
  const apiOut = "api/index.mjs";
  if (fs.existsSync(apiSrc)) {
    const esbuildRes = spawnSync(process.execPath, [
      "node_modules/esbuild/bin/esbuild",
      apiSrc,
      "--platform=node",
      "--format=esm",
      "--outfile=" + apiOut,
      "--bundle",
      "--packages=external",
    ], { stdio: "inherit" });
    if (esbuildRes.error) console.error(esbuildRes.error);
    if (esbuildRes.status !== 0) {
      console.error("Failed to bundle api/index.mjs");
      process.exitCode = 1;
      return;
    }
    console.log("api/index.mjs bundled successfully.");
  } else {
    console.warn("Warning: " + apiSrc + " not found, skipping api bundle.");
  }

const res = spawnSync(process.execPath, [npmCli, "run", "build"], { stdio: "inherit" });
  if (res.error) console.error(res.error);
  process.exitCode = res.status ?? 1;
}

run().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});