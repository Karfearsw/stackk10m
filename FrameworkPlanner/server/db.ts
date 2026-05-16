import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import crypto from "node:crypto";
import {
  type DatabaseUrlResolution,
  redactDbUrlForLogs,
  resolveDatabaseUrlFromEnv,
  runtimeDatabaseEnvNames,
  sslOptionsFor,
} from "./db-url.js";
const { Pool } = pg;

let cachedDbUrlResolution: DatabaseUrlResolution | null = null;

export function databaseUrlResolution(): DatabaseUrlResolution {
  if (cachedDbUrlResolution) return cachedDbUrlResolution;

  const resolved = resolveDatabaseUrlFromEnv(runtimeDatabaseEnvNames);
  cachedDbUrlResolution = resolved;

  if (resolved.url) {
    const redacted = redactDbUrlForLogs(resolved.url);
    console.log(
      JSON.stringify({
        ts: new Date().toISOString(),
        event: "db_url",
        kind: "resolved",
        source: resolved.source,
        host: redacted.host,
        db: redacted.db,
        rejected: resolved.issues.length ? resolved.issues : undefined,
      }),
    );
  } else {
    console.error(
      JSON.stringify({
        ts: new Date().toISOString(),
        event: "db_url",
        kind: "missing",
        rejected: resolved.issues.length ? resolved.issues : undefined,
      }),
    );
  }

  return resolved;
}

export function databaseUrl(): string | undefined {
  return databaseUrlResolution().url;
}

export function pgSslOptions() {
  return sslOptionsFor(databaseUrl());
}

function intEnv(name: string, fallback: number) {
  const raw = String(process.env[name] ?? "").trim();
  if (!raw) return fallback;
  const n = parseInt(raw, 10);
  return Number.isFinite(n) ? n : fallback;
}

function boolEnv(name: string, fallback: boolean) {
  const raw = String(process.env[name] ?? "").trim().toLowerCase();
  if (!raw) return fallback;
  return raw === "1" || raw === "true" || raw === "yes" || raw === "on";
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getSqlText(input: unknown): string {
  if (!input) return "";
  if (typeof input === "string") return input;
  if (typeof input === "object" && (input as any).text) return String((input as any).text || "");
  return "";
}

function isRetryableDbError(err: any): boolean {
  const code = String(err?.code || "").trim();
  if (!code) return false;
  return (
    code === "57P01" ||
    code === "57P02" ||
    code === "57P03" ||
    code === "53300" ||
    code === "55000" ||
    code === "08000" ||
    code === "08003" ||
    code === "08006" ||
    code === "08001"
  );
}

function isSelectSql(sqlText: string): boolean {
  const s = String(sqlText || "").trimStart().toLowerCase();
  return s.startsWith("select") || s.startsWith("with");
}

function poolSnapshot(p: pg.Pool) {
  return { total: p.totalCount, idle: p.idleCount, waiting: p.waitingCount };
}

function logDbEvent(level: "info" | "warn" | "error", payload: Record<string, unknown>) {
  const line = JSON.stringify({ ts: new Date().toISOString(), event: "db", ...payload });
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}

const isVercel = boolEnv("VERCEL", false) || !!process.env.VERCEL_ENV;
const defaultPoolMax = isVercel ? 1 : 10;
const poolMax = intEnv("DB_POOL_MAX", defaultPoolMax);
const poolIdleTimeoutMs = intEnv("DB_POOL_IDLE_TIMEOUT_MS", 10000);
const poolConnTimeoutMs = intEnv(
  "DB_POOL_CONN_TIMEOUT_MS",
  process.env.DB_CONNECTION_TIMEOUT_MS ? intEnv("DB_CONNECTION_TIMEOUT_MS", 20000) : 20000,
);
const statementTimeoutMs = intEnv("DB_STATEMENT_TIMEOUT_MS", 15000);
const idleInTxTimeoutMs = intEnv("DB_IDLE_IN_TX_TIMEOUT_MS", 15000);
const slowQueryMs = intEnv("DB_SLOW_QUERY_MS", 250);
const enableQueryTiming = boolEnv("DB_QUERY_TIMING", true);
const enableSelectRetry = boolEnv("DB_RETRY_SELECTS", true);
const enableStartupTest = boolEnv("DB_STARTUP_TEST", !isVercel);

export const pool = new Pool({
  connectionString: databaseUrl(),
  ssl: pgSslOptions(),
  max: poolMax,
  idleTimeoutMillis: poolIdleTimeoutMs,
  connectionTimeoutMillis: poolConnTimeoutMs,
});

pool.on('error', (err: any) => {
  logDbEvent("error", { kind: "pool_error", message: String(err?.message || err), code: err?.code || null, pool: poolSnapshot(pool) });
});

pool.on("connect", (client) => {
  const statements: string[] = [];
  if (statementTimeoutMs > 0) statements.push(`SET statement_timeout TO ${statementTimeoutMs}`);
  if (idleInTxTimeoutMs > 0) statements.push(`SET idle_in_transaction_session_timeout TO ${idleInTxTimeoutMs}`);
  const appName = String(process.env.DB_APPLICATION_NAME || "").trim();
  if (appName) statements.push(`SET application_name TO '${appName.replace(/'/g, "''")}'`);
  if (!statements.length) return;
  client.query(statements.join("; ")).catch((err: any) => {
    logDbEvent("warn", { kind: "session_settings_failed", message: String(err?.message || err), code: err?.code || null });
  });
});

const originalQuery = pool.query.bind(pool) as any;
pool.query = (async (...args: any[]) => {
  const sqlText = getSqlText(args[0]);
  const sqlHash = sqlText ? crypto.createHash("sha256").update(sqlText).digest("hex").slice(0, 16) : null;
  const started = enableQueryTiming ? performance.now() : 0;
  try {
    const result = await originalQuery(...args);
    if (enableQueryTiming) {
      const durationMs = performance.now() - started;
      if (durationMs >= slowQueryMs) {
        logDbEvent("warn", {
          kind: "slow_query",
          durationMs: Math.round(durationMs),
          rowCount: Number(result?.rowCount ?? 0),
          sqlHash,
          pool: poolSnapshot(pool),
        });
      }
    }
    return result;
  } catch (err: any) {
    const durationMs = enableQueryTiming ? performance.now() - started : null;
    logDbEvent("error", {
      kind: "query_error",
      durationMs: durationMs != null ? Math.round(durationMs) : null,
      message: String(err?.message || err),
      code: err?.code || null,
      sqlHash,
      pool: poolSnapshot(pool),
    });

    if (enableSelectRetry && isRetryableDbError(err) && isSelectSql(sqlText)) {
      await sleep(150);
      return await originalQuery(...args);
    }
    throw err;
  }
}) as any;

if (enableStartupTest) {
  pool
    .connect()
    .then((client) => {
      logDbEvent("info", { kind: "startup_connect_ok", pool: poolSnapshot(pool) });
      client.release();
    })
    .catch((err) => {
      logDbEvent("error", { kind: "startup_connect_failed", message: String((err as any)?.message || err), code: (err as any)?.code || null, pool: poolSnapshot(pool) });
    });
}

export const db = drizzle(pool);
