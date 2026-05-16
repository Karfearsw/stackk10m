import { spawnSync } from "node:child_process";
import { applyMigrations } from "./apply-migrations.js";

async function run() {
  const raw = String(process.env.AUTO_APPLY_MIGRATIONS ?? "").trim().toLowerCase();
  const shouldApply = raw === "1" || raw === "true" || raw === "yes" || raw === "on";

  if (shouldApply) {
    await applyMigrations();
  } else {
    console.log("Skipping migrations (set AUTO_APPLY_MIGRATIONS=true to enable)");
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
