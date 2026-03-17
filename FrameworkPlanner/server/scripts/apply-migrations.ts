import dotenv from 'dotenv';
import { join } from "node:path";
dotenv.config({ path: join(process.cwd(), 'FrameworkPlanner', '.env') });
import { readdirSync, readFileSync } from "node:fs";

async function run() {
  const dir = join(process.cwd(), "FrameworkPlanner", "migrations");
  const files = readdirSync(dir)
    .filter(f => f.endsWith(".sql"))
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

run().then(() => {
  console.log("All migrations applied");
  process.exit(0);
}).catch((e) => {
  console.error("Migration failed", e);
  process.exit(1);
});
