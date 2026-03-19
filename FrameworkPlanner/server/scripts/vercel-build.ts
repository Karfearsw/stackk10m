import { spawnSync } from "node:child_process";
import { applyMigrations } from "./apply-migrations.js";

async function run() {
  const raw = String(process.env.AUTO_APPLY_MIGRATIONS ?? "").trim().toLowerCase();
  const explicit =
    raw === "true" ? true :
    raw === "false" ? false :
    null;

  const isVercel = Boolean(process.env.VERCEL) || Boolean(process.env.VERCEL_ENV);
  const shouldApply = explicit ?? isVercel;

  if (shouldApply) {
    await applyMigrations();
  } else {
    console.log("Skipping migrations (set AUTO_APPLY_MIGRATIONS=true to enable, false to force-disable)");
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
