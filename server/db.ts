import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
const { Pool } = pg;

type DatabaseUrlIssue = { name: string; reason: string };
type DatabaseUrlResolution = { url: string | undefined; source: string | null; issues: DatabaseUrlIssue[] };

export function sanitizeDatabaseUrl(input: string | undefined): string | undefined {
  if (!input) return input;
  try {
    const u = new URL(input);
    const channelBinding = (u.searchParams.get("channel_binding") || "").toLowerCase();
    if (channelBinding === "require") {
      u.searchParams.delete("channel_binding");
      return u.toString();
    }
    return input;
  } catch {
    return undefined;
  }
}

function isValidPostgresUrl(input: string | undefined): boolean {
  if (!input) return false;
  try {
    const u = new URL(input);
    return u.protocol === "postgres:" || u.protocol === "postgresql:";
  } catch {
    return false;
  }
}

function redactDbUrlForLogs(input: string) {
  try {
    const u = new URL(input);
    const db = u.pathname ? u.pathname.replace(/^\//, "") : "";
    return { host: u.host, db };
  } catch {
    return { host: null, db: null };
  }
}

let cachedDbUrlResolution: DatabaseUrlResolution | null = null;

export function databaseUrlResolution(): DatabaseUrlResolution {
  if (cachedDbUrlResolution) return cachedDbUrlResolution;

  // IMPORTANT: Prioritize pooled connections first to minimize Neon data transfer quota usage.
  // POSTGRES_URL is the Neon pooler URL (via pgbouncer) - use this first.
  // POSTGRES_URL_NON_POOLING is for migrations only - avoid for runtime queries.
  const candidates: Array<{ name: string; value: string | undefined }> = [
    { name: "POSTGRES_URL", value: process.env.POSTGRES_URL },
    { name: "DATABASE_URL", value: process.env.DATABASE_URL },
    { name: "POSTGRES_PRISMA_URL", value: process.env.POSTGRES_PRISMA_URL },
    { name: "POSTGRES_URL_NON_POOLING", value: process.env.POSTGRES_URL_NON_POOLING },
  ];

  const issues: DatabaseUrlIssue[] = [];

  for (const c of candidates) {
    const raw = String(c.value ?? "").trim();
    if (!raw) continue;
    if (!isValidPostgresUrl(raw)) {
      issues.push({ name: c.name, reason: "invalid_url" });
      continue;
    }
    const sanitized = sanitizeDatabaseUrl(raw);
    if (!sanitized) {
      issues.push({ name: c.name, reason: "invalid_url" });
      continue;
    }
    const resolved: DatabaseUrlResolution = { url: sanitized, source: c.name, issues };
    cachedDbUrlResolution = resolved;
    const redacted = redactDbUrlForLogs(sanitized);
    console.log(
      JSON.stringify({
        ts: new Date().toISOString(),
        event: "db_url",
        kind: "resolved",
        source: c.name,
        host: redacted.host,
        db: redacted.db,
        rejected: issues.length ? issues : undefined,
      }),
    );
    return resolved;
  }

  cachedDbUrlResolution = { url: undefined, source: null, issues };
  console.error(
    JSON.stringify({
      ts: new Date().toISOString(),
      event: "db_url",
      kind: "missing",
      rejected: issues.length ? issues : undefined,
    }),
  );
  return cachedDbUrlResolution;
}

export function databaseUrl(): string | undefined {
  return databaseUrlResolution().url;
}

function shouldUseSsl(connectionString: string | undefined) {
  if (!connectionString) return false;
  try {
    const u = new URL(connectionString);
    const sslmode = (u.searchParams.get("sslmode") || process.env.PGSSLMODE || "").toLowerCase();
    if (sslmode === "require" || sslmode === "verify-full" || sslmode === "verify-ca") return true;
    if (u.hostname.endsWith(".neon.tech")) return true;
    return false;
  } catch {
    return false;
  }
}

export function pgSslOptions() {
  const useSsl = shouldUseSsl(databaseUrl());
  if (!useSsl) return undefined;
  const raw = String(process.env.DB_SSL_REJECT_UNAUTHORIZED ?? "").trim().toLowerCase();
  const rejectUnauthorized = raw ? raw === "1" || raw === "true" || raw === "yes" || raw === "on" : true;
  return { rejectUnauthorized };
}

export function isDbQuotaError(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const e = err as { code?: string; message?: string };
  return (
    e.code === "XX000" &&
    typeof e.message === "string" &&
    e.message.includes("data transfer quota")
  );
}

// Serverless-optimized pool: max=1 reduces connection overhead on Neon free tier
export const pool = new Pool({
  connectionString: databaseUrl(),
  ssl: pgSslOptions(),
  max: 1,
  idleTimeoutMillis: 5000,
  connectionTimeoutMillis: 5000,
});

// Log connection errors
pool.on('error', (err) => {
  console.error('Unexpected error on idle client', err);
});

// NOTE: Removed startup pool.connect() test - it consumed Neon data transfer quota
// on every cold start (every serverless function invocation).

export const db = drizzle(pool);
