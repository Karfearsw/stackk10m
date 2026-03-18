import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
const { Pool } = pg;

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL is required");
}

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
    return input;
  }
}

export function databaseUrl(): string | undefined {
  return sanitizeDatabaseUrl(process.env.DATABASE_URL);
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

// Use connection string from environment
export const pool = new Pool({
  connectionString: databaseUrl(),
  ssl: pgSslOptions(),
  max: 3,
  idleTimeoutMillis: 10000,
  connectionTimeoutMillis: 5000,
});

// Log connection errors
pool.on('error', (err) => {
  console.error('Unexpected error on idle client', err);
});

// Test connection on startup (optional, but good for debugging logs)
pool.connect().then(client => {
  console.log('Database connected successfully');
  client.release();
}).catch(err => {
  console.error('Database connection failed during startup:', err);
});

export const db = drizzle(pool);
