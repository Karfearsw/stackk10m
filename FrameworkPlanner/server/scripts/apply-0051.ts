import "dotenv/config";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { pool } from "../db.js";

async function main() {
  const sql = readFileSync(join(process.cwd(), "migrations", "0051_phase5_ops.sql"), "utf-8");
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(sql);
    await client.query("COMMIT");
    console.log("0051 applied OK");
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
