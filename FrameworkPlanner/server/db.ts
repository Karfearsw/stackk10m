import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
const { Pool } = pg;

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL is required");
}

// Use connection string from environment
export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
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
