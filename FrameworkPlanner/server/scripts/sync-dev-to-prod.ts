import dotenv from "dotenv";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import pg from "pg";
import { sanitizeDatabaseUrl, sslOptionsFor } from "../db-url.js";

dotenv.config({ path: join(process.cwd(), "FrameworkPlanner", ".env") });

function requiredEnv(name: string) {
  const v = process.env[name];
  if (!v || !String(v).trim()) throw new Error(`Missing ${name}`);
  return String(v).trim();
}

function sha256(text: string) {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

async function run() {
  const confirm = String(process.env.SYNC_ALLOW_PRODUCTION || "").trim().toLowerCase();
  if (!(confirm === "1" || confirm === "true" || confirm === "yes" || confirm === "on")) {
    throw new Error("Refusing to run. Set SYNC_ALLOW_PRODUCTION=true");
  }

  const targetUrl = process.env.SYNC_TARGET_DATABASE_URL
    ? String(process.env.SYNC_TARGET_DATABASE_URL).trim()
    : requiredEnv("DATABASE_URL");
  const sanitizedTargetUrl = sanitizeDatabaseUrl(targetUrl) || targetUrl;

  const migrationsDir = join(process.cwd(), "FrameworkPlanner", "migrations");
  const files = readdirSync(migrationsDir)
    .filter((f) => f.endsWith(".sql"))
    .sort();

  const pool = new pg.Pool({
    connectionString: sanitizedTargetUrl,
    ssl: sslOptionsFor(sanitizedTargetUrl),
    max: 1,
    idleTimeoutMillis: 10000,
    connectionTimeoutMillis: 10000,
  });

  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        id INTEGER PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
        filename TEXT NOT NULL UNIQUE,
        checksum TEXT NOT NULL,
        applied_at TIMESTAMP DEFAULT NOW()
      )
    `);

    const appliedRows = await pool.query<{ filename: string; checksum: string }>(
      `SELECT filename, checksum FROM schema_migrations`,
    );
    const applied = new Map(appliedRows.rows.map((r) => [r.filename, r.checksum]));

    let appliedCount = 0;
    for (const f of files) {
      const p = join(migrationsDir, f);
      const sqlText = readFileSync(p, "utf8");
      const checksum = sha256(sqlText);
      const prev = applied.get(f);
      if (prev && prev === checksum) continue;
      if (prev && prev !== checksum) {
        throw new Error(`Migration checksum changed after apply: ${f}`);
      }

      console.log(`Applying migration: ${f}`);
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        await client.query(sqlText);
        await client.query(`INSERT INTO schema_migrations (filename, checksum) VALUES ($1, $2)`, [f, checksum]);
        await client.query("COMMIT");
        appliedCount += 1;
        console.log(`Applied: ${f}`);
      } catch (e) {
        await client.query("ROLLBACK").catch(() => {});
        throw e;
      } finally {
        client.release();
      }
    }

    const check = await pool.query<{ now: string }>(`SELECT NOW()::text AS now`);
    console.log(`Sync complete. migrations_applied=${appliedCount} server_time=${check.rows?.[0]?.now || ""}`);
  } finally {
    await pool.end().catch(() => {});
  }
}

run().catch((e) => {
  console.error("Sync failed", e);
  process.exit(1);
});
