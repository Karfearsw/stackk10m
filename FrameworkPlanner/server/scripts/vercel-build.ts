import { spawnSync } from "node:child_process";
import { applyMigrations } from "./apply-migrations.js";

async function run() {
  const auto = String(process.env.AUTO_APPLY_MIGRATIONS || "").toLowerCase() === "true";
  if (auto) {
    await applyMigrations();
  } else {
    console.log("AUTO_APPLY_MIGRATIONS is not true; skipping migrations");
  }

  const npmCmd = process.platform === "win32" ? "npm.cmd" : "npm";
  const res = spawnSync(npmCmd, ["run", "build"], { stdio: "inherit" });
  process.exitCode = res.status ?? 1;
}

run().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});

