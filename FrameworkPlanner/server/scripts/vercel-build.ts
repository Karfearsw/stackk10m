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
  const isVercel = Boolean(process.env.VERCEL || process.env.VERCEL_ENV);

  // Default on Vercel: SKIP migrations during build.
  // Neon WebSocket connections are not supported on Vercel build machines.
  // Run migrations separately via POST /api/admin/migrate or post-deploy script.
  const shouldApply = skip === true ? false : explicit === true ? true : false;

  if (shouldApply) {
    console.log("Applying database migrations (explicitly enabled via AUTO_APPLY_MIGRATIONS=true)...");
    try {
      await applyMigrations();
    } catch (e: any) {
      if (isQuotaExceededError(e)) {
        console.error("",
          "Database is rejecting queries because a Neon quota has been exceeded.",
          "Fix: reduce usage / wait for quota reset / upgrade Neon plan.",
          "Set AUTO_APPLY_MIGRATIONS=false to bypass migrations during build.",
        );
        process.exitCode = 1;
        return;
      }
      if (isVercel) {
        console.warn("WARNING: Migration failed during Vercel build.",
          "The build will continue. Migrations will be applied on first request.",
          "Error: " + String(e?.message || e),
        );
      } else {
        throw e;
      }
    }
  } else {
    console.log("Skipping DB migrations during build (safe default).",
      "Migrations will be applied on first request or via POST /api/admin/migrate.",
      "To force during build, set AUTO_APPLY_MIGRATIONS=true.",
    );
  }

  const npmCli = process.env.npm_execpath;
  if (!npmCli) {
    throw new Error("npm_execpath is not set; cannot run nested npm build");
  }

  const res = spawnSync(process.execPath, [npmCli, "run", "build"], { stdio: "inherit" });
  if (res.error) console.error(res.error);
  process.exitCode = res.status ?? 1;
}

run().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});