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
  const explicit = parseBoolEnv("AUTO_APPLY_MIGRATIONS");
  const skip = parseBoolEnv("SKIP_DB_MIGRATIONS") === true;
  const vercelEnv = String(process.env.VERCEL_ENV || "").trim().toLowerCase();

  const shouldApply = skip ? false : explicit !== null ? explicit : vercelEnv === "production";

  if (shouldApply) {
    try {
      await applyMigrations();
    } catch (e: any) {
      if (isQuotaExceededError(e)) {
        console.error(
          [
            "",
            "Database is rejecting queries because a Neon quota has been exceeded.",
            "Fix: reduce usage / wait for quota reset / upgrade Neon plan.",
            "Optional: set AUTO_APPLY_MIGRATIONS=false to bypass migrations during build (not recommended for production).",
            "Escape hatch: set SKIP_DB_MIGRATIONS=true for frontend-only deploys.",
            "",
          ].join("\n"),
        );
        process.exitCode = 1;
        return;
      }
      throw e;
    }
  } else {
    console.log(
      [
        "Skipping migrations.",
        "Controls:",
        "- AUTO_APPLY_MIGRATIONS=true|false (explicit override)",
        "- SKIP_DB_MIGRATIONS=true (always skip)",
        "- Default: runs only for VERCEL_ENV=production",
      ].join(" "),
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
