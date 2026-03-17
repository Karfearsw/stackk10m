import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
const { Pool } = pg;

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL is required");
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
  const useSsl = shouldUseSsl(process.env.DATABASE_URL);
  if (!useSsl) return undefined;
  const raw = String(process.env.DB_SSL_REJECT_UNAUTHORIZED ?? "").trim().toLowerCase();
  const rejectUnauthorized = raw ? raw === "1" || raw === "true" || raw === "yes" || raw === "on" : true;
  return { rejectUnauthorized };
}

// Use connection string from environment
export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: pgSslOptions(),
  max: 3,
  idleTimeoutMillis: 10000,
  connectionTimeoutMillis: process.env.DB_CONNECTION_TIMEOUT_MS
    ? parseInt(String(process.env.DB_CONNECTION_TIMEOUT_MS), 10)
    : 20000,
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
