import dotenv from "dotenv";
import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join, resolve } from "node:path";
import { createHash } from "node:crypto";
import pg from "pg";
import { migrationsDatabaseEnvNames, resolveDatabaseUrlFromEnv, sslOptionsFor } from "../db-url.js";

const frameworkRoot = fileURLToPath(new URL("../..", import.meta.url));

dotenv.config({ path: join(frameworkRoot, ".env") });

function sha256(text: string) {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

export async function applyMigrations() {
  const dir = join(frameworkRoot, "migrations");
  const files = readdirSync(dir)
    .filter((f) => f.endsWith(".sql"))
    .sort();

  console.log(`Migrations directory: ${dir} (${files.length} .sql files)`);

  const resolved = resolveDatabaseUrlFromEnv(migrationsDatabaseEnvNames);
  if (!resolved.url) {
    throw new Error(`Database URL is required to apply migrations. Set one of: ${migrationsDatabaseEnvNames.join(", ")}`);
  }

  const pool = new pg.Pool({
    connectionString: resolved.url,
    ssl: sslOptionsFor(resolved.url),
    max: 1,
    idleTimeoutMillis: 10000,
    connectionTimeoutMillis: 20000,
  });

  const lockId = 239488200;
  try {
    await pool.query(`SELECT pg_advisory_lock($1)`, [lockId]);

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
      const p = join(dir, f);
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
    console.log(`All migrations applied. migrations_applied=${appliedCount} server_time=${check.rows?.[0]?.now || ""}`);
  } finally {
    await pool.query(`SELECT pg_advisory_unlock($1)`, [lockId]).catch(() => {});
    await pool.end().catch(() => {});
  }
}

function isMain() {
  const self = resolve(fileURLToPath(import.meta.url));
  const argv = process.argv[1] ? resolve(process.argv[1]) : "";
  return self === argv;
}

if (isMain()) {
  applyMigrations()
    .catch((e) => {
      console.error("Migration failed", e);
      process.exitCode = 1;
    });
}
