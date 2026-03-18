import dotenv from "dotenv";
import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join, resolve } from "node:path";

const frameworkRoot = fileURLToPath(new URL("../../..", import.meta.url));

dotenv.config({ path: join(frameworkRoot, ".env") });

export async function applyMigrations() {
  const dir = join(frameworkRoot, "migrations");
  const files = readdirSync(dir)
    .filter((f) => f.endsWith(".sql"))
    .sort();

  const { pool } = await import("../db.js");
  for (const f of files) {
    const p = join(dir, f);
    const sql = readFileSync(p, "utf8");
    console.log(`Applying migration: ${f}`);
    try {
      await pool.query(sql);
      console.log(`Applied: ${f}`);
    } catch (e: any) {
      const code = String(e?.code || "");
      const msg = String(e?.message || "");
      const alreadyExists =
        code === "42710" ||
        code === "42P07" ||
        code === "42701" ||
        /already exists/i.test(msg);
      if (alreadyExists) {
        console.log(`Skipped: ${f}`);
        continue;
      }
      throw e;
    }
  }
}

function isMain() {
  const self = resolve(fileURLToPath(import.meta.url));
  const argv = process.argv[1] ? resolve(process.argv[1]) : "";
  return self === argv;
}

if (isMain()) {
  applyMigrations()
    .then(() => {
      console.log("All migrations applied");
    })
    .catch((e) => {
      console.error("Migration failed", e);
      process.exitCode = 1;
    });
}
